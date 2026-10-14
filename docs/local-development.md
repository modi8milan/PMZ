# Local development

Prerequisites: Node.js 24 LTS, npm 11 and local PostgreSQL. Docker is optional, not required. Initial inspection found PostgreSQL 18 running and its binaries in `D:\Milan\Software\PostgreSQL\18\bin`; Node/npm/Git/Docker were not on PATH. Portable Node 24.21.0/npm 11.19.0 were downloaded into ignored `.tools`, verified against the official SHA-256 release checksum, without global installation. Use `scripts/use-local-node.ps1` in each PowerShell session. If script execution is restricted, add that runtime directory to `$env:PATH` in that terminal; do not change machine-wide execution policy.

On another machine, install Node.js 24 and Git through your approved software process. This task does not install global software or change PostgreSQL service configuration. Open the workspace in VS Code using File → Open Folder.

1. Run `npm.cmd ci` at the root (after the committed lockfile exists).
2. For a fresh checkout, copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env.local` **only if the destinations do not exist**. Replace the database placeholder privately. Generate separate random values for `MFA_ENCRYPTION_KEY` (exactly 32 bytes encoded as Base64) and `BOOTSTRAP_TOKEN` (at least 32 characters). Never paste these values into chat, browser configuration or source.
3. Create a dedicated local database using [database setup](database.md). For a new role/database on this Windows machine, `node scripts/setup-local-db.mjs` can bootstrap using the local `postgres` administrator password. It refuses to overwrite `.env` or existing targets, generates a separate random application password and saves it only in the ignored API `.env`. Do not pre-copy the API `.env` when using this helper. A failed creation can leave partial infrastructure; inspect before retrying rather than deleting it automatically.
4. Run `npm.cmd run db:migrate`, `npm.cmd run db:validate`, `npm.cmd run db:check`.
5. Start `npm.cmd run dev:api` and `npm.cmd run dev:web` in separate terminals; open `http://127.0.0.1:3000`.
6. When the users table is empty, follow the controlled first-administrator procedure in [the Stage 2 security record](security-auth.md). The bootstrap closes after the first account and does not provide default credentials.

Production compilation is a local check, not deployment: `npm.cmd run build`. Start compiled applications with `npm.cmd run start --workspace @zenovel/api` and `npm.cmd run start --workspace @zenovel/web`. Frontend public variables are embedded at build time; rebuild after changing them.

No Docker daemon was found. Existing PostgreSQL is the reproducible local path; a fresh machine should install a supported PostgreSQL release using its approved installer, create the role/database using the same procedure, and run the committed migration. Do not disable authentication to make connectivity pass.

If the API refuses to start, validate the required variables and port availability. Its startup failure intentionally omits secret values. If liveness passes but readiness fails, check the PostgreSQL service, credentials and migration. A valid but unreachable database must leave liveness up and readiness at 503. If the UI cannot connect, check both its public API URL and the backend CORS allowlist.

Portable Git 2.56.0 was downloaded from the official git-for-windows release, verified against its published digest and used to initialize this local repository. The runtime activation script makes Git available in the current terminal; no global settings were changed.

NestJS watch/reload was verified using the documented command, including comment-only edit and exact restoration cycles. If a restricted execution identity cannot restart a watch child, run the dev command in the regular VS Code terminal without changing system policy. Compiled fallback: build the API, then run its start script. Headless browser QA may require execution outside a restricted process sandbox; no application security should be disabled.

Optional browser reproduction: `npm.cmd install --prefix .tools/qa --no-fund --no-audit playwright-core`, then `node scripts/verify-ui.mjs` while both apps run. This uses installed Windows Chrome; adapt the executable path in the helper if necessary. Run `node scripts/verify-live.mjs` for an isolated real database-failure test on API port 4001, or `node scripts/verify-secrets.mjs` for targeted credential exclusion.
