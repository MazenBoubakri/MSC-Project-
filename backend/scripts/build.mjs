import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dirs = ['src'];

const files = dirs.flatMap((dir) => {
  const base = path.join(root, dir);
  return readdirSync(base, { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(base, f));
});

let failed = 0;
for (const file of files) {
  try {
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
  } catch {
    console.error(`syntax error: ${path.relative(root, file)}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`build failed: ${failed} file(s) with syntax errors`);
  process.exit(1);
}
console.log(`build ok: ${files.length} file(s) checked`);
