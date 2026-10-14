# Stage 2 authentication and access-control security record

## Implemented design

NestJS is authoritative for identity, session validity, password state and authorization. The Next.js application receives only a safe user profile, role and permission codes, expiry indicators, and a CSRF token. Database credentials, password hashes, raw session identifiers, reset-token hashes and MFA secrets are never returned.

Passwords use Node.js `scrypt` with a random 16-byte salt, N=32768, r=8, p=1 and a 64-byte derived key. This memory-hard algorithm is available in the approved runtime and avoids changing dependencies while the accepted `braces` development-tool risk remains open. Policy requires at least 12 characters with letters and numbers, blocks a local common/context-specific password set, expires passwords after 30 days, requires change after bootstrap or administrator reset, and checks the current plus five recent hashes.

Opaque random session identifiers are placed in an HttpOnly, SameSite=Strict cookie; production enables Secure. PostgreSQL stores only SHA-256 session and CSRF hashes. Defaults are a 30-minute idle timeout and eight-hour absolute timeout. Login rotates credentials. Logout, password change/reset, deactivation, privilege change, MFA change and administrator revocation invalidate sessions. Authenticated state-changing requests require an allowed Origin and the per-session CSRF token.

Login, recovery and reset routes have focused throttles. Five invalid attempts lock an account for 15 minutes. Public responses do not disclose whether an identity exists, and unknown-user login performs a dummy password verification to reduce timing differences.

Administrator-issued reset tokens are random, stored only as hashes, expire after 30 minutes and are consumed under a row lock. The usable token is returned once to an authorized administrator for controlled out-of-band delivery. SMTP is unavailable in Stage 2. Public recovery only records a generic request event.

Authenticator MFA uses TOTP with a 30-second period and one-window clock allowance. Secrets are encrypted with AES-256-GCM under `MFA_ENCRYPTION_KEY`. Enrollment requires password re-authentication and TOTP verification. Eight one-time recovery codes are displayed once and stored only as hashes. Optional MFA disable requires password plus TOTP/recovery code. Required-role MFA cannot be disabled by the user. Administrator reset requires administrator password re-authentication and revokes target sessions. Role MFA policy is configurable.

## Authorization invariants

Global authentication and permission guards enforce backend policy. A resource-scope policy accepts server-loaded assignments for later modules. Generic administration does not bypass explicit policies.

Monitoring-report download requires both `Download` and one of these role categories:

- Associate Director GCP
- Project Manager
- QMS

CRA/Monitor, Director, Director of Operations, System Administrator and Business/Quality Configuration Administrator remain denied even if configuration attempts to grant `Download`. Role administration rejects such mappings.

## First administrator bootstrap

`GET /api/v1/auth/bootstrap` reports availability. `POST /api/v1/auth/bootstrap` requires the ignored local `BOOTSTRAP_TOKEN` in `X-Bootstrap-Token`, a unique username, full name and compliant password. An exclusive users-table lock permits creation only while the users table is empty. It assigns System Administrator, requires first-login password change, records a security event and then remains permanently closed while any user exists. No default identity or password is committed.

Use an API client that does not retain sensitive history:

```http
POST http://127.0.0.1:4000/api/v1/auth/bootstrap
Content-Type: application/json
X-Bootstrap-Token: <local bootstrap token>

{"username":"<owner selected>","fullName":"<owner selected>","password":"<owner selected>"}
```

Delete request history containing the password or token. Change the password at first login, then enroll MFA because System Administrator initially requires it.

## Security events and limitations

PostgreSQL events record timestamp, type, outcome, actor/subject, request ID and bounded context. Context keys indicating passwords, tokens, secrets, recovery material or cookies are removed. Ordinary APIs cannot update or delete events. This is append-oriented application logging, not a claim of absolute immutability against database administrators.

- SMTP and automated recovery delivery are outside Stage 2.
- Common-password rejection uses a local denylist; no external breached-password service is queried.
- Production TLS, secret management, database encryption/backup and infrastructure alerting depend on a future deployment environment.
- TOTP enrollment supplies the standard URI and manual secret; no QR image is rendered.
- This work is not a security certification, regulatory validation or compliance determination.

The approved `braces@3.0.3` development/lint risk disposition remains in `docs/security-api.md`. Stage 2 made no package or lockfile changes.
