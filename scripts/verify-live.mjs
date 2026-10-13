import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

const api = 'http://127.0.0.1:4000/api/v1';
const health = await fetch(`${api}/health`);
assert.equal(health.status, 200);
assert.equal((await health.json()).status, 'ok');
assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
const ready = await fetch(`${api}/ready`);
assert.equal(ready.status, 200);
assert.deepEqual((await ready.json()).checks, { database: 'up', schema: 'up' });
console.log(
  'PASS live API health, security header, PostgreSQL/schema readiness.',
);
const env = parse(readFileSync('apps/api/.env'));
const unreachable = new URL(env.DATABASE_URL);
unreachable.port = '65432';
const child = spawn(process.execPath, ['dist/main.js'], {
  cwd: resolve('apps/api'),
  env: {
    ...process.env,
    ...env,
    PORT: '4001',
    DATABASE_URL: unreachable.toString(),
  },
  stdio: 'ignore',
  windowsHide: true,
});
try {
  let running = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:4001/api/v1/health', {
        signal: AbortSignal.timeout(1000),
      });
      if (response.status === 200) {
        running = true;
        break;
      }
    } catch {
      /* await startup within bounded polling window */
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  assert.ok(running, 'Isolated unavailable-dependency API did not start');
  const failure = await fetch('http://127.0.0.1:4001/api/v1/ready');
  assert.equal(failure.status, 503);
  const result = await failure.json();
  assert.equal(result.status, 'not_ready');
  assert.deepEqual(result.checks, { database: 'down', schema: 'down' });
  assert.doesNotMatch(
    JSON.stringify(result),
    /postgresql|password|stack|65432/,
  );
  console.log(
    'PASS isolated real connection failure: liveness 200, readiness 503, safe payload.',
  );
} finally {
  child.kill();
}
