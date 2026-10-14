// One invoice or quote. src/cli.mjs compiles this file once per document:
//
//   typst compile layout/document.typ out/INV-2026-041.pdf --root . \
//     --input data=/out/.data/INV-2026-041.json --font-path assets/fonts --ignore-system-fonts
//
// The data file is the JSON src/load.mjs builds (see docs/architecture.md for its fields).
// Run `npm run build` rather than typst by hand: it writes the data file first.
#import "theme.typ": *
#import "parts.typ": *

#let data = sys.inputs.at("data", default: none)
#if data == none { panic("no document data: run `npm run build` or `npm run watch -- <number>` instead of typst directly") }
#let doc = json(data)
#let (lang, region) = lang-of(doc)
#let (y, m, d) = doc.issued.iso.split("-").map(int)

#set document(
  title: [#doc.title #doc.number],
  author: doc.seller.legalName,
  keywords: (doc.type, doc.number),
  // A fixed date keeps the PDF byte-for-byte identical every time it is built.
  date: datetime(year: y, month: m, day: d),
)
#set page(paper: page-size, margin: margin, header: page-header(doc), footer: page-footer(doc), footer-descent: 6mm)
#set text(font: doc.brand.font, size: size.body, fill: ink, lang: lang, region: region)
#set par(leading: 0.55em, spacing: 0.9em)

#header(doc)
#v(8mm)
#parties(doc)
#v(7mm)
#items(doc)
#v(3mm)
#totals(doc)
#v(7mm)
#closing(doc)
#metadata("end") <cp-end>
