# Tenda Admin Dashboard

Next.js (App Router) dashboard over the Tenda v2 admin API.

## Run

```bash
pnpm --filter admin dev        # http://localhost:3100
```

The dev/start scripts bind port 3100 — the API server's default is 3000
(`PORT ?? 3000` in server.ts), so the two never collide locally.

Env: `NEXT_PUBLIC_API_URL` — the API server origin (defaults to
`http://localhost:3000`, the server's default port). Override in
`.env.local` when the API lives elsewhere.

## Auth (#86–#90)

Passwordless email OTP against `/v1/auth/admin/{send,verify}-email-otp`.
The bearer token lives in localStorage and rides the `Authorization`
header on every call. There is deliberately **NO Edge middleware** (see
open_issues A5): the API server is the only JWT verifier; the client-side
guard is a UX convenience and 401s bounce to `/login`.

Bootstrap the first login with the server ops script:

```bash
pnpm --filter tenda-server admin:grant-email -- <user-id> <email>
```

## DEPLOY NOTE — ADMIN_ORIGIN

The server scopes `/v1/admin/*` to origins listed in its `ADMIN_ORIGIN`
env (comma-separated). **The deployed dashboard origin MUST be in that
list** or every admin call fails with 403. Dev leaves it unset
(allow-all). Setting `ADMIN_ORIGIN` alone is sufficient: the server's
CORS plugin unions it into the browser allow-list, which also covers the
`/v1/auth/admin/*` login routes and preflights (plugins/cors.ts).

## Structure

- `lib/auth.ts` + `lib/use-session.ts` — token/session storage (+
  `useSyncExternalStore` hooks, cross-tab logout)
- `lib/nav.ts` — permission-tagged nav filtered through the shared
  `ROLE_PERMISSIONS` map (same source as the server guards)
- `api/routes.ts` + `api/client.ts` — typed v2 client; every method maps
  to a route that exists on the server
- `lib/dispute-thread.ts` — inclusive-gte cursor mechanics (tested)
- `test/` — node:test suites (`pnpm --filter admin test`)
