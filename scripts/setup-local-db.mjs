// One-time local bootstrap. Run only against your own development PostgreSQL.
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import pg from 'pg';

if (existsSync('apps/api/.env')) {
  console.error(
    'Refusing to overwrite apps/api/.env. Use the documented manual setup.',
  );
  process.exit(1);
}
console.log('Local PostgreSQL administrator password (input hidden):');
if (process.stdin.isTTY) process.stdin.setRawMode(true);
let input = '';
const password = await new Promise((resolve, reject) => {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    for (const char of chunk) {
      if (char === '\u0003') {
        reject(new Error('Cancelled'));
        return;
      }
      if (char === '\r' || char === '\n') {
        resolve(input);
        return;
      }
      if (char === '\u007f' || char === '\b') input = input.slice(0, -1);
      else input += char;
    }
  });
});
if (process.stdin.isTTY) process.stdin.setRawMode(false);
process.stdin.pause();
const admin = new pg.Client({
  host: '127.0.0.1',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password,
  connectionTimeoutMillis: 3000,
});
try {
  await admin.connect();
  const roles = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [
    'zenovel_dev',
  ]);
  const databases = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    ['zenovel_dev'],
  );
  if (roles.rowCount || databases.rowCount) throw new Error('Existing target');
  const generated = randomBytes(32).toString('hex');
  // Identifiers are fixed; the password is generated hexadecimal, never user input.
  await admin.query(
    `CREATE ROLE zenovel_dev LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${generated}'`,
  );
  await admin.query('CREATE DATABASE zenovel_dev OWNER zenovel_dev');
  await admin.query("ALTER ROLE zenovel_dev SET timezone TO 'UTC'");
  writeFileSync(
    'apps/api/.env',
    `NODE_ENV=development\nHOST=127.0.0.1\nPORT=4000\nCORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000\nDATABASE_URL=postgresql://zenovel_dev:${generated}@127.0.0.1:5432/zenovel_dev\nDB_POOL_MAX=5\nDB_TIMEOUT_MS=3000\nRATE_LIMIT=60\nRATE_TTL_MS=60000\n`,
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    'Dedicated local development role/database created; generated credentials saved only to ignored apps/api/.env.',
  );
} catch {
  console.error(
    'Bootstrap failed. Verify the local administrator login or existing target. No existing objects or files were overwritten. Inspect for a partially created role/database before retrying.',
  );
  process.exitCode = 1;
} finally {
  await admin.end();
}
