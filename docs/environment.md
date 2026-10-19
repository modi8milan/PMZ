# Environment variables

API file: `apps/api/.env` (ignored). Frontend file: `apps/web/.env.local` (ignored). Examples contain placeholders only. `npm` workspace scripts run in the workspace's directory; database tooling resolves the API file explicitly. OS environment values override file values. The tooling never prints connection strings. Empty/default example credentials are not a working connection.

| Variable                       | Scope                | Meaning / constraint                                                                                                                    |
| ------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| NODE_ENV                       | API                  | development, test or production; default development                                                                                    |
| HOST                           | API                  | 127.0.0.1 or ::1 only                                                                                                                   |
| PORT                           | API                  | Integer 1024–65535; default 4000                                                                                                        |
| CORS_ORIGINS                   | API                  | Required comma-separated exact local HTTP origins, e.g. http://127.0.0.1:3000; no wildcard, path or trailing slash                      |
| DATABASE_URL                   | API/database tooling | Required local PostgreSQL URL with username, password and database; password URL-encoded; no URL query parameters; placeholder rejected |
| DB_POOL_MAX                    | API                  | 1–20; default 5                                                                                                                         |
| DB_TIMEOUT_MS                  | API                  | 500–10000 ms; default 3000; connect, query and statement bounds                                                                         |
| RATE_LIMIT                     | API                  | 1–1000 requests per window per client IP; default 60                                                                                    |
| RATE_TTL_MS                    | API                  | 1000–3600000 ms; default 60000                                                                                                          |
| BUSINESS_TIME_ZONE             | API                  | IANA business timezone for calendar dates, deadlines and display; default `Asia/Kolkata`                                                |
| OVERDUE_PROCESSING_INTERVAL_MS | API                  | Recurring sponsor-deadline evaluation interval; 1000–86400000 ms; default 60000                                                         |
| PASSWORD_EXPIRY_DAYS           | API                  | Configurable password lifetime; initial approved value 30                                                                               |
| PASSWORD_HISTORY_COUNT         | API                  | Recent password hashes checked for reuse; initial value 5                                                                               |
| SESSION_IDLE_MINUTES           | API                  | Sliding idle timeout; default 30                                                                                                        |
| SESSION_ABSOLUTE_HOURS         | API                  | Non-extendable session lifetime; default 8                                                                                              |
| LOGIN_MAX_FAILURES             | API                  | Failed attempts before temporary lockout; default 5                                                                                     |
| LOCKOUT_MINUTES                | API                  | Temporary login lockout; default 15 minutes                                                                                             |
| RESET_TOKEN_MINUTES            | API                  | Single-use reset-token lifetime; default 30 minutes                                                                                     |
| SESSION_COOKIE_NAME            | API                  | HttpOnly session cookie name; default `zenovel_session`                                                                                 |
| MFA_ENCRYPTION_KEY             | API                  | Required locally generated 32-byte Base64 key for AES-256-GCM; never expose to browser or Git                                           |
| BOOTSTRAP_TOKEN                | API                  | Required random 32+ character secret for the one-time zero-user administrator bootstrap                                                 |
| NEXT_PUBLIC_API_BASE_URL       | Browser              | Local HTTP API address ending exactly /api/v1; default http://127.0.0.1:4000/api/v1; no credentials/query/fragment                      |

Only the public API address reaches the browser. Database URL and credentials remain in the backend. The API validates configuration before binding. Invalid-value errors identify field names only. The frontend validates its URL before network calls and shows an unavailable state for invalid configuration.

Timestamps in API responses/logs and PostgreSQL remain UTC. Calendar dates, deadline comparisons and browser display use `BUSINESS_TIME_ZONE`. The automatic overdue processor runs at API startup and then every `OVERDUE_PROCESSING_INTERVAL_MS`; database transaction locking and unique notification constraints make repeated or concurrent runs safe.
