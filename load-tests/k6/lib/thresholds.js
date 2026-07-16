/**
 * Shared k6 threshold definitions.
 * Import and spread into your scenario's `thresholds` config.
 */

/** Standard thresholds for read (GET) endpoints */
export const readThresholds = {
  http_req_failed:   [{ threshold: 'rate<0.01', abortOnFail: false }],  // < 1% errors
  http_req_duration: [
    { threshold: 'p(95)<200',  abortOnFail: false },  // p95 < 200 ms
    { threshold: 'p(99)<1000', abortOnFail: false },  // p99 < 1 s
  ],
}

/** Standard thresholds for write (POST/PATCH/DELETE) endpoints */
export const writeThresholds = {
  http_req_failed:   [{ threshold: 'rate<0.01', abortOnFail: false }],
  http_req_duration: [
    { threshold: 'p(95)<500',  abortOnFail: false },  // p95 < 500 ms
    { threshold: 'p(99)<1000', abortOnFail: false },
  ],
}

/** Strict thresholds for the API Gateway (includes proxy overhead) */
export const gatewayThresholds = {
  http_req_failed:   [{ threshold: 'rate<0.01', abortOnFail: false }],
  http_req_duration: [
    { threshold: 'p(95)<300',  abortOnFail: false },
    { threshold: 'p(99)<1000', abortOnFail: false },
  ],
}
