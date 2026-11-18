import type { APIRoute } from "astro";
import { getEnv, jsonResponse } from "@lib/server";

const ALLOWED_ROOMS = new Set(["live", "scribble", "drop"]);

export const GET: APIRoute = async ({ params, request }) => {
  const roomType = (params.roomType || "").toLowerCase();
  const roomId = (params.roomId || "").toLowerCase();

  if (!ALLOWED_ROOMS.has(roomType) || !/^[a-z0-9-_]{2,64}$/i.test(roomId)) {
    return jsonResponse({ error: "Invalid room specification" }, 400);
  }

  if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
    return jsonResponse({ error: "WebSocket upgrade required" }, 426);
  }

  const env = getEnv();
  const stubId = env.ROOM_HUB.idFromName(`${roomType}:${roomId}`);
  const stub = env.ROOM_HUB.get(stubId);
  return stub.fetch(request);
};
