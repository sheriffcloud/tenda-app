# routes/

Autoloaded Fastify routes (`@fastify/autoload` in `app.ts`). Conventions:

- **Folder = URL.** `v1/escrows/_id/accept/index.ts` → `POST /v1/escrows/:id/accept`
  (`routeParams: true` maps `_id` directories to `:id` params).
- Each `index.ts` default-exports an encapsulated Fastify plugin; route-local
  helpers live beside it in the same folder.
- Cross-route functionality (db, auth decorators, queue, guards) comes from
  `plugins/` + `lib/`, routes stay thin: parse → guard → service call → reply.
- Error envelope: throw `AppError` with an `ErrorCode` from `@tenda/shared`
  (`lib/http-errors.ts` renders it); never hand-roll error JSON.
- Auth: `fastify.authenticate` preHandler + `requireRole` / `requirePermission`
  guards (`lib/guards.ts`); admin surfaces additionally pass the `ADMIN_ORIGIN`
  CORS scope.

Route matrix integration tests: `test/integration/` (real app via
`fastify.inject`, DB-backed, see `test/helpers/README.md`).
