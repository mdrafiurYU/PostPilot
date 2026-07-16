#!/usr/bin/env bash
# Deploy all PostPilot services to Google Cloud Run.
#
# Prerequisites:
#   - Google Cloud SDK (gcloud CLI) installed and configured
#   - Logged in: gcloud auth login
#   - Project set: gcloud config set project YOUR_PROJECT_ID
#   - Artifact Registry repository created (e.g., named 'postpilot' in your region)
#   - Cloud SQL for PostgreSQL and Memorystore for Redis instances provisioned
#   - Necessary environment variables set/passed
#
# Usage:
#   GCP_PROJECT_ID=my-project GCP_REGION=us-central1 ./scripts/deploy-gcp.sh
#   SERVICE=api-gateway GCP_PROJECT_ID=my-project GCP_REGION=us-central1 ./scripts/deploy-gcp.sh # deploy single service
#
# Additional optional CLI flags:
#   --vpc-connector <connector-name>             : attach Serverless VPC Connector to Cloud Run services
#   --add-cloudsql-instances <inst1,inst2,...>   : add Cloud SQL instances to Cloud Run services

set -euo pipefail

cd "$(dirname "$0")/.."

# Parse optional CLI flags for Cloud Run networking
VPC_CONNECTOR="${VPC_CONNECTOR:-}"
CLOUDSQL_INSTANCES="${CLOUDSQL_INSTANCES:-}"
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --vpc-connector)
      VPC_CONNECTOR="$2"
      shift 2
      ;;
    --add-cloudsql-instances)
      CLOUDSQL_INSTANCES="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [--vpc-connector NAME] [--add-cloudsql-instances INSTANCES]"
      exit 0
      ;;
    *)
      # unknown arg; ignore (other env vars still used)
      shift
      ;;
  esac
done

# Build flags to pass to gcloud run deploy
VPC_FLAG=""
CLOUDSQL_FLAG=""
if [[ -n "${VPC_CONNECTOR}" ]]; then
  VPC_FLAG="--vpc-connector ${VPC_CONNECTOR}"
fi
if [[ -n "${CLOUDSQL_INSTANCES}" ]]; then
  CLOUDSQL_FLAG="--add-cloudsql-instances ${CLOUDSQL_INSTANCES}"
fi

GCP_PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
GCP_REGION="${GCP_REGION:-us-central1}"
ARTIFACT_REPO="${ARTIFACT_REPO:-postpilot}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

if [[ -z "${GCP_PROJECT_ID}" ]]; then
  echo "Error: GCP_PROJECT_ID is not set and could not be detected via gcloud config."
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          PostPilot — GCP Cloud Run Deployment                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo "Project: ${GCP_PROJECT_ID}"
echo "Region:  ${GCP_REGION}"
echo "Repo:    ${ARTIFACT_REPO}"
echo ""

# Helper to retrieve Cloud Run service URL
get_service_url() {
  local service_name=$1
  gcloud run services describe "${service_name}" \
    --project "${GCP_PROJECT_ID}" \
    --region "${GCP_REGION}" \
    --format 'value(status.url)' 2>/dev/null || echo ""
}

# 1. Run database migrations
if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "▶ Running database migrations..."
  cd migrations
  DATABASE_URL="${DATABASE_URL}" pnpm migrate:up
  cd ..
  echo "✓ Migrations complete"
  echo ""
else
  echo "⚠ DATABASE_URL not set locally; skipping migration step."
  echo "  (Make sure migrations are run on your database instance.)"
  echo ""
fi

# 2. Build images using Cloud Build
echo "▶ Triggering Cloud Build to build and push images..."
gcloud builds submit . \
  --project "${GCP_PROJECT_ID}" \
  --config cloudbuild.yaml \
  --substitutions=_GCP_REGION="${GCP_REGION}",_ARTIFACT_REPO="${ARTIFACT_REPO}"
echo "✓ Cloud Build complete"
echo ""

