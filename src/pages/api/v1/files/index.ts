import type { APIRoute } from "astro";
import {
  allocateClipId,
  buildPasswordFields,
  getEnv,
  getUploadPolicy,
  isVaultAdmin,
  jsonResponse,
  MAX_FILE_BYTES,
  MAX_TOTAL_STORAGE_BYTES,
  resolveExpiry,
  SAFE_RASTER_IMAGE_TYPES,
} from "@lib/server";

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const admin = await isVaultAdmin(request, env);
  if (!admin) {
    const policy = await getUploadPolicy(env.CLIPBOARD_DB);
    if (!policy.fileUpload) {
      return jsonResponse({ error: "File uploads are temporarily disabled by the administrator." }, 403);
    }
  }

  const contentLen = parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLen > MAX_FILE_BYTES + 1024 * 1024) {
    return jsonResponse({ error: "Request exceeds the 98 MB per-file limit." }, 413);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse({ error: "Expected multipart/form-data upload." }, 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonResponse({ error: "Please attach a non-empty file." }, 400);
  }
  if (file.size > MAX_FILE_BYTES) {
    return jsonResponse({ error: "File exceeds the 98 MB per-file limit." }, 413);
  }

  const now = new Date().toISOString();
  const totalRow = await env.CLIPBOARD_DB.prepare(
    `SELECT COALESCE(SUM(file_size), 0) AS used
     FROM clips
     WHERE (expires_at IS NULL OR expires_at > ?)
       AND (max_views = 0 OR view_count < max_views)`
  )
    .bind(now)
    .first<{ used: number }>();

  if ((totalRow?.used || 0) + file.size > MAX_TOTAL_STORAGE_BYTES) {
    return jsonResponse({ error: "Storage capacity reached. Please try again later." }, 507);
  }

  const requestedId = (formData.get("id") as string | null)?.trim().toLowerCase() || "";
  const allocated = await allocateClipId(
    env.CLIPBOARD_DB,
    requestedId || null,
    false,
    env.CLIPBOARD_FILES
  );
  if (!allocated.id) {
    return jsonResponse({ error: allocated.error || "ID unavailable" }, 409);
  }

  const mime = (file.type || "application/octet-stream").toLowerCase();
  const kind = SAFE_RASTER_IMAGE_TYPES.has(mime) ? "image" : "file";
  const password = (formData.get("password") as string | null) || "";
  const expiresIn = (formData.get("expiresIn") as string | null) || "7d";
  const maxViews = Math.max(
    0,
    Math.min(10000, parseInt((formData.get("maxViews") as string | null) || "0", 10) || 0)
  );
  const title = ((formData.get("title") as string | null) || "").slice(0, 120);

  const safeName = (file.name || "file").replace(/[^\w.\-() ]+/g, "_").slice(0, 120);
  const r2Key = `${allocated.id}/${safeName}`;

  await env.CLIPBOARD_FILES.put(r2Key, file.stream(), {
    httpMetadata: {
      contentType: file.type || "application/octet-stream",
    },
    customMetadata: {
      clipId: allocated.id,
      fileName: safeName,
    },
  });

  const { passwordHash, passwordSalt } = await buildPasswordFields(password);
  const expiresAt = resolveExpiry(expiresIn);

  try {
    await env.CLIPBOARD_DB.prepare(
      `INSERT INTO clips
        (id, kind, title, r2_key, file_name, mime_type, file_size, is_editable, is_e2ee, password_hash, password_salt, max_views, view_count, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 0, ?, ?, ?)`
    )
      .bind(
        allocated.id,
        kind,
        title,
        r2Key,
        safeName,
        file.type || "application/octet-stream",
        file.size,
        passwordHash,
        passwordSalt,
        maxViews,
        expiresAt,
        now,
        now
      )
      .run();
  } catch (err) {
    await env.CLIPBOARD_FILES.delete(r2Key).catch(() => {});
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("UNIQUE")) {
      return jsonResponse({ error: "That ID was claimed concurrently. Try again." }, 409);
    }
    return jsonResponse({ error: "Failed to persist file metadata." }, 500);
  }

  return jsonResponse(
    {
      id: allocated.id,
      kind,
      fileName: safeName,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      hasPassword: Boolean(passwordHash),
      maxViews,
      expiresAt,
      downloadUrl: `/api/v1/files/${encodeURIComponent(allocated.id)}`,
    },
    201
  );
};
