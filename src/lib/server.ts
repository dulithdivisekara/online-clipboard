import { env as workerEnv } from "cloudflare:workers";
import {
  generateShortId,
  hashPassword,
  isValidCustomId,
  verifyPassword,
  verifySessionToken,
} from "./crypto";
import { calculateExpiresAt, isExpired } from "./ttl";

export const MAX_FILE_BYTES = 98 * 1024 * 1024; // 98 MB
export const MAX_TOTAL_STORAGE_BYTES = 6 * 1024 * 1024 * 1024; // 6 GB

export const RESERVED_SLUGS = new Set([
  "api",
  "live-clipboard",
  "scribble",
  "file-drop",
  "url",
  "u",
  "shortcuts",
  "vault",
  "robots.txt",
  "sitemap-index.xml",
  "sitemap-0.xml",
  "sitemap.xml",
  "manifest.json",
  "favicon.ico",
  "favicon.png",
  "og-image.png",
  "apple-touch-icon.png",
  "icon-32.png",
  "icon-48.png",
  "icon-72.png",
  "icon-192.png",
  "icon-512.png",
]);

export interface ClipRow {
  id: string;
  kind: "text" | "markdown" | "code" | "image" | "file";
  title: string;
  language: string;
  content: string;
  r2_key: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  is_editable: number;
  is_e2ee: number;
  password_hash: string;
  password_salt: string;
  max_views: number;
  view_count: number;
  expires_at: string | null;
  client_name: string;
  created_at: string;
  updated_at: string;
}

export interface UploadPolicy {
  textUpload: boolean;
  fileUpload: boolean;
}

export function getEnv(): App.Env {
  return workerEnv as unknown as App.Env;
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export function getCookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function isHttpsRequest(request: Request, url: URL): boolean {
  return url.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

export async function checkRateLimit(
  kv: KVNamespace,
  bucket: string,
  limit = 20,
  windowSeconds = 300
): Promise<boolean> {
  try {
    const key = `rl:${bucket}`;
    const raw = await kv.get(key);
    const count = raw ? parseInt(raw, 10) || 0 : 0;
    if (count >= limit) return false;
    await kv.put(key, String(count + 1), { expirationTtl: windowSeconds });
    return true;
  } catch {
    return true;
  }
}

export const SAFE_RASTER_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
]);

export async function isVaultAdmin(request: Request, env: App.Env): Promise<boolean> {
  const secret = env.SESSION_SECRET;
  if (!secret) return false;
  const cookieToken = getCookieValue(request, "cb_vault");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const token = cookieToken || bearerToken;
  if (!token) return false;
  const verified = await verifySessionToken(secret, token);
  return verified?.role === "vault-admin";
}

export async function getUploadPolicy(db: D1Database): Promise<UploadPolicy> {
  try {
    const row = await db
      .prepare("SELECT value FROM settings WHERE key = 'upload_policy'")
      .first<{ value: string }>();
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      return {
        textUpload: parsed.textUpload !== false,
        fileUpload: parsed.fileUpload !== false,
      };
    }
  } catch {
    // Fallback to open
  }
  return { textUpload: true, fileUpload: true };
}

export async function isIdAvailable(
  db: D1Database,
  rawId: string,
  r2?: R2Bucket
): Promise<boolean> {
  const id = rawId.trim().toLowerCase();
  if (!id || RESERVED_SLUGS.has(id) || !isValidCustomId(id)) return false;

  const existingClip = await db
    .prepare("SELECT id, r2_key, expires_at FROM clips WHERE id = ?")
    .bind(id)
    .first<{ id: string; r2_key: string; expires_at: string | null }>();
  if (existingClip) {
    if (isExpired(existingClip.expires_at)) {
      if (existingClip.r2_key && r2) {
        await r2.delete(existingClip.r2_key).catch(() => {});
      }
      await db.prepare("DELETE FROM clips WHERE id = ?").bind(id).run();
    } else {
      return false;
    }
  }

  const existingUrl = await db
    .prepare("SELECT code, expires_at FROM short_urls WHERE code = ?")
    .bind(id)
    .first<{ code: string; expires_at: string | null }>();
  if (existingUrl) {
    if (isExpired(existingUrl.expires_at)) {
      await db.prepare("DELETE FROM url_clicks WHERE code = ?").bind(id).run();
      await db.prepare("DELETE FROM short_urls WHERE code = ?").bind(id).run();
    } else {
      return false;
    }
  }

  return true;
}

