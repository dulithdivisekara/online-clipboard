import type { APIRoute } from "astro";
import { getEnv, jsonResponse } from "@lib/server";
import { queryUrlAnalytics } from "@lib/url-redirect";
import { isExpired } from "@lib/ttl";

export const GET: APIRoute = async ({ params }) => {
  const rawCode = (params.code || "").trim().toLowerCase();
  const code = rawCode.endsWith("+") ? rawCode.slice(0, -1) : rawCode;
  if (!code) return jsonResponse({ error: "Missing code" }, 400);

  const env = getEnv();
  const urlRow = await env.CLIPBOARD_DB.prepare(
    "SELECT code, target_url, title, expires_at, created_at FROM short_urls WHERE code = ?"
  )
    .bind(code)
    .first<{
      code: string;
      target_url: string;
      title: string;
      expires_at: string | null;
      created_at: string;
    }>();

  if (!urlRow || isExpired(urlRow.expires_at)) {
    return jsonResponse({ error: "Short URL not found or expired." }, 404);
  }

  const analytics = await queryUrlAnalytics(env.CLIPBOARD_DB, urlRow);
  return jsonResponse(analytics);
};
