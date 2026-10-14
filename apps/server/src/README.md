# src/

How the server is layered. `test/unit/layering.test.ts` enforces the two rules
that can be checked mechanically; the rest is convention.

| Folder | Holds |
|---|---|
| `routes/` | HTTP handlers, one folder per URL segment (autoloaded — see its README). Thin: parse, call a feature, serialise. |
| `features/<domain>/` | Domain logic, one folder per domain (`escrows`, `disputes`, `auth`, `notifications`, `gigs`, `fiat-rails`, …). Owns its stores, read models and rules. |
| `chains/` | Per-chain adapters behind one registry (see its README). |
| `queue/` | BullMQ job handlers (`jobs/`) and consumers (`workers/`), plus the job-id factory. `plugins/queue` and `plugins/workers` only wire them into Fastify. |
| `realtime/` | WebSocket transport, channel authorisation and the publisher. |
| `plugins/` | Fastify plugins — wiring only (autoloaded — see its README). |
| `config/` | Typed config (`index`) and the raw env-value readers beneath it (`env`). |
| `lib/` | The domain-free layer, in folders: `errors/`, `http/` (validation, guards, pagination, …), `boot/`, `chain/`, `events/`, `platform/`, `db/`, and the escrow core the chain adapters call (`escrow/`, `auth/`). |
| `db/` | Seed and migrations. `db/migrations` is read by path at runtime (boot-migrate, the Dockerfile) — do not move it. |
| `scripts/` | One-off and operator CLIs; never imported by the app. |

## The rules

1. **`lib/` never imports `features/` or `routes/`.** If a `lib/` file needs a
   domain module, the domain module belongs in `lib/` — or the file belongs in
   `features/`. Enforced.
2. **`chains/` imports `features/` only for `features/attribution`**, from the
   four files that do today. A new upward edge fails the guard; decide
   deliberately, then update the list there.
3. **Nothing outside `routes/` imports `routes/`.** Enforced.
4. New domain code goes in `features/<domain>/`, in a folder — not as a loose
   file at a layer root.
5. **A folder holds files or folders, never both.** A folder with subfolders may
   hold only its `index.ts` barrel; everything else goes in a subfolder named for
   what it does. Enforced. Exempt: `app.ts` / `server.ts` (process entry points
   addressed by `package.json`, the Dockerfile and `instrument.js`), `routes/`
   (the URL decides the shape), `plugins/` (autoload reads it flat) and
   `scripts/` (each file is a CLI entry point named by a script). A folder with
   no subfolders may stay flat.
   A single file that owns a name becomes `name/index.ts`, so `@server/name`
   keeps resolving.

## Why some escrow code stays in `lib/`

`lib/escrow/` (state machine, fees, build-tx, signer, …) and
`lib/escrow/party.ts` are imported by `chains/`. Moving them under `features/`
would make the adapters depend upward. For the same reason `lib/auth/resolver.ts`
(and the two files it imports) stay: the escrow signer resolves a wallet to a
user through it.

## Settled placements

- `routes/v1/openapi.json/` and `routes/v1/agent/openapi.json/` are route
  folders whose names are the URL segment (the autoloader maps folder → path);
  they are routes, not data files.
- `features/escrows/routes/` holds the escrow feature's route-level helpers;
  the HTTP handlers themselves live under `routes/v1/escrows/`.
- `assets/` is copied verbatim into `dist/` by `build:ts`; `types/fastify.d.ts`
  is picked up by the tsconfig `include`. Both are build inputs, not code.
- Features with a small flat set of files (`applications`, `capacity`,
  `reputation`, `gigs`, `disputes`) have no barrel: callers import the specific
  module. Add an `index.ts` only when a feature has a public surface worth
  narrowing.
