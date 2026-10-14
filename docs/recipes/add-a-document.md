# Add an invoice or a quote

Use this when the user asks for a new invoice or quote ("invoice Lumen Books for the two covers", "quote the café for a menu redesign"). For many at once from an export, use `import-a-spreadsheet.md`; to correct one that was sent, `credit-notes.md`.

## Steps

1. **The client.** Find their `id` in `data/clients.csv`. A new client gets a row: `id` (short, lowercase, dashes: `blue-door-bakery`), `name`, `contact`, `email`, `address` (lines separated by `|`, the whole field in quotes if it has a comma), `currency` (only if not the business's), `tax_number` (if they gave one), `tax` (their usual rate, only if not the default: e.g. `zero` for reverse charge), `language` (only if not the business's: `languages-and-currencies.md`).

2. **The number.** `npm run next -- invoice` (or `-- quote`) prints the next free number for this year, after the last one issued (`data/numbering.json`) and the ones in `data/`; `npm run next -- invoice 2027-01-04` for another date's year. Never pick a number by hand or reuse one (rule 3).

3. **The rows** in `data/documents.csv`, one per line item, all with the same `number`. On the **first row only**: `type` (`invoice`, `quote`), `client`, `issued` (`YYYY-MM-DD`; today's date unless the user says otherwise), `due` (only to override the usual terms; for a quote it's the "valid until" date), `reference` (their PO or project name), `notes`, `currency` (only to override the client's). On every row: `description`, `details` (optional second line), `quantity`, `unit` (`day`, `hour`, `word`, `item`… or empty), `unit_price` (before tax, plain decimal: `450`, `0.0875`), `discount` (percent, e.g. `10`, or empty), `tax` (a rate name from `business.json`, or empty for the client's usual rate or the default), `line_note` (optional remark under the line). Leave `corrects` (credit notes only) and `source` (written by the import) empty.

   Keep the rows of one document together and in the order the user wants them printed. Put the new document after the existing ones. A line under the business's `lineMinimum` is charged the minimum (`minimum-charges-and-line-notes.md`).

4. **Or JSON.** If the data comes from another program, add it to `data/documents.json` instead (see the sample quote there): the same fields, items as a list, `unitPrice` instead of `unit_price`, `note` instead of `line_note`.

5. **Build and look:** `npm run build -- <number>` then `npm run preview -- <number>`, and open the PNGs.

6. **Tell the user** the number, the total, and the PDF path (`out/<number>.pdf`). It's a draft until they send it: ask them to tell you when they have, then `npm run issue -- <number>` (`issue-a-document.md`).

## Verify

- `npm run check` ends with `CODEPLATE CHECKS: PASS`: the `data` step lists the new document and its total; `layout` confirms every line and the total are on the page.
- The total in `npm run list` is what the user expects (check one line by hand: quantity × price, less discount, or the minimum).
- The preview shows the right client, dates, lines and total, in the client's language, with nothing cut off.
