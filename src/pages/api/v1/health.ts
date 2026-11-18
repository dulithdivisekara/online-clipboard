import type { APIRoute } from "astro";
import { getEnv, jsonResponse } from "@lib/server";

export const GET: APIRoute = async () => {
  try {
    const env = getEnv();
    await env.CLIPBOARD_DB.prepare("SELECT 1 AS ok").first();
    return jsonResponse({ status: "ok", service: "clipboard.dulith.me" });
  } catch (err) {
    return jsonResponse(
      { status: "error", message: err instanceof Error ? err.message : "Health check failed" },
      500
    );
  }
};
