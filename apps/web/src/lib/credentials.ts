import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import type { SessionIdentity } from "@/lib/auth";
import { createPrivateUploadUrl, createPrivateViewUrl, headPrivateObject, privateBucket } from "@/lib/object-storage";

const ALLOWED_TYPES = new Set(["application/pdf","image/jpeg","image/png","image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,100) || "document";
}

export type DriverDocumentType = "driver_license" | "insurance" | "volunteer_approval" | "other";

export async function createCredentialUpload(identity: SessionIdentity, input: {
  documentType: DriverDocumentType;
  filename: string;
  contentType: string;
  sizeBytes: number;
}) {
  const db = dbRequired();
  if (!ALLOWED_TYPES.has(input.contentType)) throw new Error("Upload a PDF, JPEG, PNG, or WebP document");
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_BYTES) throw new Error("Document must be 10 MB or smaller");
  const id = crypto.randomUUID();
  const key = `people/${identity.personId}/${input.documentType}/${id}-${safeFilename(input.filename)}`;
  await db.query(
    `insert into person_documents
      (id,person_id,document_type,storage_bucket,storage_key,original_filename,content_type,size_bytes,status,uploaded_by_person_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'pending_upload',$2)`,
    [id,identity.personId,input.documentType,privateBucket(),key,input.filename,input.contentType,input.sizeBytes]
  );
  const uploadUrl = await createPrivateUploadUrl({ key,contentType:input.contentType,contentLength:input.sizeBytes });
  await db.query(
    `insert into document_access_events (document_id,actor_person_id,access_type,purpose)
     values ($1,$2,'upload_url','credential_upload')`,
    [id,identity.personId]
  );
  return { documentId:id,uploadUrl,key,expiresInSeconds:300 };
}

export async function finalizeCredentialUpload(identity: SessionIdentity, documentId: string) {
  const db = dbRequired();
  const row = await db.query(
    `select * from person_documents where id=$1 and person_id=$2 and status='pending_upload'`,
    [documentId,identity.personId]
  );
  if (!row.rowCount) throw new Error("Pending document upload not found");
  const object = await headPrivateObject(row.rows[0].storage_key);
  if (!object.contentLength || object.contentLength > MAX_BYTES) throw new Error("Uploaded document size is invalid");
  if (object.contentType && !ALLOWED_TYPES.has(object.contentType)) throw new Error("Uploaded document type is not allowed");
  const result = await db.query(
    `update person_documents
     set status='uploaded',uploaded_at=now(),content_type=coalesce($1,content_type),size_bytes=$2,updated_at=now()
     where id=$3 returning id,document_type,status,original_filename,content_type,size_bytes,uploaded_at,expires_at,extracted_metadata`,
    [object.contentType,object.contentLength,documentId]
  );
  return result.rows[0];
}

export async function listMyCredentials(identity: SessionIdentity) {
  const db = dbRequired();
  const result = await db.query(
    `select id,document_type,status,original_filename,content_type,size_bytes,issued_at,expires_at,
            extracted_metadata,uploaded_at,created_at,updated_at
     from person_documents
     where person_id=$1 and status<>'deleted'
     order by document_type,created_at desc`,
    [identity.personId]
  );
  return result.rows;
}

async function canReviewDocument(actorPersonId: string, documentPersonId: string, organizationId?: string | null) {
  if (actorPersonId === documentPersonId) return true;
  if (!organizationId) return false;
  const db = dbRequired();
  const admin = await db.query(
    `select 1 from memberships
     where organization_id=$1 and person_id=$2 and group_id is null and status='active'
       and role in ('owner','admin','manager') limit 1`,
    [organizationId,actorPersonId]
  );
  if (!admin.rowCount) return false;
  const subject = await db.query(
    `select 1 from memberships where organization_id=$1 and person_id=$2 and group_id is null and status='active' limit 1`,
    [organizationId,documentPersonId]
  );
  return Boolean(subject.rowCount);
}

export async function credentialViewUrl(identity: SessionIdentity, input: { documentId:string; organizationId?:string|null }) {
  const db = dbRequired();
  const row = await db.query(`select * from person_documents where id=$1 and status not in ('deleted','pending_upload')`,[input.documentId]);
  if (!row.rowCount) throw new Error("Document not found");
  const document = row.rows[0];
  const granted = await canReviewDocument(identity.personId,document.person_id,input.organizationId);
  await db.query(
    `insert into document_access_events (document_id,actor_person_id,organization_id,access_type,granted,purpose)
     values ($1,$2,$3,'view_url',$4,'credential_review')`,
    [document.id,identity.personId,input.organizationId || null,granted]
  );
  if (!granted) throw new Error("You are not authorized to view this document");
  return { url:await createPrivateViewUrl(document.storage_key),expiresInSeconds:120 };
}
