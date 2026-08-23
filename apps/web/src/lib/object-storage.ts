import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function client() {
  return new S3Client({
    region: process.env.S3_REGION || "eu-central-3",
    endpoint: env("S3_ENDPOINT"),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: env("S3_ACCESS_KEY_ID"),
      secretAccessKey: env("S3_SECRET_ACCESS_KEY"),
    },
  });
}

export function privateBucket() { return env("S3_PRIVATE_BUCKET"); }
export function publicBucket() { return env("S3_PUBLIC_BUCKET"); }

export async function createPrivateUploadUrl(input: {
  key: string;
  contentType: string;
  contentLength?: number | null;
  expiresSeconds?: number;
}) {
  const command = new PutObjectCommand({
    Bucket: privateBucket(),Key: input.key,ContentType: input.contentType,
    ...(input.contentLength ? { ContentLength: input.contentLength } : {}),
  });
  return getSignedUrl(client(),command,{ expiresIn:Math.max(60,Math.min(900,input.expiresSeconds||300)) });
}

export async function createPrivateViewUrl(key:string,expiresSeconds=120) {
  return getSignedUrl(client(),new GetObjectCommand({Bucket:privateBucket(),Key:key}),{ expiresIn:Math.max(30,Math.min(600,expiresSeconds)) });
}

export async function headPrivateObject(key:string) {
  const result=await client().send(new HeadObjectCommand({Bucket:privateBucket(),Key:key}));
  return {contentType:result.ContentType||null,contentLength:result.ContentLength==null?null:Number(result.ContentLength),eTag:result.ETag||null,lastModified:result.LastModified||null};
}

export async function getPrivateObjectBytes(key:string) {
  const result=await client().send(new GetObjectCommand({Bucket:privateBucket(),Key:key}));
  if(!result.Body) throw new Error("Stored document is empty");
  const bytes=await result.Body.transformToByteArray();
  return {bytes:Buffer.from(bytes),contentType:result.ContentType||"application/octet-stream"};
}
