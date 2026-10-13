import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const files = {
  'Data/ZENOVEL_Master_Architecture_v1.1.md':
    '768f26a2a5beb13260d4e710b41d108c0e15ee1ac62f5bd0f00700d2e103b5c9',
  'Data/ZENOVEL_Master_Architecture_v1.1.docx':
    'f89316cc7ed6927545b187a9ab4459bc796dda72cf056780359533e239f4b575',
};
for (const [file, expected] of Object.entries(files)) {
  const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (hash !== expected)
    throw new Error(`Architecture integrity mismatch: ${file}`);
  console.log(`PASS ${file} ${hash}`);
}
