# Apps

Deployable applications. All consume `@tenda/shared` — build it first
(`pnpm build:shared` from the repo root). Setup and scripts live in each
app's own README:

| App | What it is | Dev |
|---|---|---|
| [`mobile/`](mobile/README.md) | React Native (Expo) app — Android | `pnpm dev:mobile` |
| [`web/`](web/README.md) | Next.js web app (browser version of mobile) | `pnpm --filter web dev` → :3200 |
| [`server/`](server/README.md) | Fastify REST API + workers | `pnpm dev:server` → :3000 |
| [`admin/`](admin/README.md) | Next.js admin dashboard | `pnpm --filter admin dev` → :3100 |
| [`tendahq/`](tendahq/README.md) | Vite landing page — tendahq.com | `cd apps/tendahq && pnpm dev` → :5173 |
