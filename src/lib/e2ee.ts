const PREFIX = "E2EE:v1:";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateE2EEKey(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return toBase64Url(raw);
}

export function isE2EEPayload(text: string): boolean {
  return typeof text === "string" && text.startsWith(PREFIX);
}

export async function encryptText(plaintext: string, base64Key: string): Promise<string> {
  const keyBytes = fromBase64Url(base64Key);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${PREFIX}${toBase64Url(iv)}:${toBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptText(payload: string, base64Key: string): Promise<string> {
  if (!isE2EEPayload(payload)) return payload;
  const body = payload.slice(PREFIX.length);
  const [ivStr, cipherStr] = body.split(":");
  if (!ivStr || !cipherStr) {
    throw new Error("Malformed encrypted payload");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    fromBase64Url(base64Key) as BufferSource,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(ivStr) as BufferSource },
    key,
    fromBase64Url(cipherStr) as BufferSource
  );
  return new TextDecoder().decode(decrypted);
}
