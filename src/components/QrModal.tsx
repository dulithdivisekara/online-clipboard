import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Download, X } from "lucide-react";
import { showToast } from "@lib/liquid-optics";

interface QrModalProps {
  open: boolean;
  url: string;
  title?: string;
  onClose: () => void;
}

export default function QrModal({ open, url, title = "Share via QR Code", onClose }: QrModalProps) {
  const [dataUrl, setDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !url) return;
    QRCode.toDataURL(url, {
      width: 440,
      margin: 2,
      color: { dark: "#111827", light: "#ffffff" },
    })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [open, url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast("Link copied to clipboard");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast("Unable to copy link", "err");
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-sheet liquid-glass">
        <div
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 680 }}>{title}</h3>
          <button
            type="button"
            className="quiet-btn hit-expand"
            style={{ minHeight: 36, padding: "0 10px" }}
            aria-label="Close QR dialog"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {dataUrl && (
          <div
            style={{
              background: "#ffffff",
              padding: 12,
              borderRadius: 18,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            }}
          >
            <img
              src={dataUrl}
              alt={`QR code for ${url}`}
              width={210}
              height={210}
              style={{ display: "block", borderRadius: 8 }}
            />
          </div>
        )}

        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-mono)",
            fontSize: 12.5,
            color: "var(--label-secondary)",
            wordBreak: "break-all",
          }}
        >
          {url}
        </p>

        <div className="btn-group" style={{ width: "100%", justifyContent: "center" }}>
          <button
            type="button"
            className={`primary-btn ${copied ? "copied" : ""}`}
            onClick={copyLink}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? "Copied" : "Copy Link"}</span>
          </button>
          {dataUrl && (
            <a href={dataUrl} download="clipboard-qr.png" className="quiet-btn">
              <Download size={16} />
              <span>Save QR</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
