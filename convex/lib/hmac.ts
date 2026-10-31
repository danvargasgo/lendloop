// HMAC SHA 256 signing for the Convex <-> n8n integration. Uses Web Crypto, which the Convex runtime provides.
const encoder = new TextEncoder();

export const MAX_SKEW_SECONDS = 300;

async function importKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usages);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function sign(secret: string, message: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await importKey(secret, ["sign"]), encoder.encode(message));
  return toHex(new Uint8Array(signature));
}

// crypto.subtle.verify compares in constant time, so a wrong signature leaks nothing through timing.
export async function verify(secret: string, message: string, signatureHex: string): Promise<boolean> {
  const signature = fromHex(signatureHex);
  if (signature === null) return false;
  return await crypto.subtle.verify("HMAC", await importKey(secret, ["verify"]), signature, encoder.encode(message));
}

export function isFresh(timestampSeconds: string, nowMs: number = Date.now()): boolean {
  if (!/^\d{1,12}$/.test(timestampSeconds)) return false;
  return Math.abs(nowMs / 1000 - Number(timestampSeconds)) <= MAX_SKEW_SECONDS;
}
