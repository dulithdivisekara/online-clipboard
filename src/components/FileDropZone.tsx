import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileUp,
  QrCode,
  Share2,
  Trash2,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import QrModal from "./QrModal";
import { copyTextSafely, showToast } from "@lib/liquid-optics";
import { formatBytes } from "@lib/ttl";
import { pushRecentHistory } from "@lib/history";

interface SharedFileItem {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
  expiresAt: string | null;
  hasPassword: boolean;
}

interface Peer {
  clientId: string;
  clientName: string;
  color: string;
}

export default function FileDropZone({ roomId }: { roomId: string }) {
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [expiresIn, setExpiresIn] = useState("1d");
  const [maxViews, setMaxViews] = useState("0");
  const [password, setPassword] = useState("");
  const [customId, setCustomId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speedText, setSpeedText] = useState("");
  const [sharedFiles, setSharedFiles] = useState<SharedFileItem[]>([]);
  const [qrUrl, setQrUrl] = useState("");
  const [qrOpen, setQrOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const label = /Mobile|Android|iPhone/i.test(navigator.userAgent) ? "Mobile" : "Desktop";
    const wsUrl = `${proto}//${window.location.host}/api/v1/ws/drop/${encodeURIComponent(roomId)}?name=${encodeURIComponent(label)}`;

    let closed = false;
    let reconnectTimer: number | undefined;

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.addEventListener("open", () => setConnected(true));
      ws.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "init") {
            setPeers(msg.peers || []);
            if (Array.isArray(msg.state?.files)) {
              setSharedFiles(msg.state.files);
            }
          } else if (msg.type === "presence") {
            setPeers(msg.peers || []);
          } else if (msg.type === "file-announce" && msg.file) {
            setSharedFiles((prev) => [msg.file, ...prev.filter((f) => f.id !== msg.file.id)]);
            showToast(`Incoming file: ${msg.file.fileName}`);
          }
        } catch {
          // ignore
        }
      });
      ws.addEventListener("close", () => {
        setConnected(false);
        if (!closed) reconnectTimer = window.setTimeout(connect, 2000);
      });
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [roomId]);

  const uploadOne = (file: File, useCustomSlug: boolean): Promise<SharedFileItem> =>
    new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("expiresIn", expiresIn);
      fd.append("maxViews", maxViews);
      if (password.trim()) fd.append("password", password);
      if (useCustomSlug && customId.trim()) fd.append("id", customId.trim().toLowerCase());

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      const startTime = Date.now();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
          const elapsed = Math.max(0.2, (Date.now() - startTime) / 1000);
          setSpeedText(`${formatBytes(e.loaded / elapsed)}/s`);
        }
      });

      xhr.addEventListener("load", () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data as SharedFileItem);
          } else {
            reject(new Error(data.error || "Upload failed"));
          }
        } catch {
          reject(new Error("Invalid server response"));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
      xhr.open("POST", "/api/v1/files");
      xhr.send(fd);
    });

  const handleUploadAll = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      showToast("Select at least one file", "err");
      return;
    }

    setUploading(true);
    setProgress(0);
    setSpeedText("");

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const res = await uploadOne(selectedFiles[i], selectedFiles.length === 1);
        const fullDownloadUrl = `${window.location.origin}/?id=${encodeURIComponent(res.id)}`;
        setSharedFiles((prev) => [res, ...prev]);

        pushRecentHistory({
          id: res.id,
          kind: "file",
          preview: `${res.fileName} (${formatBytes(res.fileSize)})`,
          url: fullDownloadUrl,
          hasPassword: res.hasPassword,
          expiresAt: res.expiresAt,
          createdAt: new Date().toISOString(),
        });

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "file-announce", file: res }));
        }
      }

      setSelectedFiles([]);
      setCustomId("");
      showToast("Files uploaded & shared");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", "err");
    } finally {
      setUploading(false);
      setProgress(0);
      setSpeedText("");
      xhrRef.current = null;
    }
  };

  const roomShareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/file-drop?id=${encodeURIComponent(roomId)}`
      : `https://clipboard.dulith.me/file-drop?id=${encodeURIComponent(roomId)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section className="glass-card sheet" aria-label="File Drop">
        <div className="step-head">
          <div className="btn-group">
            <span className={`badge-pill ${connected ? "ok" : "warn"}`}>
              {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{connected ? "Room Ready" : "Connecting..."}</span>
            </span>
            <span className="badge-pill">
              Drop Room: <strong style={{ fontFamily: "var(--font-mono)" }}>{roomId}</strong>
            </span>
          </div>

          <div className="btn-group">
            <button
              type="button"
              className="quiet-btn"
              onClick={() => {
                setQrUrl(roomShareUrl);
                setQrOpen(true);
              }}
            >
              <QrCode size={15} />
              <span>Room QR</span>
            </button>
            <button
              type="button"
              className="quiet-btn"
              onClick={() => copyTextSafely(roomShareUrl, "Drop room link copied")}
            >
              <Share2 size={15} />
              <span>Invite Device</span>
            </button>
          </div>
        </div>

        {peers.length > 0 && (
          <div className="presence-strip">
            {peers.map((p) => (
              <span key={p.clientId} className="peer-chip">
                <span className="peer-dot" style={{ background: p.color }} />
                <span>{p.clientName}</span>
              </span>
            ))}
          </div>
        )}

        <form onSubmit={handleUploadAll} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            className="dropzone"
            role="button"
            tabIndex={0}
            aria-label="Select or drop files to upload"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("drag-active");
            }}
            onDragLeave={(e) => e.currentTarget.classList.remove("drag-active")}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("drag-active");
              const dropped = Array.from(e.dataTransfer.files || []);
              if (dropped.length) setSelectedFiles((prev) => [...prev, ...dropped]);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                const picked = Array.from(e.target.files || []);
                if (picked.length) setSelectedFiles((prev) => [...prev, ...picked]);
              }}
            />
            <FileUp size={30} style={{ color: "var(--accent)" }} />
            <p style={{ margin: 0, fontWeight: 620 }}>
              Drop files here or tap to browse (up to 98 MB per file)
            </p>
            <span style={{ fontSize: 13, color: "var(--label-secondary)" }}>
              Files stream to Cloudflare R2 and appear live for devices in this room.
            </span>
          </div>

          {selectedFiles.length > 0 && (
            <div className="well" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selectedFiles.map((f, idx) => (
                <div key={`${f.name}-${idx}`} className="action-row">
                  <span style={{ fontSize: 14, fontWeight: 550 }}>
                    {f.name} <span style={{ color: "var(--label-tertiary)" }}>({formatBytes(f.size)})</span>
                  </span>
                  <button
                    type="button"
                    className="quiet-btn danger hit-expand"
                    aria-label={`Remove ${f.name}`}
                    style={{ minHeight: 32, padding: "0 10px" }}
                    onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="well">
            <div className="field-grid">
              <div className="field">
                <label className="field-label" htmlFor="drop-exp">
                  <span>Expiration</span>
                </label>
                <select
                  id="drop-exp"
                  className="glass-select"
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value)}
                >
                  <option value="1h">1 Hour</option>
                  <option value="1d">1 Day</option>
                  <option value="7d">7 Days</option>
                  <option value="30d">30 Days</option>
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="drop-max">
                  <span>Download Limit</span>
                </label>
                <select
                  id="drop-max"
                  className="glass-select"
                  value={maxViews}
                  onChange={(e) => setMaxViews(e.target.value)}
                >
                  <option value="0">Unlimited Downloads</option>
                  <option value="1">1 Download (Burn After Read)</option>
                  <option value="5">5 Downloads</option>
                  <option value="20">20 Downloads</option>
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="drop-pass">
                  <span>Password (optional)</span>
                </label>
                <input
                  id="drop-pass"
                  type="password"
                  className="glass-input"
                  placeholder="Optional download password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {selectedFiles.length <= 1 && (
                <div className="field">
                  <label className="field-label" htmlFor="drop-slug">
                    <span>Custom File ID (optional)</span>
                  </label>
                  <input
                    id="drop-slug"
                    type="text"
                    className="glass-input mono"
                    placeholder="e.g. build-apk"
                    value={customId}
                    onChange={(e) => setCustomId(e.target.value.toLowerCase())}
                  />
                </div>
              )}
            </div>
          </div>

          {uploading && (
            <div className="well" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="action-row">
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                  Uploading {progress}% {speedText ? `· ${speedText}` : ""}
                </span>
                <button
                  type="button"
                  className="quiet-btn danger hit-expand"
                  style={{ minHeight: 32, padding: "0 12px" }}
                  onClick={() => xhrRef.current?.abort()}
                >
                  <XCircle size={14} />
                  <span>Cancel</span>
                </button>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: "var(--separator)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    background: "var(--accent)",
                    transition: "width 120ms linear",
                  }}
                />
              </div>
            </div>
          )}

          <div className="action-row">
            <span style={{ fontSize: 13, color: "var(--label-tertiary)", overflowWrap: "anywhere" }}>
              Direct CLI download: <code style={{ fontFamily: "var(--font-mono)" }}>curl -OJ https://clipboard.dulith.me/api/v1/files/&lt;id&gt;</code>
            </span>
            <button type="submit" className="primary-btn full-mobile" disabled={uploading}>
              <FileUp size={16} />
              <span>{uploading ? "Uploading..." : "Send Files"}</span>
            </button>
          </div>
        </form>
      </section>

      {sharedFiles.length > 0 && (
        <section className="glass-card sheet" aria-label="Shared Files in Session">
          <div className="step-head">
            <h3>Ready to Download</h3>
            <span className="badge-pill ok">
              <Check size={14} /> {sharedFiles.length} file(s)
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sharedFiles.map((item) => {
              const safeId = /^[a-z0-9_-]{2,64}$/i.test(item.id) ? item.id : "";
              if (!safeId) return null;
              const directLink = `${window.location.origin}/?id=${encodeURIComponent(safeId)}`;
              const fileEndpoint = `/api/v1/files/${encodeURIComponent(safeId)}`;
              return (
                <div key={safeId} className="well action-row">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 620, overflowWrap: "anywhere" }}>{item.fileName}</div>
                    <div style={{ fontSize: 13, color: "var(--label-secondary)" }}>
                      ID: <span style={{ fontFamily: "var(--font-mono)" }}>{safeId}</span> · {formatBytes(item.fileSize)}
                    </div>
                  </div>
                  <div className="btn-group">
                    <button
                      type="button"
                      className="quiet-btn"
                      onClick={() => copyTextSafely(directLink, "Share link copied")}
                    >
                      <Copy size={14} />
                      <span>Link</span>
                    </button>
                    <button
                      type="button"
                      className="quiet-btn"
                      onClick={() => {
                        setQrUrl(directLink);
                        setQrOpen(true);
                      }}
                    >
                      <QrCode size={14} />
                      <span>QR</span>
                    </button>
                    <a
                      href={item.hasPassword ? directLink : `${fileEndpoint}?download=1`}
                      className="primary-btn"
                    >
                      <Download size={15} />
                      <span>{item.hasPassword ? "Unlock" : "Download"}</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <QrModal open={qrOpen} url={qrUrl} title="Share File Drop" onClose={() => setQrOpen(false)} />
    </div>
  );
}
