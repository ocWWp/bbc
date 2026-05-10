# BBC Dashboard — Production Dockerfile
#
# Multi-stage build:
#   1. deps    — install all pnpm workspace deps
#   2. builder — build @bbc/dashboard (Next.js production output)
#   3. runner  — minimal Node image serving the built app
#
# Built from the bbc/ monorepo root so the build context can see
# packages/store + apps/dashboard together. From bbc/ root:
#
#   docker build -t bbc-dashboard -f apps/dashboard/Dockerfile .
#
# Or via docker-compose at the repo root.

# ---- Stage 1: dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

# Copy workspace manifests first for cacheable installs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/mcp-server/package.json ./apps/mcp-server/
COPY packages/store/package.json ./packages/store/

RUN pnpm install --frozen-lockfile

# ---- Stage 2: build ----
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/dashboard/node_modules ./apps/dashboard/node_modules
COPY --from=deps /app/packages/store/node_modules ./packages/store/node_modules

COPY . .

RUN pnpm --filter @bbc/dashboard build

# ---- Stage 3: runtime ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Bring built artifacts + the install tree
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/dashboard/node_modules ./apps/dashboard/node_modules
COPY --from=builder /app/apps/dashboard/.next ./apps/dashboard/.next
COPY --from=builder /app/apps/dashboard/package.json ./apps/dashboard/
COPY --from=builder /app/apps/dashboard/next.config.ts ./apps/dashboard/
COPY --from=builder /app/packages/store ./packages/store
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./

EXPOSE 3000

WORKDIR /app/apps/dashboard
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
