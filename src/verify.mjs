// What the checks prove about one built document, shared by `npm run check` and
// `npm run issue` (a document is verified once more before it is frozen).
//   inspectPdf(buffer)        PDF/A-3 id, fonts embedded, size, page count
//   probeLayout(doc, pages)   every line item and the total reached the page, in order
import { evalIn } from './typst.mjs';

// Pages in a PDF Typst wrote (page objects are plain dictionaries there).
export const pdfPages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;

export function inspectPdf(pdf) {
  const text = pdf.toString('latin1');
  const problems = [];
  if (!text.startsWith('%PDF-')) problems.push('not a PDF');
  if (!/pdfaid:part>3</.test(text)) problems.push('no PDF/A-3 identification in its metadata');
  const descriptors = (text.match(/\/Type\s*\/FontDescriptor/g) ?? []).length;
  const embedded = (text.match(/\/FontFile[23]?\s/g) ?? []).length;
  if (!descriptors || embedded < descriptors) problems.push(`fonts not embedded (${embedded} of ${descriptors})`);
  if (pdf.length > 1_000_000) problems.push(`${pdf.length} bytes: over 1 MB (a big logo? use SVG or a smaller PNG)`);
  return { problems, pages: pdfPages(pdf), embedded };
}

// One `typst eval` per document reads the <cp-…> markers from the laid-out pages.
const PROBE = '(lines: query(<cp-line>).map(m => (index: m.value.index, page: m.location().page())), '
  + 'total: query(<cp-total>).map(m => (text: m.value, page: m.location().page())), '
  + 'number: query(<cp-number>).map(m => m.value), end: query(<cp-end>).map(m => m.location().page()))';

// Returns { problems, notes, lines, endPage }. `pages` is the PDF's page count, if known.
export function probeLayout(doc, pages, root = '.') {
  const r = evalIn(doc, PROBE, root);
  if (!r.ok) return { problems: [`typst eval failed\n${r.diagnostics}`], notes: [] };
  const v = r.value;
  const problems = [];
  const notes = [];
  const indexes = v.lines.map((l) => l.index);
  const want = doc.items.map((it) => it.index);
  if (JSON.stringify(indexes) !== JSON.stringify(want)) {
    problems.push(`line items on the page are [${indexes.join(', ')}], expected [${want.join(', ')}] (each row needs exactly one <cp-line> marker, in order)`);
  }
  if (v.number.length !== 1 || v.number[0] !== doc.number) problems.push(`the document number appears ${v.number.length} time(s) as <cp-number>, expected once`);
  if (v.total.length !== 1) problems.push(`the total appears ${v.total.length} time(s) as <cp-total>, expected once`);
  else if (v.total[0].text !== doc.totals.total) problems.push(`the page shows the total ${v.total[0].text}, but the data says ${doc.totals.total}`);
  if (pages !== undefined && v.end[0] !== pages) problems.push(`the layout ends on page ${v.end[0]} but the PDF has ${pages} pages (a blank page at the end?)`);
  const lastLinePage = Math.max(...v.lines.map((l) => l.page));
  if (v.total[0] && v.total[0].page < lastLinePage) problems.push(`the total is on page ${v.total[0].page}, before the last line item (page ${lastLinePage})`);
  if (v.total[0] && v.total[0].page > lastLinePage) notes.push('note: the totals start a new page on their own (fine, but you may want fewer lines per page or smaller spacing)');
  return { problems, notes, lines: indexes.length, endPage: v.end[0] };
}
