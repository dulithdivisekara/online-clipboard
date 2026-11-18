import type { APIRoute } from "astro";
import {
  checkRateLimit,
  consumeClipView,
  getEnv,
  isVaultAdmin,
  jsonResponse,
  sanitizeClipForClient,
  verifyClipAccess,
  type ClipRow,
} from "@lib/server";

export const POST: APIRoute = async ({ params, request }) => {
  const id = (params.id || "").trim().toLowerCase();
  if (!id) return jsonResponse({ error: "Missing ID" }, 400);

  const env = getEnv();
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const allowed = await checkRateLimit(env.CLIPBOARD_KV, `unlock:${ip}:${id}`, 25, 300);
  if (!allowed) {
    return jsonResponse({ error: "Too many unlock attempts. Please wait a few minutes." }, 429);
  }

  let body: { password?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const clip = await env.CLIPBOARD_DB.prepare("SELECT * FROM clips WHERE id = ?")
    .bind(id)
    .first<ClipRow>();

  if (!clip) {
    return jsonResponse({ error: "Clipboard item not found." }, 404);
  }

  const admin = await isVaultAdmin(request, env);
  const access = await verifyClipAccess(env, clip, body.password || "", admin);
  if (!access.ok) {
    return jsonResponse({ error: access.message }, access.status);
  }

  if (clip.kind === "image" || clip.kind === "file") {
    return jsonResponse({
      ...sanitizeClipForClient(clip),
      downloadUrl: `/api/v1/files/${encodeURIComponent(clip.id)}`,
      requiresPassword: false,
    });
  }

  const { nextViewCount, burned, exhausted } = await consumeClipView(env, clip);
  if (exhausted) {
    return jsonResponse({ error: "This clip reached its view limit." }, 404);
  }
  return jsonResponse({
    ...sanitizeClipForClient(clip, nextViewCount),
    burned,
    requiresPassword: false,
  });
};
