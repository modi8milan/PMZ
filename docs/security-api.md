# API and security foundation

All routes have prefix `/api/v1`. No business endpoints exist.

| Route       | Response                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| GET /health | 200 `{status:"ok", service:"zenovel-api", timestamp:<UTC>}`; independent of PostgreSQL availability                                 |
| GET /ready  | 200 when database connects and `zenovel` namespace exists; otherwise 503, with only up/down database/schema flags and UTC timestamp |

Readiness uses a bounded real query, no cached optimistic value. Full migration-history verification is the separate `db:validate` acceptance command. Health never returns hostnames, connection strings, table contents or stack traces. Database outage does not prevent the API binding after valid configuration. API tests substitute database state; actual connection/migration checks are separate evidence.

Errors use `{statusCode, code, message, requestId, timestamp}`. Internal exceptions and validation values are not serialized. The request ID is generated server-side, returned in `X-Request-Id`, and used in structured completion logs. Logs contain only event, UTC timestamp, generated ID, HTTP status and elapsed milliseconds. Framework messages are intentionally replaced with safe generic events. This trades detailed diagnostics for confidentiality until a reviewed structured diagnostic strategy is established. The logger is not a business audit trail.

Implemented: ignored secrets, validated config, non-superuser development database role, separated browser/backend config, request DTO validation with whitelist/rejection, explicit browser CORS allowlist, Helmet headers, 64 KiB JSON body limit, safe errors/logs, local-only connections, UTC and dependency timeout bounds. Every API endpoint is rate-limited by client IP; no trust-proxy override. CORS prevents disallowed browsers reading responses; it is not authentication and does not block non-browser callers.

The frontend has frame, MIME, referrer and permissions headers. A production nonce-based CSP must be designed with deployment/session controls; a permissive CSP is not added to create a false security claim. The local plain HTTP environment is not approved for confidential clinical information.

Not implemented: authentication/session management, 30-day password policy, reset/MFA, RBAC/object-scope authorization, electronic signatures, business audit trail, controlled business versions, confidential file processing/scanning, encryption/backup operational controls, regulatory validation or production deployment. Those remain mandatory future-stage requirements. No confidential study data is entered in this foundation.

Dependency audit and actual checks are recorded in the Stage 1 report. A passing build is not a security assessment or regulatory compliance certificate.