# Common environment variables for all backend services
# (Usually set via Cloud Run env vars. In production, prefer GCP Secret Manager for sensitive keys)
DB_URL_VAL="${DATABASE_URL:-postgresql://postpilot:postpilot@localhost:5432/postpilot}"
REDIS_URL_VAL="${REDIS_URL:-redis://localhost:6379}"
GCS_BUCKET_VAL="${GCS_BUCKET:-postpilot-assets}"
JWT_SECRET_VAL="${JWT_SECRET:-postpilot-dev-secret}"
GROQ_API_KEY_VAL="${GROQ_API_KEY:-}"

# Service discovery: get URLs of downstream services if they exist already, or fallback to temporary names
ASSET_URL="$(get_service_url asset-service)"
AUTH_URL="$(get_service_url auth-service)"
PUBLISHING_URL="$(get_service_url publishing-service)"
TARGETING_URL="$(get_service_url targeting-engine)"
ANALYTICS_URL="$(get_service_url analytics-engine)"
NOTIFICATION_URL="$(get_service_url notification-service)"

ASSET_URL="${ASSET_URL:-http://asset-service}"
AUTH_URL="${AUTH_URL:-http://auth-service}"
PUBLISHING_URL="${PUBLISHING_URL:-http://publishing-service}"
TARGETING_URL="${TARGETING_URL:-http://targeting-engine}"
ANALYTICS_URL="${ANALYTICS_URL:-http://analytics-engine}"
NOTIFICATION_URL="${NOTIFICATION_URL:-http://notification-service}"

# Deploy single service if requested
if [[ -n "${SERVICE:-}" ]]; then
  echo "▶ Deploying single service: ${SERVICE}..."
  IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REPO}/${SERVICE}:${IMAGE_TAG}"

  ENV_ARGS=(
    "DATABASE_URL=${DB_URL_VAL}"
    "REDIS_URL=${REDIS_URL_VAL}"
  )

  if [[ "${SERVICE}" == "api-gateway" ]]; then
    ENV_ARGS+=(
      "JWT_SECRET=${JWT_SECRET_VAL}"
      "ASSET_SERVICE_URL=${ASSET_URL}"
      "AUTH_SERVICE_URL=${AUTH_URL}"
      "PUBLISHING_SERVICE_URL=${PUBLISHING_URL}"
      "TARGETING_SERVICE_URL=${TARGETING_URL}"
      "ANALYTICS_SERVICE_URL=${ANALYTICS_URL}"
      "NOTIFICATION_SERVICE_URL=${NOTIFICATION_URL}"
    )
  elif [[ "${SERVICE}" == "asset-service" || "${SERVICE}" == "compression-engine" || "${SERVICE}" == "transcoder" || "${SERVICE}" == "repurposing-engine" ]]; then
    ENV_ARGS+=("GCS_BUCKET=${GCS_BUCKET_VAL}")
    if [[ "${SERVICE}" == "repurposing-engine" ]]; then
      ENV_ARGS+=(
        "GROQ_API_KEY=${GROQ_API_KEY_VAL}"
        "GCS_PUBLIC_URL=https://storage.googleapis.com/${GCS_BUCKET_VAL}"
      )
    fi
  elif [[ "${SERVICE}" == "auth-service" ]]; then
    ENV_ARGS+=(
      "GCP_PROJECT_ID=${GCP_PROJECT_ID}"
      "VAULT_PROVIDER=gcp"
    )
  elif [[ "${SERVICE}" == "analytics-engine" ]]; then
    ENV_ARGS+=("GROQ_API_KEY=${GROQ_API_KEY_VAL}")
  elif [[ "${SERVICE}" == "web" ]]; then
    API_GATEWAY_URL="$(get_service_url api-gateway)"
    ENV_ARGS=("NEXT_PUBLIC_API_URL=${API_GATEWAY_URL:-http://api-gateway}")
  fi

  # Build --set-env-vars string
  ENV_STRING=$(IFS=,; echo "${ENV_ARGS[*]}")

  gcloud run deploy "${SERVICE}" \
    --project "${GCP_PROJECT_ID}" \
    --image "${IMAGE}" \
    --region "${GCP_REGION}" \
    --platform managed \
    --allow-unauthenticated \
    ${VPC_FLAG} ${CLOUDSQL_FLAG} \
    --set-env-vars "${ENV_STRING}"

  echo "✓ ${SERVICE} deployed successfully"
  exit 0
