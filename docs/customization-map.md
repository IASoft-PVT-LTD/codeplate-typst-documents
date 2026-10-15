# Customization map

"I want to change X — which file?"

| I want to change… | Edit | Notes |
|---|---|---|
| Take the Fernhill sample out | `npm run remove-sample -- --yes` | `remove-the-sample.md` |
| Business name, address, email, phone, website, registration line | `business.json` | `rebrand.md` |
| The logo | `assets/logo.svg` (or a PNG/JPEG), `business.json` `logo`, `assets.json`, `CREDITS.md` | `rebrand.md` |
| Brand colours | `business.json` `brand.color`, `brand.accent` | hex like `#2f5d50` |
| The font | `assets/fonts/`, `business.json` `brand.font`, `assets.json`, `CREDITS.md` | `change-fonts.md`; OFL fonts only |
| Payment details, payment reference wording | `business.json` `payment` (and `languages.<lang>.payment`) | `{number}` becomes the invoice number |
| Closing line ("Thank you…") | `business.json` `footer` (and `languages.<lang>.footer`) | |
| Payment terms (days), quote validity | `business.json` `documents.invoice.dueDays`, `documents.quote.validDays` | a `due` date in the data overrides them |
| Invoice/quote/credit note number format | `business.json` `documents.<type>.numbering` | `numbering.md`; `{yyyy}`, `{nnn}`; never renumber sent documents |
| Continue from the last number the user sent | `data/numbering.json` | `numbering.md`; never lower it |
| Freeze a document that was sent | `npm run issue -- <number>` | `issue-a-document.md`; writes `archive/` |
| Correct an invoice that was sent | a `credit-note` in `data/documents.csv` (`corrects`) | `credit-notes.md` |
| Tax label, number, rates, rounding; no tax | `business.json` `tax` | `tax-setups.md` |
| A client's usual tax rate (reverse charge) | `data/clients.csv` `tax` | `tax-setups.md` |
| A minimum charge per line | `business.json` `lineMinimum` | `minimum-charges-and-line-notes.md` |
| A note under one line | `data/documents.csv` `line_note` (JSON `note`) | `minimum-charges-and-line-notes.md` |
| Currency and number/date format | `business.json` `currency`, `locale`; a client's `currency` | `languages-and-currencies.md` |
| Documents in another language for some clients | `data/clients.csv` `language`, `business.json` `languages`, `layout/labels/<lang>.json` | `languages-and-currencies.md`; non-English label files need a native speaker's review |
| Words on the page ("Invoice", "Payment due") | `layout/labels/<lang>.json` | one file per language, the same keys in each |
| Paper size, margins, type sizes, greys | `layout/theme.typ` | |
| Order of the blocks on the page | `layout/document.typ` | |
| What a block looks like (header, addresses, table, totals, payment) | `layout/parts.typ` | `change-the-layout.md`; keep the `<cp-…>` markers |
| A new column per line (date, SKU) | `data/documents.csv` header, `src/load.mjs` (`readDocuments`, `buildDocument`), `layout/parts.typ` `items` | `change-the-layout.md` |
| A new kind of document (receipt, pro forma) | `business.json` `documents`, `layout/labels/`, maybe `layout/parts.typ` | `add-a-document-type.md` |
| Deposits, amount paid, balance due | `src/money.mjs`, `src/load.mjs`, `layout/parts.typ` `totals` | `add-a-document-type.md` |
| Clients | `data/clients.csv` (or `.json`) | `id` is what documents refer to |
| Invoices and quotes | `data/documents.csv` (or `.json`) | `add-a-document.md` |
| A monthly import from a time tracker or spreadsheet | `data/import.json`, `npm run import -- <file>` | `import-a-spreadsheet.md` |
| The bookkeeping export columns | `src/cli.mjs` `export` | |
| What the checks assert | `checks/run.mjs`, `src/verify.mjs`, `tests/` | never weaken a check to pass |
