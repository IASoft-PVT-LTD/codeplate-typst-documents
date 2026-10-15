# Typst Invoices & Quotes: agent brief

You are setting up the user's invoices and quotes, starting from this template. This brief tells you how the project works, what to ask before changing anything, the rules that keep the documents correct, and how to check every change. Read it all once. Then follow **Interview** before your first edit.

## Start here

This folder turns a spreadsheet of line items into branded PDF invoices, quotes and credit notes. The sample business is **Fernhill Studio** (a placeholder design studio in Bristol) with four clients (one billed in German), four invoices (one already issued), a credit note and a quote:

- **Data in, PDFs out.** `business.json` says who the user is (name, address, tax, numbering, payment details, brand colours, other languages, a minimum charge per line). `data/clients.csv` lists who they bill (and in which language). `data/documents.csv` has one row per line item; rows with the same number make one document. `data/documents.json` holds the same kind of documents as JSON, for data exported from another app. Both are read.
- **Node does the money, Typst does the page.** `src/` (plain Node, no packages to install) reads and checks the data, does all the money math with exact integers (`src/money.mjs`: per-line rounding, tax per rate, discounts, minimum charges, unit prices like £0.0875 per word, any currency) and writes one JSON file per document. `layout/document.typ` (Typst) lays it out: logo, addresses, a details box, an items table whose header repeats on every page, totals, notes, payment details, page numbers.
- **Sent documents are frozen.** Once the user has sent a document, `npm run issue -- <number>` keeps its PDF and data in `archive/`; from then on nothing (a new address, a new rate, a layout change) can change it, and the checks fail if its rows change. Corrections are credit notes.
- **The output** is a PDF/A-3b per document in `out/` (fonts embedded, archivable, the same bytes on every computer) and, when you ask for it, a PNG per page in `shots/` so you can look at it.

```
npm run build                       every document -> out/<number>.pdf (and removes PDFs of documents that are gone)
npm run build -- INV-2026-042       just that one
npm run preview                     a PNG per page of every draft -> shots/<number>-p1.png …
npm run list                        every document, its client, total and status (draft or issued)
npm run next -- invoice             the next free invoice number
npm run issue -- INV-2026-042       after the user has SENT it: freeze it in archive/
npm run import -- export.csv        line items from another program's export (data/import.json maps it)
npm run export                      out/summary.csv for bookkeeping
npm run remove-sample               list what the Fernhill sample removal would do (-- --yes to do it)
npm run watch -- INV-2026-042       rebuild that PDF whenever a layout file changes
```

**Verify any change** with one command from this folder. It must end with `CODEPLATE CHECKS: PASS`:

```
npm run check
```

It needs **Node 22 or newer** and **Typst 0.15** (no `npm install`: there are no packages). Find Typst before anything else:

