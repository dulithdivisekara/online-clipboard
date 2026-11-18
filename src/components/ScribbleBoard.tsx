import { useEffect, useRef, useState } from "react";
import { Download, QrCode, Share2, Trash2, Undo2, Wifi, WifiOff } from "lucide-react";
import QrModal from "./QrModal";
import { copyTextSafely, showToast } from "@lib/liquid-optics";

interface Stroke {
  id: string;
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
  author: string;
}

interface Peer {
  clientId: string;
  clientName: string;
  color: string;
}

const SWATCHES = ["#0a74e6", "#1c1c1e", "#ffffff", "#177a2b", "#e11d48", "#f97316", "#8b5cf6"];

export default function ScribbleBoard({ roomId }: { roomId: string }) {
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState("#0a74e6");
  const [width, setWidth] = useState(4);
  const [qrOpen, setQrOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const drawingRef = useRef<Stroke | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const selfIdRef = useRef("local");

  const redraw = (list: Stroke[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of list) {
      if (s.points.length === 0) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) {
        const prev = s.points[i - 1];
        const cur = s.points[i];
        const mx = (prev.x + cur.x) / 2;
        const my = (prev.y + cur.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
      }
      const last = s.points[s.points.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
  };

  useEffect(() => {
    strokesRef.current = strokes;
    redraw(strokes);
  }, [strokes]);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const label = /Mobile|Android|iPhone/i.test(navigator.userAgent) ? "Mobile" : "Desktop";
    const wsUrl = `${proto}//${window.location.host}/api/v1/ws/scribble/${encodeURIComponent(roomId)}?name=${encodeURIComponent(label)}`;

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
            selfIdRef.current = msg.self?.clientId || "local";
            setPeers(msg.peers || []);
            setStrokes(msg.state?.strokes || []);
          } else if (msg.type === "presence") {
            setPeers(msg.peers || []);
          } else if (msg.type === "stroke-add" && msg.stroke) {
            setStrokes((prev) => [...prev, msg.stroke]);
          } else if (msg.type === "stroke-undo") {
            setStrokes((prev) => prev.filter((s) => s.id !== msg.strokeId));
          } else if (msg.type === "stroke-clear") {
            setStrokes([]);
          }
        } catch {
          // ignore
        }
      });
      ws.addEventListener("close", () => {
        setConnected(false);
        if (!closed) reconnectTimer = window.setTimeout(connect, 1800);
      });
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [roomId]);

  const toCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toCanvasPoint(e);
    const stroke: Stroke = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      color,
      width,
      points: [pt],
      author: selfIdRef.current,
    };
    drawingRef.current = stroke;
    redraw([...strokesRef.current, stroke]);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current.points.push(toCanvasPoint(e));
    redraw([...strokesRef.current, drawingRef.current]);
  };

  const finishStroke = () => {
    const s = drawingRef.current;
    if (!s) return;
    drawingRef.current = null;
    setStrokes((prev) => [...prev, s]);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stroke-add", stroke: s }));
    }
  };

  const undoLast = () => {
    const mine = [...strokes].reverse().find((s) => s.author === selfIdRef.current) || strokes[strokes.length - 1];
    if (!mine) return;
    setStrokes((prev) => prev.filter((s) => s.id !== mine.id));
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stroke-undo", strokeId: mine.id }));
    }
  };

  const clearBoard = () => {
    setStrokes([]);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stroke-clear" }));
    }
    showToast("Canvas cleared");
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = `scribble-${roomId}.png`;
    a.click();
    showToast("Exported PNG");
  };

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/scribble?id=${encodeURIComponent(roomId)}`
      : `https://clipboard.dulith.me/scribble?id=${encodeURIComponent(roomId)}`;

  return (
    <section className="glass-card sheet" aria-label="Collaborative Scribble Board">
      <div className="step-head">
        <div className="btn-group">
          <span className={`badge-pill ${connected ? "ok" : "warn"}`}>
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{connected ? "Live Canvas" : "Reconnecting..."}</span>
          </span>
          <span className="badge-pill">
            Board: <strong style={{ fontFamily: "var(--font-mono)" }}>{roomId}</strong>
          </span>
        </div>

        <div className="presence-strip">
          {peers.map((p) => (
            <span key={p.clientId} className="peer-chip">
              <span className="peer-dot" style={{ background: p.color }} />
              <span>{p.clientName}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="well action-row">
        <div className="btn-group">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className="hit-expand"
              aria-label={`Select color ${swatch}`}
              onClick={() => setColor(swatch)}
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: swatch,
                border: color === swatch ? "3px solid var(--accent)" : "1px solid var(--separator)",
                cursor: "pointer",
              }}
            />
          ))}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8, fontSize: 13 }}>
            <span>Size {width}px</span>
            <input
              type="range"
              min={1}
              max={18}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="btn-group">
          <button type="button" className="quiet-btn" onClick={undoLast}>
            <Undo2 size={15} />
            <span>Undo</span>
          </button>
          <button type="button" className="quiet-btn" onClick={clearBoard}>
            <Trash2 size={15} />
            <span>Clear</span>
          </button>
          <button type="button" className="quiet-btn" onClick={exportPng}>
            <Download size={15} />
            <span>PNG</span>
          </button>
          <button type="button" className="quiet-btn" onClick={() => setQrOpen(true)}>
            <QrCode size={15} />
            <span>QR</span>
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => copyTextSafely(shareUrl, "Board link copied")}
          >
            <Share2 size={15} />
            <span>Share</span>
          </button>
        </div>
      </div>

      <div
        className="well"
        style={{ padding: 0, overflow: "hidden", background: "rgba(255,255,255,0.88)" }}
      >
        <canvas
          ref={canvasRef}
          width={1200}
          height={640}
          aria-label="Collaborative drawing canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          style={{
            width: "100%",
            height: "auto",
            aspectRatio: "15 / 8",
            display: "block",
            touchAction: "none",
            cursor: "crosshair",
          }}
        />
      </div>

      <QrModal open={qrOpen} url={shareUrl} title="Join Scribble Board" onClose={() => setQrOpen(false)} />
    </section>
  );
}
