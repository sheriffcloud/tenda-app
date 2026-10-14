# Tenda Admin Dashboard

Next.js (App Router) dashboard over the Tenda v2 admin API — disputes &
mediation, reports & takedown, users, escrows, featured curation, moderation,
config, fiat, finance, metrics, push. Permission-tagged nav from the shared
`ROLE_PERMISSIONS` map.

## Setup

```bash
pnpm --filter admin dev        # http://localhost:3100 (API defaults to :3000)
```

Env: `NEXT_PUBLIC_API_URL` — the API server origin (defaults to
`http://localhost:3000`). Override in `.env.local` when the API lives
elsewhere.

**Auth:** passwordless email OTP. The bearer token lives in localStorage and
rides the `Authorization` header; the API server is the only JWT verifier
(deliberately no Edge middleware — the client-side guard is a UX convenience
and 401s bounce to `/login`). Bootstrap the first login with the server ops
script:

```bash
pnpm --filter tenda-server admin:grant-email -- <user-id> <email>
```

**Deploy note — `ADMIN_ORIGIN`:** the server scopes `/v1/admin/*` to origins
listed in its `ADMIN_ORIGIN` env (comma-separated). The deployed dashboard
origin MUST be in that list or every admin call fails with 403. Dev leaves it
unset (allow-all). Setting `ADMIN_ORIGIN` alone is sufficient — the server's
CORS plugin unions it into the browser allow-list, covering the admin login
routes and preflights too.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next dev / prod build / prod serve, all on :3100 |
| `pnpm test` / `pnpm test:watch` / `pnpm test:coverage` | vitest suite |
| `pnpm test:e2e` (`:headed`, `:ui`) | Playwright e2e |
| `pnpm type-check` / `pnpm lint` | tsc / eslint |

## Structure

- `lib/auth.ts` + `lib/use-session.ts` — token/session storage, cross-tab logout
- `lib/nav.ts` — nav filtered through the shared `ROLE_PERMISSIONS` map (same
  source as the server guards)
- `api/routes.ts` + `api/client.ts` — typed v2 client; the path map lives in
  `@tenda/shared/api/admin`, and the server's `api-routes-drift` test asserts
  every entry is served by a registered route
