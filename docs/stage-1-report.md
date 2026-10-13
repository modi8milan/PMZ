# Stage 1 completion and acceptance report

Date: 13 October 2026, Asia/Kolkata. Baseline: ZPS-MA-001 v1.1, Section 25 Stage 1. **Implementation delivered; owner acceptance pending. Stage 2 is not implemented or authorized.**

## 1. What was built

An npm workspace with separate Next.js frontend and NestJS API, shared TypeScript response contracts, PostgreSQL access and explicit migrations. The branded foundation screen uses the official website logo and observed palette, reusable UI components, actual connectivity, loading/error/empty states and responsive layout. No placeholder business screens or entities were introduced.

The API has validated config, real bounded dependency checks, safe errors/logs, request IDs, input validation, Helmet headers, explicit CORS, payload-size limits, rate limiting and UTC timestamps. Both applications bind to loopback only. Setup, environment, database, design, security and decision documentation are linked from the root README.

## 2. Inspection and final structure

Initially only the two `Data` architecture files existed. There was no Git repository, application code or configuration. Node/npm/Git/Docker/psql were absent from PATH. PostgreSQL 18 was already running; service registration identified its actual binaries in `D:\Milan\Software\PostgreSQL\18\bin` (psql 18.6). A pre-existing ARM64 Node archive directory was later noticed outside the workspace; it was not changed or used.

Official portable Node 24.21.0/npm 11.19.0 and Git 2.56.0 were downloaded into ignored `.tools` and verified against published SHA-256 values. No global installation, machine PATH, PostgreSQL service or authentication settings were changed. A local Git repository was initialized without a remote.

```text
apps/api/src/config/       validated environment
apps/api/src/common/       safe logging and error handling
apps/api/src/database/     PostgreSQL pool and readiness probe
apps/api/src/health/       health/readiness endpoints
apps/api/src/              bootstrap, setup, root module
apps/api/test/             18 foundation tests
apps/web/app/              shell, foundation page, route states, design tokens
apps/web/components/       reusable UI and status panel
apps/web/lib/              browser-safe URL validation
apps/web/public/brand/     unmodified official logo
packages/contracts/       compile-time response contracts
packages/database/        migration and connection/schema verification
scripts/                  runtime, DB setup, integrity/live/UI/secret checks
docs/evidence/            actual results and screenshots
docs/                     setup, environment, decisions, design, security, this report
Data/                     protected original Markdown and Word files
README.md                 entry point and commands
package*.json             npm workspaces and lockfile
tsconfig.base.json        shared strict TypeScript configuration
```

Generated dependencies/builds/test output, portable tooling/browser profiles and private env files are ignored. Next.js-generated `apps/web/AGENTS.md` is retained. [The final file manifest](files-created.txt) lists all reviewable files.

## 3. Technical decisions

See [decisions](decisions.md). Versions: Next.js 16.4.0, React 19.3.0, NestJS 12.1.3, TypeScript 6.0.3, ESLint 9.39.5. ESM/NodeNext matches NestJS 12; native Node tests avoid unnecessary transform infrastructure. npm workspaces avoid additional orchestration. `pg` and `node-pg-migrate` provide parameterized access and explicit migrations without premature domain models.

