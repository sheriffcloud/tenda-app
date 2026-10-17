# syntax=docker/dockerfile:1
# Tenda web app image — build from the REPO ROOT (the pnpm workspace):
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.netforgetech.online \
#     --build-arg NEXT_PUBLIC_WEB_URL=https://app.netforgetech.online \
#     ... (other NEXT_PUBLIC_* args) \
#     -t tenda-web .

########################################
FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app

########################################
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
COPY apps/admin/package.json apps/admin/
COPY apps/web/package.json apps/web/
COPY apps/tendahq/package.json apps/tendahq/
COPY apps/docs/package.json apps/docs/
COPY packages/shared/package.json packages/shared/
COPY packages/api-doc/package.json packages/api-doc/
COPY contracts/evm/package.json contracts/evm/
COPY contracts/solana/package.json contracts/solana/

RUN pnpm install --frozen-lockfile --ignore-scripts \
    --filter web --filter @tenda/shared

COPY packages/shared packages/shared
COPY apps/web apps/web

# NEXT_PUBLIC_* baked in at build time
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WEB_URL
ARG NEXT_PUBLIC_APP_ENV
ARG NEXT_PUBLIC_REOWN_PROJECT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL
ENV NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV
ENV NEXT_PUBLIC_REOWN_PROJECT_ID=$NEXT_PUBLIC_REOWN_PROJECT_ID


RUN pnpm --filter @tenda/shared build && pnpm --filter web build

########################################
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/web

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/web/node_modules ./node_modules
COPY --from=build /app/apps/web/.next ./.next
COPY --from=build /app/apps/web/public ./public
COPY --from=build /app/apps/web/package.json ./package.json
COPY --from=build /app/packages/shared /app/packages/shared

EXPOSE 3200
CMD ["node", "/app/node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3200"]