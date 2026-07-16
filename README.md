# PostPilot — AI Creator OS

PostPilot is an all-in-one platform for social media creators. Upload content once and PostPilot automatically adapts, repurposes, schedules, and publishes it across TikTok, Instagram, YouTube, LinkedIn, and Facebook.

## Monorepo Structure

```
postpilot/
├── apps/
│   └── web/                  # Next.js 14 frontend (@postpilot/web)
├── packages/
│   ├── types/                # Shared TypeScript types (@postpilot/types)
│   ├── events/               # Message bus event schemas (@postpilot/events)
│   └── queue/                # BullMQ producer/consumer abstraction (@postpilot/queue)
├── services/
│   ├── api-gateway/          # HTTP entry point, JWT auth, rate limiting (port 3000)
│   ├── asset-service/        # Upload initiation, GCS presigned URLs (port 3001)
│   ├── auth-service/         # OAuth 2.0 channel management (port 3004)
│   ├── publishing-service/   # Post scheduling and platform dispatch (port 3005)
│   ├── targeting-engine/     # Hashtags, timing, trends, predictions (port 3006)
│   ├── analytics-engine/     # Metric ingestion and AI insights (port 3007)
│   ├── notification-service/ # In-app, push, and email notifications (port 3008)
│   ├── compression-engine/   # FFmpeg encoding with VMAF scoring (queue consumer)
│   ├── transcoder/           # Platform adaptation generation (queue consumer)
│   └── repurposing-engine/   # Clip extraction and caption generation (queue consumer)
├── integration-tests/        # End-to-end pipeline tests
├── load-tests/               # k6 load and performance tests
├── migrations/               # PostgreSQL schema migrations
└── scripts/                  # Build and deployment scripts
```

## Prerequisites

- Node.js >= 20
- pnpm >= 9 (`npm install -g pnpm`)
- Docker + Docker Compose
- Groq API key (free at [console.groq.com](https://console.groq.com))
- Google Cloud SDK (gcloud CLI) (for deployment)

## Quick Start

```bash
# 1. Install all dependencies
cd postpilot
pnpm install

# 2. Start infrastructure (Postgres, Redis)
docker compose up -d postgres redis

# 3. Run database migrations
cd migrations
DATABASE_URL=postgres://postpilot:postpilot@localhost:5432/postpilot pnpm migrate:up
cd ..

# 4. Build shared packages
pnpm --filter @postpilot/types run build
pnpm --filter @postpilot/events run build
pnpm --filter @postpilot/queue run build

# 5. Start backend services (each in a separate terminal)
node services/api-gateway/dist/index.js       # :3000
node services/asset-service/dist/index.js     # :3001
node services/auth-service/dist/index.js      # :3004
node services/publishing-service/dist/index.js # :3005
node services/targeting-engine/dist/index.js  # :3006
node services/analytics-engine/dist/index.js  # :3007
node services/notification-service/dist/index.js # :3008
node services/compression-engine/dist/index.js  # queue consumer
node services/transcoder/dist/index.js          # queue consumer
node services/repurposing-engine/dist/index.js  # queue consumer

# 6. Start the frontend
pnpm dev:web   # http://localhost:3001 (Next.js dev server)
```

Or start everything at once (interleaved logs):

```bash
pnpm dev
```

## Environment Variables

Copy `.env.local.example` in `apps/web/` and set `NEXT_PUBLIC_API_URL`.

For backend services, the defaults in `docker-compose.yml` work for local dev.

Key variables:

| Variable | Used by | Description |
|---|---|---|
| `GROQ_API_KEY` | repurposing-engine, analytics-engine | AI captions, insights, transcription |
| `DATABASE_URL` | all services | PostgreSQL connection string |
| `REDIS_URL` | all services | Redis for message queue (BullMQ) and idempotency |
| `QUEUE_PREFIX` | all services | Prefix for queue names (default: `postpilot`) |
| `GCS_BUCKET` | asset-service, compression-engine, transcoder, repurposing-engine | Google Cloud Storage bucket |
| `GCS_PUBLIC_URL` | repurposing-engine | Public base URL for GCS objects |
| `JWT_SECRET` | api-gateway | JWT signing secret |
| `NEXT_PUBLIC_API_URL` | apps/web | API Gateway URL |
| `GCP_PROJECT_ID` | auth-service | Google Cloud Project ID (used by Secret Manager) |
| `VAULT_PROVIDER` | auth-service | Vault provider ('gcp' for Secret Manager, 'memory' for dev) |

## Running Tests

```bash
# All tests
pnpm test

# Backend only
pnpm test:services

# Frontend only
pnpm test:web

# Integration tests
pnpm --filter @postpilot/integration-tests run test

# Load tests (requires k6 and running services)
cd load-tests && pnpm asset
```

## Production Deployment (GCP Cloud Run)

PostPilot is deployed on **Google Cloud Run** using **Cloud Build** to build and push docker images.
It connects to a **Cloud SQL for PostgreSQL** database and a **Memorystore for Redis** instance.

```bash
# 1. Install Google Cloud SDK
# Ensure you are logged in and config project is set:
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 2. Deploy all services
GCP_PROJECT_ID=YOUR_PROJECT_ID GCP_REGION=us-central1 ./scripts/deploy-gcp.sh

# Or deploy a single service
SERVICE=api-gateway GCP_PROJECT_ID=YOUR_PROJECT_ID GCP_REGION=us-central1 ./scripts/deploy-gcp.sh
```

## Object Storage

PostPilot uses **Google Cloud Storage (GCS)** for object storage.
In local development, you can use any S3-compatible tool or connect directly to a GCS bucket using Google Cloud credentials.

Configure via the `GCS_BUCKET` environment variable. In production, Cloud Run instances use Application Default Credentials (ADC) from the service account.

## Local Docker Build

```bash
# Build all images locally (for testing)
./scripts/docker-build.sh

# Build + push to a registry
REGISTRY=ghcr.io/your-org PUSH=true ./scripts/docker-build.sh
```
