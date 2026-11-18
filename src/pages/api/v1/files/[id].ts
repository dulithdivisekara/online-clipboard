import type { APIRoute } from "astro";
import {
  consumeClipView,
  getEnv,
  isVaultAdmin,
  jsonResponse,
  SAFE_RASTER_IMAGE_TYPES,
  verifyClipAccess,
  type ClipRow,
} from "@lib/server";

async function serveFile(
  id: string,
  request: Request,
  cfContext: ExecutionContext,
  providedPassword: string | null,
  forceDownload: boolean
): Promise<Response> {
  const env = getEnv();
  const clip = await env.CLIPBOARD_DB.prepare("SELECT * FROM clips WHERE id = ?")
    .bind(id)
    .first<ClipRow>();

  if (!clip || !clip.r2_key) {
    return jsonResponse({ error: "File not found." }, 404);
  }

  const admin = await isVaultAdmin(request, env);
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const access = await verifyClipAccess(env, clip, providedPassword, admin, ip);
  if (!access.ok) {
    return jsonResponse({ error: access.message }, access.status);
  }

  const obj = await env.CLIPBOARD_FILES.get(clip.r2_key);
  if (!obj) {
    return jsonResponse({ error: "Stored file object is missing." }, 404);
  }

  const { burned, exhausted } = await consumeClipView(env, clip, true);
  if (exhausted) {
    return jsonResponse({ error: "This file reached its download limit." }, 404);
  }

  const isSafeInlineRaster =
    !forceDownload &&
    clip.kind === "image" &&
    SAFE_RASTER_IMAGE_TYPES.has((clip.mime_type || "").toLowerCase());

  const headers = new Headers();
  headers.set(
    "Content-Type",
    isSafeInlineRaster ? clip.mime_type : "application/octet-stream"
  );
  headers.set("Content-Length", String(obj.size));
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "sandbox");
  const disposition = isSafeInlineRaster ? "inline" : "attachment";
  headers.set("Content-Disposition", `${disposition}; filename="${clip.file_name || "file"}"`);

  if (burned) {
    // Stream body via TransformStream without buffering 98 MB in Worker RAM, then delete R2 object
    const { readable, writable } = new TransformStream();
    let deleted = false;
    const deleteOnce = () => {
      if (deleted) return;
      deleted = true;
      return env.CLIPBOARD_FILES.delete(clip.r2_key).catch(() => {});
    };
    const pipePromise = obj.body.pipeTo(writable).finally(deleteOnce);
    if (cfContext) {
      cfContext.waitUntil(pipePromise);
    } else {
      await pipePromise;
    }
    return new Response(readable, { status: 200, headers });
  }

  return new Response(obj.body, { status: 200, headers });
}

export const GET: APIRoute = async ({ params, request, url, locals }) => {
  const id = (params.id || "").trim().toLowerCase();
  if (!id) return jsonResponse({ error: "Missing file ID" }, 400);
  const password = request.headers.get("X-Password");
  const forceDownload = url.searchParams.get("download") === "1";
  return serveFile(id, request, locals.cfContext, password, forceDownload);
};

export const POST: APIRoute = async ({ params, request, url, locals }) => {
  const id = (params.id || "").trim().toLowerCase();
  if (!id) return jsonResponse({ error: "Missing file ID" }, 400);
  let password = request.headers.get("X-Password");
  if (!password) {
    try {
      const body = (await request.json()) as { password?: string };
      password = body.password || null;
    } catch {
      password = null;
    }
  }
  const forceDownload = url.searchParams.get("download") === "1";
  return serveFile(id, request, locals.cfContext, password, forceDownload);
};
