import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Eye, ImagePlus, QrCode, Share2, Trash2, Wifi, WifiOff } from "lucide-react";
import QrModal from "./QrModal";
import { copyTextSafely, showToast } from "@lib/liquid-optics";
import { renderSafeMarkdown } from "@lib/sanitize";

interface Peer {
  clientId: string;
  clientName: string;
  color: string;
}

export default function LiveClipboardRoom({ roomId }: { roomId: string }) {
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [previewMd, setPreviewMd] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const label = /Mobile|Android|iPhone/i.test(navigator.userAgent) ? "Mobile" : "Desktop";
    const wsUrl = `${proto}//${window.location.host}/api/v1/ws/live/${encodeURIComponent(roomId)}?name=${encodeURIComponent(label)}`;

    let closed = false;
    let reconnectTimer: number | undefined;
    let heartbeatTimer: number | undefined;

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        setConnected(true);
        heartbeatTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);
      });

      ws.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "init") {
            setPeers(msg.peers || []);
            setText(msg.state?.text || "");
            setImages(msg.state?.images || []);
          } else if (msg.type === "presence") {
            setPeers(msg.peers || []);
          } else if (msg.type === "text-update") {
            setText(msg.text || "");
          } else if (msg.type === "image-sync") {
            setImages(msg.images || []);
          }
        } catch {
          // Ignore invalid payloads
        }
      });

      ws.addEventListener("close", () => {
        setConnected(false);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (!closed) {
          reconnectTimer = window.setTimeout(connect, 1800);
        }
      });
    };

    connect();
    return () => {
      closed = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      wsRef.current?.close();
    };
  }, [roomId]);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/live-clipboard?id=${encodeURIComponent(roomId)}`
      : `https://clipboard.dulith.me/live-clipboard?id=${encodeURIComponent(roomId)}`;

  const mdHtml = useMemo(() => (previewMd ? renderSafeMarkdown(text) : ""), [previewMd, text]);

  const sendText = (next: string) => {
    setText(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "text-update", text: next }));
      }
    }, 60);
  };

  const handleImagesSelected = async (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...images];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.type.startsWith("image/")) {
        showToast("Only image files can be added here", "err");
        continue;
      }
      const fd = new FormData();
      fd.append("file", f);
      fd.append("expiresIn", "1d");
      try {
        const res = await fetch("/api/v1/files", { method: "POST", body: fd });
        const data = (await res.json()) as { downloadUrl?: string; error?: string };
        if (!res.ok || !data.downloadUrl) {
          throw new Error(data.error || "Image upload failed");
        }
        next.push(data.downloadUrl);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Image upload failed", "err");
      }
    }
    const capped = next.slice(-24);
    setImages(capped);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "image-sync", images: capped }));
    }
  };

  return (
    <section className="glass-card sheet" aria-label="Live Clipboard Room">
      <div className="step-head">
        <div className="btn-group">
          <span className={`badge-pill ${connected ? "ok" : "warn"}`}>
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{connected ? "Connected" : "Reconnecting..."}</span>
          </span>
          <span className="badge-pill">
            Room: <strong style={{ fontFamily: "var(--font-mono)" }}>{roomId}</strong>
          </span>
        </div>

        <div className="presence-strip" aria-label="Active devices">
          {peers.map((p) => (
            <span key={p.clientId} className="peer-chip">
              <span className="peer-dot" style={{ background: p.color }} />
              <span>{p.clientName}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="action-row">
        <div className="btn-group">
          <button
            type="button"
            className={`quiet-btn ${previewMd ? "active" : ""}`}
            onClick={() => setPreviewMd((v) => !v)}
          >
            <Eye size={15} />
            <span>{previewMd ? "Edit Text" : "Markdown Preview"}</span>
          </button>
          <button
            type="button"
            className="quiet-btn"
            onClick={() => {
              sendText("");
              showToast("Room cleared");
            }}
          >
            <Trash2 size={15} />
            <span>Clear</span>
          </button>
        </div>

        <div className="btn-group">
          <button
            type="button"
            className="quiet-btn"
            onClick={() => copyTextSafely(text, "Room text copied")}
          >
            <Copy size={15} />
            <span>Copy Text</span>
          </button>
          <button
            type="button"
            className="quiet-btn"
            onClick={() => setQrOpen(true)}
          >
            <QrCode size={15} />
            <span>QR</span>
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => copyTextSafely(shareUrl, "Room invite link copied")}
          >
            <Share2 size={15} />
            <span>Share Room</span>
          </button>
        </div>
      </div>

      <div className="field-grid live-grid">
        <div className="field">
          {previewMd ? (
            <div
              className="clip-preview"
              style={{ minHeight: 320 }}
              dangerouslySetInnerHTML={{
                __html: mdHtml || "<p>Start typing to preview Markdown live.</p>",
              }}
            />
          ) : (
            <textarea
              aria-label="Live clipboard shared text"
              className="glass-textarea mono"
              style={{ minHeight: 320 }}
              placeholder="Type or paste here — changes sync in real time across every open device in this room..."
              value={text}
              onChange={(e) => sendText(e.target.value)}
            />
          )}
        </div>

        <div className="well" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="step-head">
            <strong style={{ fontSize: 14 }}>Shared Images</strong>
            <button
              type="button"
              className="quiet-btn hit-expand"
              style={{ minHeight: 34, fontSize: 13 }}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus size={14} />
              <span>Add</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleImagesSelected(e.target.files)}
            />
          </div>

          {images.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--label-tertiary)" }}>
              Add quick screenshots or photos to sync them live with peers via Cloudflare R2.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 8, maxHeight: 280, overflowY: "auto" }}>
              {images.map((src, i) => (
                <a key={i} href={`${src}?download=1`} download={`live-image-${i + 1}`}>
                  <img
                    src={src}
                    alt={`Shared room image ${i + 1}`}
                    style={{ width: "100%", borderRadius: 12, display: "block" }}
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <QrModal open={qrOpen} url={shareUrl} title="Join Live Clipboard Room" onClose={() => setQrOpen(false)} />
    </section>
  );
}
