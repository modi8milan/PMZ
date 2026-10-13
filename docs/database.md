# PostgreSQL development workflow

Use a dedicated `zenovel_dev` database owned by a dedicated non-superuser `zenovel_dev` role. Application credentials must never be the administrative PostgreSQL account. No production connection is permitted: tooling and backend validate loopback hosts. No database reset or down migration is run automatically.

## Initialization without Docker

Connect with your own local administrator using SQL Shell/pgAdmin, or:

```powershell
& 'D:\Milan\Software\PostgreSQL\18\bin\psql.exe' -h 127.0.0.1 -U postgres -d postgres
```

Enter passwords at the prompt. For a new local target only, run:

```sql
CREATE ROLE zenovel_dev LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
\password zenovel_dev
CREATE DATABASE zenovel_dev OWNER zenovel_dev;
ALTER ROLE zenovel_dev SET timezone TO 'UTC';
```

Store the application connection in ignored `apps/api/.env`. The repository's optional `node scripts/setup-local-db.mjs` performs the same dedicated setup, generates a random password, and refuses existing targets; it accepts the admin password through hidden terminal input. It does not change the PostgreSQL service, existing users, existing databases or authentication configuration.

## Explicit migrations

`node-pg-migrate` manages ordered, transactional, advisory-locked migrations and records them in `public.zenovel_migrations`. The first migration creates only an empty `zenovel` namespace. That namespace is a real infrastructure change, sufficient to demonstrate migrations without placeholder business entities. Migration history is tooling metadata, not an application business table.

```powershell
npm.cmd run db:check       # SELECT 1, actual PostgreSQL connection
npm.cmd run db:migrate     # Apply pending migrations; safe to repeat
npm.cmd run db:validate    # Verify namespace, expected migration record, no business tables
```

Review each new migration, commit it, and apply it in order. Never edit a migration already applied to an accepted environment; write a new one. Schema validation is deliberately Stage-1-specific and must evolve alongside later approved migrations. No ORM entities/schema sync or `synchronize=true` is used. Parameterized `pg` queries are the current data-access approach; future domain mappings can be chosen within approved stages without replacing PostgreSQL.

The included down migration drops the namespace **without CASCADE**, so it fails if dependent objects exist. It is not exposed through an npm reset command. Never drop a database/schema or roll back on an environment containing controlled records just to pass a test.

## Safe development reset procedure (manual, approval required)

Verify loopback hostname, exact database name, owner and that the database contains only disposable development data. Obtain explicit reset approval and a verified backup first. Prefer creating a new dedicated disposable database and updating the ignored URL, then applying migrations, rather than deleting the existing one. If deletion is specifically approved, stop the application, inspect active connections and dependencies, back up with `pg_dump` to an approved private location, verify restore in a separate database, and perform only the specifically approved database operation. No destructive commands are automated by this foundation.

Docker was unavailable during initial inspection; all demonstrated connectivity uses the already running Windows PostgreSQL service. PostgreSQL remains the authoritative store for future application records and file content; no external object store is introduced.
