import { marked } from "marked";
import hljs from "highlight.js";
import DOMPurify from "dompurify";

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Single-pass linkifier that HTML-escapes plain text and disjointly matches
 * HTTP(S) URLs and email addresses so URLs containing '@' are never corrupted.
 */
export function safeLinkify(inputText: string): string {
  const tokenRegex =
    /(\bhttps?:\/\/[^\s<>"'`]+)|(\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b)/gi;

  let out = "";
  let lastIndex = 0;

  for (const match of inputText.matchAll(tokenRegex)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      out += escapeHtml(inputText.slice(lastIndex, idx));
    }
    const url = match[1];
    const email = match[2];
    if (url) {
      const safe = escapeHtml(url);
      out += `<a href="${safe}" class="cb-link" target="_blank" rel="noopener noreferrer nofollow">${safe}</a>`;
    } else if (email) {
      const safe = escapeHtml(email);
      out += `<a href="mailto:${safe}" class="cb-link">${safe}</a>`;
    }
    lastIndex = idx + match[0].length;
  }

  if (lastIndex < inputText.length) {
    out += escapeHtml(inputText.slice(lastIndex));
  }
  return out;
}

const renderer = new marked.Renderer();
renderer.code = ({ text, lang }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : "";
  const highlighted = language
    ? hljs.highlight(text, { language }).value
    : hljs.highlightAuto(text).value;
  const safeLang = escapeHtml(language || "text");
  return `<div class="md-code-block"><div class="md-code-head"><span>${safeLang}</span><button type="button" class="md-copy-btn" data-copy-code="1">Copy</button></div><pre><code class="hljs language-${safeLang}">${highlighted}</code></pre></div>`;
};

marked.setOptions({
  renderer,
  gfm: true,
  breaks: true,
});

export function renderSafeMarkdown(markdown: string): string {
  if (typeof window === "undefined") {
    return `<pre style="white-space:pre-wrap;margin:0;font-family:inherit;">${escapeHtml(markdown)}</pre>`;
  }
  const rawHtml = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ["target", "rel", "data-copy-code"],
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form"],
  });
}

export function highlightCodeSnippet(code: string, lang?: string): string {
  if (lang && hljs.getLanguage(lang)) {
    return hljs.highlight(code, { language: lang }).value;
  }
  return hljs.highlightAuto(code).value;
}
