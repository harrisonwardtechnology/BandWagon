export type TwilioForm = Record<string, string>;

const MAX_TWILIO_FORM_BYTES = 65_536;

async function readBodyWithLimit(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("Twilio webhook payload is too large");
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("Twilio webhook payload is too large").catch(() => undefined);
        throw new Error("Twilio webhook payload is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function parseTwilioForm(request: Request): Promise<TwilioForm> {
  const text = await readBodyWithLimit(request, MAX_TWILIO_FORM_BYTES);
  const params = new URLSearchParams(text);
  return Object.fromEntries(params.entries());
}
