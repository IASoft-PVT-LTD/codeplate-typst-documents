import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { missingLabels } from '../src/load.mjs';
import { doc, edit, editJson, has, loadWith } from './helpers.mjs';

const nb = (s) => s.replace(/[  ]/g, ' ');

test("a client's language: its labels, locale and translated business fields", () => {
  const r = loadWith();
  const de = doc(r, 'INV-2026-044');
  assert.equal(de.language, 'de');
  assert.equal(de.locale, 'de-DE');
  assert.equal(de.title, 'Rechnung');
  assert.equal(de.issued.text, '31. Oktober 2026');
  assert.equal(nb(de.totals.total), '655,00 €');
  assert.equal(de.items[1].quantity, '2,5');
  assert.equal(de.items[1].unit, 'Std.', 'units from the language\'s "units"');
  assert.equal(de.seller.tagline, 'Markendesign & Illustration');
  assert.equal(de.payment.reference, 'Bitte geben Sie INV-2026-044 als Verwendungszweck an.');
  assert.equal(de.footer, 'Vielen Dank für die Zusammenarbeit.');
  assert.match(de.totals.taxes[0].label, /^USt\. 0\s%$/);
  // Everyone else stays in the main language.
  const en = doc(r, 'INV-2026-043');
  assert.equal(en.title, 'Invoice');
  assert.equal(en.totals.total, '€8,242.00');
  assert.equal(en.items[0].unit, 'design');
});

test('a language needs its locale in business.json and every label', () => {
  const noLocale = loadWith((d) => editJson(d, 'business.json', (b) => ({ ...b, languages: {} })));
  assert.ok(has(noLocale, /client "kranich" is in language "de", but business.json "languages" has no "de"/));
  const noFile = loadWith((d) => rmSync(join(d, 'layout/labels/de.json')));
  assert.ok(has(noFile, /there is no layout\/labels\/de\.json/));
  const missing = loadWith((d) => editJson(d, 'layout/labels/de.json', (w) => { delete w.totalDue; return w; }));
  assert.ok(has(missing, /layout\/labels\/de\.json is missing "totalDue"/));
  // A language no client uses only warns.
  const unused = loadWith((d) => editJson(d, 'layout/labels/fr.json', (w) => { delete w.totalDue; return w; }));
  assert.deepEqual(unused.problems, []);
  assert.ok(unused.warnings.some((w) => /fr\.json is missing "totalDue".*no client uses it yet/.test(w)));
  const unknownField = loadWith((d) => editJson(d, 'business.json', (b) => ({ ...b, languages: { de: { ...b.languages.de, name: 'Farnhügel' } } })));
  assert.ok(has(unknownField, /"languages\.de\.name" is not something a language can change/));
  const french = loadWith((d) => {
    editJson(d, 'business.json', (b) => ({ ...b, languages: { ...b.languages, fr: { locale: 'fr-FR' } } }));
    edit(d, 'data/clients.csv', (s) => s.replace('IE 1234567T,zero,', 'IE 1234567T,zero,fr'));
  });
  assert.deepEqual(french.problems, []);
  assert.equal(doc(french, 'INV-2026-043').title, 'Facture');
  assert.equal(nb(doc(french, 'INV-2026-043').totals.total), '8 242,00 €');
});

test('every shipped label file has every key, and says whether a native speaker reviewed it', () => {
  // The template's own label files (layout/labels/), not the fixture's.
  const dir = fileURLToPath(new URL('../layout/labels/', import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const en = read('en.json');
  for (const f of files) {
    const words = read(f);
    assert.deepEqual(missingLabels(en, words), [], `${f} is missing keys`);
    for (const p of ['{p}', '{t}']) assert.ok(words.page.includes(p), `${f} "page" keeps ${p}`);
    assert.ok(words.taxOn.includes('{base}'), `${f} "taxOn" keeps {base}`);
    if (f !== 'en.json') assert.ok(typeof words.$review === 'string' && words.$review.length > 20, `${f} needs a "$review" note at the top`);
  }
});
