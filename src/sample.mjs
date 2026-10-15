// `npm run remove-sample`: takes the Fernhill Studio sample out, once, when the user's own
// data is about to go in. Without --yes it only lists what it would do.
// docs/recipes/remove-the-sample.md
//
// It removes only what the template shipped (the sample's documents, clients, archive
// files, example export and screenshots), so documents and clients the user already added
// stay. It doesn't touch business.json or the logo: replacing those is rebrand.md.
// tests/fixtures/sample/ (a frozen copy the unit tests use) stays as it is.
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { csvLine, parseRows } from './csv.mjs';
import { ARCHIVE, NUMBERING, readNumbering, writeNumbering } from './archive.mjs';

export const SAMPLE = {
  documents: ['INV-2026-041', 'INV-2026-042', 'INV-2026-043', 'INV-2026-044', 'QUO-2026-007', 'CN-2026-001'],
  clients: ['harbour-finch', 'lumen-books', 'tidewater', 'kranich'],
  // The sample's last issued numbers in data/numbering.json.
  numbering: { invoice: 'INV-2026-041' },
  files: ['data/imports/timesheet-2026-10.csv', 'docs/media/invoice.png', 'docs/media/quote.png', 'docs/media/invoice-page-2.png'],
  // Names in data/import.json "clients" that point at sample clients.
  importAliases: ['Kranich Verlag'],
};

// Rewrites a CSV file without the rows whose `column` is in `drop`. Returns how many went.
function dropCsvRows(path, column, drop, dryRun) {
  if (!existsSync(path)) return 0;
  const text = readFileSync(path, 'utf8');
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0];
  const sep = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  const rows = parseRows(text, sep).filter((r) => r.cells.some((c) => c.trim() !== ''));
  if (!rows.length) return 0;
  const at = rows[0].cells.map((h) => h.trim().toLowerCase()).indexOf(column);
  const keep = rows.slice(1).filter((r) => !drop.includes((r.cells[at] ?? '').trim()));
  const gone = rows.length - 1 - keep.length;
  if (gone && !dryRun) writeFileSync(path, `${[rows[0], ...keep].map((r) => csvLine(r.cells, sep)).join('\n')}\n`);
  return gone;
}

// Returns the list of things done (or, with dryRun, that would be done).
export function removeSample(root = '.', { dryRun = false } = {}) {
  const done = [];
  const say = (s) => done.push(s);
  const rm = (rel) => {
    if (!existsSync(join(root, rel))) return;
    if (!dryRun) rmSync(join(root, rel), { force: true });
    say(`delete ${rel}`);
  };

  const rows = dropCsvRows(join(root, 'data/documents.csv'), 'number', SAMPLE.documents, dryRun);
  if (rows) say(`data/documents.csv: remove ${rows} sample row(s)`);
  const jsonPath = join(root, 'data/documents.json');
  if (existsSync(jsonPath)) {
    const list = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const keep = list.filter((d) => !SAMPLE.documents.includes(d.number));
    if (keep.length !== list.length) {
      if (!dryRun) writeFileSync(jsonPath, `${JSON.stringify(keep, null, 2)}\n`);
      say(`data/documents.json: remove ${list.length - keep.length} sample document(s)`);
    }
  }
  const clients = dropCsvRows(join(root, 'data/clients.csv'), 'id', SAMPLE.clients, dryRun);
  if (clients) say(`data/clients.csv: remove ${clients} sample client(s)`);

  // The sample's issued documents and its numbering: a fresh series starts from the user's
  // own last number (docs/recipes/numbering.md).
  for (const n of SAMPLE.documents) for (const ext of ['json', 'pdf']) rm(`${ARCHIVE}/${n}.${ext}`);
  const store = readNumbering(root);
  let changed = false;
  for (const [type, last] of Object.entries(SAMPLE.numbering)) {
    if (store[type] === last) {
      store[type] = null;
      changed = true;
    }
  }
  if (changed) {
    if (!dryRun) writeNumbering(root, store);
    say(`${NUMBERING}: clear the sample's last numbers (set the user's own: docs/recipes/numbering.md)`);
  }

  // The import profile stays as a starting point, without the sample's client names.
  const profilePath = join(root, 'data/import.json');
  if (existsSync(profilePath)) {
    const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
    const aliases = Object.keys(profile.clients ?? {}).filter((k) => SAMPLE.importAliases.includes(k));
    if (aliases.length) {
      for (const k of aliases) delete profile.clients[k];
      if (!dryRun) writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
      say('data/import.json: remove the sample client names from "clients" (map the user\'s export next)');
    }
  }

  // Sample screenshots: the files, the manifest's "media" and the README block that shows them.
  for (const f of SAMPLE.files) rm(f);
  const manifestPath = join(root, 'codeplate.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const media = (manifest.media ?? []).filter((m) => !SAMPLE.files.includes(m));
    if (media.length !== (manifest.media ?? []).length) {
      if (media.length) manifest.media = media;
      else delete manifest.media;
      if (!dryRun) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      say('codeplate.json: remove the sample screenshots from "media"');
    }
  }
  const readmePath = join(root, 'README.md');
  if (existsSync(readmePath)) {
    // Image lines that show a sample screenshot, and any table they sit in (with its blank line).
    const readme = readFileSync(readmePath, 'utf8');
    const shows = (l) => SAMPLE.files.some((f) => l.includes(`](${f})`));
    const lines = readme.split('\n');
    const drop = new Set();
    lines.forEach((l, i) => {
      if (!shows(l)) return;
      let a = i;
      let b = i;
      if (l.trimStart().startsWith('|')) {
        while (a > 0 && lines[a - 1].trimStart().startsWith('|')) a -= 1;
        while (b < lines.length - 1 && lines[b + 1].trimStart().startsWith('|')) b += 1;
      }
      for (let k = a; k <= b; k++) drop.add(k);
      if (lines[b + 1]?.trim() === '') drop.add(b + 1);
    });
    const without = lines.filter((_, i) => !drop.has(i)).join('\n');
    if (without !== readme) {
      if (!dryRun) writeFileSync(readmePath, without);
      say('README.md: remove the sample screenshots');
    }
  }

  // Built files of the sample's documents.
  let built = 0;
  for (const dir of ['out', 'out/.data', 'shots']) {
    if (!existsSync(join(root, dir))) continue;
    for (const f of readdirSync(join(root, dir))) {
      if (!SAMPLE.documents.includes(f.replace(/(-p\d+)?\.(pdf|json|png)$/, ''))) continue;
      if (!dryRun) rmSync(join(root, dir, f), { force: true });
      built += 1;
    }
  }
  if (built) say(`out/, shots/: delete ${built} built file(s) of sample documents`);
  return done;
}
