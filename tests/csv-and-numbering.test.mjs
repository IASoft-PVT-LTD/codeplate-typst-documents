import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvLine, parseCsv } from '../src/csv.mjs';
import { compilePattern, findGaps, nextNumber } from '../src/numbering.mjs';
import { addDays, endOfMonth, parseDate, parseDateAs } from '../src/dates.mjs';

test('CSV: quotes, commas and line breaks inside fields, CRLF, BOM', () => {
  const rows = parseCsv('﻿id,name,address\r\na,"Smith, Jones & Co","1 High St\r\nTown"\r\nb,"Say ""hi""",\r\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'Smith, Jones & Co');
  assert.equal(rows[0].address, '1 High St\r\nTown');
  assert.equal(rows[1].name, 'Say "hi"');
  assert.equal(rows[1].address, '');
  assert.equal(rows[1]._line, 4);
});

test('CSV: semicolons (European Excel), blank lines, header problems', () => {
  const rows = parseCsv('number;unit_price\nINV-1;12,50\n\n');
  assert.deepEqual({ ...rows[0] }, { number: 'INV-1', unit_price: '12,50' });
  assert.throws(() => parseCsv('a,a\n1,2'), /appears twice/);
  assert.throws(() => parseCsv('a,b\n1,2,3'), /line 2: 3 fields/);
  assert.throws(() => parseCsv('a\n"open'), /never closed/);
  assert.deepEqual(parseCsv(''), []);
});

test('numbering: patterns, next number, gaps', () => {
  const p = compilePattern('INV-{yyyy}-{nnn}');
  assert.deepEqual(p.parse('INV-2026-041'), { year: 2026, seq: 41 });
  assert.equal(p.parse('INV-26-041'), null);
  assert.equal(p.parse('QUO-2026-041'), null);
  assert.deepEqual(p.parse('INV-2026-1041'), { year: 2026, seq: 1041 }, 'a sequence can outgrow its padding');
  assert.equal(p.format({ year: 2026, seq: 7 }), 'INV-2026-007');
  assert.equal(nextNumber('INV-{yyyy}-{nnn}', ['INV-2026-041', 'INV-2026-043', 'INV-2025-120'], 2026), 'INV-2026-044');
  assert.equal(nextNumber('INV-{yyyy}-{nnn}', ['INV-2025-120'], 2026), 'INV-2026-001');
  assert.equal(nextNumber('{nnnn}', ['0007'], 2026), '0008');
  assert.deepEqual(findGaps('INV-{yyyy}-{nnn}', ['INV-2026-041', 'INV-2026-044', 'INV-2025-001', 'INV-2025-002']), ['INV-2026-042', 'INV-2026-043']);
  assert.throws(() => compilePattern('INV-{yyyy}'), /needs a sequence/);
});

test('dates: ISO only, real dates, adding days across months', () => {
  assert.equal(parseDate('2026-10-01'), '2026-10-01');
  assert.throws(() => parseDate('01/10/2026'), /YYYY-MM-DD/);
  assert.throws(() => parseDate('2026-02-30'), /not a real date/);
  assert.equal(addDays('2026-10-01', 30), '2026-10-31');
  assert.equal(addDays('2026-12-15', 30), '2027-01-14');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('numbering: the stored last-issued number is a floor and part of the sequence', () => {
  const P = 'INV-{yyyy}-{nnn}';
  // Seeded with the last number sent before this project: the next one follows it.
  assert.equal(nextNumber(P, [], 2026, 'INV-2026-118'), 'INV-2026-119');
  assert.equal(nextNumber(P, ['INV-2026-119'], 2026, 'INV-2026-118'), 'INV-2026-120');
  // Rows deleted: the numbering doesn't go back.
  assert.equal(nextNumber(P, ['INV-2026-041'], 2026, 'INV-2026-043'), 'INV-2026-044');
  // A new year starts again at 001 when the pattern has {yyyy}.
  assert.equal(nextNumber(P, [], 2027, 'INV-2026-043'), 'INV-2027-001');
  assert.equal(nextNumber('{nnnn}', [], 2027, '0042'), '0043');
  assert.deepEqual(findGaps(P, [], 'INV-2026-118'), []);
  assert.deepEqual(findGaps(P, ['INV-2026-119', 'INV-2026-120'], 'INV-2026-118'), []);
  assert.deepEqual(findGaps(P, ['INV-2026-121'], 'INV-2026-118'), ['INV-2026-119', 'INV-2026-120'], 'drafts follow the last issued number');
  assert.deepEqual(findGaps(P, ['INV-2026-041', 'INV-2026-042'], 'INV-2026-043'), ['INV-2026-043'], 'an issued number whose rows are gone');
  assert.deepEqual(findGaps(P, ['INV-2026-041', 'INV-2026-042', 'INV-2026-043'], 'INV-2026-041'), []);
  assert.deepEqual(findGaps(P, ['INV-2027-001'], 'INV-2026-043'), [], 'other years are separate');
});

test('dates: exports in other formats, end of month', () => {
  assert.equal(parseDateAs('2/10/2026', 'DD/MM/YYYY'), '2026-10-02');
  assert.equal(parseDateAs('10/2/2026', 'MM/DD/YYYY'), '2026-10-02');
  assert.equal(parseDateAs('02.10.2026', 'DD.MM.YYYY'), '2026-10-02');
  assert.throws(() => parseDateAs('2026-10-02', 'DD/MM/YYYY', 'Date'), /Date "2026-10-02" is not written DD\/MM\/YYYY/);
  assert.throws(() => parseDateAs('31/02/2026', 'DD/MM/YYYY'), /not a real date/);
  assert.throws(() => parseDateAs('1/1/2026', 'DD/MM'), /needs DD, MM and YYYY/);
  assert.equal(endOfMonth('2026-10-14'), '2026-10-31');
  assert.equal(endOfMonth('2028-02-03'), '2028-02-29');
});

test('CSV: writing a line quotes only what needs it', () => {
  assert.equal(csvLine(['a', 'b, c', 'say "hi"', '']), 'a,"b, c","say ""hi""",');
  assert.equal(csvLine(['1,5', 'x;y'], ';'), '1,5;"x;y"');
  assert.deepEqual(parseCsv(`h1,h2\n${csvLine(['x, y', 'line\nbreak'])}\n`)[0], { h1: 'x, y', h2: 'line\nbreak' });
});
