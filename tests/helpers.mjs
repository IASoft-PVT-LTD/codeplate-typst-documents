// Shared by the tests: the frozen sample, copied to a temp folder and changed.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../src/load.mjs';

// A frozen copy of the template's sample (Fernhill Studio), so the tests check the rules,
// not the user's own data (the `data` check covers that). Leave it as it is.
export const SAMPLE = fileURLToPath(new URL('./fixtures/sample/', import.meta.url));

// Runs fn(dir) on a temp copy of the sample, then deletes the copy.
export function withSample(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'typst-documents-'));
  try {
    cpSync(SAMPLE, dir, { recursive: true });
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The sample, changed by `mutate`, then loaded.
export const loadWith = (mutate) => withSample((dir) => {
  mutate?.(dir);
  return loadProject(dir);
});

export const edit = (dir, rel, fn) => writeFileSync(join(dir, rel), fn(readFileSync(join(dir, rel), 'utf8')));
export const editJson = (dir, rel, fn) => edit(dir, rel, (s) => `${JSON.stringify(fn(JSON.parse(s)), null, 2)}\n`);
export const has = (r, re) => r.problems.some((p) => re.test(p));
export const doc = (r, number) => r.documents.find((d) => d.number === number);
