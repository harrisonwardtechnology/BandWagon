import crypto from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const base = (process.env.SYNTHETIC_BASE_URL || process.env.APP_URL || "").replace(/\/$/, "");
if (!base) throw new Error("SYNTHETIC_BASE_URL or APP_URL is required");

async function json(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15_000) });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return body;
}

const live = await json("/api/health/live");
const ready = await json("/api/health/ready");
const deep = await json("/api/health/deep");
if (!live.ok || !ready.ok) throw new Error("Live or readiness health check failed");
if ((deep.summary?.failed || 0) > 0) throw new Error(`Deep health reports ${deep.summary.failed} failed checks`);

let s3 = "skipped";
if (process.env.SYNTHETIC_S3_CANARY === "true") {
  const required = ["S3_ENDPOINT", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PRIVATE_BUCKET"];
  for (const name of required) if (!process.env[name]) throw new Error(`${name} is required for the S3 canary`);
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  });
  const Bucket = process.env.S3_PRIVATE_BUCKET;
  const Key = `synthetic-canary/${crypto.randomUUID()}.txt`;
  const marker = `bandwagon-synthetic-${crypto.randomUUID()}`;
  try {
    await client.send(new PutObjectCommand({ Bucket, Key, Body: marker, ContentType: "text/plain" }));
    const object = await client.send(new GetObjectCommand({ Bucket, Key }));
    if ((await object.Body.transformToString()) !== marker) throw new Error("S3 canary content mismatch");
    s3 = "passed";
  } finally {
    await client.send(new DeleteObjectCommand({ Bucket, Key })).catch(() => {});
  }
}

console.log(JSON.stringify({ ok: true, live: live.status, ready: ready.status, deep: deep.status, failed: deep.summary?.failed || 0, s3 }));
