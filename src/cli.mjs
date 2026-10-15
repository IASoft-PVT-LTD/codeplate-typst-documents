// The project's commands (see package.json):
//   npm run build   [-- INV-2026-041 …]   PDFs into out/ (every document, or the ones named);
//                                         removes out/ and shots/ files of documents that are gone
//   npm run preview [-- INV-2026-041 …]   a PNG per page into shots/, to look at
//   npm run watch   -- INV-2026-041       rebuild that PDF whenever a layout file changes
//   npm run list                          every document with its client, total and status
//   npm run next    -- invoice            the next free number for a document type
//   npm run issue   -- INV-2026-041 …     after sending: freeze it in archive/ (src/archive.mjs)
//   npm run import  -- <export.csv>       add line items from another program (src/import.mjs)
//   npm run export                        out/summary.csv for your bookkeeping
//   npm run remove-sample [-- --yes]      take the Fernhill sample out (src/sample.mjs)
// Every command checks all the data first and stops with the problems if there are any.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadProject } from './load.mjs';
import { nextNumber } from './numbering.mjs';
import { parseDate, today } from './dates.mjs';
import { freezeDocument, readNumbering, writeNumbering } from './archive.mjs';
import { PROFILE, planImport, readProfile, restoreDocuments, writeImport } from './import.mjs';
import { removeSample } from './sample.mjs';
import { inspectPdf, probeLayout } from './verify.mjs';
import { OUT, buildPdf, compilePdf, compilePng, fileName, removeStale, typstPath, watch } from './typst.mjs';

const [cmd, ...argv] = process.argv.slice(2);
// "--name value" options, and the rest.
const opts = {};
const args = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const [k, v] = argv[i].slice(2).split('=');
    opts[k] = v ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
  } else args.push(argv[i]);
}

function load() {
  const project = loadProject('.');
  for (const w of project.warnings) console.warn(`warning: ${w}`);
  if (project.problems.length) {
    console.error(`The data has ${project.problems.length} problem(s):`);
    for (const p of project.problems) console.error(`  ${p}`);
    process.exit(1);
  }
  return project;
}

function pick(documents, numbers) {
  if (!numbers.length) return documents;
  const out = [];
  for (const n of numbers) {
    const d = documents.find((x) => x.number === n);
    if (!d) {
      console.error(`No document numbered ${n}. Known: ${documents.map((x) => x.number).join(', ') || 'none'}`);
      process.exit(1);
    }
    out.push(d);
  }
  return out;
}

function report(r, label) {
  if (r.diagnostics) console.error(r.diagnostics);
  if (!r.ok || r.warnings.length) {
    console.error(`${label}: Typst ${r.ok ? 'warned' : 'failed'}${r.error ? ` (${r.error})` : ''}`);
    return false;
  }
  return true;
}

const status = (d) => (d.frozen ? `issued ${d.frozen.issuedOn}` : 'draft');

