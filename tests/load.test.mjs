import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { doc, edit, editJson, has, loadWith } from './helpers.mjs';

test('the sample data loads cleanly', () => {
  const r = loadWith();
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.documents.map((d) => d.number), ['INV-2026-041', 'INV-2026-042', 'INV-2026-043', 'INV-2026-044', 'CN-2026-001', 'QUO-2026-007']);
  assert.deepEqual(doc(r, 'INV-2026-041').totals.raw, { subtotal: '3686.40', tax: '718.00', total: '4404.40' });
  assert.equal(doc(r, 'INV-2026-041').totals.total, '£4,404.40');
  assert.equal(doc(r, 'INV-2026-041').due.iso, '2026-10-31', 'issued + dueDays');
  assert.equal(doc(r, 'INV-2026-042').due.iso, '2026-10-17', 'an explicit due date wins');
  assert.equal(doc(r, 'INV-2026-043').currency, 'EUR', "the client's currency");
  assert.equal(doc(r, 'QUO-2026-007').validUntil.iso, '2026-11-07');
  assert.equal(doc(r, 'QUO-2026-007').payment, null, 'quotes have no payment block');
  assert.equal(doc(r, 'INV-2026-042').payment.reference, 'Please use INV-2026-042 as the payment reference.');
  assert.equal(doc(r, 'INV-2026-042').items[6].note, 'Agreed by email on 22 September', 'a line note');
});

test('problems name the file and line', () => {
  const r = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.replace('INV-2026-042,invoice,lumen-books', 'INV-2026-042,invoice,lumen-bookz')));
  assert.ok(has(r, /data\/documents\.csv line 6: client "lumen-bookz" is not in data\/clients/));
  const later = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.replace('INV-2026-042,,,,,,,Cover design: Small Hours', 'INV-2026-042,,,2026-10-04,,,,Cover design: Small Hours')));
  assert.ok(has(later, /line 7: issued "2026-10-04" differs from the first row/));
  const amount = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.replace(',950.00,', ',"1,950.00",')));
  assert.ok(has(amount, /line 6: unit price "1,950.00".*thousands separators/));
});

test('numbers: pattern, duplicates across CSV and JSON, gaps', () => {
  const pattern = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.replaceAll('INV-2026-042', 'INV-26-042')));
  assert.ok(has(pattern, /INV-26-042 doesn't match the invoice pattern/));
  const dup = loadWith((d) => editJson(d, 'data/documents.json', (a) => { a[0].number = 'INV-2026-042'; a[0].type = 'invoice'; return a; }));
  assert.ok(has(dup, /number INV-2026-042 is also used in data\/documents\.csv/));
  const gap = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.replaceAll('INV-2026-044', 'INV-2026-046')));
  assert.ok(has(gap, /INV-2026-044 is missing/));
  assert.ok(has(gap, /INV-2026-045 is missing/));
  const quotesMayHaveGaps = loadWith((d) => editJson(d, 'data/documents.json', (a) => { a[0].number = 'QUO-2026-009'; return a; }));
  assert.deepEqual(quotesMayHaveGaps.problems, []);
});

test('tax: unknown rates, a client\'s usual rate, and businesses that charge no tax', () => {
  const unknown = loadWith((d) => edit(d, 'data/documents.csv', (s) => s.replace(',300.00,,,', ',300.00,,exempt,')));
  assert.ok(has(unknown, /tax "exempt" is not one of the rates/));
  // Kranich's lines name no rate: the client's "tax" (zero) applies.
  assert.deepEqual(doc(loadWith(), 'INV-2026-044').items.map((i) => i.tax.replace(/\s/g, ' ')), ['0 %', '0 %', '0 %']);
  const noTax = loadWith((d) => {
    editJson(d, 'business.json', (b) => { delete b.tax; return b; });
    // (INV-2026-041 was issued: its rows stay as they were.)
    edit(d, 'data/documents.csv', (s) => s.split('\n').map((l) => (l.startsWith('INV-2026-041') ? l : l.replace(/,zero,/g, ',,'))).join('\n'));
    edit(d, 'data/clients.csv', (s) => s.replace(/,zero,/g, ',,'));
  });
  assert.deepEqual(noTax.problems, []);
  const inv = doc(noTax, 'INV-2026-042');
  assert.equal(inv.showTax, false);
  assert.deepEqual(inv.totals.taxes, []);
  assert.equal(inv.totals.raw.total, '4578.00');
});

test('business.json is checked', () => {
  const r = loadWith((d) => editJson(d, 'business.json', (b) => ({ ...b, currency: 'POUNDS', brand: { ...b.brand, color: 'green' }, logo: 'assets/nope.png', lineMinimum: { GBP: '£5' } })));
  assert.ok(has(r, /ISO 4217/));
  assert.ok(has(r, /brand\.color/));
  assert.ok(has(r, /logo assets\/nope\.png does not exist/));
  assert.ok(has(r, /"lineMinimum": lineMinimum GBP "£5" is not a number/));
});

test('a new document type needs its settings and its label', () => {
  const r = loadWith((d) => {
    mkdirSync(join(d, 'data'), { recursive: true });
    editJson(d, 'data/documents.json', (a) => [...a, { ...a[0], number: 'REC-2026-001', type: 'receipt' }]);
  });
  assert.ok(has(r, /type "receipt" is not one of invoice, credit-note, quote/));
  const label = loadWith((d) => {
    editJson(d, 'business.json', (b) => ({ ...b, documents: { ...b.documents, receipt: { numbering: 'REC-{yyyy}-{nnn}' } } }));
    editJson(d, 'data/documents.json', (a) => [...a, { ...a[0], number: 'REC-2026-001', type: 'receipt' }]);
  });
  assert.ok(has(label, /layout\/labels\/en\.json has no label for the type "receipt"/));
});

test('minimum charge per line: per currency, noted on the line, not on credit notes', () => {
  const r = loadWith();
  const inv = doc(r, 'INV-2026-044');
  // 0.5 hours at 70.00 = 35.00, under the EUR minimum of 60.00
  assert.equal(inv.items[2].net.replace(/\s/g, ' '), '60,00 €');
  assert.equal(inv.items[2].note, 'Mindestbetrag');
  assert.equal(inv.items[0].note, '', 'lines above the minimum are unchanged');
  assert.equal(inv.totals.raw.total, '655.00');
  // Raising the GBP minimum changes drafts, never credit notes (and never issued documents: issue.test.mjs).
  const higher = loadWith((d) => editJson(d, 'business.json', (b) => ({ ...b, lineMinimum: { ...b.lineMinimum, GBP: '400.00' } })));
  assert.equal(doc(higher, 'INV-2026-042').items[3].net, '£918.00');
  assert.equal(doc(higher, 'INV-2026-042').items[4].net, '£400.00', '6 photos at £25 = £150 -> £400');
  assert.equal(doc(higher, 'INV-2026-042').items[4].note, 'Minimum charge');
  assert.equal(doc(higher, 'CN-2026-001').totals.raw.total, '-456.00');
  const noEntry = loadWith((d) => editJson(d, 'business.json', (b) => ({ ...b, lineMinimum: { GBP: '50.00' } })));
  assert.ok(noEntry.warnings.some((w) => /no EUR entry/.test(w)));
});