1. **`npm run typst`** prints the Typst it would use, or how to install it. It looks at the `TYPST` environment variable, then PATH, then the usual install folders (winget's, Scoop, Chocolatey, Homebrew, `~/.local/bin`, `~/.cargo/bin`), and accepts only 0.15.x.
2. **None found?** Install it: Windows `winget install --id Typst.Typst -e --version 0.15.1`; macOS `brew install typst` (check that `typst --version` says 0.15, otherwise use the release archive); Linux: unpack `typst-x86_64-unknown-linux-musl.tar.xz` from https://github.com/typst/typst/releases/tag/v0.15.1 into `~/.local/bin`. A fresh winget install is found even before PATH updates.
3. **Another version installed?** Typst's syntax and layout change between minor versions. Install 0.15.1 next to it and set `TYPST` to its full path.

Write the path in `docs/project.md` once it works, so later sessions don't search again.

**Typst changes quickly, and some of your training data is from older versions** (`locate`/`style` callbacks and `#set` rules that were renamed). The reference for the installed version is https://typst.app/docs (check the version picker). When the checks report a Typst error, read its message and fix the cause; **Common pitfalls** lists the usual ones.

## Interview

Before you change anything, read `docs/project.md`.

- **If it still contains `<!-- codeplate:project-stub -->`, interview the user first.** Ask only what you need, in one short message, and suggest defaults so they can say "yes":
  1. **Their business.** Trading name and legal name, address, email, phone, website, company or registration number if they have one. A logo (SVG is best; a PNG or JPEG of at least 600 px wide works)? Brand colours (one main, one accent)?
  2. **Tax.** Do they charge VAT, GST or sales tax? Their tax number and the rates they use (e.g. 20% standard, 5% reduced, 0%). Or are they not registered, so invoices show no tax at all? Prices are entered **before tax**. You set up what they tell you; you don't give tax advice (say so if they ask what they *should* charge, and suggest they check with an accountant).
  3. **Money and language.** Their currency and locale (e.g. GBP and en-GB, EUR and de-DE, USD and en-US), A4 or US Letter, and the language of the documents. Do some clients pay in another currency, or want documents in another language? A minimum charge per job or line?
  4. **Numbering.** How are their invoices numbered today, and what was the **last number they sent**? The next invoice must follow it (`numbering.md`). Quotes too? Credit notes?
  5. **Terms.** Payment terms (14 or 30 days?), how long quotes are valid, the payment details to print (bank transfer details, a payment link), a closing line.
  6. **Their data.** Where do their line items live today: a spreadsheet, an export from another tool (a time tracker, a jobs list), or nowhere yet? If they export them every month, ask for a sample and set up the one-command import (`import-a-spreadsheet.md`).

  Then replace the stub in `docs/project.md` with their answers as short decisions, and remove the marker. Never write passwords or online-banking logins anywhere; bank details that appear on invoices (account name, sort code, IBAN) are fine in `business.json`.
- **Otherwise, the project has started.** `docs/project.md` holds the decisions made so far. Follow them, and add new decisions as the user makes them. This file is how the next session knows what was agreed.

Work in small steps: one change, `npm run check`, look at the pages (**Seeing your work**), then the next. Usual first steps: `npm run remove-sample -- --yes` (`remove-the-sample.md`), their details and logo in `business.json` and `assets/` (`rebrand.md`), their tax, their last number sent in `data/numbering.json` (`numbering.md`), then their clients and documents (`add-a-document.md` or `import-a-spreadsheet.md`).

`README.md` and `codeplate.json` describe the template. Once the user's own setup works, rewrite `README.md` for them (how they make an invoice), and leave `codeplate.json` and `LICENSE.md` in place. `LICENSE.md` (the CodePlate Free License) asks for the credit "Built with CodePlate (codeplate.io)" in the documentation of the project if they share or publish it. **Keep that line in `README.md`**; the `credit` check looks for it. Invoices and quotes they send to clients are their own documents and don't need it.

## Architecture

Data flows one way: `business.json` + `data/` → `src/load.mjs` (checks everything, does the math, formats amounts and dates per language) → `out/.data/<number>.json` → `layout/document.typ` (Typst) → `out/<number>.pdf`. Issued documents skip all of it: they are read from `archive/` as they were sent. See `docs/architecture.md` for the JSON every layout part receives.

| Path | What lives there |
|---|---|
| `business.json` | **Who the user is**: names, address, contacts, `logo`, `brand` (colours, font family), `language`, `locale`, `currency`, `languages` (per other language: `locale`, and its `tagline`, `registration`, `taxLabel`, `payment`, `footer`), `tax` (label, number, named `rates`, `default`, `rounding`), `lineMinimum` (a minimum charge per line, per currency), `documents` (per type: `numbering` pattern, `dueDays` or `validDays`, `gapless`), `payment` (lines, reference), `footer`. |
| `data/clients.csv` | One client per row: `id` (used in documents), `name`, `contact`, `email`, `address` (lines separated by `|`), `currency` (optional, else the business's), `tax_number`, `tax` (their usual rate name, e.g. `zero` for reverse charge; optional), `language` (optional, else the business's). A `data/clients.json` list works too. |
| `data/documents.csv` | **One row per line item**: `number`, `type`, `client`, `issued`, `due`, `reference`, `corrects` (credit notes: the invoice), `notes`, `currency` (these only on the first row of a document), then `description`, `details` (a second, smaller line), `quantity`, `unit`, `unit_price` (before tax, no currency sign or thousands separator), `discount` (percent), `tax` (a rate name from `business.json`; empty = the client's, else the default), `line_note` (an italic note under the line), `source` (written by the import: the export row it came from). |
| `data/documents.json` | The same documents as JSON (`items: [{ description, details, quantity, unit, unitPrice, discount, tax, note, source }]`). |
| `data/numbering.json` | The last number **issued** per document type. `npm run issue` updates it; you set it once to the user's last number sent (`numbering.md`). Never lower it. |
| `data/import.json`, `data/imports/` | How another program's export maps to documents (`import-a-spreadsheet.md`); the sample's example export. |
| `archive/` | Issued documents: `<number>.pdf` (what was sent) and `<number>.json` (its rows, the computed document, the PDF's SHA-256). Written by `npm run issue`; **never edit or delete these files**. |
| `src/load.mjs` | Reads and checks the data; builds each document's JSON. **Every rule about the data lives here.** |
| `src/money.mjs` | Exact money math with BigInt minor units; rounding; minimum charges; formatting with `Intl`. |
| `src/archive.mjs`, `src/import.mjs`, `src/sample.mjs` | Issuing and the numbering store; the import; removing the sample. |
| `src/csv.mjs`, `src/dates.mjs`, `src/numbering.mjs` | CSV reading and writing (quotes, line breaks, semicolons, BOM); dates (ISO, and exports' formats); number patterns like `INV-{yyyy}-{nnn}`, the next number, gaps. |
| `src/typst.mjs`, `src/verify.mjs`, `src/cli.mjs` | Running Typst (finding it, the shared arguments, PDF/PNG/eval, removing stale outputs); what a built PDF must pass; the npm commands. |
| `layout/document.typ` | The page: settings and the order of the parts. |
| `layout/parts.typ` | The parts: `header`, `parties`, `items`, `totals`, `closing`, `page-header`, `page-footer`. Each carries `<cp-…>` markers the checks read. |
| `layout/theme.typ` | Paper size, margins, type sizes, greys. Brand colours come from `business.json`. |
| `layout/labels/<lang>.json` | Every word printed on the page, one file per language: `en` (main), and `de`, `fr`, `es`, `pl`, which carry a `$review` note: **not yet checked by a native speaker**. |
| `assets/` | `fonts/` (Inter, OFL, with `OFL.txt`) and `logo.svg`; all listed in `assets.json`. |
| `checks/run.mjs`, `checks/shared/` | The checks; `shared/` is CodePlate's tool finder, check runner and `assets.json` check (don't edit it). |
| `tests/` | `node --test` unit tests for the money, CSV, dates, numbering, loading, issuing, credit notes, languages, the import and removing the sample. They run on `tests/fixtures/sample/`, a frozen copy of the Fernhill sample, so they keep passing when the user's own data replaces it; leave that folder alone. |

## Rules

1. **Money math happens only in `src/money.mjs`, with integers.** Never compute an amount in Typst, in a spreadsheet formula you paste in, in an import script, or with JavaScript floats (`0.1 + 0.2` is not `0.3`). Typst receives finished strings (`£4,404.40`). A new kind of amount (a deposit, a shipping line, prices including tax) is a function in `money.mjs` with a test in `tests/money.test.mjs`.
2. **Numbers in the data are plain decimals.** `1800.00`, never `£1,800.00` or `1.800,00` (except in a semicolon-separated CSV, where `1800,00` is read). Dates are `YYYY-MM-DD`. The loader rejects anything else with the file and line; fix the data, don't loosen the parser. Exports in other formats go through `npm run import`, which converts them.
3. **Numbers are permanent.** Never renumber, reuse or delete a document that was sent: the `gapless` check fails on gaps (many tax authorities require an unbroken sequence), and `data/numbering.json` keeps the last number issued so the sequence never goes back. Get new numbers from `npm run next -- invoice`. To correct a sent invoice, issue a credit note (`credit-notes.md`) and, if needed, a new invoice.
4. **Issue what was sent; never touch it after.** When the user says they sent a document, run `npm run issue -- <number>` (`issue-a-document.md`). An issued document is read from `archive/`, so settings, rates, minimums, labels and the layout no longer affect it. Never edit its rows, its `archive/` files or `data/numbering.json` to change it: the `data` and `issued` checks fail. Drafts follow every change, so before a change to `business.json` or the layout, check with `npm run list` that what the user already sent is issued.
5. **The layout only lays out.** `layout/*.typ` reads the document JSON and draws it; it never decides what is charged. Every word on the page comes from `layout/labels/` (or the data), so a new language is a new labels file, not edits in the layout.
6. **Keep the `<cp-…>` markers.** Each line item row carries one `<cp-line>`, the total one `<cp-total>`, the header one `<cp-number>`, and `<cp-end>` closes the document. The checks read them to prove every line and the right total reached the page. If you move a part, move its marker with it.
7. **Fonts come only from `assets/fonts/`.** Typst runs with `--ignore-system-fonts --ignore-embedded-fonts`, so a document looks the same on every computer and every font's licence is known. A new font must be OFL (or similar) with its licence file next to it, listed in `assets.json` and `CREDITS.md` (`change-fonts.md`). Never use a font from the user's system you can't ship.
8. **Every asset is listed.** Every file under `assets/` has an entry in `assets.json` (path, size for SVG and PNG images, use, licence, credit), and the `assets` check compares them. For the user's own logo, keep `license: "CodePlate-original"` (the value for "no third-party licence") and set `credit` to their business; record it in `CREDITS.md`. Only use images the user owns or made, or CC0 ones.
9. **No Typst warnings.** The checks fail on any warning (an unknown font, a missing glyph, a missing image), because a warning usually means a page that looks wrong. Fix the cause.
10. **Use only what ships.** Plain Node built-ins and Typst; no npm packages, no Typst Universe packages (they would need the network at build time and some are GPL). If something seems to need a package, write the small piece you need.
11. **Never weaken a check to make it pass.** If a check fails, fix the cause. If the user deliberately changed something a test covers (rounding per line instead of per rate), update that test to the new rule and say so.
12. **You don't give tax or legal advice, and you don't vouch for translations.** Set up the rates, notes and wording the user asks for. If they ask what is required (reverse charge wording, e-invoicing rules, what a credit note must say), say what you know is commonly required, say it may have changed, and suggest they confirm with an accountant or their tax authority. Labels in another language must be checked by a native speaker before documents go out: say so, and keep the file's `$review` note until they have.

## Verify

After every change:

1. **Run the full `npm run check`, every time.** The last line must be `CODEPLATE CHECKS: PASS`. It runs these steps (a few seconds) and lists each one's result and time:
   - `tools`: Typst 0.15 is found
   - `assets`: `assets.json` matches the files in assets/ (fonts, their licence file, the logo)
   - `data`: every document loads: clients exist, numbers match their pattern with no gaps where `gapless` is on (counting `data/numbering.json`), dates and amounts parse, tax names are known, labels exist for every language in use, credit notes correct an issued invoice by no more than its total, issued documents' rows are unchanged, imported rows aren't in twice
   - `unit`: `node --test tests/`
   - `pdf`: every draft compiles to PDF/A-3b with **no warnings**; fonts embedded; under 1 MB; the first draft builds byte-for-byte identical twice; issued documents are copied from `archive/`; PDFs and page images of documents that no longer exist are removed
   - `issued`: every archived PDF is still the one that was sent (SHA-256), and `out/` has exactly that file
   - `layout`: every line item reached the page in order, the printed total equals the computed total and comes after the last line, and the PDF has no blank page at the end
   - `preview`: a low-resolution PNG of every page of every draft in `shots/`
   - `credit`: the credit line is still in `README.md`
   - `budget`: the whole run stays under the 30 seconds in `codeplate.json`

   While you work, a quicker loop is fine: `npm test`, `npm run build -- <number>`, or `node checks/run.mjs --skip=unit,preview`. Then the full `npm run check` before you report the change. When a step fails, the end of its output is repeated above the summary.
2. **Look at the pages.** Run `npm run preview -- <number>` for every document you changed and open the PNGs (**Seeing your work**). The checks prove the numbers; only your eyes catch a clipped address, a wrapped total or a logo that's too big.
3. **Tell the user** what changed, show the page images, and give the PDF paths. Say what the checks can't see: how the PDF looks in their client's viewer or on paper (print one), whether the wording meets their tax rules, and whether a translation reads right. Remind them to run (or ask you to run) `npm run issue` for each document they send.

## Recipes

Step-by-step guides for common requests. Follow the matching recipe when one fits; each ends with its own verification.

- `docs/recipes/remove-the-sample.md`: take the Fernhill sample out in one command, before the user's own data goes in.
- `docs/recipes/rebrand.md`: their name, address, logo, colours, payment details and closing line.
- `docs/recipes/numbering.md`: continue from the last number they sent, change the pattern, a new year, what the numbering store is.
- `docs/recipes/add-a-document.md`: a new invoice or quote: the next number, the rows, build and look.
- `docs/recipes/issue-a-document.md`: the user sent it: freeze it, and what that changes.
- `docs/recipes/credit-notes.md`: correct an issued invoice with a credit note.
- `docs/recipes/import-a-spreadsheet.md`: their monthly export (time tracker, jobs list, shop) in one command: `data/import.json`, re-runs that add nothing, one-off migrations.
- `docs/recipes/minimum-charges-and-line-notes.md`: a minimum charge per line, per currency; a note under a line.
- `docs/recipes/tax-setups.md`: VAT/GST/sales tax, several rates, no tax at all, per-line rounding, a client's usual rate, reverse-charge and exemption notes.
- `docs/recipes/languages-and-currencies.md`: documents in another language for some clients, adding a language, a client who pays in another currency, US Letter paper.
- `docs/recipes/change-the-layout.md`: move or restyle parts, add a column (a date or SKU per line), a signature block, a second page of terms.
- `docs/recipes/change-fonts.md`: another OFL font family, or a second one for headings.
- `docs/recipes/add-a-document-type.md`: receipts, pro forma invoices, deposits and "amount paid".
- `docs/recipes/e-invoicing.md`: where to start when a client or country needs a structured e-invoice (Factur-X/ZUGFeRD, XRechnung, Peppol).

`docs/customization-map.md` answers "I want to change X — which file?" for everything else.

## Seeing your work

You can't open a PDF viewer, but you can look at every page as an image:

```
npm run preview                         every draft → shots/<number>-p1.png, -p2.png …
npm run preview -- INV-2026-042         just that one
```

- **Open the PNGs and look** after every visible change. Check: nothing is cut off or overlapping, long descriptions and addresses wrap cleanly, amounts line up in their column, the logo is a sensible size, the totals sit together, the page footer and "Page 1 of 2" are right, and a multi-page document repeats the table header. For another language: no English left on the page.
- Issued documents aren't typeset again, so they have no preview: what was sent is `archive/<number>.pdf`. If the user asks what an issued invoice looked like, preview a draft with the same rows, or tell them the PDF's path.
- `npm run check` also leaves low-resolution PNGs of every draft's pages in `shots/` (72 ppi); `npm run preview` makes sharper ones (110 ppi).
- The PDFs are in `out/`. Typst draws the PNGs from the same layout, so they match the PDF.
- For a layout change, test with the longest document (`INV-2026-043` in the sample spans two pages), the shortest, and one in another language (`INV-2026-044`, German).

## Common pitfalls

- **Old Typst syntax.** Things that changed: use `context` (not `locate(loc => …)`) for page numbers and queries; `counter(page).final()` returns an array (`.first()`); `#set` rules can't be undone, so scope them in `{ … }`; `table.header(repeat: true, …)` and `table.cell(breakable: false)` exist; read https://typst.app/docs for the installed version before using an API you're unsure of.
- **Markup vs code.** In a `{ … }` code block, text needs `[…]` or a string; in `[…]` markup, code needs `#`. A stray `#` or unescaped `*`, `_`, `$`, `@`, `<` in text from the data is fine (the data arrives as strings, not markup), but in a `.typ` file you write by hand, escape them (`\$`).
- **Missing fields.** JSON `null` arrives as `none`; `doc.at("field", default: none)` reads a field that may be missing. Add a new field in `src/load.mjs` for every document (even as `""`), so the layout never has to guess. Issued documents keep the fields they had when they were issued, but they are never laid out again, so a new field never breaks them.
- **"It changed after I issued it."** It didn't: `npm run build` copies issued PDFs from `archive/`. If the user wants an issued document different, that's a credit note and a new invoice, never an edit.
- **Paths.** Typst runs with the project folder as its root, so files are `/assets/logo.svg`, never `C:\…` or `../`. `src/load.mjs` turns `business.json`'s `logo` into that form.
- **Fonts "not found".** A warning like `unknown font family: x` means `brand.font` doesn't match a font file's family name in `assets/fonts/` (the family inside the file, e.g. "Inter", not the file name). `npm run typst` finds the binary; `typst fonts --font-path assets/fonts --ignore-system-fonts` lists the families it sees.
- **Excel and CSV.** Excel may save with semicolons (read fine), add a BOM (fine), and **turn dates into 01/10/2026 or numbers into 1,800.00** (rejected: format those columns as text, or use `YYYY-MM-DD` and plain numbers). Fields with commas or line breaks need "quotes"; Excel adds them when it saves. A recurring export with its own date format goes through `npm run import` (`dateFormat`, `decimalComma`).
- **Running Typst by hand.** `typst compile layout/document.typ` alone fails ("no document data"): the layout needs the JSON the loader writes. Use `npm run build`, `npm run preview` or `npm run watch`.
- **Windows paths in Git Bash:** keep the quotes in `npm test`'s glob (`"tests/*.test.mjs"`), as the npm script does. In Git Bash, `MSYS_NO_PATHCONV=1` stops it rewriting `/out/...` arguments if you call `typst` by hand.
