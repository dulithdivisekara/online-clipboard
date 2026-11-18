import { useEffect, useState } from "react";
import {
  Copy,
  ExternalLink,
  HardDrive,
  Lock,
  LogOut,
  RefreshCw,
  Shield,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  clearRecentHistory,
  getRecentHistory,
  removeRecentHistory,
  type RecentClipItem,
} from "@lib/history";
import { copyTextSafely, showToast } from "@lib/liquid-optics";
import { formatBytes, formatRemainingTtl } from "@lib/ttl";

interface AdminClip {
  id: string;
  kind: string;
  title?: string;
  fileName?: string;
  fileSize: number;
  hasPassword: boolean;
  isE2EE: boolean;
  maxViews: number;
  viewCount: number;
  expiresAt: string | null;
  createdAt: string;
}

interface AdminUrl {
  code: string;
  target_url: string;
  clicks: number;
  created_at: string;
}

export default function VaultDashboard() {
  const [recent, setRecent] = useState<RecentClipItem[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(true);
  const [storage, setStorage] = useState({ usedBytes: 0, maxBytes: 6 * 1024 * 1024 * 1024 });
  const [policy, setPolicy] = useState({ textUpload: true, fileUpload: true });
  const [clips, setClips] = useState<AdminClip[]>([]);
  const [urls, setUrls] = useState<AdminUrl[]>([]);

  const loadVault = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/vault/items");
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to load vault");
      const data = (await res.json()) as {
        storage: typeof storage;
        policy: typeof policy;
        clips: AdminClip[];
        urls: AdminUrl[];
      };
      setAuthenticated(true);
      setStorage(data.storage);
      setPolicy(data.policy);
      setClips(data.clips);
      setUrls(data.urls);
    } catch {
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setRecent(getRecentHistory());
    loadVault();
  }, []);

  const handleLogin = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/v1/vault/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Sign in failed");
      setPasscode("");
      showToast("Vault unlocked");
      loadVault();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Invalid passcode", "err");
    }
  };

  const handleLogout = async () => {
    await fetch("/api/v1/vault/logout", { method: "POST" });
    setAuthenticated(false);
    setClips([]);
    setUrls([]);
    showToast("Vault locked");
  };

  const togglePolicy = async (key: "textUpload" | "fileUpload") => {
    const next = { ...policy, [key]: !policy[key] };
    const res = await fetch("/api/v1/vault/items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (res.ok) {
      setPolicy(next);
      showToast("Upload policy updated");
    }
  };

  const purgeExpired = async () => {
    const res = await fetch("/api/v1/vault/items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "purge-expired" }),
    });
    if (res.ok) {
      const data = (await res.json()) as { deletedClips: number; deletedFiles: number };
      showToast(`Purged ${data.deletedClips} expired clip(s) and ${data.deletedFiles} file(s)`);
      loadVault();
    }
  };

  const deleteItem = async (kind: "clip" | "url", id: string) => {
    const res = await fetch(
      `/api/v1/vault/items?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      showToast(`Deleted ${id}`);
      loadVault();
    }
  };

  const usedPct = Math.min(100, Math.round((storage.usedBytes / Math.max(1, storage.maxBytes)) * 100));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Browser Recent History */}
      <section className="glass-card sheet" aria-label="Device Recent History">
        <div className="step-head">
          <h2>Recent on This Device</h2>
          {recent.length > 0 && (
            <button
              type="button"
              className="quiet-btn danger"
              onClick={() => {
                clearRecentHistory();
                setRecent([]);
                showToast("Device history cleared");
              }}
            >
              <Trash2 size={14} />
              <span>Clear History</span>
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <p style={{ margin: 0, color: "var(--label-secondary)", fontSize: 14.5 }}>
            Clips, files, and short URLs you create on this browser appear here locally for quick re-copying.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recent.map((item) => (
              <div key={item.id} className="well action-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="badge-pill">{item.kind}</span>
                    <strong style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>{item.id}</strong>
                    {item.isE2EE && <span className="badge-pill ok">E2EE</span>}
                  </div>
                  <div
                    style={{
                      fontSize: 13.5,
                      color: "var(--label-secondary)",
                      marginTop: 4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.preview}
                  </div>
                </div>

                <div className="btn-group">
                  <button
                    type="button"
                    className="quiet-btn"
                    aria-label={`Copy share link for ${item.id}`}
                    onClick={() => copyTextSafely(item.url, "Link copied")}
                  >
                    <Copy size={14} />
                  </button>
                  <a
                    href={item.url}
                    className="quiet-btn"
                    aria-label={`Open ${item.id}`}
                  >
                    <ExternalLink size={14} />
                  </a>
                  <button
                    type="button"
                    className="quiet-btn danger"
                    aria-label={`Remove ${item.id} from local history`}
                    onClick={() => {
                      removeRecentHistory(item.id);
                      setRecent(getRecentHistory());
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Protected Owner / Admin Vault */}
      <section className="glass-card sheet" aria-label="Owner Vault">
        <div className="step-head">
          <h2 style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Shield size={20} style={{ color: "var(--accent)" }} />
            <span>Owner Storage Vault</span>
          </h2>
          {authenticated && (
            <div className="btn-group">
              <button type="button" className="quiet-btn" onClick={loadVault}>
                <RefreshCw size={14} />
                <span>Refresh</span>
              </button>
              <button type="button" className="quiet-btn" onClick={handleLogout}>
                <LogOut size={14} />
                <span>Lock</span>
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <p style={{ margin: 0, color: "var(--label-secondary)" }}>Checking vault session...</p>
        ) : !authenticated ? (
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ margin: 0, color: "var(--label-secondary)", fontSize: 14.5 }}>
              Sign in with your Cloudflare Worker <code style={{ fontFamily: "var(--font-mono)" }}>VAULT_PASSCODE</code> secret to manage global clips, monitor R2 storage, and toggle public upload policies.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                type="password"
                aria-label="Vault passcode"
                className="glass-input"
                style={{ flex: 1, minWidth: 200 }}
                placeholder="Enter vault passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                required
              />
              <button type="submit" className="primary-btn">
                <Lock size={15} />
                <span>Unlock Vault</span>
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Storage Quota & Policy */}
            <div className="well" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="action-row">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 620 }}>
                  <HardDrive size={16} style={{ color: "var(--accent)" }} />
                  <span>
                    R2 Storage: {formatBytes(storage.usedBytes)} / {formatBytes(storage.maxBytes)} ({usedPct}%)
                  </span>
                </span>
                <button type="button" className="quiet-btn" onClick={purgeExpired}>
                  <Sparkles size={14} />
                  <span>Purge Expired Now</span>
                </button>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "var(--separator)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.max(2, usedPct)}%`,
                    height: "100%",
                    background: usedPct > 85 ? "var(--danger-tint)" : "var(--accent)",
                  }}
                />
              </div>

              <div className="btn-group">
                <button
                  type="button"
                  className={`quiet-btn ${policy.textUpload ? "active" : "danger"}`}
                  onClick={() => togglePolicy("textUpload")}
                >
                  Text Uploads: {policy.textUpload ? "Enabled" : "Paused"}
                </button>
                <button
                  type="button"
                  className={`quiet-btn ${policy.fileUpload ? "active" : "danger"}`}
                  onClick={() => togglePolicy("fileUpload")}
                >
                  File Uploads: {policy.fileUpload ? "Enabled" : "Paused"}
                </button>
              </div>
            </div>

            <div className="field-grid">
              <div className="well" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <strong>Stored Clips &amp; Files ({clips.length})</strong>
                {clips.length === 0 ? (
                  <span style={{ fontSize: 13.5, color: "var(--label-tertiary)" }}>No active clips.</span>
                ) : (
                  clips.map((c) => (
                    <div
                      key={c.id}
                      className="action-row"
                      style={{ paddingTop: 8, borderTop: "1px solid var(--separator)" }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13.5, fontWeight: 620 }}>
                          {c.id} · {c.kind}
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--label-secondary)" }}>
                          {c.fileName || c.title || "Clip"} · {formatRemainingTtl(c.expiresAt)}
                          {c.fileSize > 0 ? ` · ${formatBytes(c.fileSize)}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="quiet-btn danger hit-expand"
                        aria-label={`Delete clip ${c.id}`}
                        style={{ minHeight: 32, padding: "0 10px" }}
                        onClick={() => deleteItem("clip", c.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="well" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <strong>Shortened URLs ({urls.length})</strong>
                {urls.length === 0 ? (
                  <span style={{ fontSize: 13.5, color: "var(--label-tertiary)" }}>No short links yet.</span>
                ) : (
                  urls.map((u) => (
                    <div
                      key={u.code}
                      className="action-row"
                      style={{ paddingTop: 8, borderTop: "1px solid var(--separator)" }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13.5, fontWeight: 620 }}>
                          /{u.code} ({u.clicks} clicks)
                        </div>
                        <div
                          style={{
                            fontSize: 12.5,
                            color: "var(--label-secondary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {u.target_url}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="quiet-btn danger hit-expand"
                        aria-label={`Delete short URL ${u.code}`}
                        style={{ minHeight: 32, padding: "0 10px" }}
                        onClick={() => deleteItem("url", u.code)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
