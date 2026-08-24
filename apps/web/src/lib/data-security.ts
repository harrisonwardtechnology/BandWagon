import crypto from "node:crypto";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function deriveKey(value:string) {
  return crypto.createHash("sha256").update(value).digest();
}

function encryptionKey() {
  return deriveKey(required("DATA_ENCRYPTION_KEY"));
}

function decryptionKeys() {
  const previous=String(process.env.DATA_ENCRYPTION_KEY_PREVIOUS||"").split(",").map(value=>value.trim()).filter(Boolean);
  return [required("DATA_ENCRYPTION_KEY"),...previous].map(deriveKey);
}

export function encryptSensitive(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSensitive(value: string) {
  const [ivPart, tagPart, encryptedPart] = value.split(".");
  if (!ivPart || !tagPart || !encryptedPart) throw new Error("Invalid encrypted value");
  for(const key of decryptionKeys()){
    try{
      const decipher=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(ivPart,"base64url"));
      decipher.setAuthTag(Buffer.from(tagPart,"base64url"));
      return Buffer.concat([decipher.update(Buffer.from(encryptedPart,"base64url")),decipher.final()]).toString("utf8");
    }catch{}
  }
  throw new Error("Encrypted value cannot be opened with the configured data keys");
}

export function lookupHash(value: string) {
  return crypto
    .createHmac("sha256", deriveKey(process.env.LOOKUP_HASH_KEY || required("DATA_ENCRYPTION_KEY")))
    .update(value.trim().toLowerCase())
    .digest("hex");
}

export function randomPublicRef(prefix: string) {
  return `${prefix}_${crypto.randomBytes(8).toString("base64url").toLowerCase()}`;
}
