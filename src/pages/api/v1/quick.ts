import type { APIRoute } from "astro";
import { timingSafeEqual } from "@lib/crypto";
import { getEnv, jsonResponse } from "@lib/server";

function getBearerOrAuthHeader(request: Request): string {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return request.headers.get("X-Auth")?.trim() || "";
}

function authorizeQuick(request: Request, env: App.Env): boolean {
  const expected = env.QUICK_API_TOKEN;
  if (!expected) return false;
  const provided = getBearerOrAuthHeader(request);
  if (!provided) return false;
  return timingSafeEqual(provided, expected);
}

export const GET: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!authorizeQuick(request, env)) {
    return jsonResponse(
      { error: "Unauthorized. Provide Authorization: Bearer <QUICK_API_TOKEN>." },
      401
    );
  }

  const raw = await env.CLIPBOARD_KV.get("quick:latest");
  if (!raw) {
    return jsonResponse({ type: "text", data: "", clientName: "", updatedAt: null });
  }
  return jsonResponse(JSON.parse(raw));
};

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!authorizeQuick(request, env)) {
    return jsonResponse(
      { error: "Unauthorized. Provide Authorization: Bearer <QUICK_API_TOKEN>." },
      401
    );
  }

  let data = "";
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { data?: string; text?: string };
    data = typeof body.data === "string" ? body.data : typeof body.text === "string" ? body.text : "";
  } else {
    data = await request.text();
  }

  if (!data) {
    return jsonResponse({ error: "No clipboard content provided." }, 400);
  }
  if (data.length > 200_000) {
    return jsonResponse({ error: "Quick clipboard text exceeds 200,000 characters." }, 413);
  }

  const clientName = (request.headers.get("X-Client-Name") || "API Client").slice(0, 48);
  const payload = {
    type: "text",
    data,
    clientName,
    updatedAt: new Date().toISOString(),
  };

  await env.CLIPBOARD_KV.put("quick:latest", JSON.stringify(payload), {
    expirationTtl: 60 * 60 * 24 * 30,
  });

  return jsonResponse({ status: "saved", ...payload }, 200);
};
