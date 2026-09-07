# syntax=docker/dockerfile:1
# Tenda admin dashboard image — build from the REPO ROOT (the pnpm workspace):
#   docker build -f apps/admin/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.netforgetech.online \
#     --build-arg NEXT_PUBLIC_ADMIN_URL=https://admin.netforgetech.online \
#     -t tenda-admin .
#
# NEXT_PUBLIC_* vars are baked into the client bundle at BUILD time (not runtime),
# so they are passed as build args, not injected by the orchestrator.

########################################
FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app

########################################
FROM base AS build
# Manifests + lockfile first for cacheable dependency layer. pnpm validates the
# lockfile against every workspace importer, so all package.json files present.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
COPY apps/admin/package.json apps/admin/
COPY apps/tendahq/package.json apps/tendahq/
COPY packages/shared/package.json packages/shared/
COPY contracts/evm/package.json contracts/evm/
COPY contracts/solana/package.json contracts/solana/

RUN pnpm install --frozen-lockfile --ignore-scripts \
    --filter admin --filter @tenda/shared

COPY packages/shared packages/shared
COPY apps/admin apps/admin

# NEXT_PUBLIC_* must be present at build time to be embedded in the bundle.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ADMIN_URL
ARG NEXT_PUBLIC_REOWN_PROJECT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL
ENV NEXT_PUBLIC_REOWN_PROJECT_ID=$NEXT_PUBLIC_REOWN_PROJECT_ID

RUN pnpm --filter @tenda/shared build && pnpm --filter admin build

########################################
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/admin

# Copy the built app and its dependencies. Without standalone output mode we
# carry the full node_modules + .next build; larger but correct.
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/admin/node_modules ./node_modules
COPY --from=build /app/apps/admin/.next ./.next
COPY --from=build /app/apps/admin/public ./public
COPY --from=build /app/apps/admin/package.json ./package.json
COPY --from=build /app/packages/shared /app/packages/shared

EXPOSE 3100
CMD ["node", "/app/node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3100"]