# PostPilot Web — Next.js 14 production Dockerfile
# Build context: postpilot/ (monorepo root)
#
# docker build -f apps/web/Dockerfile -t postpilot/web:latest .

# ── Builder ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Workspace manifests (layer-cached)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/types/package.json       ./packages/types/
COPY packages/events/package.json      ./packages/events/
COPY packages/queue/package.json         ./packages/queue/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# Source
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

ARG NEXT_PUBLIC_API_URL=https://api.postpilot.io
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NODE_ENV=production

# Build shared packages then the web app
RUN pnpm --filter @postpilot/types run build
RUN pnpm --filter @postpilot/web run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# Copy what Next.js standalone output needs
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3001

USER node

# In a monorepo, next standalone usually outputs to apps/web/server.js
CMD ["node", "apps/web/server.js"]

