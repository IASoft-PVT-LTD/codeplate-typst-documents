import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { doc, edit, has, loadWith } from './helpers.mjs';

const CN = 'CN-2026-001,credit-note,harbour-finch,2026-10-09,,,INV-2026-041,';

test('a credit note: its own series, positive entries printed negative, no payment block', () => {
  const r = loadWith();
  const cn = doc(r, 'CN-2026-001');
  assert.equal(cn.title, 'Credit note');
  assert.equal(cn.corrects, 'INV-2026-041');
  assert.deepEqual(cn.totals.raw, { subtotal: '-380.00', tax: '-76.00', total: '-456.00' });
  assert.equal(cn.totals.total, '-£456.00');
  assert.equal(cn.items[0].unitPrice, '-£380.00');
  assert.equal(cn.payment, null);
  assert.equal(cn.due, null);
});

test('a credit note corrects an issued invoice', () => {
  const none = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.replace(CN, CN.replace(',INV-2026-041,', ',,'))));
  assert.ok(has(none, /a credit note names the invoice it corrects in "corrects"/));
  const missing = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.replace(CN, CN.replace('INV-2026-041', 'INV-2026-099'))));
  assert.ok(has(missing, /corrects "INV-2026-099", which is not an invoice in data\//));
  const quote = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.replace(CN, CN.replace('INV-2026-041', 'QUO-2026-007'))));
  assert.ok(has(quote, /corrects "QUO-2026-007", which is not an invoice/));
  const draft = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.replace(CN, CN.replace('INV-2026-041', 'INV-2026-042').replace('2026-10-09', '2026-10-10'))));
  assert.ok(has(draft, /corrects INV-2026-042, which hasn't been issued/));
  const unissued = loadWith((d) => {
    rmSync(join(d, 'archive/INV-2026-041.json'));
    edit(d, 'data/numbering.json', (s) => s.replace('"INV-2026-041"', 'null'));
  });
  assert.ok(has(unissued, /corrects INV-2026-041, which hasn't been issued/));
  const early = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.replace(CN, CN.replace('2026-10-09', '2026-09-30'))));
  assert.ok(has(early, /is dated 2026-09-30, before INV-2026-041/));
  const client = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.replace(CN, CN.replace('harbour-finch', 'lumen-books'))));
  assert.ok(has(client, /credit note CN-2026-001 is for "lumen-books", but INV-2026-041 was for "harbour-finch"/));
  const other = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.replace('amount you owe.",,', 'amount you owe.",EUR,')));
  assert.ok(has(other, /is in EUR, but INV-2026-041 is in GBP/));
  const quoteCorrects = loadWith((d) => edit(d, 'data/documents.json', (s) => s.replace('"reference": "Second café opening"', '"corrects": "INV-2026-041", "reference": "Second café opening"')));
  assert.ok(has(quoteCorrects, /"corrects" is only for credit notes/));
});

test('credit notes never add up to more than the invoice', () => {
  // INV-2026-041 is £4,404.40; a second credit of 3,300 + VAT brings the credits to £4,416.00.
  const over = loadWith((d) => edit(d, 'data/documents.csv', (s) => `${s.trimEnd()}\nCN-2026-002,credit-note,harbour-finch,2026-10-12,,,INV-2026-041,Logo design,,1,project,3300.00,,,,,,\n`));
  assert.ok(has(over, /the credit notes for INV-2026-041 add up to more than its total \(£4,404.40\)/));
  const fine = loadWith((d) => edit(d, 'data/documents.csv', (s) => `${s.trimEnd()}\nCN-2026-002,credit-note,harbour-finch,2026-10-12,,,INV-2026-041,Logo design,,1,project,3290.00,,,,,,\n`));
  assert.deepEqual(fine.problems, []);
});

test('credit note prices are entered positive; a negative total elsewhere asks for one', () => {
  const neg = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.replace(`${CN}Packaging illustration,"One of the three bag fronts, withdrawn before artwork",1,design,380.00`, `${CN}Packaging illustration,"One of the three bag fronts, withdrawn before artwork",1,design,-380.00`)));
  assert.ok(has(neg, /in a credit note, enter what you credit as a positive price/));
  const refund = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.replace(',300.00,,,Agreed', ',-9000.00,,,Agreed')));
  assert.ok(has(refund, /the total is negative .* issue a credit note/));
  assert.ok(readFileSync(join(import.meta.dirname, 'fixtures/sample/data/documents.csv'), 'utf8').includes(CN), 'the fixture still has the sample credit note');
});
