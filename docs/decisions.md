# Stage 1 technical decisions

Date: 13 October 2026. Baseline: ZPS-MA-001 v1.1, Section 25 Stage 1. No stack or scope changes.

| Decision                                                  | Reason                                                                                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| npm workspaces; no orchestration framework                | Simple frontend/backend/database separation; npm ships with Node; root commands remain transparent                            |
| Node.js 24 LTS, portable workspace runtime                | Stable LTS; compatible with Next/Nest; no global installation or machine settings                                             |
| Next.js App Router and plain CSS tokens                   | Minimal functional frontend; no added UI-framework dependency; centralized website-derived brand values                       |
| NestJS modules: config, common controls, database, health | Clear seams for future approved business modules without placeholder routes                                                   |
| `pg` + `node-pg-migrate`                                  | Explicit SQL migrations, parameterized queries, no premature domain entities, schema synchronization or unnecessary ORM model |
| Empty application namespace migration                     | Real reversible infrastructure change; only migration bookkeeping table is needed                                             |
| Shared compile-time response contracts                    | Prevent health payload drift without shipping backend configuration to the browser                                            |
| Fixed loopback listeners and DB hosts                     | Enforces requested local-only scope; production network/security design deferred                                              |
| UTC system timestamps; IST UI check time                  | Consistent storage/API semantics and user's business timezone                                                                 |
| In-memory rate limiter                                    | Appropriate to single local API instance; distributed store deferred until deployment design                                  |
| Safe structured event logger                              | Only controlled fields and UTC timestamps; no URL, query, headers, body, Error serialization or credentials                   |
| Dependency versions verified against npm peer ranges      | Latest version alone is insufficient: TypeScript selection must fit TypeScript-ESLint and Nest tooling                        |

Final compatibility decisions: NestJS 12 uses ESM, so the backend compiles with NodeNext and explicit `.js` imports. Native Node tests with Nest testing and Supertest avoid an additional ESM transform layer. TypeScript 6.0.3 satisfies TypeScript-ESLint's supported range; TypeScript 7 does not. ESLint 9.39.5 is the latest compatible 9.x release for all Next lint plugins; ESLint 10 violates their peer ranges. npm flags ESLint 9 as unsupported, so this remains an acceptance limitation requiring upstream review.

No performance/service-level claims are made. Pool size 5, dependency timeout 3 seconds and 60 requests/minute are configurable development defaults, not business SLAs or production capacity targets. Baseline measurement and expected user-volume decisions are deferred until the owner provides operating scale.

Official setup references reviewed: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [NestJS first steps](https://docs.nestjs.com/first-steps), [NestJS rate limiting](https://docs.nestjs.com/security/rate-limiting), [node-pg-migrate documentation](https://salsita.github.io/node-pg-migrate/), and package metadata from the official npm registry. Frontend lint uses ESLint directly (no removed `next lint` command). Versions actually installed are captured in the root lockfile.
