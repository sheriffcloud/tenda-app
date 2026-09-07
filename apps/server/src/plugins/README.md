# plugins/

Autoloaded cross-cutting Fastify plugins (loaded before routes; most are
`fastify-plugin`-wrapped so their decorators are app-wide).

| Plugin | Provides |
|---|---|
| `db.ts` | `fastify.db`, Drizzle over postgres-js (`AppDatabase` / `AppTransaction` types) |
| `auth.ts` | JWT verify + `fastify.authenticate`; token refresh |
| `chains.ts` | `fastify.chains`, per-chain adapter registry built from `CHAIN_MANIFEST` + env secrets |
| `queue/` | BullMQ producers (typed `JobName` union); 501 stub without `REDIS_URL` |
| `workers.ts` | BullMQ consumers + `REPEATABLES` schedule (in-process with the API, documented decision) |
| `listeners.ts` | Chain event listeners (polling fallback; webhook routes complement) |
| `notifications.ts` | App-event listeners → push/WS fan-out |
| `websocket.ts` | Realtime WS channel (escrow events, chat) |
| `cors.ts` | Browser allow-list, `CORS_ORIGIN` + `ADMIN_ORIGIN` union |
| `rate-limit.ts` | Global + per-route rate limiting (trustProxy-aware) |
| `audit.ts` | `admin_audit_log` writes for admin mutations |
| `sensible.ts` | `@fastify/sensible` helpers |

A plugin may be a DIRECTORY (`queue/`) when one file would run past the 300-line
budget, subject to two rules autoload imposes — both guarded by
`test/unit/queue.test.ts`:

- It must hold an `index.ts` exporting the plugin. Without one, autoload
  registers each plugin-shaped file inside it separately instead of registering
  the directory once.
- It must contain no subdirectories. An `index.ts` stops autoload loading
  sibling *files*, but not sibling *directories* — it descends into those
  anyway and registers what it finds as extra plugins. Keep helpers as flat
  files beside `index.ts`, where the index hides them.

Schedule drift guard: `test/unit/worker-schedule.test.ts` pins the repeatable
job set, adding a periodic job without scheduling it fails the suite.