export async function allocateClipId(
  db: D1Database,
  preferredId?: string | null,
  editable = false,
  r2?: R2Bucket
): Promise<{ id?: string; error?: string }> {
  if (preferredId && preferredId.trim()) {
    const normalized = preferredId.trim().toLowerCase();
    if (!isValidCustomId(normalized) || RESERVED_SLUGS.has(normalized)) {
      return {
        error: "Custom ID must be 2–64 characters using letters, numbers, hyphens, or underscores.",
      };
    }
    const available = await isIdAvailable(db, normalized, r2);
    if (!available) {
      return { error: "That ID is already in use. Choose another ID." };
    }
    return { id: normalized };
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const base = generateShortId(6, "alnum");
    const candidate = editable ? `${base}-e` : base;
    if (await isIdAvailable(db, candidate, r2)) {
      return { id: candidate };
    }
  }
  return { error: "Unable to allocate a unique ID. Please try again." };
}

export async function verifyClipAccess(
  env: App.Env,
  clip: ClipRow,
  providedPassword?: string | null,
  bypassAuth = false,
  clientIp?: string | null
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (isExpired(clip.expires_at)) {
    if (clip.r2_key) {
      await env.CLIPBOARD_FILES.delete(clip.r2_key).catch(() => {});
    }
    await env.CLIPBOARD_DB.prepare("DELETE FROM clips WHERE id = ?").bind(clip.id).run();
    return { ok: false, status: 404, message: "This clip has expired." };
  }

  if (clip.max_views > 0 && clip.view_count >= clip.max_views) {
    if (clip.r2_key) {
      await env.CLIPBOARD_FILES.delete(clip.r2_key).catch(() => {});
    }
    await env.CLIPBOARD_DB.prepare("DELETE FROM clips WHERE id = ?").bind(clip.id).run();
    return { ok: false, status: 404, message: "This clip reached its view limit." };
  }

  if (!bypassAuth && clip.password_hash) {
    if (!providedPassword) {
      return { ok: false, status: 401, message: "Password required" };
    }
    if (clientIp) {
      const allowed = await checkRateLimit(
        env.CLIPBOARD_KV,
        `unlock:${clientIp}:${clip.id}`,
        25,
        300
      );
      if (!allowed) {
        return {
          ok: false,
          status: 429,
          message: "Too many unlock attempts. Please wait a few minutes.",
        };
      }
    }
    const valid = await verifyPassword(
      providedPassword,
      clip.password_hash,
      clip.password_salt
    );
    if (!valid) {
      return { ok: false, status: 403, message: "Incorrect password" };
    }
  }

  return { ok: true };
}

/**
 * Atomically increments view_count in D1 and deletes exhausted clips so concurrent
 * burn-after-read requests cannot both read the same max_views=1 secret.
 */
export async function consumeClipView(
  env: App.Env,
  clip: ClipRow,
  deferR2Delete = false
): Promise<{ nextViewCount: number; burned: boolean; exhausted: boolean }> {
  const nowIso = new Date().toISOString();
  const updated = await env.CLIPBOARD_DB.prepare(
    `UPDATE clips
     SET view_count = view_count + 1
     WHERE id = ?
       AND (expires_at IS NULL OR expires_at > ?)
       AND (max_views = 0 OR view_count < max_views)
     RETURNING view_count, max_views`
  )
    .bind(clip.id, nowIso)
    .first<{ view_count: number; max_views: number }>();

  if (!updated) {
    return { nextViewCount: clip.view_count, burned: true, exhausted: true };
  }

  const burned = updated.max_views > 0 && updated.view_count >= updated.max_views;
  if (burned) {
    await env.CLIPBOARD_DB.prepare(
      "DELETE FROM clips WHERE id = ? AND max_views > 0 AND view_count >= max_views"
    )
      .bind(clip.id)
      .run();
    if (!deferR2Delete && clip.r2_key) {
      await env.CLIPBOARD_FILES.delete(clip.r2_key).catch(() => {});
    }
  }

  return { nextViewCount: updated.view_count, burned, exhausted: false };
}

export function sanitizeClipForClient(clip: ClipRow, viewCountOverride?: number) {
  return {
    id: clip.id,
    kind: clip.kind,
    title: clip.title,
    language: clip.language,
    content: clip.content,
    fileName: clip.file_name,
    mimeType: clip.mime_type,
    fileSize: clip.file_size,
    isEditable: Boolean(clip.is_editable || clip.id.endsWith("-e")),
    isE2EE: Boolean(clip.is_e2ee),
    hasPassword: Boolean(clip.password_hash),
    maxViews: clip.max_views,
    viewCount: viewCountOverride ?? clip.view_count,
    expiresAt: clip.expires_at,
    createdAt: clip.created_at,
    updatedAt: clip.updated_at,
  };
}

export async function buildPasswordFields(password?: string | null) {
  if (!password || !password.trim()) {
    return { passwordHash: "", passwordSalt: "" };
  }
  const { hash, salt } = await hashPassword(password);
  return { passwordHash: hash, passwordSalt: salt };
}

export function resolveExpiry(expiresIn?: string | null): string | null {
  return calculateExpiresAt(expiresIn || "7d");
}
