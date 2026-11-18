import type { APIRoute } from "astro";
import { getEnv, isIdAvailable, jsonResponse } from "@lib/server";

export const GET: APIRoute = async ({ url }) => {
  const id = (url.searchParams.get("id") || "").trim().toLowerCase();
  if (!id) {
    return jsonResponse({ available: false, error: "ID is required" }, 400);
  }
  const env = getEnv();
  const available = await isIdAvailable(env.CLIPBOARD_DB, id, env.CLIPBOARD_FILES);
  return jsonResponse({ id, available });
};
