# Environment variables

API file: `apps/api/.env` (ignored). Frontend file: `apps/web/.env.local` (ignored). Examples contain placeholders only. `npm` workspace scripts run in the workspace's directory; database tooling resolves the API file explicitly. OS environment values override file values. The tooling never prints connection strings. Empty/default example credentials are not a working connection.

| Variable                 | Scope                | Meaning / constraint                                                                                                                    |
| ------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| NODE_ENV                 | API                  | development, test or production; default development                                                                                    |
| HOST                     | API                  | 127.0.0.1 or ::1 only                                                                                                                   |
| PORT                     | API                  | Integer 1024–65535; default 4000                                                                                                        |
| CORS_ORIGINS             | API                  | Required comma-separated exact local HTTP origins, e.g. http://127.0.0.1:3000; no wildcard, path or trailing slash                      |
| DATABASE_URL             | API/database tooling | Required local PostgreSQL URL with username, password and database; password URL-encoded; no URL query parameters; placeholder rejected |
| DB_POOL_MAX              | API                  | 1–20; default 5                                                                                                                         |
| DB_TIMEOUT_MS            | API                  | 500–10000 ms; default 3000; connect, query and statement bounds                                                                         |
| RATE_LIMIT               | API                  | 1–1000 requests per window per client IP; default 60                                                                                    |
| RATE_TTL_MS              | API                  | 1000–3600000 ms; default 60000                                                                                                          |
| NEXT_PUBLIC_API_BASE_URL | Browser              | Local HTTP API address ending exactly /api/v1; default http://127.0.0.1:4000/api/v1; no credentials/query/fragment                      |

Only the public API address reaches the browser. Database URL and credentials remain in the backend. The API validates configuration before binding. Invalid-value errors identify field names only. The frontend validates its URL before network calls and shows an unavailable state for invalid configuration.

Timestamps in API responses/logs use ISO 8601 UTC. PostgreSQL pool sessions and the application role default to UTC. Future business timestamp columns must use `timestamptz`; none are introduced in Stage 1. The health screen displays check times in Asia/Kolkata (IST).
