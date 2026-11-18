/// <reference types="astro/client" />

declare namespace App {
  interface Env {
    CLIPBOARD_DB: D1Database;
    CLIPBOARD_KV: KVNamespace;
    CLIPBOARD_FILES: R2Bucket;
    ROOM_HUB: DurableObjectNamespace;
    VAULT_PASSCODE?: string;
    SESSION_SECRET?: string;
    QUICK_API_TOKEN?: string;
  }
}
