import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://clipboard.dulith.me",
  trailingSlash: "never",
  output: "server",
  adapter: cloudflare({
    imageService: "passthrough",
    sessionKVBindingName: "CLIPBOARD_KV",
  }),
  integrations: [
    react(),
    sitemap({
      customPages: [
        "https://clipboard.dulith.me/",
        "https://clipboard.dulith.me/live-clipboard",
        "https://clipboard.dulith.me/scribble",
        "https://clipboard.dulith.me/file-drop",
        "https://clipboard.dulith.me/url",
        "https://clipboard.dulith.me/shortcuts",
      ],
      filter: (page) =>
        !page.includes("/vault") &&
        !page.includes("/api/") &&
        !page.includes("/u/") &&
        !page.includes("/sitemap.xml"),
      changefreq: "weekly",
      priority: 0.8,
      lastmod: new Date(),
    }),
  ],
});
