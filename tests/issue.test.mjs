// Issued documents (archive/) and the numbering store (data/numbering.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { freezeDocument, readNumbering, sha256, sourceOf, writeNumbering } from '../src/archive.mjs';
import { loadProject } from '../src/load.mjs';
import { removeStale } from '../src/typst.mjs';
import { doc, edit, editJson, has, loadWith, withSample } from './helpers.mjs';

test('an issued document never changes when the settings, rates, minimum or clients change', () => {
  const before = loadWith();
  const r = loadWith((d) => {
    editJson(d, 'business.json', (b) => ({
      ...b, address: ['1 New Street', 'Bath BA1 1AA'], tax: { ...b.tax, rates: { ...b.tax.rates, standard: '25' } },
      lineMinimum: { GBP: '2000.00', EUR: '60.00' }, footer: 'New footer',
    }));
    edit(d, 'data/clients.csv', (s) => s.replace('14 Narrow Quay', '99 Other Quay'));
  });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(doc(r, 'INV-2026-041'), doc(before, 'INV-2026-041'), 'read from archive/, exactly as issued');
  assert.equal(doc(r, 'INV-2026-041').frozen.issuedOn, '2026-10-01');
  assert.equal(doc(r, 'INV-2026-041').seller.address[0], 'Unit 4, Paintworks');
  // Drafts do follow the new settings.
  assert.equal(doc(r, 'INV-2026-042').seller.address[0], '1 New Street');
  assert.notEqual(doc(r, 'INV-2026-042').totals.raw.total, doc(before, 'INV-2026-042').totals.raw.total);
});

test("an issued document's rows can't change or disappear", () => {
  const changed = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.replace(',1800.00,', ',1900.00,')));
  assert.ok(has(changed, /INV-2026-041 was issued on 2026-10-01 and its rows have changed since/));
  const deleted = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.split('\n').filter((l) => !l.startsWith('INV-2026-041,')).join('\n')));
  assert.ok(has(deleted, /INV-2026-041 was issued on 2026-10-01 .* but its rows are no longer in data\//));
  // Moving it to the JSON file with the same values is fine: the values are what count.
  const moved = loadWith((d) => {
    const rows = readFileSync(join(d, 'data/documents.csv'), 'utf8').split('\n');
    edit(d, 'data/documents.csv', () => rows.filter((l) => !l.startsWith('INV-2026-041,')).join('\n'));
    const src = JSON.parse(readFileSync(join(d, 'archive/INV-2026-041.json'), 'utf8')).source;
    editJson(d, 'data/documents.json', (a) => [...a, src]);
  });
  assert.deepEqual(moved.problems, []);
});

test('the numbering store: never behind an issued document, continues after deletions', () => {
  const lowered = loadWith((d) => writeNumbering(d, { invoice: 'INV-2026-040' }));
  assert.ok(has(lowered, /"invoice" must be at least INV-2026-041, which was issued/));
  const bad = loadWith((d) => writeNumbering(d, { invoice: 'INV-41', receipt: null }));
  assert.ok(has(bad, /"INV-41" doesn't match the pattern/));
  assert.ok(has(bad, /"receipt" is not a document type/));
  // Seeded with the last number sent before this project, the sequence continues from it.
  withSample((dir) => {
    for (const f of ['INV-2026-041.json']) rmSync(join(dir, 'archive', f));
    edit(dir, 'data/documents.csv', (s) => s.split('\n').filter((l) => !/^(INV-2026-04[1-4]|CN-)/.test(l)).join('\n'));
    writeNumbering(dir, { invoice: 'INV-2026-118' });
    const r = loadProject(dir);
    assert.deepEqual(r.problems, []);
    assert.equal(readNumbering(dir).invoice, 'INV-2026-118');
    // A first invoice that skips numbers is a gap; one after the stored number is fine.
    edit(dir, 'data/documents.csv', (s) => `${s.trimEnd()}\nINV-2026-121,invoice,lumen-books,2026-10-20,,,,Cover design,,1,cover,950.00,,,,,,\n`);
    assert.ok(has(loadProject(dir), /INV-2026-119 is missing/));
    edit(dir, 'data/documents.csv', (s) => s.replace('INV-2026-121', 'INV-2026-119'));
    assert.deepEqual(loadProject(dir).problems, []);
  });
});

test('freezing writes the PDF, its hash, the rows and the document', () => withSample((dir) => {
  const r = loadProject(dir);
  const d = doc(r, 'INV-2026-042');
  mkdirSync(join(dir, 'out'), { recursive: true });
  writeFileSync(join(dir, 'out/INV-2026-042.pdf'), '%PDF-1.7 test');
  const files = freezeDocument(dir, { raw: r.raw.find((x) => x.number === d.number), document: d, pdfPath: 'out/INV-2026-042.pdf', file: 'INV-2026-042', on: '2026-10-05' });
  assert.ok(existsSync(join(dir, files.pdf)));
  const rec = JSON.parse(readFileSync(join(dir, files.json), 'utf8'));
  assert.equal(rec.sha256, sha256(Buffer.from('%PDF-1.7 test')));
  assert.equal(rec.issuedOn, '2026-10-05');
  assert.deepEqual(rec.source, sourceOf(r.raw.find((x) => x.number === d.number)));
  writeNumbering(dir, { invoice: 'INV-2026-042' });
  const after = loadProject(dir);
  assert.deepEqual(after.problems, []);
  assert.equal(doc(after, 'INV-2026-042').frozen.issuedOn, '2026-10-05');
}));

test('build removes PDFs, data files and page images of documents that are gone', () => withSample((dir) => {
  mkdirSync(join(dir, 'out/.data'), { recursive: true });
  mkdirSync(join(dir, 'shots'), { recursive: true });
  for (const f of ['out/INV-2026-042.pdf', 'out/INV-2026-001.pdf', 'out/summary.csv', 'out/.data/INV-2026-001.json', 'shots/INV-2026-001-p1.png', 'shots/INV-2026-042-p1.png']) {
    writeFileSync(join(dir, f), 'x');
  }
  const removed = removeStale(loadProject(dir).documents, dir).sort();
  assert.deepEqual(removed, ['out/.data/INV-2026-001.json', 'out/INV-2026-001.pdf', 'shots/INV-2026-001-p1.png']);
  assert.ok(existsSync(join(dir, 'out/summary.csv')), 'other files stay');
  assert.ok(existsSync(join(dir, 'out/INV-2026-042.pdf')));
}));
