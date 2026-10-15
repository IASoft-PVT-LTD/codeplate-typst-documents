// The checks: one command that says whether every document still builds correctly.
//   npm run check
// Needs Node and Typst, nothing else (no network, no browser, no system fonts). Runs:
//   tools    Typst is installed and is the pinned version (codeplate.json "stack")
//   assets   assets.json matches the files in assets/ (fonts, their license, the logo)
//   data     business.json, data/ and archive/ are complete and consistent: clients exist,
//            numbers match their pattern and have no gaps (data/numbering.json included),
//            dates, amounts, labels for every language in use, credit notes correct an
//            issued invoice, issued documents' rows are unchanged
//   unit     node --test tests/: money math, rounding, CSV, numbering, loading, import,
//            issuing, languages, removing the sample
//   pdf      every draft compiles to a PDF/A-3b with no Typst warnings; each PDF has its
//            fonts embedded and builds byte-for-byte the same twice; issued documents are
//            copied from archive/; out/ and shots/ lose files of documents that are gone
//   issued   every issued document's archived PDF is the one that was sent (SHA-256), and
//            out/ holds exactly that file
//   layout   every line item and the total are on the page, in order; the total printed
//            equals the total worked out in src/money.mjs and comes after the last line
//   preview  a PNG of every page of every draft in shots/ (open them to look; see AGENTS.md)
//   credit   README.md still carries the credit the CodePlate Free License asks for
// A failing step doesn't stop the later ones. The last line is CODEPLATE CHECKS: PASS or FAIL.
//   --skip=unit,preview   skip steps for a quick loop; always finish with a full run
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRunner } from './shared/runner.mjs';
import { checkAssets } from './shared/assets.mjs';
import { loadProject } from '../src/load.mjs';
import { sha256 } from '../src/archive.mjs';
import { inspectPdf, probeLayout } from '../src/verify.mjs';
import { SHOTS, buildPdf, compilePdf, compilePng, fileName, pinnedTypst, removeStale, typstPath } from '../src/typst.mjs';

const run = createRunner();
let project = null;
let typstOk = false;
const built = new Map(); // number -> { pdf: Buffer, pages, out }

const drafts = () => (project?.documents ?? []).filter((d) => !d.frozen);
// Steps that need Typst fail with one line when it's missing (the tools step says why).
const needTypst = () => {
  if (!typstOk) console.log('Typst is missing or the wrong version: see the tools step above.');
  return typstOk && project !== null;
};

await run.step('tools', () => {
  const t = typstPath('.');
  typstOk = true;
  console.log(`Typst ${t.version} at ${t.path} (found via ${t.via}; codeplate.json pins ${pinnedTypst('.')}.x)`);
});

await run.step('assets', () => {
  const problems = checkAssets('.');
  for (const p of problems) console.log(p);
  if (!problems.length) console.log('assets.json matches the files in assets/');
  return problems.length === 0;
});

await run.step('data', () => {
  project = loadProject('.');
  for (const w of project.warnings) console.log(`warning: ${w}`);
  for (const p of project.problems) console.log(p);
  if (project.problems.length) {
    project = null;
    return false;
  }
  for (const d of project.documents) {
    console.log(`${d.number.padEnd(14)} ${d.type.padEnd(11)} ${String(d.items.length).padStart(3)} lines  ${d.totals.total.padStart(12)}  ${d.frozen ? `issued ${d.frozen.issuedOn}` : 'draft'}`);
  }
  console.log(`${project.documents.length} documents (${project.archive.size} issued), ${project.clients.size} clients`);
  if (!project.documents.length) console.log('No documents yet: add one (docs/recipes/add-a-document.md). The PDF steps have nothing to check until then.');
  return true;
});

await run.step('unit', () => run.sh(process.execPath, ['--test', '--test-reporter=dot', ...readdirSync('tests').filter((f) => f.endsWith('.test.mjs')).map((f) => `tests/${f}`)]).ok);

