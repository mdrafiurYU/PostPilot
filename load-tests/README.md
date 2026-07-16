# PostPilot Load & Performance Tests

Load and performance tests for all PostPilot HTTP services using [k6](https://k6.io/).

## Prerequisites

```bash
# macOS
brew install k6

# or via Docker
docker run --rm -i grafana/k6 run - < load-tests/k6/asset-service.js
```

## Running Tests

All services must be running before executing load tests. Start the stack:

```bash
cd postpilot
docker compose up -d
# then start each service in separate terminals or via your process manager
```

### Run individual scenarios

```bash
# Asset Service — upload initiation throughput
k6 run load-tests/k6/asset-service.js

# Publishing Service — post scheduling throughput
k6 run load-tests/k6/publishing-service.js

# Targeting Engine — hashtag/timing/trends/prediction endpoints
k6 run load-tests/k6/targeting-engine.js

# Analytics Engine — dashboard aggregation
k6 run load-tests/k6/analytics-engine.js

# API Gateway — end-to-end routing + JWT validation + rate limiting
k6 run load-tests/k6/api-gateway.js

# Full soak test (all services, 10-minute sustained load)
k6 run load-tests/k6/soak.js
```

### Run in-process pipeline concurrency benchmark (no live services needed)

```bash
cd postpilot/integration-tests
pnpm vitest run src/pipeline.concurrency.bench.ts
```

## Thresholds

| Metric | Threshold |
|---|---|
| HTTP error rate | < 1% |
| p95 response time (read endpoints) | < 200 ms |
| p95 response time (write endpoints) | < 500 ms |
| p99 response time (all) | < 1 000 ms |
| Scheduler dispatch latency | < 60 000 ms (Req 4.3) |
| Encoding throughput | ≤ 5 min/min of source video (Req 7.9) |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | API Gateway base URL |
| `ASSET_URL` | `http://localhost:3001` | Asset Service direct URL |
| `PUBLISHING_URL` | `http://localhost:3005` | Publishing Service direct URL |
| `TARGETING_URL` | `http://localhost:3006` | Targeting Engine direct URL |
| `ANALYTICS_URL` | `http://localhost:3007` | Analytics Engine direct URL |
| `JWT_SECRET` | `postpilot-dev-secret` | JWT signing secret |
| `VUS` | `20` | Virtual users for standard scenarios |
| `DURATION` | `30s` | Test duration for standard scenarios |
