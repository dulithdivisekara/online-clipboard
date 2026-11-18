# Security Policy

## Supported Versions

Only the latest release deployed on the `main` branch at `clipboard.dulith.me` receives security patches.

| Version | Supported |
| :--- | :--- |
| 2.x (Cloudflare Edge) | Yes |
| 1.x (Legacy Astro 2 / Supabase) | No |

## Architectural Security Controls

1. **Server-Side Password Hashing**: Clip passwords are hashed on the Cloudflare Worker using PBKDF2-SHA256 (100,000 iterations) with a unique 16-byte cryptographic salt per clip and verified in constant time. Plaintext passwords and hashes are never returned to clients.
2. **Optional Zero-Knowledge E2EE**: When browser-side encryption is enabled, text is encrypted with Web Crypto AES-256-GCM before leaving the browser. The decryption key stays in the URL `#fragment`, which browsers do not transmit in HTTP requests.
3. **XSS Protection**: Markdown previews are parsed and sanitized with DOMPurify, and plain-text URLs are HTML-escaped prior to linkification.
4. **Private Route Exclusion**: `robots.txt` and `<meta name="robots" content="noindex, nofollow">` exclude retrieved private clips, live rooms, and the `/vault` route from search engine indexing.
5. **Secret Isolation**: Runtime credentials (`VAULT_PASSCODE`, `SESSION_SECRET`, `QUICK_API_TOKEN`) live strictly in Cloudflare Worker secrets or gitignored `.dev.vars` files and are never committed to version control.

## Reporting a Vulnerability

If you discover a security vulnerability, please do not open a public GitHub issue. Report it privately using GitHub Security Advisories on `dulithdivisekara/online-clipboard` or contact the maintainer via `https://dulith.me`. Include clear reproduction steps, affected endpoints, and potential impact. Initial acknowledgment is provided within 48 hours.
