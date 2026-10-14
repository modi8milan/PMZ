import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';
import { runner } from 'node-pg-migrate';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../apps/api/.env'), quiet: true });
const url = z
  .string()
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        ['postgres:', 'postgresql:'].includes(parsed.protocol) &&
        ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) &&
        Boolean(
          parsed.username && parsed.password && parsed.pathname.length > 1,
        ) &&
        !value.includes('REPLACE_') &&
        !parsed.search
      );
    } catch {
      return false;
    }
  })
  .safeParse(process.env.DATABASE_URL);
if (!url.success) {
  console.error('Invalid local DATABASE_URL. See apps/api/.env.example.');
  process.exit(1);
}
const pool = new pg.Pool({
  connectionString: url.data,
  connectionTimeoutMillis: 3000,
  query_timeout: 3000,
  statement_timeout: 3000,
  options: '-c timezone=UTC',
});
pool.on('error', () => {});
try {
  const command = process.argv[2];
  if (command === 'up') {
    await runner({
      databaseUrl: url.data,
      dir: resolve(here, 'migrations'),
      direction: 'up',
      migrationsTable: 'zenovel_migrations',
      migrationsSchema: 'public',
      checkOrder: true,
      log: () => {},
      logger: { info() {}, warn() {}, error() {} },
    });
    console.log('Migrations applied successfully (or already current).');
  } else if (command === 'check') {
    await pool.query('SELECT 1');
    console.log('PostgreSQL connectivity PASS.');
  } else if (command !== 'validate') {
    throw new Error('Unsupported command');
  }
  if (command === 'validate' || command === 'up') {
    const schema = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'zenovel') AS present",
    );
    const migration = await pool.query(
      'SELECT name FROM public.zenovel_migrations ORDER BY id',
    );
    const tables = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'zenovel'",
    );
    const expectedMigrations = [
      '1780000000000-initialize-schema',
      '1790000000000-auth-access-control',
      '1800000000000-stage-2-audit-role-refinement',
    ];
    const expectedTables = [
      'departments',
      'mfa_recovery_codes',
      'password_history',
      'password_reset_tokens',
      'permissions',
      'role_permissions',
      'roles',
      'security_events',
      'sessions',
      'user_roles',
      'users',
    ];
    if (
      !schema.rows[0]?.present ||
      migration.rows.map((row) => row.name).join('|') !==
        expectedMigrations.join('|') ||
      tables.rows
        .map((row) => row.tablename)
        .sort()
        .join('|') !== expectedTables.join('|')
    )
      throw new Error('Unexpected Stage 2 schema');
    console.log('Stage 2 authentication schema and migration history PASS.');
  }
} catch {
  console.error(
    'Database operation failed. Check local credentials, service, migration history and permissions. No sensitive details logged.',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