function main() {
  switch (cmd) {
    case 'build': {
      const { documents } = load();
      mkdirSync(OUT, { recursive: true });
      for (const f of removeStale(documents)) console.log(`removed ${f} (no such document any more)`);
      let ok = true;
      for (const d of pick(documents, args)) {
        const r = buildPdf(d);
        const good = report(r, d.number);
        ok = good && ok;
        if (good) console.log(`${r.out}  ${d.title.padEnd(8)} ${d.client.name}  ${d.totals.total}${d.frozen ? `  (issued: copied from ${d.frozen.pdf})` : ''}`);
      }
      return ok ? 0 : 1;
    }
    case 'preview': {
      const { documents } = load();
      removeStale(documents);
      let ok = true;
      for (const d of pick(documents, args)) {
        if (d.frozen) {
          console.log(`${d.number}: issued, so it isn't typeset again; what was sent is ${d.frozen.pdf}`);
          continue;
        }
        const r = compilePng(d);
        const good = report(r, d.number);
        ok = good && ok;
        if (good) console.log(`${r.pattern.replace('{p}', '*')}`);
      }
      if (ok) console.log('Open the PNGs in shots/ to look at the pages.');
      return ok ? 0 : 1;
    }
    case 'watch': {
      const { documents } = load();
      if (args.length !== 1) {
        console.error('usage: npm run watch -- <document number>');
        return 2;
      }
      const [d] = pick(documents, args);
      if (d.frozen) {
        console.error(`${d.number} was issued: it can't change. Watch a draft instead.`);
        return 1;
      }
      console.log(`Watching layout/ for ${d.number} -> out/${fileName(d.number)}.pdf (Ctrl+C to stop). Data changes need a new run.`);
      return watch(d).status ?? 0;
    }
    case 'list': {
      const { documents } = load();
      for (const d of documents) {
        console.log([d.number.padEnd(14), d.type.padEnd(11), d.issued.iso, d.client.name.padEnd(28), d.totals.total.padStart(14), ` ${status(d)}`].join('  '));
      }
      if (!documents.length) console.log('No documents yet (docs/recipes/add-a-document.md).');
      return 0;
    }
    case 'next': {
      const { business, raw, numbering } = load();
      const type = args[0];
      const cfg = business.documents[type];
      if (!cfg) {
        console.error(`usage: npm run next -- <${Object.keys(business.documents).join('|')}> [YYYY-MM-DD]`);
        return 2;
      }
      const year = Number((args[1] ?? today()).slice(0, 4));
      console.log(nextNumber(cfg.numbering, raw.filter((d) => d.type === type).map((d) => d.number), year, numbering[type]));
      return 0;
    }
    case 'issue': {
      // After the user has sent a document: verify it once more, then freeze it.
      if (!args.length) {
        console.error('usage: npm run issue -- <document number> [more numbers] [--date YYYY-MM-DD]   (once it has been sent)');
        return 2;
      }
      const project = load();
      const on = opts.date ? parseDate(opts.date, '--date') : today();
      const store = readNumbering('.');
      const p = project.business.patterns;
      // In number order, so a series is issued without gaps.
      const docs = pick(project.documents, args).sort((a, b) => (p[a.type]?.parse(a.number)?.seq ?? 0) - (p[b.type]?.parse(b.number)?.seq ?? 0));
      const issuing = new Set(docs.map((d) => d.number));
      let ok = true;
      for (const d of docs) {
        if (d.frozen) {
          console.log(`${d.number} was already issued on ${d.frozen.issuedOn}.`);
          continue;
        }
        // A gapless series is issued in order: no earlier draft of the same year may be left behind.
        const cfg = project.business.documents[d.type];
        const me = p[d.type].parse(d.number);
        const last = store[d.type] ? p[d.type].parse(store[d.type]) : null;
        const earlier = project.documents.filter((x) => x.type === d.type && !x.frozen && !issuing.has(x.number)).filter((x) => {
          const o = p[d.type].parse(x.number);
          return o && (o.year ?? 0) === (me.year ?? 0) && o.seq < me.seq && (!last || (last.year ?? 0) !== (o.year ?? 0) || o.seq > last.seq);
        });
        if (cfg.gapless && earlier.length) {
          console.error(`${d.number}: issue ${earlier.map((x) => x.number).join(', ')} first (or delete the draft): ${d.type} numbers are gapless.`);
          ok = false;
          continue;
        }
        if (d.issued.iso > on) console.warn(`warning: ${d.number} is dated ${d.issued.iso}, after today (${on}).`);
        const r = compilePdf(d);
        if (!report(r, d.number)) {
          ok = false;
          continue;
        }
        const pdf = inspectPdf(readFileSync(r.out));
        const layout = probeLayout(d, pdf.pages);
        const problems = [...pdf.problems, ...layout.problems];
        if (problems.length) {
          for (const x of problems) console.error(`${d.number}: ${x}`);
          console.error(`${d.number}: not issued; fix the problems first (npm run check).`);
          ok = false;
          continue;
        }
        const raw = project.raw.find((x) => x.number === d.number);
        const files = freezeDocument('.', { raw, document: d, pdfPath: r.out, file: fileName(d.number), on });
        const pos = (n) => (n ? p[d.type].parse(n) : null);
        const cur = pos(store[d.type]);
        if (!cur || (cur.year ?? 0) < (me.year ?? 0) || ((cur.year ?? 0) === (me.year ?? 0) && cur.seq < me.seq)) store[d.type] = d.number;
        writeNumbering('.', store);
        console.log(`${d.number}: issued on ${on}. ${files.pdf} is the PDF as sent; it will never be typeset again. ${d.totals.total}`);
      }
      return ok ? 0 : 1;
    }
    case 'import': {
      const file = args[0];
      if (!file) {
        console.error(`usage: npm run import -- <export.csv> [--issued YYYY-MM-DD] [--profile ${PROFILE}] [--dry-run]`);
        return 2;
      }
      const project = load();
      let plan;
      try {
        plan = planImport({
          text: readFileSync(file, 'utf8'),
          profile: readProfile('.', typeof opts.profile === 'string' ? opts.profile : PROFILE),
          project,
          issued: typeof opts.issued === 'string' ? opts.issued : undefined,
        });
      } catch (e) {
        console.error(e.message);
        return 1;
      }
      if (plan.skipped) console.log(`${plan.skipped} row(s) were imported before: skipped.`);
      if (!plan.documents.length) {
        console.log('Nothing new to import.');
        return 0;
      }
      for (const d of plan.documents) console.log(`${opts['dry-run'] ? 'would add' : 'adding'} ${d.number}: ${d.client}, ${d.lines} line(s), dated ${plan.issued}`);
      if (opts['dry-run']) return 0;
      const before = writeImport('.', plan);
      const after = loadProject('.');
      if (after.problems.length) {
        restoreDocuments('.', before);
        console.error('The imported rows don\'t load, so nothing was imported:');
        for (const x of after.problems) console.error(`  ${x}`);
        return 1;
      }
      for (const d of after.documents.filter((x) => plan.documents.some((y) => y.number === x.number))) {
        console.log(`${d.number}  ${d.client.name}  ${d.totals.total}`);
      }
      console.log('Next: npm run check, then npm run preview -- <number> and look at the pages.');
      return 0;
    }
    case 'export': {
      const { documents } = load();
      const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
      const lines = [['number', 'type', 'client', 'issued', 'due', 'currency', 'subtotal', 'tax', 'total', 'corrects', 'status'].join(',')];
      for (const d of documents) {
        lines.push([d.number, d.type, d.client.name, d.issued.iso, d.due?.iso ?? d.validUntil?.iso ?? '', d.currency,
          d.totals.raw.subtotal, d.totals.raw.tax, d.totals.raw.total, d.corrects ?? '', d.frozen ? 'issued' : 'draft'].map(q).join(','));
      }
      mkdirSync(OUT, { recursive: true });
      writeFileSync(`${OUT}/summary.csv`, `${lines.join('\n')}\n`);
      console.log(`${OUT}/summary.csv: ${documents.length} documents`);
      return 0;
    }
    case 'remove-sample': {
      const yes = Boolean(opts.yes);
      const done = removeSample('.', { dryRun: !yes });
      if (!done.length) {
        console.log('The sample is already gone.');
        return 0;
      }
      for (const s of done) console.log(`${yes ? '' : 'would '}${s}`);
      if (!yes) console.log('Run `npm run remove-sample -- --yes` to do it.');
      else console.log('Done. Next: rebrand.md (business.json, the logo), numbering.md (the last number the user sent), then their clients and documents.');
      return 0;
    }
    case 'typst': {
      const t = typstPath('.');
      console.log(`${t.path} (Typst ${t.version}, found via ${t.via})`);
      return 0;
    }
    default:
      console.error('usage: node src/cli.mjs <build|preview|watch|list|next|issue|import|export|remove-sample|typst> [args]');
      return 2;
  }
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
