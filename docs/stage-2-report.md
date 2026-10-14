# ZENOVEL Stage 2 completion report

Date: 14 October 2026  
Branch: `stage-2-auth-access-control`  
Baseline: Master Architecture v1.1

## Delivered scope

- Administrator-created individual accounts; no public registration.
- Login, logout, safe current session, forced/expired and authenticated password change.
- 12-character letter-and-number policy, local common-password blocking, 30-day expiry and five-password history.
- Generic recovery plus administrator-issued hashed, expiring, single-use reset tokens.
- PostgreSQL opaque sessions, idle/absolute expiry, CSRF/origin checks and revocation.
- Activation/deactivation, departments, multiple roles, permissions, session revocation and resets.
- Approved initial departments, eight roles and 18 permission codes.
- Backend authentication, permission, privileged-operation and future resource-scope policies.
- Mandatory report-download allowlist for Project Manager, QMS and Associate Director GCP.
- TOTP enrollment/verification, encrypted secrets, one-time recovery codes, optional disable and re-authenticated administrator reset.
- PostgreSQL security events for authentication and privileged operations.
- Responsive login, recovery, reset, password, session, MFA, user, role/permission, department and security-event interfaces.

No Stage 3 project, tracking, monitoring-plan, report or approval workflow was introduced.

## Structure and migration

- `apps/api/src/auth/`: authentication, sessions, guards and authorization policies.
- `apps/api/src/admin/`: user/role/permission/department/security administration.
- `apps/api/src/security/security.crypto.ts`: password, token, TOTP and encryption primitives.
- `apps/api/test/security.spec.ts`: security and authorization tests.
- `apps/web/components/auth-portal.tsx`: Stage 2 workspace.
- `packages/database/migrations/1790000000000-auth-access-control.cjs`: additive schema and seeds.
- `docs/security-auth.md`: security design, bootstrap and limitations.

The additive migration creates 11 normalized tables: departments, users, roles, permissions, user roles, role permissions, password history, sessions, password reset tokens, MFA recovery codes and security events. It includes foreign keys, constraints and indexes and seeds only approved definitions/mappings. It preserves Stage 1 and creates no later-stage business table or credential.

`db:migrate`, `db:validate` and `db:check` passed against the accepted Stage 1 database. Validation confirmed both ordered migrations and all expected tables.

## Commands

```powershell
. .\scripts\use-local-node.ps1
npm.cmd run db:migrate
npm.cmd run dev:api
npm.cmd run dev:web
```

If policy blocks dot-sourcing, add the pinned Node directory to the current process PATH; do not change global execution policy.

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run db:validate
npm.cmd run db:check
npm.cmd run verify:architecture
node scripts/verify-secrets.mjs
```

## Verification

- Automated API/security tests: final suite passed with zero failures.
- Stage 1 health, readiness, headers, CORS, throttling, validation, payload and sanitized-error regression tests remain passing.
- API/web lint, typecheck and production builds passed.
- Architecture hashes remained unchanged.
- Targeted credential/static-artifact check passed; it is not comprehensive secret scanning.
- Live checks: health 200, bootstrap status 200, unauthenticated admin 401, generic recovery response, configured CORS origin, and Stage 2 frontend 200.

Automated tests cover valid and invalid/inactive login, lockout, logout revocation, expired-session rejection, password policy/history, forced-change state, 30-day expiry, reset invalidity/single use, report-download allow/deny roles, resource scope, TOTP encryption/verification, recovery-code use, MFA disable and event secret exclusion.

**NOT TESTED — persistent first-administrator and authenticated browser journey:** The database intentionally has no default administrator because the owner must select the identity and password. Bootstrap status and automated service behavior were tested. Complete the manual checklist with owner-selected credentials.

**NOT TESTED — SMTP:** SMTP is outside Stage 2. Administrator-mediated out-of-band reset delivery is implemented and documented.

## Product-owner checklist

1. Confirm bootstrap reports available, create the first administrator once, then confirm a second attempt is rejected.
2. Sign in, complete forced password change, sign in again, enroll TOTP and save recovery codes.
3. Confirm the account page exposes only safe identity/session data.
4. Create a test user, deliver its reset token out of band, reset and complete forced change.
5. Change roles/departments and confirm prior sessions are rejected.
6. Deactivate the user and confirm login/session denial; reactivate if needed.
7. Revoke sessions, initiate reset and exercise MFA reset with administrator re-authentication.
8. Confirm relevant security events exist and contain no usable secrets.
9. Attempt to grant `Download` to CRA/Monitor or an administrator role and confirm rejection.
10. Exercise password reuse, expired/used reset token, invalid TOTP and recovery-code reuse.
11. Review desktop/mobile layout, keyboard focus, loading and error feedback.

Stage 2 awaits manual testing, evidence review and explicit acceptance. Stage 3 has not started.
