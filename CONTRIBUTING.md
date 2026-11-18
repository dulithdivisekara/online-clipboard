# Contributing

Contributions are welcome for bug fixes, security improvements, accessibility upgrades, and documentation clarity.

## Development Workflow

1. Fork `dulithdivisekara/online-clipboard` and clone your fork locally.
2. Copy `.dev.vars.example` to `.dev.vars` for local Worker secrets.
3. Install dependencies and apply the local D1 schema:

```bash
npm install --legacy-peer-deps
npx wrangler d1 execute clipboard-db --local --yes --file=src/worker/schema.sql
```

4. Start local development:

```bash
npm run dev
```

## Pull Request Standards

1. Run `npm test` and `npm run build` (`astro check && astro build`) before opening a pull request.
2. Verify responsive layout and contrast in Light, Dark, and Auto themes across `1280px`, `390px`, and `320px` viewports.
3. Never commit `.env`, `.dev.vars`, API tokens, or personal credentials.
4. Preserve accessibility invariants: keyboard focus rings, `44x44px` minimum touch targets on mobile, `prefers-reduced-motion`, and `prefers-reduced-transparency` fallbacks.
