// Runs Typst for the CLI and the checks. Finds the binary with checks/shared/find-tool.mjs
// (the TYPST environment variable, PATH, then the usual install folders) and accepts
// the major.minor version pinned in codeplate.json's "stack".
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { requireTool } from '../checks/shared/find-tool.mjs';

export const OUT = 'out';
export const DATA_DIR = 'out/.data';
export const SHOTS = 'shots';
export const ENTRY = 'layout/document.typ';
// PDF/A-3b: archivable (fonts embedded, colours defined), and allows an attached
// e-invoice XML later (docs/recipes/e-invoicing.md).
export const PDF_STANDARD = 'a-3b';

export function pinnedTypst(root = '.') {
  const manifest = JSON.parse(readFileSync(join(root, 'codeplate.json'), 'utf8'));
  const pin = manifest.stack.find((s) => s.name === 'typst')?.version ?? '';
  return pin.split('.').slice(0, 2).join('.');
}

let cached = null;
export function typstPath(root = '.') {
  if (cached) return cached;
  cached = requireTool('typst', { accept: pinnedTypst(root), root });
  return cached;
}

// A document number as a file name: "INV/2026/041" -> "INV-2026-041".
export const fileName = (number) => number.replace(/[\\/:*?"<>|\s]+/g, '-');

export function writeData(doc, root = '.') {
  mkdirSync(join(root, DATA_DIR), { recursive: true });
  const rel = `${DATA_DIR}/${fileName(doc.number)}.json`;
  writeFileSync(join(root, rel), `${JSON.stringify(doc, null, 2)}\n`);
  return `/${rel}`;
}

// Arguments every Typst run shares: the project root, only the fonts in assets/fonts
// (so the output is the same on every computer), and the document's data file.
export function commonArgs(dataPath) {
  return ['--root', '.', '--font-path', 'assets/fonts', '--ignore-system-fonts', '--ignore-embedded-fonts',
    '--input', `data=${dataPath}`, '--diagnostic-format', 'short'];
}

function run(args, root) {
  const { path } = typstPath(root);
  const r = spawnSync(path, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const diagnostics = `${r.stderr ?? ''}`.trim();
  return {
    ok: r.status === 0,
    stdout: r.stdout ?? '',
    diagnostics,
    // Typst warns about unknown fonts, missing glyphs and similar; treat them as failures.
    warnings: diagnostics.split('\n').filter((l) => /\bwarning\b/i.test(l)),
    error: r.error?.message,
  };
}

export function compilePdf(doc, root = '.') {
  const data = writeData(doc, root);
  const out = `${OUT}/${fileName(doc.number)}.pdf`;
  const r = run(['compile', ENTRY, out, '--pdf-standard', PDF_STANDARD, ...commonArgs(data)], root);
  return { ...r, out };
}

// out/<number>.pdf for any document: an issued one is copied from archive/ unchanged (it
// is never typeset again), a draft is compiled.
export function buildPdf(doc, root = '.') {
  if (!doc.frozen) return compilePdf(doc, root);
  const out = `${OUT}/${fileName(doc.number)}.pdf`;
  mkdirSync(join(root, OUT), { recursive: true });
  try {
    copyFileSync(join(root, doc.frozen.pdf), join(root, out));
    return { ok: true, out, diagnostics: '', warnings: [], copied: true };
  } catch (e) {
    return { ok: false, out, diagnostics: '', warnings: [], error: `${doc.frozen.pdf}: ${e.message}` };
  }
}

// Removes PDFs, data files and page images of documents that no longer exist (a deleted
// draft, the removed sample), so out/ and shots/ only show what's in data/. Other files
// (out/summary.csv) stay. Returns the paths removed.
export function removeStale(documents, root = '.') {
  const keep = new Set(documents.map((d) => fileName(d.number)));
  const removed = [];
  const sweep = (dir, re) => {
    if (!existsSync(join(root, dir))) return;
    for (const f of readdirSync(join(root, dir))) {
      const m = re.exec(f);
      if (m && !keep.has(m[1])) {
        rmSync(join(root, dir, f), { force: true });
        removed.push(`${dir}/${f}`);
      }
    }
  };
  sweep(OUT, /^(.+)\.pdf$/);
  sweep(DATA_DIR, /^(.+)\.json$/);
  sweep(SHOTS, /^(.+)-p\d+\.png$/);
  return removed;
}

// One PNG per page: shots/<number>-p1.png, -p2.png …
export function compilePng(doc, { ppi = 110, root = '.' } = {}) {
  const data = writeData(doc, root);
  mkdirSync(join(root, SHOTS), { recursive: true });
  const pattern = `${SHOTS}/${fileName(doc.number)}-p{p}.png`;
  const r = run(['compile', ENTRY, pattern, '--format', 'png', '--ppi', String(ppi), ...commonArgs(data)], root);
  return { ...r, pattern };
}

// Evaluates a Typst expression in the context of the laid-out document and returns its
// value as JSON, e.g. query(<cp-line>).len().
export function evalIn(doc, expression, root = '.') {
  const data = writeData(doc, root);
  const r = run(['eval', expression, '--in', ENTRY, ...commonArgs(data)], root);
  if (!r.ok) return { ...r, value: undefined };
  return { ...r, value: JSON.parse(r.stdout) };
}

export function watch(doc, root = '.') {
  const data = writeData(doc, root);
  const out = `${OUT}/${fileName(doc.number)}.pdf`;
  mkdirSync(dirname(join(root, out)), { recursive: true });
  const { path } = typstPath(root);
  return spawnSync(path, ['watch', ENTRY, out, ...commonArgs(data)], { cwd: root, stdio: 'inherit' });
}
