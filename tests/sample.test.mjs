import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readNumbering } from '../src/archive.mjs';
import { loadProject } from '../src/load.mjs';
import { removeSample } from '../src/sample.mjs';
import { edit, withSample } from './helpers.mjs';

test('remove-sample: lists first, then takes out only the sample, in one go', () => withSample((dir) => {
  // What a fresh copy of the template also has: screenshots, the manifest and README.
  mkdirSync(join(dir, 'docs/media'), { recursive: true });
  for (const f of ['invoice.png', 'quote.png', 'invoice-page-2.png']) writeFileSync(join(dir, 'docs/media', f), 'png');
  writeFileSync(join(dir, 'codeplate.json'), JSON.stringify({ id: 'typst-documents', media: ['docs/media/invoice.png', 'docs/media/quote.png', 'docs/media/invoice-page-2.png'] }));
  writeFileSync(join(dir, 'README.md'), '# Invoices\n\n![x](docs/media/invoice.png)\n\nIntro.\n\n| | |\n|---|---|\n| ![a](docs/media/quote.png) | ![b](docs/media/invoice-page-2.png) |\n\n## Use it\n\nBuilt with CodePlate (codeplate.io).\n');
  mkdirSync(join(dir, 'out'), { recursive: true });
  writeFileSync(join(dir, 'out/INV-2026-042.pdf'), 'x');
  // A client and a document the user already added stay.
  edit(dir, 'data/clients.csv', (s) => `${s.trimEnd()}\nnorthlight,Northlight Games Ltd,,,Dundee,,,,\n`);
  edit(dir, 'data/documents.csv', (s) => `${s.trimEnd()}\nINV-2026-045,invoice,northlight,2026-11-02,,,,Game UI strings,,3250,word,0.0875,,,,,,\n`);

  const dry = removeSample(dir, { dryRun: true });
  assert.ok(dry.length >= 8);
  assert.ok(existsSync(join(dir, 'archive/INV-2026-041.json')), 'a dry run changes nothing');

  const done = removeSample(dir);
  assert.deepEqual(done, dry, 'it does what the dry run listed');
  const r = loadProject(dir);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.documents.map((d) => d.number), ['INV-2026-045']);
  assert.deepEqual([...r.clients.keys()], ['northlight']);
  assert.equal(readNumbering(dir).invoice, null);
  assert.ok(!existsSync(join(dir, 'archive/INV-2026-041.json')));
  assert.ok(!existsSync(join(dir, 'data/imports/timesheet-2026-10.csv')));
  assert.ok(!existsSync(join(dir, 'docs/media/invoice.png')));
  assert.ok(!existsSync(join(dir, 'out/INV-2026-042.pdf')));
  assert.equal(JSON.parse(readFileSync(join(dir, 'codeplate.json'), 'utf8')).media, undefined);
  assert.equal(readFileSync(join(dir, 'README.md'), 'utf8'), '# Invoices\n\nIntro.\n\n## Use it\n\nBuilt with CodePlate (codeplate.io).\n');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'data/import.json'), 'utf8')).clients, {});
  assert.deepEqual(removeSample(dir), [], 'a second run has nothing to do');
}));
