import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parse } from 'dotenv';

const root = resolve('.');
const portable = resolve('.tools/git/cmd/git.exe');
const git = existsSync(portable) ? portable : 'git';
const files = [
  ...new Set(
    execFileSync(
      git,
      [
        '-c',
        `safe.directory=${root.replaceAll('\\', '/')}`,
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '-z',
      ],
      { encoding: 'utf8' },
    )
      .split('\0')
      .filter(Boolean),
  ),
];
assert.ok(files.length > 0, 'No reviewable repository files');
assert.ok(
  files.every(
    (file) =>
      !file
        .split('/')
        .some(
          (part) =>
            (part === '.env' || part.startsWith('.env.')) &&
            part !== '.env.example',
        ),
  ),
  'Private environment file is included in repository',
);
const env = parse(readFileSync('apps/api/.env'));
const password = decodeURIComponent(new URL(env.DATABASE_URL).password);
assert.ok(
  password.length >= 16,
  'Dedicated application password must be generated, not an example',
);
for (const file of files) {
  const content = readFileSync(file);
  assert.ok(
    !content.includes(Buffer.from(password)),
    `Local application password found in ${file}`,
  );
  assert.ok(
    !content.includes(Buffer.from(env.DATABASE_URL)),
    `Local connection string found in ${file}`,
  );
}
function scanBrowser(directory) {
  if (!existsSync(directory)) return;
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) scanBrowser(path);
    else
      assert.ok(
        !readFileSync(path).includes(Buffer.from(password)),
        'Database password found in browser artifact',
      );
  }
}
scanBrowser('apps/web/.next/static');
console.log(
  `PASS ${files.length} repository files checked; local application credentials excluded; browser static artifacts contain no local database password.`,
);
console.log(
  'This targeted check is not a comprehensive secret-scanning security assessment.',
);
