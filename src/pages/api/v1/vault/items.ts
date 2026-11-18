import type { APIRoute } from "astro";
import {
  getEnv,
  getUploadPolicy,
  isVaultAdmin,
  jsonResponse,
  MAX_TOTAL_STORAGE_BYTES,
  sanitizeClipForClient,
  type ClipRow,
} from "@lib/server";
import { purgeExpiredContent } from "@worker/cleanup";

export const GET: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!(await isVaultAdmin(request, env))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const clipsRes = await env.CLIPBOARD_DB.prepare(
    "SELECT * FROM clips ORDER BY created_at DESC LIMIT 200"
  ).all<ClipRow>();

  const urlsRes = await env.CLIPBOARD_DB.prepare(
    `SELECT u.code, u.target_url, u.title, u.expires_at, u.created_at,
      (SELECT COUNT(*) FROM url_clicks c WHERE c.code = u.code) AS clicks
     FROM short_urls u ORDER BY u.created_at DESC LIMIT 100`
  ).all();

  const totalBytesRes = await env.CLIPBOARD_DB.prepare(
    "SELECT COALESCE(SUM(file_size), 0) AS used FROM clips"
  ).first<{ used: number }>();

  const policy = await getUploadPolicy(env.CLIPBOARD_DB);

  return jsonResponse({
    authenticated: true,
    storage: {
      usedBytes: totalBytesRes?.used || 0,
      maxBytes: MAX_TOTAL_STORAGE_BYTES,
    },
    policy,
    clips: (clipsRes.results ?? []).map((c) => sanitizeClipForClient(c)),
    urls: urlsRes.results ?? [],
  });
};

export const PUT: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!(await isVaultAdmin(request, env))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    textUpload?: boolean;
    fileUpload?: boolean;
  };

  if (body.action === "purge-expired") {
    const result = await purgeExpiredContent(env);
    return jsonResponse({ status: "purged", ...result });
  }

  const current = await getUploadPolicy(env.CLIPBOARD_DB);
  const next = {
    textUpload: typeof body.textUpload === "boolean" ? body.textUpload : current.textUpload,
    fileUpload: typeof body.fileUpload === "boolean" ? body.fileUpload : current.fileUpload,
  };

  await env.CLIPBOARD_DB.prepare(
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('upload_policy', ?, ?)"
  )
    .bind(JSON.stringify(next), new Date().toISOString())
    .run();

  return jsonResponse({ policy: next });
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const env = getEnv();
  if (!(await isVaultAdmin(request, env))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const kind = url.searchParams.get("kind") || "clip";
  const id = (url.searchParams.get("id") || "").trim().toLowerCase();
  if (!id) return jsonResponse({ error: "Missing id" }, 400);

  if (kind === "url") {
    await env.CLIPBOARD_DB.prepare("DELETE FROM url_clicks WHERE code = ?").bind(id).run();
    await env.CLIPBOARD_DB.prepare("DELETE FROM short_urls WHERE code = ?").bind(id).run();
    return jsonResponse({ deleted: id, kind: "url" });
  }

  const clip = await env.CLIPBOARD_DB.prepare("SELECT r2_key FROM clips WHERE id = ?")
    .bind(id)
    .first<{ r2_key: string }>();

  if (clip?.r2_key) {
    await env.CLIPBOARD_FILES.delete(clip.r2_key).catch(() => {});
  }
  await env.CLIPBOARD_DB.prepare("DELETE FROM clips WHERE id = ?").bind(id).run();
  return jsonResponse({ deleted: id, kind: "clip" });
};