fi

# Deploy all services in order (dependencies first)
SERVICES_TO_DEPLOY=(
  auth-service
  asset-service
  publishing-service
  targeting-engine
  analytics-engine
  notification-service
  compression-engine
  transcoder
  repurposing-engine
  api-gateway
  web
)

for SERV in "${SERVICES_TO_DEPLOY[@]}"; do
  echo "▶ Deploying ${SERV}..."
  IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REPO}/${SERV}:${IMAGE_TAG}"

  ENV_ARGS=(
    "DATABASE_URL=${DB_URL_VAL}"
    "REDIS_URL=${REDIS_URL_VAL}"
  )

  if [[ "${SERV}" == "api-gateway" ]]; then
    # Resolve fresh URLs for dependencies that were just deployed
    ASSET_URL="$(get_service_url asset-service)"
    AUTH_URL="$(get_service_url auth-service)"
    PUBLISHING_URL="$(get_service_url publishing-service)"
    TARGETING_URL="$(get_service_url targeting-engine)"
    ANALYTICS_URL="$(get_service_url analytics-engine)"
    NOTIFICATION_URL="$(get_service_url notification-service)"

    ENV_ARGS+=(
      "JWT_SECRET=${JWT_SECRET_VAL}"
      "ASSET_SERVICE_URL=${ASSET_URL:-http://asset-service}"
      "AUTH_SERVICE_URL=${AUTH_URL:-http://auth-service}"
      "PUBLISHING_SERVICE_URL=${PUBLISHING_URL:-http://publishing-service}"
      "TARGETING_SERVICE_URL=${TARGETING_URL:-http://targeting-engine}"
      "ANALYTICS_SERVICE_URL=${ANALYTICS_URL:-http://analytics-engine}"
      "NOTIFICATION_SERVICE_URL=${NOTIFICATION_URL:-http://notification-service}"
    )
  elif [[ "${SERV}" == "asset-service" || "${SERV}" == "compression-engine" || "${SERV}" == "transcoder" || "${SERV}" == "repurposing-engine" ]]; then
    ENV_ARGS+=("GCS_BUCKET=${GCS_BUCKET_VAL}")
    if [[ "${SERV}" == "repurposing-engine" ]]; then
      ENV_ARGS+=(
        "GROQ_API_KEY=${GROQ_API_KEY_VAL}"
        "GCS_PUBLIC_URL=https://storage.googleapis.com/${GCS_BUCKET_VAL}"
      )
    fi
  elif [[ "${SERV}" == "auth-service" ]]; then
    ENV_ARGS+=(
      "GCP_PROJECT_ID=${GCP_PROJECT_ID}"
      "VAULT_PROVIDER=gcp"
    )
  elif [[ "${SERV}" == "analytics-engine" ]]; then
    ENV_ARGS+=("GROQ_API_KEY=${GROQ_API_KEY_VAL}")
  elif [[ "${SERV}" == "web" ]]; then
    API_GATEWAY_URL="$(get_service_url api-gateway)"
    ENV_ARGS=("NEXT_PUBLIC_API_URL=${API_GATEWAY_URL:-http://api-gateway}")
  fi

  ENV_STRING=$(IFS=,; echo "${ENV_ARGS[*]}")

  gcloud run deploy "${SERV}" \
    --project "${GCP_PROJECT_ID}" \
    --image "${IMAGE}" \
    --region "${GCP_REGION}" \
    --platform managed \
    --allow-unauthenticated \
    ${VPC_FLAG} ${CLOUDSQL_FLAG} \
    --set-env-vars "${ENV_STRING}"
  
  echo "✓ ${SERV} deployed"
  echo ""
done

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  All PostPilot services deployed successfully to GCP.       ║"
echo "║  Web Frontend: $(get_service_url web)                       ║"
echo "║  API Gateway:  $(get_service_url api-gateway)               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
