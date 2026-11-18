import type { APIRoute } from "astro";
import {
  consumeClipView,
  getEnv,
  isVaultAdmin,
  jsonResponse,
  sanitizeClipForClient,
  verifyClipAccess,
  type ClipRow,
} from "@lib/server";

export const GET: APIRoute = async ({ params, request }) => {
  const id = (params.id || "").trim().toLowerCase();
  if (!id) return jsonResponse({ error: "Missing ID" }, 400);

  const env = getEnv();
  const clip = await env.CLIPBOARD_DB.prepare("SELECT * FROM clips WHERE id = ?")
    .bind(id)
    .first<ClipRow>();

  if (!clip) {
    return jsonResponse({ error: "Clipboard item not found." }, 404);
  }

  const admin = await isVaultAdmin(request, env);
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const headerPassword = request.headers.get("X-Password");
  const access = await verifyClipAccess(env, clip, headerPassword, admin, ip);

  if (!access.ok) {
    if (access.status === 401) {
      return jsonResponse(
        {
          id: clip.id,
          kind: clip.kind,
          title: clip.title,
          hasPassword: true,
          isEditable: Boolean(clip.is_editable || clip.id.endsWith("-e")),
          isE2EE: Boolean(clip.is_e2ee),
          requiresPassword: true,
        },
        401
      );
    }
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

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = (params.id || "").trim().toLowerCase();
  if (!id) return jsonResponse({ error: "Missing ID" }, 400);

  const env = getEnv();
  const clip = await env.CLIPBOARD_DB.prepare("SELECT * FROM clips WHERE id = ?")
    .bind(id)
    .first<ClipRow>();

  if (!clip) {
    return jsonResponse({ error: "Clipboard item not found." }, 404);
  }

  if (clip.kind === "image" || clip.kind === "file") {
    return jsonResponse({ error: "Binary file clips cannot be edited as text." }, 403);
  }

  const isEditable = Boolean(clip.is_editable || clip.id.endsWith("-e"));
  if (!isEditable) {
    return jsonResponse({ error: "This clip is read-only." }, 403);
  }

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const admin = await isVaultAdmin(request, env);
  const ip = request.headers.get("cf-connecting-ip") || "local";
  if (!admin && !clip.password_hash) {
    return jsonResponse({ error: "Editable clips without a password cannot be modified." }, 403);
  }
  const pass = typeof body.password === "string" ? body.password : request.headers.get("X-Password") || "";
  const access = await verifyClipAccess(env, clip, pass, admin, ip);
  if (!access.ok) {
    return jsonResponse({ error: access.message }, access.status);
  }

  const newContent = typeof body.content === "string" ? body.content : "";
  if (!newContent.trim()) {
    return jsonResponse({ error: "Content cannot be empty." }, 400);
  }
  if (newContent.length > 500_000) {
    return jsonResponse({ error: "Content exceeds 500,000 characters." }, 413);
  }

  const now = new Date().toISOString();
  await env.CLIPBOARD_DB.prepare(
    "UPDATE clips SET content = ?, updated_at = ? WHERE id = ?"
  )
    .bind(newContent, now, id)
    .run();

  return jsonResponse({
    id,
    content: newContent,
    updatedAt: now,
    status: "updated",
  });
};

export const DELETE: APIRoute = async ({ params, request }) => {
  const id = (params.id || "").trim().toLowerCase();
  const env = getEnv();
  const clip = await env.CLIPBOARD_DB.prepare("SELECT * FROM clips WHERE id = ?")
    .bind(id)
    .first<ClipRow>();

  if (!clip) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  const admin = await isVaultAdmin(request, env);
  if (!admin) {
    if (!clip.password_hash) {
      return jsonResponse({ error: "Only password-protected clips or vault admins can delete items." }, 403);
    }
    const ip = request.headers.get("cf-connecting-ip") || "local";
    const pass = request.headers.get("X-Password") || "";
    const access = await verifyClipAccess(env, clip, pass, false, ip);
    if (!access.ok) {
      return jsonResponse({ error: access.message }, access.status);
    }
  }

  if (clip.r2_key) {
    await env.CLIPBOARD_FILES.delete(clip.r2_key).catch(() => {});
  }
  await env.CLIPBOARD_DB.prepare("DELETE FROM clips WHERE id = ?").bind(id).run();
  return jsonResponse({ id, status: "deleted" });
};
