import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Edit3,
  Eye,
  FileCode2,
  Flame,
  Image as ImageIcon,
  Loader2,
  Lock,
  Printer,
  QrCode,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import SegmentedControl from "./SegmentedControl";
import QrModal from "./QrModal";
import { copyTextSafely, showToast } from "@lib/liquid-optics";
import { decryptText, encryptText, generateE2EEKey, isE2EEPayload } from "@lib/e2ee";
import { highlightCodeSnippet, renderSafeMarkdown, safeLinkify } from "@lib/sanitize";
import { formatBytes, formatRemainingTtl } from "@lib/ttl";
import { pushRecentHistory } from "@lib/history";

type ComposerMode = "text" | "markdown" | "code" | "image";

interface RetrievedClip {
  id: string;
  kind: "text" | "markdown" | "code" | "image" | "file";
  title?: string;
  language?: string;
  content: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  downloadUrl?: string;
  isEditable?: boolean;
  isE2EE?: boolean;
  hasPassword?: boolean;
  maxViews?: number;
  viewCount?: number;
  burned?: boolean;
  expiresAt?: string | null;
  createdAt?: string;
}

interface ClipboardWorkspaceProps {
  initialId?: string;
  initialClip?: RetrievedClip | null;
  initialRequiresPassword?: boolean;
  initialNeedsReveal?: boolean;
}

const DRAFT_KEY = "cb_composer_draft_v2";

