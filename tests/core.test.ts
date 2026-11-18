import { describe, expect, it } from "vitest";
import {
  generateShortId,
  hashPassword,
  isValidCustomId,
  signSessionToken,
  timingSafeEqual,
  verifyPassword,
  verifySessionToken,
} from "../src/lib/crypto";
import { decryptText, encryptText, generateE2EEKey, isE2EEPayload } from "../src/lib/e2ee";
import { escapeHtml, safeLinkify } from "../src/lib/sanitize";
import { calculateExpiresAt, formatBytes, isExpired } from "../src/lib/ttl";
import { parseUserAgent } from "../src/lib/ua";

describe("Crypto & Password Security", () => {
  it("hashes and verifies PBKDF2-SHA256 passwords with unique salts", async () => {
    const first = await hashPassword("super-secret-pass");
    const second = await hashPassword("super-secret-pass");

    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
    expect(await verifyPassword("super-secret-pass", first.hash, first.salt)).toBe(true);
    expect(await verifyPassword("wrong-pass", first.hash, first.salt)).toBe(false);
  });

  it("signs and verifies HMAC session tokens", async () => {
    const secret = "test-hmac-secret-123";
    const token = await signSessionToken(secret, { role: "vault-admin" }, 60);
    const decoded = await verifySessionToken(secret, token);
    expect(decoded?.role).toBe("vault-admin");

    expect(await verifySessionToken("wrong-secret", token)).toBeNull();
    expect(await verifySessionToken(secret, `${token}x`)).toBeNull();
  });

  it("performs constant-time string comparison", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  it("generates unbiased short IDs and validates custom slugs", () => {
    const id = generateShortId(8, "alnum");
    expect(id).toMatch(/^[a-z0-9]{8}$/);
    expect(isValidCustomId("my-clip-e")).toBe(true);
    expect(isValidCustomId("../etc/passwd")).toBe(false);
    expect(isValidCustomId("a")).toBe(false);
  });
});

describe("Zero-Knowledge E2EE", () => {
  it("encrypts and decrypts payloads with AES-256-GCM", async () => {
    const key = generateE2EEKey();
    const secret = "Confidential token: sk-live-example-12345";
    const encrypted = await encryptText(secret, key);

    expect(isE2EEPayload(encrypted)).toBe(true);
    expect(encrypted).not.toContain("Confidential");
    expect(await decryptText(encrypted, key)).toBe(secret);

    const wrongKey = generateE2EEKey();
    await expect(decryptText(encrypted, wrongKey)).rejects.toThrow();
  });
});

describe("XSS Sanitization & Linkification", () => {
  it("escapes HTML injection payloads before linkifying URLs", () => {
    const input = '<script>alert(1)</script> Check https://clipboard.dulith.me/@dulith and user@dulith.me';
    const out = safeLinkify(input);

    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).toContain('href="https://clipboard.dulith.me/@dulith"');
    expect(out).not.toContain('href="mailto:dulith"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('href="mailto:user@dulith.me"');
    expect(escapeHtml(`"quoted"`)).toBe("&quot;quoted&quot;");
  });
});

describe("TTL, Byte Formatting & User-Agent Parsing", () => {
  it("computes expiration timestamps and detects expired items", () => {
    const base = new Date("2026-11-18T12:00:00.000Z");
    expect(calculateExpiresAt("never", base)).toBeNull();
    expect(calculateExpiresAt("1h", base)).toBe("2026-11-18T13:00:00.000Z");
    expect(isExpired("2026-11-18T11:59:59.000Z", base)).toBe(true);
    expect(isExpired("2026-11-18T12:05:00.000Z", base)).toBe(false);
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("parses mobile and desktop User-Agents accurately", () => {
    const ios = parseUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1"
    );
    expect(ios).toEqual({ browser: "Safari", os: "iOS", deviceType: "Mobile" });

    const winEdge = parseUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0"
    );
    expect(winEdge).toEqual({ browser: "Edge", os: "Windows", deviceType: "Desktop" });
  });
});
