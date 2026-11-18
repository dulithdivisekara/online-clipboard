import { DurableObject } from "cloudflare:workers";

export interface PeerAttachment {
  clientId: string;
  clientName: string;
  color: string;
  joinedAt: string;
}

export interface StrokeRecord {
  id: string;
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
  author: string;
}

export interface RoomFileRecord {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
  expiresAt: string | null;
  hasPassword: boolean;
}

const PALETTE = [
  "#0a74e6",
  "#177a2b",
  "#d946ef",
  "#f97316",
  "#06b6d4",
  "#e11d48",
  "#8b5cf6",
];

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

export class RoomHub extends DurableObject {
  private initialized = false;

  private ensureSchema(): void {
    if (this.initialized) return;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS room_strokes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS room_files (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE NOT NULL,
        payload TEXT NOT NULL
      );
    `);
    this.initialized = true;
  }

  private async touchAlarm(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  private getMeta(key: string, fallback: string): string {
    this.ensureSchema();
    const rows = this.ctx.storage.sql
      .exec<{ value: string }>("SELECT value FROM room_meta WHERE key = ?", key)
      .toArray();
    return rows[0]?.value ?? fallback;
  }

  private setMeta(key: string, value: string): void {
    this.ensureSchema();
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO room_meta (key, value) VALUES (?, ?)",
      key,
      value
    );
  }

  private getStateSnapshot() {
    this.ensureSchema();
    const text = this.getMeta("text", "");
    let images: string[] = [];
    try {
      images = JSON.parse(this.getMeta("images", "[]"));
    } catch {
      images = [];
    }
    const strokes = this.ctx.storage.sql
      .exec<{ payload: string }>("SELECT payload FROM room_strokes ORDER BY seq ASC LIMIT 600")
      .toArray()
      .map((r) => JSON.parse(r.payload) as StrokeRecord);
    const files = this.ctx.storage.sql
      .exec<{ payload: string }>("SELECT payload FROM room_files ORDER BY seq DESC LIMIT 30")
      .toArray()
      .map((r) => JSON.parse(r.payload) as RoomFileRecord);
    return { text, images, strokes, files };
  }

  private getPeers(): PeerAttachment[] {
    const peers: PeerAttachment[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as PeerAttachment | null;
      if (att) peers.push(att);
    }
    return peers;
  }

  private broadcast(payload: unknown, exclude?: WebSocket): void {
    const raw = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(raw);
      } catch {
        // Ignore closed socket
      }
    }
  }

  async alarm(): Promise<void> {
    if (this.ctx.getWebSockets().length === 0) {
      await this.ctx.storage.deleteAll();
      this.initialized = false;
    } else {
      await this.touchAlarm();
    }
  }

  async fetch(request: Request): Promise<Response> {
    if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const url = new URL(request.url);
    const clientName = (url.searchParams.get("name") || "Guest").slice(0, 32);
    const clientId = crypto.randomUUID().slice(0, 8);
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const attachment: PeerAttachment = {
      clientId,
      clientName,
      color,
      joinedAt: new Date().toISOString(),
    };

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    await this.touchAlarm();

    const state = this.getStateSnapshot();
    server.send(
      JSON.stringify({
        type: "init",
        self: attachment,
        peers: this.getPeers(),
        state,
      })
    );

    this.broadcast({ type: "presence", peers: this.getPeers() }, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    let msg: Record<string, any>;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    this.ensureSchema();
    await this.touchAlarm();

    switch (msg.type) {
      case "ping": {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }
      case "text-update": {
        if (typeof msg.text === "string" && msg.text.length <= 200_000) {
          this.setMeta("text", msg.text);
          this.broadcast({ type: "text-update", text: msg.text, from: msg.from }, ws);
        }
        return;
      }
      case "image-sync": {
        if (Array.isArray(msg.images)) {
          const urls = msg.images
            .filter(
              (s: unknown): s is string =>
                typeof s === "string" &&
                s.length <= 512 &&
                /^\/api\/v1\/files\/[a-z0-9_-]{2,64}$/i.test(s)
            )
            .slice(-24);
          this.setMeta("images", JSON.stringify(urls));
          this.broadcast({ type: "image-sync", images: urls }, ws);
        }
        return;
      }
      case "stroke-add": {
        const stroke = msg.stroke as StrokeRecord | undefined;
        if (
          stroke &&
          typeof stroke.id === "string" &&
          stroke.id.trim().length > 0 &&
          Array.isArray(stroke.points) &&
          stroke.points.length > 0 &&
          stroke.points.length <= 2000
        ) {
          const cleanStroke: StrokeRecord = {
            id: stroke.id.trim().slice(0, 64),
            color: /^#[0-9a-f]{3,8}$/i.test(String(stroke.color || ""))
              ? String(stroke.color)
              : "#0a74e6",
            width: Math.max(1, Math.min(24, Number(stroke.width) || 4)),
            points: stroke.points.slice(0, 2000).map((p) => {
              const rawX = Number(p?.x);
              const rawY = Number(p?.y);
              return {
                x: Number.isFinite(rawX) ? Math.round(rawX) : 0,
                y: Number.isFinite(rawY) ? Math.round(rawY) : 0,
              };
            }),
            author: String(stroke.author || "").slice(0, 24),
          };
          this.ctx.storage.sql.exec(
            "INSERT OR IGNORE INTO room_strokes (id, payload) VALUES (?, ?)",
            cleanStroke.id,
            JSON.stringify(cleanStroke)
          );
          this.ctx.storage.sql.exec(
            "DELETE FROM room_strokes WHERE seq NOT IN (SELECT seq FROM room_strokes ORDER BY seq DESC LIMIT 600)"
          );
          this.broadcast({ type: "stroke-add", stroke: cleanStroke }, ws);
        }
        return;
      }
      case "stroke-undo": {
        if (typeof msg.strokeId === "string") {
          this.ctx.storage.sql.exec("DELETE FROM room_strokes WHERE id = ?", msg.strokeId);
          this.broadcast({ type: "stroke-undo", strokeId: msg.strokeId }, ws);
        }
        return;
      }
      case "stroke-clear": {
        this.ctx.storage.sql.exec("DELETE FROM room_strokes");
        this.broadcast({ type: "stroke-clear" }, ws);
        return;
      }
      case "file-announce": {
        const f = msg.file as RoomFileRecord | undefined;
        if (
          f &&
          typeof f.id === "string" &&
          /^[a-z0-9_-]{2,64}$/i.test(f.id) &&
          typeof f.fileName === "string"
        ) {
          const cleanId = f.id.toLowerCase();
          const clean: RoomFileRecord = {
            id: cleanId,
            fileName: f.fileName.slice(0, 128),
            fileSize: Number(f.fileSize) || 0,
            mimeType: typeof f.mimeType === "string" ? f.mimeType.slice(0, 80) : "application/octet-stream",
            downloadUrl: `/api/v1/files/${encodeURIComponent(cleanId)}`,
            expiresAt: f.expiresAt ?? null,
            hasPassword: Boolean(f.hasPassword),
          };
          this.ctx.storage.sql.exec(
            "INSERT OR REPLACE INTO room_files (id, payload) VALUES (?, ?)",
            clean.id,
            JSON.stringify(clean)
          );
          this.broadcast({ type: "file-announce", file: clean }, ws);
        }
        return;
      }
      default:
        return;
    }
  }

  async webSocketClose(): Promise<void> {
    this.broadcast({ type: "presence", peers: this.getPeers() });
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // ignore
    }
    this.broadcast({ type: "presence", peers: this.getPeers() });
  }
}
