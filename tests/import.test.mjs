import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../src/csv.mjs';
import { CSV_COLUMNS, fillTemplate, planImport, readProfile, restoreDocuments, writeImport } from '../src/import.mjs';
import { loadProject } from '../src/load.mjs';
import { doc, withSample } from './helpers.mjs';

const EXPORT = 'data/imports/timesheet-2026-10.csv';
const NOVEMBER = `Entry,Date,Client,Task,Hours,Rate,Currency
T-1101,03/11/2026,Lumen Books Ltd,Cover roughs: Winter list,4,62.50,GBP
T-1102,04/11/2026,Kranich Verlag,Lektorat Umschlagtext,1.5,70.00,EUR
T-1103,10/11/2026,Lumen Books Ltd,Cover finals: Winter list,6,62.50,
T-1104,12/11/2026,Kranich Verlag,Korrektur,0.25,70.00,EUR
`;

const plan = (dir, text, extra = {}) => planImport({ text, profile: readProfile(dir), project: loadProject(dir), now: '2026-11-20', ...extra });

test('templates: columns, dates in the client\'s language, optional parts', () => {
  const row = { date: '05/10/2026', po: '', task: 'Logo' };
  const ctx = { columns: ['date', 'po', 'task'], dateFormat: 'DD/MM/YYYY', locale: 'en-GB' };
  assert.equal(fillTemplate('{Task}', row, ctx), 'Logo');
  assert.equal(fillTemplate('{Date:date}[ · PO {PO}]', row, ctx), '5 Oct 2026');
  assert.equal(fillTemplate('{Date:date}[ · PO {PO}]', { ...row, po: 'NL-7' }, ctx), '5 Oct 2026 · PO NL-7');
  assert.equal(fillTemplate('{Date:date}', row, { ...ctx, locale: 'de-DE' }), '05.10.2026');
  assert.equal(fillTemplate('hour', row, ctx), 'hour');
  assert.throws(() => fillTemplate('{Hours}', row, ctx), /uses the column "Hours", which the export doesn't have/);
});

test('the sample export was imported already: running it again adds nothing', () => withSample((dir) => {
  const p = plan(dir, readFileSync(join(dir, EXPORT), 'utf8'));
  assert.equal(p.skipped, 3);
  assert.deepEqual(p.documents, []);
}));

test('a new export: one document per client in order of first row, numbered on, dated end of month', () => withSample((dir) => {
  const p = plan(dir, NOVEMBER);
  assert.equal(p.issued, '2026-11-30');
  assert.deepEqual(p.documents, [
    { number: 'INV-2026-045', client: 'Lumen Books Ltd', lines: 2 },
    { number: 'INV-2026-046', client: 'Kranich Verlag GmbH', lines: 2 },
  ]);
  assert.deepEqual(p.rows.map((r) => [r.number, r.type, r.client, r.source]), [
    ['INV-2026-045', 'invoice', 'lumen-books', 'T-1101'], ['INV-2026-045', '', '', 'T-1103'],
    ['INV-2026-046', 'invoice', 'kranich', 'T-1102'], ['INV-2026-046', '', '', 'T-1104'],
  ]);
  assert.equal(p.rows[0].details, '3 Nov 2026');
  assert.equal(p.rows[2].details, '04.11.2026', "the German client's dates");
  assert.equal(plan(dir, NOVEMBER, { issued: '2026-12-01' }).issued, '2026-12-01', '--issued wins');

  writeImport(dir, p);
  const r = loadProject(dir);
  assert.deepEqual(r.problems, []);
  assert.equal(doc(r, 'INV-2026-045').totals.raw.total, '750.00', '(4 + 6) x 62.50 = 625.00 + 20% VAT');
  // 0.25 h x 70 = 17.50, under the EUR minimum: 60.00; 1.5 h x 70 = 105.00
  assert.equal(doc(r, 'INV-2026-046').totals.raw.total, '165.00');
  assert.deepEqual(plan(dir, NOVEMBER).documents, [], 'idempotent: a second run adds nothing');
}));

test('numbers continue from data/numbering.json, not only from the rows left', () => withSample((dir) => {
  writeFileSync(join(dir, 'data/numbering.json'), '{ "invoice": "INV-2026-090" }\n');
  // (INV-2026-090 is "issued" but not in data/, so loading would report a gap; planning only reads.)
  assert.equal(plan(dir, NOVEMBER).documents[0].number, 'INV-2026-091');
}));

test('bad rows: every problem with its line, nothing planned', () => withSample((dir) => {
  const bad = NOVEMBER
    .replace('03/11/2026', '2026-11-03')
    .replace('Kranich Verlag,Lektorat', 'Kranich Books,Lektorat')
    .replace(',6,62.50,', ',"1,5",62.50,')
    .replace('0.25,70.00,EUR', '0.25,70.00,USD');
  assert.throws(() => plan(dir, bad), (e) => {
    assert.match(e.message, /^Nothing was imported/);
    assert.match(e.message, /line 2: Date "2026-11-03" is not written DD\/MM\/YYYY/);
    assert.match(e.message, /line 3: no client "Kranich Books" in data\/clients/);
    assert.match(e.message, /line 4: quantity "1,5" is not a number/);
    assert.match(e.message, /line 5: the row is in USD, but Kranich Verlag GmbH is billed in EUR/);
    return true;
  });
  const dupId = `${NOVEMBER}T-1101,13/11/2026,Lumen Books Ltd,Extra,1,62.50,GBP\n`;
  assert.throws(() => plan(dir, dupId), /the id "T-1101" appears twice/);
}));

test('without an id column, a fingerprint of each row keeps re-runs idempotent', () => withSample((dir) => {
  const profile = { ...readProfile(dir), id: '' };
  const text = NOVEMBER.replace(/^Entry,/, 'Ref,');
  const first = planImport({ text, profile, project: loadProject(dir), now: '2026-11-20' });
  assert.equal(first.rows.length, 4);
  assert.match(first.rows[0].source, /^[0-9a-f]{12}$/);
  writeImport(dir, first);
  assert.deepEqual(loadProject(dir).problems, []);
  assert.deepEqual(planImport({ text, profile, project: loadProject(dir), now: '2026-11-20' }).documents, []);
}));

test('a documents.csv without the newer columns gets them, values unchanged; restore puts it back', () => withSample((dir) => {
  const path = join(dir, 'data/documents.csv');
  const original = readFileSync(path, 'utf8');
  const rows = parseCsv(original);
  // An older file: no corrects, line_note, currency or source columns.
  const old = ['number,type,client,issued,due,reference,description,details,quantity,unit,unit_price,discount,tax,notes',
    'INV-2026-042,invoice,lumen-books,2026-10-03,2026-10-17,Autumn list,Cover,,1,cover,950.00,,,'].join('\n');
  writeFileSync(path, `${old}\n`);
  const before = writeImport(dir, { rows: [{ number: 'INV-2026-045', type: 'invoice', client: 'lumen-books', issued: '2026-11-30', description: 'X', quantity: '1', unit_price: '1', source: 'T-9' }] });
  const now = parseCsv(readFileSync(path, 'utf8'));
  assert.deepEqual(Object.keys(now[0]).sort(), [...CSV_COLUMNS].sort());
  assert.equal(now[0].reference, 'Autumn list');
  assert.equal(now[1].source, 'T-9');
  restoreDocuments(dir, before);
  assert.equal(readFileSync(path, 'utf8'), `${old}\n`);
  assert.ok(rows.length > 0);
}));

test('the profile is checked', () => withSample((dir) => {
  const bad = { ...readProfile(dir), type: 'receipt', dateFormat: 'DD/YYYY', issued: 'soon', line: { quantity: '{Hours}', price: '{Rate}' } };
  assert.throws(() => planImport({ text: NOVEMBER, profile: bad, project: loadProject(dir) }), (e) => {
    for (const re of [/"type" "receipt" is not one of/, /date format "DD\/YYYY" needs DD, MM and YYYY/, /"issued" is "end-of-month"/, /"line\.description" is required/, /"line\.price" is not a line field/]) assert.match(e.message, re);
    return true;
  });
}));
