import { useState } from "react";
import { BarChart3, Check, Copy, ExternalLink, Link2, Loader2, QrCode } from "lucide-react";
import QrModal from "./QrModal";
import { copyTextSafely, showToast } from "@lib/liquid-optics";
import { pushRecentHistory } from "@lib/history";

export default function UrlShortenerPanel({ origin }: { origin: string }) {
  const [url, setUrl] = useState("");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [expiresIn, setExpiresIn] = useState("never");
  const [isLoading, setIsLoading] = useState(false);
  const [createdCode, setCreatedCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          code: code.trim().toLowerCase() || undefined,
          title: title.trim() || undefined,
          expiresIn: expiresIn === "never" ? undefined : expiresIn,
        }),
      });
      const data = (await res.json()) as { code?: string; targetUrl?: string; expiresAt?: string | null; error?: string };
      if (!res.ok || !data.code) throw new Error(data.error || "Failed to shorten URL");

      setCreatedCode(data.code);
      const shortUrl = `${liveOrigin}/u/${data.code}`;
      pushRecentHistory({
        id: data.code,
        kind: "url",
        preview: data.targetUrl || url,
        url: shortUrl,
        expiresAt: data.expiresAt,
        createdAt: new Date().toISOString(),
      });
      showToast("Short URL created");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to shorten URL", "err");
    } finally {
      setIsLoading(false);
    }
  };

  const liveOrigin = typeof window !== "undefined" ? window.location.origin : origin;
  const shortUrl = createdCode ? `${liveOrigin}/u/${createdCode}` : "";
  const statsUrl = createdCode ? `${liveOrigin}/u/${createdCode}+` : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section className="glass-card sheet" aria-label="URL Shortener">
        <div className="step-head">
          <h2>Shorten a URL</h2>
          <span className="badge-pill accent">Built-in Analytics</span>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label className="field-label" htmlFor="long-url">
              <span>Destination URL</span>
            </label>
            <input
              id="long-url"
              type="url"
              className="glass-input"
              placeholder="https://example.com/very/long/link"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          <div className="field-grid-3">
            <div className="field">
              <label className="field-label" htmlFor="short-alias">
                <span>Custom Alias (optional)</span>
              </label>
              <input
                id="short-alias"
                type="text"
                className="glass-input mono"
                placeholder="e.g. demo-docs"
                value={code}
                onChange={(e) => setCode(e.target.value.toLowerCase())}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="short-title">
                <span>Label (optional)</span>
              </label>
              <input
                id="short-title"
                type="text"
                className="glass-input"
                placeholder="Campaign or note"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="short-exp">
                <span>Expiration</span>
              </label>
              <select
                id="short-exp"
                className="glass-select"
                value={expiresIn}
                onChange={(e) => setExpiresIn(e.target.value)}
              >
                <option value="never">Never Expires</option>
                <option value="1d">1 Day</option>
                <option value="7d">7 Days</option>
                <option value="30d">30 Days</option>
              </select>
            </div>
          </div>

          <div className="action-row">
            <span style={{ fontSize: 13, color: "var(--label-tertiary)" }}>
              Append <code style={{ fontFamily: "var(--font-mono)" }}>+</code> to any short link to view browser, OS &amp; device stats.
            </span>
            <button type="submit" className="primary-btn full-mobile" disabled={isLoading}>
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
              <span>{isLoading ? "Shortening..." : "Shorten URL"}</span>
            </button>
          </div>
        </form>

        {shortUrl && (
          <div className="well" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="action-row">
              <a
                href={shortUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cb-link"
                style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 650 }}
              >
                {shortUrl}
              </a>

              <div className="btn-group">
                <button
                  type="button"
                  className={`primary-btn ${copied ? "copied" : ""}`}
                  onClick={async () => {
                    if (await copyTextSafely(shortUrl, "Short URL copied")) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1800);
                    }
                  }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
                <button type="button" className="quiet-btn" onClick={() => setQrOpen(true)}>
                  <QrCode size={15} />
                  <span>QR</span>
                </button>
                <a href={statsUrl} className="quiet-btn">
                  <BarChart3 size={15} />
                  <span>Analytics</span>
                </a>
                <a href={shortUrl} target="_blank" rel="noopener noreferrer" className="quiet-btn">
                  <ExternalLink size={15} />
                  <span>Open</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </section>

      <QrModal open={qrOpen} url={shortUrl} title="Share Short Link" onClose={() => setQrOpen(false)} />
    </div>
  );
}
