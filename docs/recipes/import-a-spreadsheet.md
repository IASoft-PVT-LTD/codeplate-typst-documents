# Import the user's spreadsheet or another tool's export

Use this when the user's line items come from somewhere else: a time tracker or jobs spreadsheet they export every month, a shop's order export, or a one-off move of their old records.

The template has a one-command import: `npm run import -- <export.csv>`. `data/import.json` (the profile) says how the export's columns become documents. The sample's profile reads `data/imports/timesheet-2026-10.csv`, a time-tracker export that became `INV-2026-044`.

## Steps

1. **Get a sample.** Ask for the file (or a few rows). Look at it before deciding anything: the columns, the date format (`02/10/2026` is day-first or month-first? ask), the number format (`1,800.00`? `1.800,00`? a currency sign?), the separator (`,` or `;`), whether one row is one line item, which column identifies a row, what a blank means. Ask about anything ambiguous instead of guessing.

2. **Write the profile**, `data/import.json`:

   ```json
   {
     "type": "invoice",
     "dateFormat": "DD/MM/YYYY",
     "dateColumn": "Date",
     "decimalComma": false,
     "issued": "end-of-month",
     "id": "{Entry}",
     "clients": { "Wydawnictwo Lato": "lato" },
     "document": { "client": "{Client}", "currency": "{Currency}", "reference": "{PO}", "notes": "" },
     "line": {
       "description": "{Job}",
       "details": "{Date:date}[ · PO {PO}]",
       "quantity": "{Words}",
       "unit": "word",
       "unit_price": "{Rate}",
       "discount": "",
       "tax": "",
       "line_note": ""
     }
   }
   ```

   - Values are templates: `{Column}` is that column (by its header, any case), `{Column:date}` the column's date written for the client's language ("2 Oct 2026", "02.10.2026"), `[ … ]` is dropped when a column inside it is empty, other text is kept as is (`"word"`).
   - `dateFormat`: `DD`, `MM` and `YYYY` with any separator (`MM/DD/YYYY` for US exports). `decimalComma: true` when the export writes `12,5`. Amounts with thousands separators or currency signs are refused, with the line: ask the user to export plain numbers.
   - `issued`: the documents' date: `end-of-month` (of the latest row; needs `dateColumn`), `latest`, `today`, or a date. `--issued 2026-10-31` on the command line wins.
   - `id`: the column(s) that identify a row (`"{Entry}"`, `"{Order}-{Line}"`). Each imported line keeps it in the `source` column, so **running the same export again adds nothing**. With `""`, a fingerprint of the whole row is used instead: fine for exports without an id, but if the user edits a row after it was imported, the edited row imports again; say so.
   - `clients`: names in the export → client ids, when the export's name isn't the client's `id` or `name` exactly. An unknown client stops the import with its line: add the client to `data/clients.csv` first.
   - `document.currency`: if the export has a currency column, each row's must equal the client's currency (from `data/clients.csv`, or the business's); the import never converts.
   - `document.reference` / `notes`: taken from the client's rows; several different values are joined ("PO 1, PO 2").

3. **Try it without writing:**

   ```
   npm run import -- "C:\path\to\jobs-november.csv" --dry-run
   ```

   It prints the documents it would add: one per client (in the order of each client's first row), numbered after the last number in the series (`data/numbering.json` and `data/`), dated per `issued`. Problems are listed with the export's line numbers and nothing is written.

4. **Import:** the same command without `--dry-run`. It appends the rows to `data/documents.csv` (adding any column the file doesn't have yet), then loads the whole project; if that finds a problem, the file is put back as it was. It prints each new document's total. Then `npm run check` and look at the pages.

5. **Afterwards**, the documents are ordinary drafts: add a `notes` line, fix a description, delete a line (its row may then import again on the next run of the same export, so check with `--dry-run`). Once the user sends them: `npm run issue` (`issue-a-document.md`).

6. **Record the mapping** in `docs/project.md` (Data: the export's columns → fields, the command, where the monthly file comes from).

7. **One-off moves of old records.** For invoices that were already sent, keep their numbers exactly: write them into `data/documents.csv` by hand or with a profile whose rows carry the number (put old invoices in their own year, or issue them as they are with `npm run issue -- <number> --date <sent>` so they can't change). Then set `data/numbering.json` to the last one (`numbering.md`). If the old numbers don't fit the pattern, ask the user before changing `numbering` or `gapless`.

8. **Their data stays theirs.** Don't print or copy client details anywhere except `data/`. If the export has columns you don't need (card numbers, personal notes), don't map them.

An export that isn't CSV (JSON from an API, an `.xlsx`): ask the user to export CSV, or write a small converter to CSV with Node built-ins, then import that. Money never gets calculated in a converter (rule 1): copy quantities and prices as plain decimals.

## Verify

- `npm run import -- <export> --dry-run` shows the documents the user expects (clients, number of lines, numbers, date).
- `npm run check` ends with `CODEPLATE CHECKS: PASS`. The `data` step names any problem with its line.
- `npm run list` shows the totals the user expects; check one line by hand (quantity × price, and the minimum if one applies).
- Running the import a second time prints "Nothing new to import."
- `npm run preview` on one imported document: the descriptions, details and dates read right in the client's language.
