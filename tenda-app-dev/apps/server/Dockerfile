# syntax=docker/dockerfile:1
# Tenda server image — build from the REPO ROOT (the pnpm workspace), not apps/server:
#
#   docker build -f apps/server/Dockerfile -t tenda-server .
#   docker build -f apps/server/Dockerfile --target migrate -t tenda-server-migrate .
#
# Two runnable targets:
#   runtime  (default) — lean prod image, `node dist/server.js`. No drizzle-kit,
#                        no TS toolchain, no .env baked in; all config comes from
#                        the orchestrator's environment.
#   migrate            — keeps devDependencies + src/db/migrations; runs
#                        `pnpm db:migrate` once and exits. Run it against the
#                        target DATABASE_URL BEFORE rolling the runtime image
#                        (see docs/production_setup_guide.md — migrate, then roll).

########################################
FROM node:24-slim AS base
# packageManager in the root package.json pins pnpm@10.22.0; corepack activates it.
RUN corepack enable
WORKDIR /app

########################################
FROM base AS build
# Manifests + lockfile first so the dependency layer caches independently of
# source edits. pnpm validates the lockfile against EVERY workspace importer,
# so all workspace package.json files must be present even though we only
# install the server + shared subtree.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
COPY apps/admin/package.json apps/admin/
COPY apps/tendahq/package.json apps/tendahq/
COPY packages/shared/package.json packages/shared/
COPY contracts/evm/package.json contracts/evm/
COPY contracts/solana/package.json contracts/solana/

# --ignore-scripts: @tenda/shared's `prepare` runs tsc, which cannot work in
# this sources-absent layer. The build is run explicitly below instead.
RUN pnpm install --frozen-lockfile --ignore-scripts \
    --filter tenda-server --filter @tenda/shared

COPY packages/shared packages/shared
COPY apps/server apps/server

RUN pnpm --filter @tenda/shared build && pnpm --filter tenda-server build

# Self-contained prod tree: @tenda/shared is physically copied in (no workspace
# symlinks), devDependencies dropped. --legacy: pnpm v10 changed deploy to
# require injected workspace packages; legacy mode is what we want with the
# hoisted nodeLinker (shared's runtime imports of drizzle-orm resolve against
# the server's hoisted copy).
RUN pnpm --filter tenda-server deploy --legacy --prod /out

########################################
FROM build AS migrate
WORKDIR /app/apps/server
# drizzle-kit (devDep) + src/db/migrations are already here from the build stage.
# Needs DATABASE_URL at run time. Exits non-zero on a failed migration so a
# deploy pipeline stops before rolling the new runtime image.
CMD ["pnpm", "db:migrate"]

########################################
FROM node:24-slim AS runtime
# production is REQUIRED, not cosmetic: the dev logger path uses a pino-pretty
# transport that is not a production dependency and does not exist in this image.
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/server/dist ./dist
# dist/server.js imports '../instrument.js' (Sentry bootstrap) — it must sit
# beside dist/ at the app root or error reporting silently disappears.
COPY --from=build --chown=node:node /app/apps/server/instrument.js ./instrument.js
# SQL migrations for the opt-in MIGRATE_ON_BOOT=true path (lib/boot-migrate.ts,
# advisory-locked, multi-replica safe). Without the flag the runtime image
# never touches the schema — migrate-then-roll via the migrate target.
COPY --from=build --chown=node:node /app/apps/server/src/db/migrations ./migrations

USER node
EXPOSE 3000
# /v1/health is the liveness probe (readiness incl. DB/Redis is /v1/health/ready,
# left to the orchestrator so a dependency blip doesn't kill the container).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const p=process.env.PORT||3000;fetch('http://127.0.0.1:'+p+'/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
