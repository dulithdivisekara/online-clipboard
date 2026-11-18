import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@lib": path.resolve(__dirname, "src/lib"),
      "@components": path.resolve(__dirname, "src/components"),
      "@worker": path.resolve(__dirname, "src/worker"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
