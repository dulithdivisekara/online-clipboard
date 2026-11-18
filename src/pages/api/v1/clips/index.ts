import type { APIRoute } from "astro";
import {
  allocateClipId,
  buildPasswordFields,
  getEnv,
  getUploadPolicy,
  isVaultAdmin,
  jsonResponse,
  resolveExpiry,
} from "@lib/server";

const ALLOWED_KINDS = new Set(["text", "markdown", "code"]);

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const admin = await isVaultAdmin(request, env);
  if (!admin) {
    const policy = await getUploadPolicy(env.CLIPBOARD_DB);
    if (!policy.textUpload) {
      return jsonResponse({ error: "Text uploads are temporarily disabled by the administrator." }, 403);
    }
  }

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const content = typeof body.content === "string" ? body.content : "";
  if (!content.trim()) {
    return jsonResponse({ error: "Content cannot be empty." }, 400);
  }
  if (content.length > 500_000) {
    return jsonResponse({ error: "Text exceeds 500,000 character limit." }, 413);
  }

  const kind = ALLOWED_KINDS.has(body.kind) ? body.kind : "text";
  const title = typeof body.title === "string" ? body.title.slice(0, 120) : "";
  const language = typeof body.language === "string" ? body.language.slice(0, 40) : "";
  const isE2EE = body.isE2EE ? 1 : 0;
  const requestedId = typeof body.id === "string" ? body.id.trim().toLowerCase() : "";
  const isEditable = body.isEditable || requestedId.endsWith("-e") ? 1 : 0;
  const maxViews = Math.max(0, Math.min(10000, parseInt(body.maxViews, 10) || 0));
  const password = typeof body.password === "string" ? body.password : "";

  if (isEditable && !password.trim()) {
    return jsonResponse(
      { error: "Editable clips require a password so only authorized edits are permitted." },
      400
    );
  }

  const allocated = await allocateClipId(
    env.CLIPBOARD_DB,
    requestedId || null,
    Boolean(isEditable),
    env.CLIPBOARD_FILES
  );
  if (!allocated.id) {
    return jsonResponse({ error: allocated.error || "ID unavailable" }, 409);
  }

  const { passwordHash, passwordSalt } = await buildPasswordFields(password);
  const now = new Date().toISOString();
  const expiresAt = resolveExpiry(body.expiresIn);
  const clientName = (request.headers.get("X-Client-Name") || "").slice(0, 48);

  try {
    await env.CLIPBOARD_DB.prepare(
      `INSERT INTO clips
        (id, kind, title, language, content, is_editable, is_e2ee, password_hash, password_salt, max_views, view_count, expires_at, client_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
    )
      .bind(
        allocated.id,
        kind,
        title,
        language,
        content,
        isEditable,
        isE2EE,
        passwordHash,
        passwordSalt,
        maxViews,
        expiresAt,
        clientName,
        now,
        now
      )
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("UNIQUE")) {
      return jsonResponse({ error: "Custom ID was claimed concurrently. Please retry." }, 409);
    }
    return jsonResponse({ error: "Failed to save clipboard entry." }, 500);
  }

  return jsonResponse(
    {
      id: allocated.id,
      kind,
      isEditable: Boolean(isEditable),
      isE2EE: Boolean(isE2EE),
      hasPassword: Boolean(passwordHash),
      maxViews,
      expiresAt,
      createdAt: now,
    },
    201
  );
};