Brand values were observed in [ZENOVEL's published stylesheet](https://zenovel.com/wp-content/uploads/elementor/css/post-5.css): orange `#F59221`, ink `#2F2F2B`, text `#474747`, warm surface `#FEF9F4`. The official footer logo is stored unchanged. Utility semantic colours and Arial/Helvetica typography are provisional; website fonts were not redistributed without established licensing. See [brand provenance](design-system.md).

## 4. Files and database changes

All application/configuration/documentation files are new; neither original architecture file was edited. [Created-files manifest](files-created.txt) excludes generated/private artifacts and itself.

After the owner instructed the agent to handle database setup, a dedicated non-superuser `zenovel_dev` role and owned `zenovel_dev` database were created. Its randomly generated application password is stored only in ignored API `.env`, separate from administrator credentials. No unrelated database was altered.

One migration creates an empty `zenovel` namespace. `public.zenovel_migrations` is migration bookkeeping. Real schema verification confirms one expected migration and **zero business tables**. Reapplication passes without duplicating migrations. No down/reset/deletion operation ran.

## 5. Start locally

From `D:\Milan\PMZ`, activate the local runtime in each regular VS Code PowerShell terminal:

```powershell
. .\scripts\use-local-node.ps1
```

First terminal:

```powershell
npm.cmd run db:check
npm.cmd run db:migrate
npm.cmd run db:validate
npm.cmd run dev:api
```

Second terminal:

```powershell
npm.cmd run dev:web
```

Open `http://127.0.0.1:3000`. Stop with Ctrl+C. Fresh checkouts require `npm.cmd ci` and private environment/database setup; see [local development](local-development.md). Do not rerun the database bootstrap against existing targets. Compiled local execution uses `npm.cmd run build`, then `npm.cmd run start --workspace @zenovel/api` and `npm.cmd run start --workspace @zenovel/web` in separate terminals.

## 6. Tests actually performed

| Check                                     | Actual result                                                                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend development startup              | PASS: Next ready, page HTTP 200                                                                                                                                   |
| Frontend production build                 | PASS: compile/type processing/static page generation                                                                                                              |
| Frontend lint/type check                  | PASS: final workspace commands                                                                                                                                    |
| Backend development startup               | PASS: initial compile 0 errors and API started                                                                                                                    |
| Backend final compiled startup            | PASS: built API served live checks                                                                                                                                |
| Backend lint/type/build                   | PASS: final workspace checks and Nest build                                                                                                                       |
| Backend tests                             | PASS: 18 tests, zero failures/skips; [output](evidence/backend-tests.txt)                                                                                         |
| Health/readiness                          | PASS: real 200 responses, database/schema up; [live evidence](evidence/live-api.txt)                                                                              |
| Real unavailable dependency               | PASS: isolated API with unreachable DB port returned health 200/readiness 503 and safe payload                                                                    |
| Configuration validation                  | PASS: unsafe CORS/bind/database/port/example values rejected without echoing secrets                                                                              |
| Security/request behavior                 | PASS: headers, allowed/denied browser origins, rate-limit 429, sanitized 404, malformed JSON 400 and payload limit 413                                            |
| PostgreSQL connectivity/migrations/schema | PASS: real SELECT 1, initial migration, validation and safe repeat; [rerun evidence](evidence/migration-rerun.txt)                                                |
| Dependency peer compatibility             | PASS: final npm ls --all exit 0, no invalid peers                                                                                                                 |
| Runtime dependency audit                  | PASS: npm audit --omit=dev reports zero vulnerabilities                                                                                                           |
| Full dependency audit                     | OPEN: five high findings in development lint toolchain; [summary](evidence/dependency-audit-summary.json)                                                         |
| Architecture preservation                 | PASS: both original SHA-256 hashes match                                                                                                                          |
| Credentials excluded                      | PASS: private env/tooling ignored; targeted source/browser scan finds no real application password/connection URL                                                 |
| UI rendering/interactions                 | PASS: Chrome, desktop/mobile, logo, refresh, preview input, error feedback, no runtime exceptions/mobile horizontal overflow; [evidence](evidence/browser-qa.txt) |
| Formatting                                | PASS: final Prettier check; [verification](evidence/final-verification.txt)                                                                                       |

Final compiled-frontend screenshots: [desktop](evidence/foundation-desktop.png), [mobile](evidence/foundation-mobile.png), [connectivity failure](evidence/foundation-unavailable.png). Browser failure tests intercepted requests; they did not stop PostgreSQL or weaken application security.

Original hashes:

```text
Markdown 768f26a2a5beb13260d4e710b41d108c0e15ee1ac62f5bd0f00700d2e103b5c9
Word     f89316cc7ed6927545b187a9ab4459bc796dda72cf056780359533e239f4b575
```

## 7. Limitations and NOT TESTED items

- **OPEN — dependency audit:** five high package findings all trace to the unpatched [braces stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Registry/advisory checks found no patched version. These are development lint dependencies; runtime audit is clean. No forced downgrade, ignored peer mismatch or suppressed audit was used. Reassess upstream before broader use; owner review remains necessary.
- **OPEN — lint lifecycle:** ESLint 9 is compatible with current Next lint plugins but npm labels it unsupported. Upgrade when those plugins support ESLint 10 and rerun lint/audit.
- **NOT TESTED — ordinary-user watch reload:** the restricted agent sandbox denied Nest CLI's taskkill child restart after a source update. Initial dev startup and final compiled runtime pass. Exact action: run `npm.cmd run dev:api` in your own regular VS Code terminal, make a harmless edit and confirm successful restart/health. Do not mix Windows execution identities. No machine security settings were changed.
- **NOT TESTED — Docker:** unavailable; native PostgreSQL path is implemented and tested. Any alternative Docker setup requires its prerequisite installation through your approved software process and a separately reviewed local-only configuration.
- **NOT TESTED — destructive reset/down migration:** intentionally unexecuted; exact action requires explicit reset approval, verified disposable target and backup per [database workflow](database.md).
- **NOT TESTED — formal accessibility/security assessment:** rendered layout, labels, focus and feedback foundations do not establish assistive-technology conformance or penetration-test success. Specialist/manual verification remains unexecuted.
- Owner design/manual acceptance, approved typography licensing and operating-scale/performance targets remain pending. No capacity, regulatory validation or production-readiness claims are made.

## 8. Security implemented and future requirements

Implemented: ignored private credentials, validated local config, dedicated non-superuser role, frontend/backend separation, request validation, safe logging/errors, request correlation, size/rate limits, headers, CORS allowlist, bounded dependencies and UTC semantics. No public deployment or production database.

Not implemented: authentication, 30-day expiry/password reset, sessions/MFA, detailed RBAC/object scope, electronic signatures, audit trail, controlled business versioning, file security/scanning, deployment encryption and qualified backup/recovery/validation. These remain mandatory future-stage requirements. Logging is not a regulated audit trail; CORS is not authorization. See [security/API documentation](security-api.md).

## 9. Practical owner acceptance checklist

1. Follow the two-terminal commands; verify the local page, official logo and overall design.
2. Confirm API, PostgreSQL and schema show Available; refresh and verify the check time updates.
3. Stop only your API terminal, refresh and confirm unavailable feedback; restart and verify recovery. Do not stop the shared PostgreSQL service.
4. Use Tab/Shift+Tab: inspect visible focus, skip link, refresh button and labelled preview field. Confirm its value is not saved.
5. Resize to tablet/mobile; check cards/table/feedback for clipping or horizontal page overflow.
6. Open health, ready and an unknown API path; confirm safe expected JSON.
7. Run lint/typecheck/build/test/db:check/db:validate/verify:architecture. Review the dependency limitations and evidence.
8. Confirm watch reload in your regular terminal; inspect the file manifest/Git diff and ignored private env files.
9. Confirm there are no business modules, false authentication claims, public hosting or Stage 2 changes.
10. Record Stage 1 acceptance or defects, then give explicit approval separately before Stage 2.

## 10. Changes requiring approval

No change to the agreed stack, Master Architecture, authoritative PostgreSQL storage or business policy is proposed. No global installation/reset/deployment occurred. Stage 1 acceptance requires your review of the design, toolchain limitations and normal-terminal watch check. Stage 2 will wait for explicit approval.
