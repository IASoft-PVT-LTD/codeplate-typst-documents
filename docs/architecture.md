# Architecture

## The flow

```
business.json ──────┐
data/clients.*      ├─> src/load.mjs ──> out/.data/<number>.json ──> layout/document.typ ──> out/<number>.pdf
data/documents.*    │   (check, math,      (one per draft)             (Typst lays it out)     shots/<number>-pN.png
data/numbering.json │    format per
layout/labels/*.json┘    language)
archive/<number>.json ──> (issued: read as they were sent) ───────────────────────────────> out/<number>.pdf (copied
                                                                                             from archive/<number>.pdf)
```

1. **`src/load.mjs`** reads everything, checks it, and collects every problem with its file and line (it never stops at the first). For each draft it works out the line amounts (with the minimum charge), tax per rate and totals with `src/money.mjs`, formats money, quantities, percentages and dates for the client's language with `Intl`, and picks that language's labels. An **issued** document (one with a record in `archive/`) is not worked out at all: the archived document is used as it is, after checking its rows in `data/` are unchanged.
2. **`src/typst.mjs`** writes a draft's JSON to `out/.data/` and runs Typst with the project folder as root, only the fonts in `assets/fonts/`, and the JSON path as `--input data=/out/.data/<number>.json`. For an issued document it copies `archive/<number>.pdf` to `out/` instead. `removeStale` deletes PDFs, data files and page images of documents that no longer exist.
3. **`layout/document.typ`** reads the JSON (`json(sys.inputs.data)`), sets up the page and calls the parts in `layout/parts.typ`.

The checks (`checks/run.mjs`) use the same functions, plus `typst eval` to read the `<cp-…>` markers back from the laid-out document (`src/verify.mjs`, also used by `npm run issue`).

## The document JSON

What every part in `layout/parts.typ` receives as `doc` (look at `out/.data/*.json` after a build for real examples):

| Field | Example | Notes |
|---|---|---|
| `number`, `type`, `title` | `"INV-2026-041"`, `"invoice"`, `"Invoice"` | `title` is the label for the type, in the document's language |
| `language`, `locale`, `currency` | `"de"`, `"de-DE"`, `"EUR"` | language: the client's, else the business's; locale from `business.json` (`locale`, or `languages.<lang>.locale`); currency: the document's, the client's, or the business's |
| `issued`, `due`, `validUntil` | `{ "iso": "2026-10-01", "text": "1 October 2026" }` | `due` for invoices and types with `dueDays`, `validUntil` for types with `validDays`; else `null` |
| `reference`, `notes`, `corrects` | strings | empty string when not set; `corrects` is the invoice a credit note corrects |
| `seller` | `name`, `legalName`, `tagline`, `address` (list), `email`, `phone`, `website`, `registration`, `taxLabel`, `taxNumber`, `logo` (`"/assets/logo.svg"` or `null`) | from `business.json`, with the language's `languages.<lang>` fields |
| `brand` | `color`, `accent`, `font` | from `business.json` |
| `client` | `id`, `name`, `contact`, `email`, `address` (list), `taxNumber` | from `data/clients.*` |
| `showTax`, `showDiscount` | booleans | hide the Tax column when the business charges none, the Discount column when no line has one |
| `items` | `[{ index, description, details, note, quantity, unit, unitPrice, discount, tax, net }]` | all strings, formatted; `index` counts from 0; `note` is the line note plus "Minimum charge" when the minimum applied; credit notes' amounts are negative |
| `totals` | `subtotal`, `taxes: [{ label, base, amount }]`, `total`, `raw: { subtotal, tax, total }` | `raw` holds exact decimals (`"4404.40"`) for checks and exports |
| `payment` | `{ lines, reference }` or `null` | invoices only |
| `footer` | string | |
| `labels` | the language's `layout/labels/<lang>.json` (without `$` notes) | |

After loading, an issued document also carries `frozen: { issuedOn, pdf, sha256 }` (never laid out again, so the layout never sees it).

## Money

All amounts are BigInt minor units (pence, cents) of the document's currency. Quantities keep 3 decimals, unit prices 4, percentages 3, all parsed from text without floating point. A line is `round(quantity × unit price)` to the minor unit, less `round(that × discount)`; if that's above zero and below `lineMinimum` for the currency, the line is the minimum. Tax is `round(sum of the lines at a rate × rate)` per rate (`"per-rate"`, the default), or rounded on each line and added up (`"per-line"`). Rounding is half away from zero. A credit note's prices are entered positive and negated. `tests/money.test.mjs` pins each rule.

## Numbering

`business.json` `documents.<type>.numbering` is a pattern: `{yyyy}` is the issue year, `{nnn}` a zero-padded sequence (more n's, more digits). `data/numbering.json` stores the last number issued per type (`npm run issue` moves it forward; never backwards). `src/numbering.mjs` parses numbers against the pattern, finds the next free one per year (after the stored number and every number in `data/`), and lists gaps (counting the stored number); `gapless: true` makes gaps a data problem.

## Issued documents

`npm run issue -- <number>` builds and verifies the document, then writes `archive/<number>.pdf` and `archive/<number>.json` (`number`, `type`, `issuedOn`, `pdf`, `sha256`, `source`: its rows from `data/` without file positions, `document`: the JSON above) and updates `data/numbering.json` (`src/archive.mjs`). The loader then uses `document` from the archive, reports a problem if the rows in `data/` differ from `source` or are gone, and if `data/numbering.json` is behind an issued number. The `issued` check compares each archived PDF with its SHA-256 and with the copy in `out/`.

## Import

`npm run import -- <export.csv>` (`src/import.mjs`) reads `data/import.json`, maps each export row to a line through templates (`{Column}`, `{Column:date}`, `[optional]`), matches clients, checks dates, numbers and currencies, skips rows whose id is already in a line's `source`, groups the rest into one document per client, numbers them, appends them to `data/documents.csv`, and puts the file back if the project doesn't load afterwards.

## Checks and markers

`layout/parts.typ` places `metadata` markers: `<cp-number>` in the header, one `<cp-line>` per item row (with its `index`), `<cp-total>` with the total string, `<cp-end>` at the very end. `src/verify.mjs` asks Typst where they landed (`typst eval 'query(<cp-line>)…' --in layout/document.typ`), so the checks (and `npm run issue`) can prove that each line is there once and in order, and that the printed total is the computed one and comes after the last line.
