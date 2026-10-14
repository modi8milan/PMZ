# ZENOVEL — Stage 2 authentication and access control

Local development only. The accepted Stage 1 foundation now includes Stage 2 identity, session, MFA and access-control functionality. Stage 3 and later business modules are not implemented. Owner acceptance is pending.

The authoritative specification is [Master Architecture v1.1](Data/ZENOVEL_Master_Architecture_v1.1.md); its Word companion remains intact. The actual folder is `Data` (capital D). The architecture's “use Section 23 for stages” reference is stale: the stage plan is in Section 25.

## Start locally

Use Node.js 24 LTS and npm 11. A checksum-verified portable runtime is available in this checkout's ignored `.tools` folder; it does not change your system PATH permanently.

```powershell
Set-Location D:\Milan\PMZ
. .\scripts\use-local-node.ps1
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run db:validate
npm.cmd run dev:api
```

In a second terminal:

```powershell
Set-Location D:\Milan\PMZ
. .\scripts\use-local-node.ps1
npm.cmd run dev:web
```

Open <http://127.0.0.1:3000>. API liveness: <http://127.0.0.1:4000/api/v1/health>. API readiness: <http://127.0.0.1:4000/api/v1/ready>. Both services bind only to loopback. Stop each with Ctrl+C.

For a fresh checkout, create the local environment files and database first; see [local setup](docs/local-development.md). Never copy local credentials into Git or browser configuration.

## Checks

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd run format:check
npm.cmd run db:check
npm.cmd run db:validate
npm.cmd run verify:architecture
```

Read [Stage 2 report](docs/stage-2-report.md), [authentication security record](docs/security-auth.md), [Stage 1 report](docs/stage-1-report.md), [environment variables](docs/environment.md), [database workflow](docs/database.md), [technical decisions](docs/decisions.md), [API/security foundation](docs/security-api.md) and [design sources](docs/design-system.md). Installed dependency versions are captured in `package-lock.json`.

## Structure

```text
apps/api/              NestJS authentication, administration, authorization, database and health modules; tests
apps/web/              Next.js secure-access workspace, reusable UI components, design tokens, official logo
packages/contracts/    Shared compile-time health/readiness/error contracts
packages/database/     Explicit PostgreSQL migration and verification tooling
scripts/               Portable runtime activation, safe local DB bootstrap, architecture integrity
docs/                  Setup, decisions, controls, brand provenance and acceptance evidence
Data/                  Protected Master Architecture Markdown and Word files
```

This checkout has a local Git repository and verified portable Git in ignored `.tools/git`. The local-runtime activation script makes it available in your current terminal. Review `git status --short` and `git check-ignore apps/api/.env apps/web/.env.local .tools` before future commits. No remote or deployment is configured. Sandbox ownership checks are handled per command without changing global Git settings.
