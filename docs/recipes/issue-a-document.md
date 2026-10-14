# Issue a document once it has been sent

Use this when the user says they sent an invoice, quote or credit note ("I've emailed INV-2026-042 to Lumen"), or before any change that would otherwise alter documents they already sent (a new address, new rates, a new minimum, a layout change).

Until a document is issued it's a **draft**: it's worked out again from `business.json`, `data/` and the layout on every build, so any change shows up in it. Issuing freezes it.

## Steps

1. **Check what's still a draft:** `npm run list` shows `draft` or `issued <date>` for every document. Ask the user which drafts have actually been sent, if you don't know.

2. **Issue each sent document, in number order:**

   ```
   npm run issue -- INV-2026-042
   npm run issue -- INV-2026-042 INV-2026-043 --date 2026-10-14
   ```

   `--date` is the day it was sent (default: today), recorded in the archive. For a gapless type the command refuses to skip a draft with a lower number of the same year: issue that one first, or delete it if it was never sent (a draft's number isn't used yet).

   The document is built and checked once more (no Typst warnings, PDF/A, fonts embedded, every line and the total on the page), then:
   - `archive/<number>.pdf`: the PDF as sent;
   - `archive/<number>.json`: its rows from `data/` (`source`), the whole document as it was laid out (`document`: amounts, words, the user's details that day), the PDF's SHA-256 and the date;
   - `data/numbering.json`: the last number issued for its type, so the sequence never goes back (`numbering.md`).

3. **What changes from now on:**
   - `npm run build` copies the archived PDF to `out/`; it's never typeset again. `npm run preview` skips it.
   - Changing `business.json`, a client, a rate, `lineMinimum`, labels or the layout no longer affects it. Its rows in `data/` must stay exactly as they are (you may move them between `documents.csv` and `documents.json`; the values are what count).
   - A mistake in it is corrected with a credit note (`credit-notes.md`), never by editing it.

4. **Tell the user** to keep `archive/` in their backups (it's the record of what they sent), and record the habit in `docs/project.md` ("Sent documents: issued with `npm run issue` on the day they're sent").

Never edit or delete files in `archive/`, and never lower `data/numbering.json`. If a check reports that an archived file changed, restore it from their backup or version control.

## Verify

- `npm run list` shows the document as `issued <date>`.
- `npm run check` ends with `CODEPLATE CHECKS: PASS`; the `issued` step lists it with "rows and PDF unchanged".
- Try it (then undo): change its `unit_price` in `data/documents.csv`; `npm run check` fails in `data` with "was issued on … and its rows have changed since". Put the value back. Change the `footer` in `business.json` and rebuild: the issued PDF in `out/` is byte-for-byte the archived one (the `issued` step says so), while drafts show the new footer.