await run.step('pdf', () => {
  if (!needTypst()) return false;
  for (const f of removeStale(project.documents)) console.log(`removed ${f} (its document is gone)`);
  let ok = true;
  for (const d of project.documents) {
    const r = buildPdf(d);
    if (r.diagnostics) console.log(r.diagnostics);
    if (!r.ok || r.warnings.length) {
      console.log(`${d.number}: ${r.error ?? `Typst ${r.ok ? 'warned (fix every warning: unknown fonts and missing glyphs show up here)' : 'failed'}`}`);
      ok = false;
      continue;
    }
    const pdf = readFileSync(r.out);
    const info = inspectPdf(pdf);
    // An issued PDF was checked when it was issued; the issued step proves it's unchanged.
    const problems = d.frozen ? [] : info.problems;
    for (const p of problems) console.log(`${d.number}: ${p}`);
    ok = ok && problems.length === 0;
    built.set(d.number, { pdf, pages: info.pages, out: r.out });
    console.log(`${r.out}  ${info.pages} page(s), ${Math.round(pdf.length / 1024)} KB${d.frozen ? `, issued: copied from ${d.frozen.pdf}` : `, ${info.embedded} embedded font(s)`}`);
  }
  // The same input must give the same file: no timestamps, no system fonts.
  const first = drafts()[0];
  if (first && built.has(first.number)) {
    const again = compilePdf(first);
    if (!again.ok || !readFileSync(again.out).equals(built.get(first.number).pdf)) {
      console.log(`${first.number}: building twice gave different PDFs (something in the layout depends on the time or the machine)`);
      ok = false;
    } else console.log(`${first.number}: built twice, identical`);
  }
  return ok;
}, { render: true });

await run.step('issued', () => {
  if (!project) {
    console.log('The data step failed: fix it first.');
    return false;
  }
  const issued = project.documents.filter((d) => d.frozen);
  if (!issued.length) {
    console.log('No documents issued yet. After the user sends one: npm run issue -- <number> (docs/recipes/issue-a-document.md).');
    return true;
  }
  let ok = true;
  for (const d of issued) {
    const problems = [];
    if (!existsSync(d.frozen.pdf)) problems.push(`${d.frozen.pdf} is missing: restore it from a backup (it's the PDF that was sent)`);
    else {
      const archived = readFileSync(d.frozen.pdf);
      if (sha256(archived) !== d.frozen.sha256) problems.push(`${d.frozen.pdf} has changed since it was issued (SHA-256 differs): restore the original from a backup`);
      const out = built.get(d.number);
      if (out && !out.pdf.equals(archived)) problems.push(`${out.out} is not the archived PDF`);
    }
    for (const p of problems) console.log(`${d.number}: ${p}`);
    ok = ok && problems.length === 0;
    if (!problems.length) console.log(`${d.number}: issued ${d.frozen.issuedOn}, rows and PDF unchanged (${d.frozen.sha256.slice(0, 12)}…)`);
  }
  return ok;
});

await run.step('layout', () => {
  if (!needTypst()) return false;
  let ok = true;
  for (const d of drafts()) {
    const r = probeLayout(d, built.get(d.number)?.pages);
    for (const p of r.problems) console.log(`${d.number}: ${p}`);
    for (const n of r.notes) console.log(`${d.number}: ${n}`);
    ok = ok && r.problems.length === 0;
    if (!r.problems.length) console.log(`${d.number}: ${r.lines} lines on ${r.endPage} page(s), total ${d.totals.total} after the last line`);
  }
  return ok;
});

await run.step('preview', () => {
  if (!needTypst()) return false;
  if (existsSync(SHOTS)) for (const f of readdirSync(SHOTS)) if (f.endsWith('.png')) rmSync(`${SHOTS}/${f}`);
  let ok = true;
  for (const d of drafts()) {
    const r = compilePng(d, { ppi: 72 });
    if (!r.ok || r.warnings.length) {
      console.log(`${d.number}: PNG export failed\n${r.diagnostics}`);
      ok = false;
      continue;
    }
    const files = readdirSync(SHOTS).filter((f) => f.startsWith(`${fileName(d.number)}-p`) && f.endsWith('.png'));
    const pages = built.get(d.number)?.pages ?? files.length;
    if (files.length !== pages || files.some((f) => statSync(`${SHOTS}/${f}`).size < 1000)) {
      console.log(`${d.number}: expected ${pages} PNG page(s) in shots/, found ${files.length}`);
      ok = false;
    }
  }
  if (ok) console.log(`${existsSync(SHOTS) ? readdirSync(SHOTS).length : 0} page images in shots/ (drafts only, low resolution; npm run preview makes sharper ones)`);
  return ok;
}, { render: true });

await run.step('credit', () => {
  const credit = 'Built with CodePlate (codeplate.io)';
  const ok = readFileSync('README.md', 'utf8').includes(credit);
  console.log(ok ? `README.md carries the credit "${credit}"` : `README.md must keep the credit "${credit}" (CodePlate Free License; see AGENTS.md)`);
  return ok;
});

run.finish();
