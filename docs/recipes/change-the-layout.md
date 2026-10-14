# Change the layout

Use this when the user wants the page to look different: blocks moved, a different header, a new column per line, a signature block, terms on a second page.

## Steps

1. **Find the part.** `layout/document.typ` sets the page and calls the parts in order: `header`, `parties`, `items`, `totals`, `closing`. Each is a function in `layout/parts.typ` that takes `doc`. Sizes, margins and greys are in `layout/theme.typ`. Change the part, not `document.typ`, unless you're reordering.

2. **Styling.** Use `brand(doc)`/`accent(doc)` and the `size`, `ink`, `muted`, `rule`, `panel` values from `theme.typ` rather than new literal colours and sizes, so the user's brand still applies everywhere. Scope `set` rules inside the part's `{ … }`.

3. **A new value on the page** (a project name, a delivery date, a purchase-order line): if it's per document, add a column to `data/documents.csv` (first row only) and to `HEADER_FIELDS` in `src/load.mjs`, carry it into the object `buildDocument` returns (always present, `""` when empty), add its label to every file in `layout/labels/`, and show it in the part (e.g. the `details` list in `parties`). If it's per business, put it in `business.json` and pass it through `seller`.

4. **A new column per line** (a date, a SKU, hours):
   - read it in `readDocuments` (CSV `r.<column>`, JSON `it.<field>`) and put it on each item in `buildDocument`'s `items` (formatted: a date through `formatDate`, a number through `formatQty`);
   - in `items` in `parts.typ`, push a column width (`auto` for short values) and a heading, and push the cell in `row(it)` at the same position;
   - a column that only some documents use: add a `showX` flag in `buildDocument` like `showDiscount`, so the column only appears when needed.

5. **A signature block for quotes:** in `closing`, under `if doc.type == "quote"`, add a `grid` with two columns of `line(length: 100%)` and labels ("Signed", "Date") from `layout/labels/` (every language). Keep it `block(breakable: false, …)` so it doesn't split across pages.

6. **Terms and conditions on a page of their own:** add `terms` (a list of paragraphs) to `business.json`, pass it through `buildDocument` (`[]` when there are none), and in `document.typ` after `closing`: `#if doc.terms.len() > 0 { pagebreak(); … }`, set smaller (`size.small`) in two columns if they're long (`columns(2, …)`). Keep `#metadata("end") <cp-end>` as the very last line, after the terms.

7. **Issued documents don't change.** A layout change only affects drafts; issued documents keep the PDF that was sent (rule 4). Tell the user so if they expect old invoices to get the new look.

8. **Keep the markers** (rule 6): one `<cp-line>` per row (inside the row's first cell), `<cp-total>` next to the total, `<cp-number>` in the header, `<cp-end>` last.

## Verify

- `npm run check` ends with `CODEPLATE CHECKS: PASS` with no Typst warnings; `layout` still finds every line and the total.
- `npm run preview` for the longest and the shortest document; open every page. Check alignment of number columns, wrapping of long descriptions, that the table header repeats on page 2, and that nothing overlaps the footer.
- `npm run watch -- <number>` while you iterate, then a full check.
