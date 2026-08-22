import crypto from "node:crypto";
import { resolveTxt } from "node:dns/promises";

export function normalizeHostname(input: string): string {
  const value = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!value || value.includes("/") || value.includes(":")) throw new Error("Enter a hostname only");
  return new URL(`https://${value}`).hostname;
}

export function newDomainVerificationToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function verificationRecord(hostname: string, token: string) {
  const host = normalizeHostname(hostname);
  return {
    type: "TXT" as const,
    name: `_bandwagon.${host}`,
    value: `bandwagon-verification=${token}`,
  };
}

export function hashVerificationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function verifyTxt(hostname: string, expectedToken: string): Promise<boolean> {
  const record = verificationRecord(hostname, expectedToken);
  const answers = await resolveTxt(record.name);
  const values = answers.map(parts => parts.join(""));
  return values.includes(record.value);
}