export default function ClipboardWorkspace({
  initialId = "",
  initialClip = null,
  initialRequiresPassword = false,
  initialNeedsReveal = false,
}: ClipboardWorkspaceProps) {
  const [mode, setMode] = useState<ComposerMode>("text");
  const [customId, setCustomId] = useState("");
  const [idStatus, setIdStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("typescript");
  const [content, setContent] = useState("");
  const [showMdPreview, setShowMdPreview] = useState(false);
  const [expiresIn, setExpiresIn] = useState("7d");
  const [maxViews, setMaxViews] = useState("0");
  const [password, setPassword] = useState("");
  const [isEditable, setIsEditable] = useState(false);
  const [useE2EE, setUseE2EE] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedShareUrl, setSavedShareUrl] = useState("");
  const [savedClipId, setSavedClipId] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [qrTargetUrl, setQrTargetUrl] = useState("");

  const [retrieveId, setRetrieveId] = useState(initialId);
  const [retrievePassword, setRetrievePassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(initialRequiresPassword);
  const [needsReveal, setNeedsReveal] = useState(initialNeedsReveal);
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [retrieved, setRetrieved] = useState<RetrievedClip | null>(initialClip);
  const [protectedBlobUrl, setProtectedBlobUrl] = useState("");
  const [editingText, setEditingText] = useState(false);
  const [editDraft, setEditDraft] = useState(initialClip?.content || "");
  const [isUpdating, setIsUpdating] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const retrieveResultRef = useRef<HTMLDivElement>(null);
  const restoringDraftRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw && !initialId) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.content === "string" && parsed.content) {
          restoringDraftRef.current = true;
          setContent(parsed.content);
        }
        if (parsed.mode && ["text", "markdown", "code"].includes(parsed.mode)) {
          setMode(parsed.mode);
        }
        if (typeof parsed.title === "string") setTitle(parsed.title);
      }
    } catch {
      // ignore
    }
  }, [initialId]);

  useEffect(() => {
    if (restoringDraftRef.current) {
      restoringDraftRef.current = false;
      return;
    }
    try {
      if (content.trim()) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ mode, title, content }));
      } else if (!initialId) {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      // ignore
    }
  }, [mode, title, content, initialId]);

  useEffect(() => {
    async function tryDecryptInitial() {
      if (!initialClip || !isE2EEPayload(initialClip.content)) return;
      const key = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("key");
      if (!key) return;
      try {
        const plain = await decryptText(initialClip.content, key);
        setRetrieved({ ...initialClip, content: plain });
        setEditDraft(plain);
      } catch {
        showToast("Decryption key mismatch or corrupted payload", "err");
      }
    }
    tryDecryptInitial();
  }, [initialClip]);

  useEffect(() => {
    if (
      initialClip &&
      initialClip.kind !== "image" &&
      initialClip.kind !== "file" &&
      !isE2EEPayload(initialClip.content)
    ) {
      navigator.clipboard
        ?.writeText(initialClip.content)
        .then(() => showToast("Retrieved and copied to clipboard"))
        .catch(() => showToast("Clip retrieved"));
    }
  }, [initialClip]);

  useEffect(() => {
    return () => {
      if (protectedBlobUrl) URL.revokeObjectURL(protectedBlobUrl);
    };
  }, [protectedBlobUrl]);

  useEffect(() => {
    const trimmed = customId.trim().toLowerCase();
    if (!trimmed) {
      setIdStatus("idle");
      return;
    }
    if (trimmed.endsWith("-e") && mode !== "image") {
      setIsEditable(true);
    }
    setIdStatus("checking");
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/check-id?id=${encodeURIComponent(trimmed)}`);
        const data = (await res.json()) as { available?: boolean };
        setIdStatus(data.available ? "available" : "taken");
      } catch {
        setIdStatus("idle");
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [customId, mode]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const renderedMarkdownHtml = useMemo(() => {
    if (mode !== "markdown" || !showMdPreview) return "";
    return renderSafeMarkdown(content);
  }, [mode, showMdPreview, content]);

  const retrievedHtml = useMemo(() => {
    if (!retrieved) return "";
    if (retrieved.kind === "markdown") return renderSafeMarkdown(retrieved.content);
    if (retrieved.kind === "code") return highlightCodeSnippet(retrieved.content, retrieved.language);
    return safeLinkify(retrieved.content);
  }, [retrieved]);

  const handlePreviewClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-copy-code]");
    if (!btn) return;
    const code = btn.closest(".md-code-block")?.querySelector("code")?.textContent || "";
    if (code) {
      await copyTextSafely(code, "Code snippet copied");
    }
  };

  const generateClientId = () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const arr = crypto.getRandomValues(new Uint8Array(6));
    let id = "";
    for (let i = 0; i < arr.length; i++) id += chars[arr[i] % chars.length];
    if (isEditable && mode !== "image") id += "-e";
    setCustomId(id);
  };

  const handleReadClipboardImage = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith("image/"));
        if (imgType) {
          const blob = await item.getType(imgType);
          const ext = imgType.split("/")[1] || "png";
          const file = new File([blob], `pasted-image.${ext}`, { type: imgType });
          setImageFile(file);
          showToast("Image captured from clipboard");
          return;
        }
      }
      showToast("No image found in your clipboard", "err");
    } catch {
      showToast("Clipboard image read permission denied or unsupported", "err");
    }
  };

  const handleSave = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (idStatus === "taken") {
      showToast("Custom ID is already taken", "err");
      return;
    }

    if (mode !== "image" && !content.trim()) {
      showToast("Please enter some text to save", "err");
      return;
    }
    if (mode !== "image" && isEditable && !password.trim()) {
      showToast("Editable clips require a password", "err");
      return;
    }
    if (mode === "image" && !imageFile) {
      showToast("Please select or paste an image", "err");
      return;
    }

    setIsSaving(true);
    try {
      if (mode === "image" && imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        if (customId.trim()) fd.append("id", customId.trim().toLowerCase());
        if (title.trim()) fd.append("title", title.trim());
        fd.append("expiresIn", expiresIn);
        fd.append("maxViews", maxViews);
        if (password.trim()) fd.append("password", password);

        const res = await fetch("/api/v1/files", { method: "POST", body: fd });
        const data = (await res.json()) as { id?: string; error?: string; expiresAt?: string | null };
        if (!res.ok || !data.id) throw new Error(data.error || "Upload failed");

        const shareUrl = `${window.location.origin}/?id=${encodeURIComponent(data.id)}`;
        setSavedClipId(data.id);
        setSavedShareUrl(shareUrl);
        pushRecentHistory({
          id: data.id,
          kind: "image",
          preview: imageFile.name,
          url: shareUrl,
          hasPassword: Boolean(password.trim()),
          expiresAt: data.expiresAt,
          createdAt: new Date().toISOString(),
        });
        setImageFile(null);
        setCustomId("");
        setPassword("");
        setTitle("");
        showToast("Image saved to clipboard");
        return;
      }

      let payloadContent = content;
      let fragment = "";
      if (useE2EE) {
        const key = generateE2EEKey();
        payloadContent = await encryptText(content, key);
        fragment = `#key=${encodeURIComponent(key)}`;
      }

      const res = await fetch("/api/v1/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: customId.trim().toLowerCase() || undefined,
          kind: mode,
          title: title.trim(),
          language: mode === "code" ? language : "",
          content: payloadContent,
          isEditable,
          isE2EE: useE2EE,
          password: password || undefined,
          expiresIn,
          maxViews: parseInt(maxViews, 10) || 0,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string; expiresAt?: string | null };
      if (!res.ok || !data.id) throw new Error(data.error || "Save failed");

      const shareUrl = `${window.location.origin}/?id=${encodeURIComponent(data.id)}${fragment}`;
      setSavedClipId(data.id);
      setSavedShareUrl(shareUrl);
      pushRecentHistory({
        id: data.id,
        kind: mode,
        preview: useE2EE ? "[End-to-End Encrypted Clip]" : content.slice(0, 90),
        url: shareUrl,
        hasPassword: Boolean(password.trim()),
        isE2EE: useE2EE,
        expiresAt: data.expiresAt,
        createdAt: new Date().toISOString(),
      });

      setContent("");
      setCustomId("");
      setTitle("");
      setPassword("");
      localStorage.removeItem(DRAFT_KEY);
      showToast(useE2EE ? "Encrypted clip saved" : "Saved to clipboard");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "err");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetrieve = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    const id = retrieveId.trim().toLowerCase();
    if (!id) {
      showToast("Enter a Clipboard ID", "err");
      return;
    }

    setIsRetrieving(true);
    if (protectedBlobUrl) {
      URL.revokeObjectURL(protectedBlobUrl);
      setProtectedBlobUrl("");
    }

    try {
      const res = await fetch(`/api/v1/clips/${encodeURIComponent(id)}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: retrievePassword }),
      });

      const data = (await res.json()) as RetrievedClip & { error?: string };
      if (res.status === 401) {
        setNeedsPassword(true);
        setNeedsReveal(false);
        setRetrieved(null);
        showToast("Enter password to unlock this clip", "err");
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || "Clip not found");
      }

      setNeedsPassword(false);
      setNeedsReveal(false);

      // For password-protected or burn-after-read images/files, fetch via POST once into an in-memory Blob URL
      if ((data.kind === "image" || data.kind === "file") && (data.hasPassword || (data.maxViews || 0) > 0)) {
        const fileRes = await fetch(`/api/v1/files/${encodeURIComponent(data.id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: retrievePassword }),
        });
        if (!fileRes.ok) {
          throw new Error("Failed to unlock protected file");
        }
        const blob = await fileRes.blob();
        setProtectedBlobUrl(URL.createObjectURL(blob));
      }

      let finalContent = data.content || "";
      if (data.isE2EE && isE2EEPayload(finalContent)) {
        const key = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("key");
        if (key) {
          finalContent = await decryptText(finalContent, key);
        } else {
          showToast("Open the full share link containing #key=... to decrypt", "err");
        }
      }

      const nextClip = { ...data, content: finalContent };
      setRetrieved(nextClip);
      setEditDraft(finalContent);
      setEditingText(false);

      if (nextClip.kind !== "image" && nextClip.kind !== "file" && !isE2EEPayload(finalContent)) {
        navigator.clipboard?.writeText(finalContent).catch(() => {});
        showToast(nextClip.burned ? "Clip retrieved & burned after read" : "Retrieved & copied");
      } else {
        showToast("Clip retrieved");
      }

      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setTimeout(() => {
        retrieveResultRef.current?.scrollIntoView({
          behavior: prefersReduced ? "auto" : "smooth",
          block: "nearest",
        });
      }, 60);
    } catch (err) {
      setRetrieved(null);
      showToast(err instanceof Error ? err.message : "Unable to retrieve clip", "err");
    } finally {
      setIsRetrieving(false);
    }
  };

  const handleUpdateClip = async () => {
    if (!retrieved) return;
    setIsUpdating(true);
    try {
      let bodyContent = editDraft;
      if (retrieved.isE2EE) {
        const key = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("key");
        if (!key) throw new Error("Missing #key=... fragment to re-encrypt");
        bodyContent = await encryptText(editDraft, key);
      }

      const res = await fetch(`/api/v1/clips/${encodeURIComponent(retrieved.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: bodyContent, password: retrievePassword }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Update failed");

      setRetrieved({ ...retrieved, content: editDraft });
      setEditingText(false);
      showToast("Clip updated");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update", "err");
    } finally {
      setIsUpdating(false);
    }
  };

  const exportClipFile = (ext: "txt" | "md") => {
    if (!retrieved) return;
    const blob = new Blob([retrieved.content], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `clip-${retrieved.id}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const mediaUrl =
    protectedBlobUrl ||
    (retrieved ? retrieved.downloadUrl || `/api/v1/files/${encodeURIComponent(retrieved.id)}` : "");
  const mediaDownloadHref =
    protectedBlobUrl || (mediaUrl ? `${mediaUrl}?download=1` : "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SegmentedControl
        ariaLabel="Clipboard content mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: "text", label: "Text" },
          { value: "markdown", label: "Markdown" },
          { value: "code", label: "Code" },
          { value: "image", label: "Image" },
        ]}
      />

      {/* Composer Card */}
      <section className="glass-card sheet" aria-label="Save to Clipboard">
        <div className="step-head">
          <h2>Save to Clipboard</h2>
          <span className="badge-pill">{mode === "image" ? "R2 Image Storage" : mode === "markdown" ? "GFM + Code" : mode === "code" ? "Syntax Highlight" : "Instant Text"}</span>
        </div>

        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field-grid">
            <div className="field">
              <label className="field-label" htmlFor="save-id">
                <span>Custom ID (optional)</span>
                {idStatus === "available" && <span style={{ color: "var(--ok-tint)" }}>Available</span>}
                {idStatus === "taken" && <span style={{ color: "var(--danger-tint)" }}>Already taken</span>}
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id="save-id"
                  type="text"
                  style={{ flex: 1, minWidth: 0 }}
                  className={`glass-input mono ${
                    idStatus === "available" ? "status-ok" : idStatus === "taken" ? "status-bad" : ""
                  }`}
                  placeholder="Auto-generated (add -e to edit)"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value.toLowerCase())}
                />
                <button type="button" className="quiet-btn" onClick={generateClientId} title="Generate random ID">
                  <Sparkles size={16} />
                  <span>Random</span>
                </button>
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="clip-title">
                <span>Label / Note (optional)</span>
              </label>
              <input
                id="clip-title"
                type="text"
                className="glass-input"
                placeholder="e.g. Deploy command or API snippet"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>

          {mode !== "image" ? (
            <div className="field">
              <div className="field-label">
                <label htmlFor="clip-content">
                  {mode === "markdown"
                    ? "Markdown Content"
                    : mode === "code"
                    ? "Code Snippet"
                    : "Text Content"}
                </label>
                <div className="btn-group">
                  {mode === "code" && (
                    <select
                      aria-label="Code language"
                      className="glass-select"
                      style={{ minHeight: 32, padding: "2px 10px", fontSize: 13, width: "auto" }}
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      <option value="typescript">TypeScript</option>
                      <option value="javascript">JavaScript</option>
                      <option value="python">Python</option>
                      <option value="bash">Bash / Shell</option>
                      <option value="json">JSON</option>
                      <option value="sql">SQL</option>
                      <option value="html">HTML / CSS</option>
                      <option value="go">Go / Rust</option>
                    </select>
                  )}
                  {mode === "markdown" && (
                    <button
                      type="button"
                      className={`quiet-btn hit-expand ${showMdPreview ? "active" : ""}`}
                      style={{ minHeight: 32, fontSize: 13, padding: "0 12px" }}
                      onClick={() => setShowMdPreview((v) => !v)}
                    >
                      <Eye size={14} />
                      <span>{showMdPreview ? "Edit" : "Preview"}</span>
                    </button>
                  )}
                </div>
              </div>

              {mode === "markdown" && showMdPreview ? (
                <div
                  className="clip-preview"
                  onClick={handlePreviewClick}
                  dangerouslySetInnerHTML={{
                    __html: renderedMarkdownHtml || "<p>Nothing to preview yet.</p>",
                  }}
                />
              ) : (
                <textarea
                  id="clip-content"
                  className={`glass-textarea ${mode === "code" || mode === "markdown" ? "mono" : ""}`}
                  placeholder={
                    mode === "markdown"
                      ? "# Meeting notes\nPaste Markdown, tables, or fenced ```code``` blocks..."
                      : mode === "code"
                      ? "Paste code here..."
                      : "Paste text, links, or notes to transfer across devices..."
                  }
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                />
              )}
            </div>
          ) : (
            <div
              className="dropzone"
              role="button"
              tabIndex={0}
              aria-label="Upload or drop an image to save"
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
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith("image/")) {
                  setImageFile(file);
                } else {
                  showToast("Only image files are accepted here", "err");
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setImageFile(f);
                }}
              />
              {imagePreviewUrl ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <img
                    src={imagePreviewUrl}
                    alt="Selected clipboard preview"
                    style={{ maxHeight: 220, maxWidth: "100%", borderRadius: 14, objectFit: "contain" }}
                  />
                  <span className="badge-pill">
                    {imageFile?.name} ({formatBytes(imageFile?.size || 0)})
                  </span>
                </div>
              ) : (
                <>
                  <ImageIcon size={28} style={{ color: "var(--accent)" }} />
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    Drop an image, click to browse, or paste from system clipboard
                  </p>
                  <button
                    type="button"
                    className="quiet-btn"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      handleReadClipboardImage();
                    }}
                  >
                    <Upload size={15} />
                    <span>Paste Image from Clipboard</span>
                  </button>
                </>
              )}
            </div>
          )}

          <div className="well">
            <div className="field-grid-3">
              <div className="field">
                <label className="field-label" htmlFor="clip-expiry">
                  <span>Expiration</span>
                </label>
                <select
                  id="clip-expiry"
                  className="glass-select"
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value)}
                >
                  <option value="1h">1 Hour</option>
                  <option value="1d">1 Day</option>
                  <option value="7d">7 Days</option>
                  <option value="30d">30 Days</option>
                  <option value="never">Never Expires</option>
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="clip-maxviews">
                  <span>Burn After Read</span>
                </label>
                <select
                  id="clip-maxviews"
                  className="glass-select"
                  value={maxViews}
                  onChange={(e) => setMaxViews(e.target.value)}
                >
                  <option value="0">Unlimited Views</option>
                  <option value="1">1 View (Burn After Read)</option>
                  <option value="3">3 Views</option>
                  <option value="5">5 Views</option>
                  <option value="10">10 Views</option>
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="clip-password">
                  <span>Password {isEditable ? "(required)" : "(optional)"}</span>
                </label>
                <input
                  id="clip-password"
                  type="password"
                  className="glass-input"
                  placeholder={isEditable ? "Required for editable clip" : "Leave blank for open access"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={isEditable && mode !== "image"}
                />
              </div>
            </div>

            {mode !== "image" && (
              <div className="btn-group" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className={`quiet-btn ${useE2EE ? "active" : ""}`}
                  onClick={() => setUseE2EE((v) => !v)}
                  aria-pressed={useE2EE}
                >
                  <ShieldCheck size={15} />
                  <span>Zero-Knowledge E2EE {useE2EE ? "On" : "Off"}</span>
                </button>
                <button
                  type="button"
                  className={`quiet-btn ${isEditable ? "active" : ""}`}
                  onClick={() => setIsEditable((v) => !v)}
                  aria-pressed={isEditable}
                >
                  <Edit3 size={15} />
                  <span>Allow Future Edits {isEditable ? "On" : "Off"}</span>
                </button>
              </div>
            )}
          </div>

          <div className="action-row">
            <span style={{ fontSize: 13, color: "var(--label-tertiary)" }}>
              {useE2EE
                ? "Encrypted in browser via AES-256-GCM; key never leaves the URL #fragment."
                : "Draft auto-saves locally until you publish."}
            </span>
            <button type="submit" className="primary-btn full-mobile" disabled={isSaving}>
              {isSaving ? <Loader2 size={17} className="animate-spin" /> : null}
              <span>{isSaving ? "Saving..." : mode === "image" ? "Save Image" : "Save Clip"}</span>
            </button>
          </div>
        </form>

        {savedShareUrl && (
          <div className="well" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="step-head">
              <span className="badge-pill ok">
                <Check size={14} /> Saved ID: <strong style={{ fontFamily: "var(--font-mono)" }}>{savedClipId}</strong>
              </span>
              <div className="btn-group">
                <button
                  type="button"
                  className="quiet-btn"
                  onClick={() => copyTextSafely(savedClipId, "Clip ID copied")}
                >
                  <Copy size={15} />
                  <span>Copy ID</span>
                </button>
                <button
                  type="button"
                  className="quiet-btn"
                  onClick={() => copyTextSafely(savedShareUrl, "Share link copied")}
                >
                  <Share2 size={15} />
                  <span>Copy Link</span>
                </button>
                <button
                  type="button"
                  className="quiet-btn"
                  onClick={() => {
                    setQrTargetUrl(savedShareUrl);
                    setQrOpen(true);
                  }}
                >
                  <QrCode size={15} />
                  <span>QR</span>
                </button>
              </div>
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                wordBreak: "break-all",
                color: "var(--label-secondary)",
              }}
            >
              {savedShareUrl}
            </div>
          </div>
        )}
      </section>

      {/* Retrieve Card */}
      <section className="glass-card sheet" aria-label="Retrieve from Clipboard">
        <div className="step-head">
          <h2>Retrieve from Clipboard</h2>
          {retrieved && (
            <div className="btn-group">
              <span className="badge-pill">{formatRemainingTtl(retrieved.expiresAt)}</span>
              {retrieved.maxViews ? (
                <span className="badge-pill warn">
                  <Flame size={13} /> {retrieved.viewCount}/{retrieved.maxViews} views
                </span>
              ) : null}
              {retrieved.isE2EE && (
                <span className="badge-pill ok">
                  <ShieldCheck size={13} /> E2EE
                </span>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleRetrieve} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="field-grid">
            <div className="field">
              <label className="field-label" htmlFor="retrieve-id">
                <span>Clipboard ID</span>
              </label>
              <input
                id="retrieve-id"
                type="text"
                className="glass-input mono"
                placeholder="Enter ID (e.g. a7x9k2 or a7x9k2-e)"
                value={retrieveId}
                onChange={(e) => setRetrieveId(e.target.value.toLowerCase())}
                required
              />
            </div>

            {(needsPassword || retrieveId.trim().toLowerCase().endsWith("-e")) && (
              <div className="field">
                <label className="field-label" htmlFor="retrieve-pass">
                  <span>
                    <Lock size={12} style={{ display: "inline", marginRight: 4 }} />
                    Password
                  </span>
                </label>
                <input
                  id="retrieve-pass"
                  type="password"
                  className="glass-input"
                  placeholder="Enter clip password"
                  value={retrievePassword}
                  onChange={(e) => setRetrievePassword(e.target.value)}
                />
              </div>
            )}
          </div>

          {needsReveal && !retrieved && (
            <div className="well">
              <span className="badge-pill warn">
                <Flame size={13} /> Burn-after-read clip ready. Click Retrieve Clip to reveal and count 1 view.
              </span>
            </div>
          )}

          <div className="action-row">
            <span style={{ fontSize: 13, color: "var(--label-tertiary)" }}>
              Text clips copy to your clipboard automatically on retrieval.
            </span>
            <button type="submit" className="primary-btn full-mobile" disabled={isRetrieving}>
              {isRetrieving ? <Loader2 size={17} className="animate-spin" /> : <Search size={16} />}
              <span>{isRetrieving ? "Retrieving..." : needsReveal ? "Reveal Clip" : "Retrieve Clip"}</span>
            </button>
          </div>
        </form>

        {retrieved && (
          <div ref={retrieveResultRef} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {retrieved.title && (
              <div style={{ fontWeight: 650, fontSize: 16 }}>{retrieved.title}</div>
            )}

            {editingText ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <textarea
                  aria-label="Edit retrieved clipboard text"
                  className="glass-textarea mono"
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                />
                <div className="btn-group" style={{ justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="quiet-btn"
                    onClick={() => setEditingText(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={isUpdating}
                    onClick={handleUpdateClip}
                  >
                    {isUpdating ? "Updating..." : "Save Changes"}
                  </button>
                </div>
              </div>
            ) : retrieved.kind === "image" ? (
              <div className="well" style={{ textAlign: "center" }}>
                <img
                  src={mediaUrl}
                  alt={retrieved.fileName || "Retrieved clipboard image"}
                  style={{ maxWidth: "100%", maxHeight: 460, borderRadius: 12, objectFit: "contain" }}
                />
                <div className="btn-group" style={{ justifyContent: "center", marginTop: 12 }}>
                  <a
                    href={mediaDownloadHref}
                    download={retrieved.fileName || `clip-${retrieved.id}.png`}
                    className="primary-btn"
                  >
                    <Download size={16} />
                    <span>Download Image</span>
                  </a>
                </div>
              </div>
            ) : retrieved.kind === "file" ? (
              <div className="well action-row">
                <div>
                  <strong>{retrieved.fileName || "Attached file"}</strong>
                  <div style={{ fontSize: 13, color: "var(--label-secondary)" }}>
                    {formatBytes(retrieved.fileSize || 0)} · {retrieved.mimeType}
                  </div>
                </div>
                <a
                  href={mediaDownloadHref}
                  download={retrieved.fileName || `file-${retrieved.id}`}
                  className="primary-btn"
                >
                  <Download size={16} />
                  <span>Download File</span>
                </a>
              </div>
            ) : (
              <>
                <div
                  className="clip-preview"
                  onClick={handlePreviewClick}
                >
                  {retrieved.kind === "code" ? (
                    <pre>
                      <code
                        className="hljs"
                        dangerouslySetInnerHTML={{ __html: retrievedHtml }}
                      />
                    </pre>
                  ) : retrieved.kind === "markdown" ? (
                    <div dangerouslySetInnerHTML={{ __html: retrievedHtml }} />
                  ) : (
                    <div
                      style={{ whiteSpace: "pre-wrap" }}
                      dangerouslySetInnerHTML={{ __html: retrievedHtml }}
                    />
                  )}
                </div>

                <div className="action-row">
                  <div className="btn-group">
                    <button
                      type="button"
                      className={`quiet-btn ${copiedResult ? "active" : ""}`}
                      onClick={async () => {
                        if (await copyTextSafely(retrieved.content, "Copied to clipboard")) {
                          setCopiedResult(true);
                          setTimeout(() => setCopiedResult(false), 1800);
                        }
                      }}
                    >
                      {copiedResult ? <Check size={15} /> : <Copy size={15} />}
                      <span>{copiedResult ? "Copied" : "Copy"}</span>
                    </button>
                    <button
                      type="button"
                      className="quiet-btn"
                      onClick={() => exportClipFile("txt")}
                    >
                      <Download size={15} />
                      <span>TXT</span>
                    </button>
                    <button
                      type="button"
                      className="quiet-btn"
                      onClick={() => exportClipFile("md")}
                    >
                      <FileCode2 size={15} />
                      <span>MD</span>
                    </button>
                    <button
                      type="button"
                      className="quiet-btn"
                      onClick={() => window.print()}
                    >
                      <Printer size={15} />
                      <span>PDF</span>
                    </button>
                    <button
                      type="button"
                      className="quiet-btn"
                      onClick={() => {
                        const shareUrl = `${window.location.origin}/?id=${encodeURIComponent(retrieved.id)}${window.location.hash}`;
                        setQrTargetUrl(shareUrl);
                        setQrOpen(true);
                      }}
                    >
                      <QrCode size={15} />
                      <span>QR</span>
                    </button>
                  </div>

                  {retrieved.isEditable && (
                    <button
                      type="button"
                      className="quiet-btn"
                      onClick={() => setEditingText(true)}
                    >
                      <Edit3 size={15} />
                      <span>Edit Clip</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <QrModal open={qrOpen} url={qrTargetUrl} onClose={() => setQrOpen(false)} />
    </div>
  );
}
