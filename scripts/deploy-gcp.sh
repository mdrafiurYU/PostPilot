#!/usr/bin/env bash
#
# Deploy PostPilot services to Google Cloud Run
#
# Required environment variables:
#   GCP_PROJECT_ID
#   GCP_REGION
#   ARTIFACT_REPO
#   IMAGE_TAG
#
# Required secrets:
#   DATABASE_URL
#   REDIS_URL
#   JWT_SECRET
#
# Optional:
#   SERVICE
#   VPC_CONNECTOR
#   CLOUDSQL_INSTANCES
#   CLOUD_RUN_SA
#
# Usage:
#   ./deploy-gcp.sh
#
# Deploy single service:
#   SERVICE=api-gateway ./deploy-gcp.sh

set -euo pipefail

cd "$(dirname "$0")/.."

#######################################
# Configuration
#######################################

GCP_PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
GCP_REGION="${GCP_REGION:-northamerica-northeast1}"
ARTIFACT_REPO="${ARTIFACT_REPO:-postpilot}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

CLOUD_RUN_SA="${CLOUD_RUN_SA:-postpilot-cloud-run@${GCP_PROJECT_ID}.iam.gserviceaccount.com}"

#######################################
# Validate secrets
#######################################

DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
REDIS_URL="${REDIS_URL:?REDIS_URL is required}"
JWT_SECRET="${JWT_SECRET:?JWT_SECRET is required}"

GCS_BUCKET="${GCS_BUCKET:?GCS_BUCKET is required}"
GROQ_API_KEY="${GROQ_API_KEY:-}"

#######################################
# Parse arguments
#######################################

VPC_ARGS=()
CLOUDSQL_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vpc-connector)
      VPC_ARGS+=(--vpc-connector "$2")
      shift 2
      ;;
    --add-cloudsql-instances)
      CLOUDSQL_ARGS+=(--add-cloudsql-instances "$2")
      shift 2
      ;;
    --help|-h)
      cat <<EOF
Usage:
  $0 [options]

Options:
  --vpc-connector NAME
  --add-cloudsql-instances INSTANCE
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      shift
      ;;
  esac
done

#######################################
# Display configuration
#######################################

echo "
=================================================
 PostPilot Cloud Run Deployment
=================================================
Project:                  ${GCP_PROJECT_ID}
Region:                   ${GCP_REGION}
Artifact Registry:        ${ARTIFACT_REPO}
Runtime Service Account:  ${CLOUD_RUN_SA}
Image Tag:                ${IMAGE_TAG}
=================================================
"

#######################################
# Helper functions
#######################################

get_service_url() {
  local SERVICE_NAME=$1

  gcloud run services describe "${SERVICE_NAME}" \
    --project "${GCP_PROJECT_ID}" \
    --region "${GCP_REGION}" \
    --format="value(status.url)" \
    2>/dev/null || true
}

deploy_service() {
  local SERVICE_NAME=$1

  echo ""
  echo "=========================================="
  echo "Deploying ${SERVICE_NAME}"
  echo "=========================================="

  local IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REPO}/${SERVICE_NAME}:${IMAGE_TAG}"

  local ENV_ARGS=(
    "DATABASE_URL=${DATABASE_URL}"
    "REDIS_URL=${REDIS_URL}"
  )

  ####################################
  # Service specific configuration
  ####################################

  case "${SERVICE_NAME}" in
    api-gateway)
      local ASSET_URL AUTH_URL PUBLISHING_URL TARGETING_URL ANALYTICS_URL NOTIFICATION_URL
      ASSET_URL=$(get_service_url asset-service)
      AUTH_URL=$(get_service_url auth-service)
      PUBLISHING_URL=$(get_service_url publishing-service)
      TARGETING_URL=$(get_service_url targeting-engine)
      ANALYTICS_URL=$(get_service_url analytics-engine)
      NOTIFICATION_URL=$(get_service_url notification-service)

      ENV_ARGS+=(
        "JWT_SECRET=${JWT_SECRET}"
        "ASSET_SERVICE_URL=${ASSET_URL}"
        "AUTH_SERVICE_URL=${AUTH_URL}"
        "PUBLISHING_SERVICE_URL=${PUBLISHING_URL}"
        "TARGETING_SERVICE_URL=${TARGETING_URL}"
        "ANALYTICS_SERVICE_URL=${ANALYTICS_URL}"
        "NOTIFICATION_SERVICE_URL=${NOTIFICATION_URL}"
      )
      ;;

    asset-service|compression-engine|transcoder|repurposing-engine)
      ENV_ARGS+=(
        "GCS_BUCKET=${GCS_BUCKET}"
      )

      if [[ "${SERVICE_NAME}" == "repurposing-engine" ]]; then
        ENV_ARGS+=(
          "GROQ_API_KEY=${GROQ_API_KEY}"
          "GCS_PUBLIC_URL=https://storage.googleapis.com/${GCS_BUCKET}"
        )
      fi
      ;;

    analytics-engine)
      ENV_ARGS+=(
        "GROQ_API_KEY=${GROQ_API_KEY}"
      )
      ;;

    auth-service)
      ENV_ARGS+=(
        "GCP_PROJECT_ID=${GCP_PROJECT_ID}"
        "VAULT_PROVIDER=gcp"
      )
      ;;

    web)
      local API_URL
      API_URL=$(get_service_url api-gateway)

      ENV_ARGS=(
        "NEXT_PUBLIC_API_URL=${API_URL}"
      )
      ;;
  esac

  local ENV_STRING
  ENV_STRING=$(IFS=, ; echo "${ENV_ARGS[*]}")

  gcloud run deploy "${SERVICE_NAME}" \
    --project "${GCP_PROJECT_ID}" \
    --region "${GCP_REGION}" \
    --platform managed \
    --image "${IMAGE}" \
    --service-account "${CLOUD_RUN_SA}" \
    --allow-unauthenticated \
    "${VPC_ARGS[@]}" \
    "${CLOUDSQL_ARGS[@]}" \
    --set-env-vars "${ENV_STRING}"

  echo ""
  echo "SUCCESS: ${SERVICE_NAME} deployed"
}

#######################################
# Deployment order
#######################################

SERVICES=(
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

#######################################
# Single service deployment
#######################################

if [[ -n "${SERVICE:-}" ]]; then
  deploy_service "${SERVICE}"
  exit 0
fi

#######################################
# Deploy all services
#######################################

for SERVICE_NAME in "${SERVICES[@]}"; do
  deploy_service "${SERVICE_NAME}"
done

echo ""
echo "================================================="
echo " PostPilot deployment completed successfully"
echo "================================================="

echo ""
echo "Frontend:"
get_service_url web

echo ""
echo "API Gateway:"
get_service_url api-gateway