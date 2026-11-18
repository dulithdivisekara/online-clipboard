const ITERATIONS = 100_000;

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

export function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

export async function hashPassword(
  password: string,
  existingSalt?: string
): Promise<{ hash: string; salt: string }> {
  const saltBytes = existingSalt
    ? fromBase64Url(existingSalt)
    : crypto.getRandomValues(new Uint8Array(16));
  const salt = existingSalt || toBase64Url(saltBytes);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes as BufferSource,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return {
    hash: toBase64Url(new Uint8Array(derived)),
    salt,
  };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  if (!password || !storedHash || !storedSalt) return false;
  const { hash } = await hashPassword(password, storedSalt);
  return timingSafeEqual(hash, storedHash);
}

export async function signSessionToken(
  secret: string,
  payload: Record<string, unknown>,
  ttlSeconds = 86400
): Promise<string> {
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encodedBody = toBase64Url(new TextEncoder().encode(JSON.stringify(body)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedBody));
  return `${encodedBody}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(
  secret: string,
  token: string
): Promise<Record<string, unknown> | null> {
  if (!secret || !token || !token.includes(".")) return null;
  const [encodedBody, encodedSig] = token.split(".");
  if (!encodedBody || !encodedSig) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expectedSig = toBase64Url(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedBody)))
  );
  if (!timingSafeEqual(encodedSig, expectedSig)) return null;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedBody)));
    if (typeof parsed.exp !== "number" || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const DICTS = {
  alnum: "abcdefghijklmnopqrstuvwxyz0123456789",
  digits: "0123456789",
  lower: "abcdefghijklmnopqrstuvwxyz",
} as const;

export function generateShortId(
  length = 6,
  dict: keyof typeof DICTS = "alnum"
): string {
  const alphabet = DICTS[dict];
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function isValidCustomId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-_]{1,62}[a-z0-9]?$/i.test(id);
}
