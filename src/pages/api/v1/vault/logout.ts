import type { APIRoute } from "astro";
import { isHttpsRequest, jsonResponse } from "@lib/server";

export const POST: APIRoute = async ({ request, url }) => {
  const cookieParts = [
    "cb_vault=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isHttpsRequest(request, url)) cookieParts.push("Secure");

  return jsonResponse(
    { authenticated: false },
    200,
    { "Set-Cookie": cookieParts.join("; ") }
  );
};
