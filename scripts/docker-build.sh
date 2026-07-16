#!/usr/bin/env bash
# Build and optionally push all PostPilot service images.
#
# Usage:
#   ./scripts/docker-build.sh                        # build only
#   PUSH=true ./scripts/docker-build.sh              # build + push
#   REGISTRY=ghcr.io/your-org PUSH=true ./scripts/docker-build.sh
#
# Note: When deploying to GCP, images can be built automatically via Cloud Build.
# This script is for local development and testing only.
#
# Requires: docker, buildx (for multi-platform builds)

set -euo pipefail

GCP_REGION="${GCP_REGION:-us-central1}"
GCP_PROJECT_ID="${GCP_PROJECT_ID:-postpilot}"
ARTIFACT_REPO="${ARTIFACT_REPO:-postpilot}"

REGISTRY="${REGISTRY:-${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REPO}}"
TAG="${TAG:-latest}"
PUSH="${PUSH:-false}"
PLATFORM="${PLATFORM:-linux/amd64}"
API_URL="${NEXT_PUBLIC_API_URL:-https://api.postpilot.io}"

# service-name:port pairs
declare -A SERVICES=(
  [api-gateway]=3000
  [asset-service]=3001
  [auth-service]=3004
  [publishing-service]=3005
  [targeting-engine]=3006
  [analytics-engine]=3007
  [notification-service]=3008
  [compression-engine]=3009
  [transcoder]=3010
  [repurposing-engine]=3011
)

cd "$(dirname "$0")/.."

echo "Building PostPilot service images (tag: ${TAG}, registry: ${REGISTRY})"

for SERVICE in "${!SERVICES[@]}"; do
  PORT="${SERVICES[$SERVICE]}"
  IMAGE="${REGISTRY}/${SERVICE}:${TAG}"

  echo ""
  echo "▶ Building ${IMAGE} (port ${PORT})..."

  docker buildx build \
    --platform "${PLATFORM}" \
    --build-arg SERVICE_NAME="${SERVICE}" \
    --build-arg SERVICE_PORT="${PORT}" \
    -f Dockerfile.service \
    -t "${IMAGE}" \
    ${PUSH:+--push} \
    .

  echo "✓ ${IMAGE}"
done

# Build the Next.js web frontend
echo ""
echo "▶ Building ${REGISTRY}/web:${TAG}..."
docker buildx build \
  --platform "${PLATFORM}" \
  --build-arg NEXT_PUBLIC_API_URL="${API_URL}" \
  -f apps/web/Dockerfile \
  -t "${REGISTRY}/web:${TAG}" \
  ${PUSH:+--push} \
  .

echo "✓ ${REGISTRY}/web:${TAG}"

echo ""
echo "All images built successfully."
