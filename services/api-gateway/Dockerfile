# API Gateway — production Dockerfile
# Build context: postpilot/ (monorepo root)
# docker build -f services/api-gateway/Dockerfile -t postpilot/api-gateway:latest .

FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/types/package.json       ./packages/types/
COPY packages/events/package.json      ./packages/events/
COPY packages/sqs/package.json         ./packages/sqs/
COPY packages/logger/package.json    ./packages/logger/
COPY services/api-gateway/package.json ./services/api-gateway/

RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY services/api-gateway/ ./services/api-gateway/

RUN pnpm --filter @postpilot/types     run build
RUN pnpm --filter @postpilot/events    run build
RUN pnpm --filter @postpilot/sqs      run build
RUN pnpm --filter @postpilot/logger   run build
RUN pnpm --filter @postpilot/api-gateway run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/types/package.json       ./packages/types/
COPY packages/events/package.json      ./packages/events/
COPY packages/sqs/package.json         ./packages/sqs/
COPY packages/logger/package.json    ./packages/logger/
COPY services/api-gateway/package.json ./services/api-gateway/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/types/dist   ./packages/types/dist
COPY --from=builder /app/packages/events/dist  ./packages/events/dist
COPY --from=builder /app/packages/sqs/dist     ./packages/sqs/dist
COPY --from=builder /app/packages/logger/dist  ./packages/logger/dist
COPY --from=builder /app/services/api-gateway/dist ./services/api-gateway/dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER node

CMD ["node", "services/api-gateway/dist/index.js"]
