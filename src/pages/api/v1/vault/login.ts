import type { APIRoute } from "astro";
import { signSessionToken, timingSafeEqual } from "@lib/crypto";
import { checkRateLimit, getEnv, isHttpsRequest, jsonResponse } from "@lib/server";

export const POST: APIRoute = async ({ request, url }) => {
  const env = getEnv();
  const expected = env.VAULT_PASSCODE;
  const secret = env.SESSION_SECRET;

  if (!expected || !secret) {
    return jsonResponse(
      { error: "Vault secrets (VAULT_PASSCODE & SESSION_SECRET) are not configured." },
      503
    );
  }

  const ip = request.headers.get("cf-connecting-ip") || "local";
  const allowed = await checkRateLimit(env.CLIPBOARD_KV, `vault:${ip}`, 15, 300);
  if (!allowed) {
    return jsonResponse({ error: "Too many sign-in attempts. Please wait 5 minutes." }, 429);
  }

  let body: { passcode?: string } = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const provided = typeof body.passcode === "string" ? body.passcode : "";
  if (!provided || !timingSafeEqual(provided, expected)) {
    return jsonResponse({ error: "Incorrect passcode." }, 401);
  }

  const token = await signSessionToken(secret, { role: "vault-admin" }, 86400);
  const cookieParts = [
    `cb_vault=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=86400",
  ];
  if (isHttpsRequest(request, url)) cookieParts.push("Secure");

  return jsonResponse(
    { authenticated: true },
    200,
    { "Set-Cookie": cookieParts.join("; ") }
  );
};
