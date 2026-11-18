import type { APIRoute } from "astro";
import { generateShortId, isValidCustomId } from "@lib/crypto";
import { getEnv, isIdAvailable, jsonResponse, RESERVED_SLUGS, resolveExpiry } from "@lib/server";

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only http and https URLs are supported");
    }
  } catch {
    return jsonResponse({ error: "Please enter a valid http:// or https:// URL." }, 400);
  }

  const customCode = typeof body.code === "string" ? body.code.trim().toLowerCase() : "";
  let code = customCode;

  if (code) {
    if (!isValidCustomId(code) || RESERVED_SLUGS.has(code)) {
      return jsonResponse(
        { error: "Custom alias must be 2–64 alphanumeric, hyphen, or underscore characters." },
        400
      );
    }
    const available = await isIdAvailable(env.CLIPBOARD_DB, code, env.CLIPBOARD_FILES);
    if (!available) {
      return jsonResponse({ error: "That alias is already taken." }, 409);
    }
  } else {
    for (let i = 0; i < 8; i++) {
      const candidate = generateShortId(5, "lower");
      if (await isIdAvailable(env.CLIPBOARD_DB, candidate, env.CLIPBOARD_FILES)) {
        code = candidate;
        break;
      }
    }
  }

  if (!code) {
    return jsonResponse({ error: "Unable to allocate short code." }, 500);
  }

  const title = typeof body.title === "string" ? body.title.slice(0, 120) : "";
  const expiresAt = body.expiresIn ? resolveExpiry(body.expiresIn) : null;
  const now = new Date().toISOString();

  try {
    await env.CLIPBOARD_DB.prepare(
      "INSERT INTO short_urls (code, target_url, title, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(code, parsed.toString(), title, expiresAt, now)
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("UNIQUE")) {
      return jsonResponse({ error: "Alias was claimed concurrently. Please retry." }, 409);
    }
    return jsonResponse({ error: "Failed to save short URL." }, 500);
  }

  return jsonResponse(
    {
      code,
      targetUrl: parsed.toString(),
      title,
      expiresAt,
      createdAt: now,
    },
    201
  );
};
