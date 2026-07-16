#!/usr/bin/env bash
# Run the full PostPilot system E2E test suite.
#
# Runs:
#   1. Backend pipeline integration tests (all services wired together)
#   2. System E2E tests (backend + frontend API contract + cross-cutting)
#   3. Frontend integration tests (UI flows with mocked API)
#   4. All service unit tests
#
# Usage:
#   ./scripts/test-e2e.sh
#   BAIL=true ./scripts/test-e2e.sh   # stop on first failure

set -euo pipefail

BAIL="${BAIL:-false}"
BAIL_FLAG=""
if [[ "${BAIL}" == "true" ]]; then
  BAIL_FLAG="--bail"
fi

cd "$(dirname "$0")/.."

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         PostPilot System End-to-End Test Suite               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

PASS=0
FAIL=0

run_suite() {
  local name="$1"
  local cmd="$2"
  local cwd="${3:-.}"

  echo "▶ ${name}"
  if (cd "${cwd}" && eval "${cmd}"); then
    echo "  ✓ PASSED"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAILED"
    FAIL=$((FAIL + 1))
    if [[ "${BAIL}" == "true" ]]; then
      echo ""
      echo "Stopping on first failure (BAIL=true)"
      exit 1
    fi
  fi
  echo ""
}

# ── 1. Build shared packages (required for imports) ──────────────────────────
echo "Building shared packages..."
pnpm --filter @postpilot/types run build --silent 2>/dev/null || true
pnpm --filter @postpilot/events run build --silent 2>/dev/null || true
pnpm --filter @postpilot/queue run build --silent 2>/dev/null || true
echo ""

# ── 2. Backend service unit tests ────────────────────────────────────────────
echo "── Backend Service Unit Tests ──────────────────────────────────"
for SERVICE in compression-engine targeting-engine repurposing-engine \
               publishing-service analytics-engine api-gateway \
               notification-service auth-service; do
  run_suite "services/${SERVICE}" \
    "pnpm vitest run ${BAIL_FLAG}" \
    "services/${SERVICE}"
done

# ── 3. Backend pipeline integration test ─────────────────────────────────────
echo "── Backend Pipeline Integration Test ───────────────────────────"
run_suite "integration-tests/pipeline" \
  "pnpm vitest run src/pipeline.integration.test.ts ${BAIL_FLAG}" \
  "integration-tests"

# ── 4. System E2E test (backend + frontend contract) ─────────────────────────
echo "── System E2E Test ─────────────────────────────────────────────"
run_suite "integration-tests/system-e2e" \
  "pnpm vitest run src/system.e2e.test.ts ${BAIL_FLAG}" \
  "integration-tests"

# ── 5. Frontend unit + integration tests ─────────────────────────────────────
echo "── Frontend Tests ──────────────────────────────────────────────"
run_suite "apps/web" \
  "pnpm vitest run ${BAIL_FLAG}" \
  "apps/web"

# ── 6. Pipeline concurrency benchmark ────────────────────────────────────────
echo "── Pipeline Concurrency Benchmark ──────────────────────────────"
run_suite "integration-tests/concurrency-bench" \
  "pnpm vitest run src/pipeline.concurrency.bench.ts ${BAIL_FLAG}" \
  "integration-tests"

# ── Summary ───────────────────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Results: ${PASS} passed, ${FAIL} failed"
echo "╚══════════════════════════════════════════════════════════════╝"

if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
