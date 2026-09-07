# Tenda Web (`apps/web`)

Browser version of `apps/mobile` — Next.js + Tailwind v4, dev on **:3200**.

- It is a DOM rewrite of the mobile app, not a separate product:
  `apps/mobile` + `@tenda/shared` are authoritative — they win every
  behaviour/visual conflict.
- Data-access + pluggability policy: `CLAUDE.md` in this directory.

## Setup

```bash
pnpm --filter @tenda/shared build   # after any change to packages/shared
pnpm --filter web dev               # http://localhost:3200
```

`pnpm --filter web dev-capped` runs the dev server memory-capped
(systemd-run, 6G) — use it on machines where `next dev` can OOM.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` / `pnpm dev-capped` | Dev server on :3200 (capped variant recommended) |
| `pnpm build` / `pnpm start` | Prod build / serve |
| `pnpm test` / `pnpm test:watch` / `pnpm test:coverage` | vitest suite |
| `pnpm test:e2e` (`:headed`) | Playwright e2e (does a full `next build`) |
| `pnpm gen:tokens` (`:check`) | Regenerate `styles/tokens.css` from `apps/mobile/theme/tokens.ts` |
| `pnpm type-check` / `pnpm lint` | tsc / eslint |
