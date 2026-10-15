// Issued documents and the numbering store.
//
// `npm run issue -- INV-2026-041` (once the user has sent it) freezes a document:
//   archive/<number>.pdf   the PDF exactly as it was sent
//   archive/<number>.json  its rows from data/ (`source`), everything worked out from them
//                          (`document`: amounts, words, the user's details that day) and the
//                          PDF's SHA-256
// From then on the loader reads that document from archive/ and never works it out again,
// so a new address, tax rate, minimum charge, label or layout can't change it; `build`
// copies the archived PDF to out/; and the checks fail if its rows in data/ change or
// disappear, or if the archived PDF changes. To correct an issued invoice, issue a credit
// note (docs/recipes/credit-notes.md).
//
// data/numbering.json stores the last number issued per document type (series), so the
// next number never goes back, even if rows are deleted (src/numbering.mjs).
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ARCHIVE = 'archive';
export const NUMBERING = 'data/numbering.json';

const NUMBERING_COMMENT = 'The last number issued in each series (document type). npm run issue updates it; set it by hand only to continue from numbers sent before this project (docs/recipes/numbering.md). Never lower it.';

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// A raw document from data/ as it is compared and stored: the values only, not where they
// were read from (moving a document between the CSV and the JSON file doesn't change it).
export function sourceOf(raw) {
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'where' && k !== 'comma'));
  return { ...clean(raw), items: raw.items.map(clean) };
}

// data/numbering.json -> { invoice: "INV-2026-041", quote: null, … }. Missing file: {}.
export function readNumbering(root, problems = []) {
  const p = join(root, NUMBERING);
  if (!existsSync(p)) return {};
  let store;
  try {
    store = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    problems.push(`${NUMBERING}: ${e.message}`);
    return {};
  }
  if (!store || typeof store !== 'object' || Array.isArray(store)) {
    problems.push(`${NUMBERING}: must be an object like { "invoice": "INV-2026-041" }`);
    return {};
  }
  const out = {};
  for (const [type, v] of Object.entries(store)) {
    if (type.startsWith('$')) continue;
    if (v !== null && typeof v !== 'string') problems.push(`${NUMBERING}: "${type}" must be a document number in quotes, or null`);
    else out[type] = v || null;
  }
  return out;
}

export function writeNumbering(root, store) {
  const body = { $comment: NUMBERING_COMMENT };
  for (const [k, v] of Object.entries(store).sort(([a], [b]) => a.localeCompare(b))) if (!k.startsWith('$')) body[k] = v ?? null;
  writeFileSync(join(root, NUMBERING), `${JSON.stringify(body, null, 2)}\n`);
}

// archive/*.json -> Map(number -> record). Each record: { number, type, issuedOn, pdf,
// sha256, source, document, file }.
export function loadArchive(root, problems = []) {
  const out = new Map();
  const dir = join(root, ARCHIVE);
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    try {
      const rec = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (!rec.number || !rec.source || !rec.document || !rec.sha256 || !rec.pdf) throw new Error('not an issued-document record');
      if (out.has(rec.number)) throw new Error(`${rec.number} is archived twice`);
      out.set(rec.number, { ...rec, file: `${ARCHIVE}/${f}` });
    } catch (e) {
      problems.push(`${ARCHIVE}/${f}: can't be read (${e.message}); restore it from a backup or version control`);
    }
  }
  return out;
}

// Freezes one document: copies its built PDF into archive/ and writes the record.
export function freezeDocument(root, { raw, document, pdfPath, file, on }) {
  const dir = join(root, ARCHIVE);
  mkdirSync(dir, { recursive: true });
  const pdf = readFileSync(join(root, pdfPath));
  copyFileSync(join(root, pdfPath), join(dir, `${file}.pdf`));
  const record = {
    number: document.number,
    type: document.type,
    issuedOn: on,
    pdf: `${file}.pdf`,
    sha256: sha256(pdf),
    source: sourceOf(raw),
    document,
  };
  writeFileSync(join(dir, `${file}.json`), `${JSON.stringify(record, null, 2)}\n`);
  return { json: `${ARCHIVE}/${file}.json`, pdf: `${ARCHIVE}/${file}.pdf` };
}
