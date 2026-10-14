# Remove the sample

Use this once, when the user's own business replaces Fernhill Studio: usually right after the interview, before their clients and documents go in.

## Steps

1. **See what it would do:**

   ```
   npm run remove-sample
   ```

   It lists everything, without changing anything:
   - the sample's rows in `data/documents.csv` and `data/documents.json` (INV-2026-041 to 044, CN-2026-001, QUO-2026-007) and its clients in `data/clients.csv` (harbour-finch, lumen-books, tidewater, kranich);
   - the sample's issued documents in `archive/` and their last number in `data/numbering.json`;
   - the example export `data/imports/timesheet-2026-10.csv` and the sample client name in `data/import.json` `clients` (the rest of the import profile stays, as a starting point);
   - the screenshots in `docs/media/`, the manifest's `media` list in `codeplate.json`, and the screenshot block in `README.md`;
   - the sample's PDFs, data files and page images in `out/` and `shots/`.

   Rows and clients the user already added are kept.

2. **Do it:**

   ```
   npm run remove-sample -- --yes
   ```

   Running it again does nothing.

3. **What it leaves for you:**
   - `business.json` and `assets/logo.svg` are still Fernhill's: `rebrand.md` replaces them (and the `languages.de` block: keep it only if the user has German clients).
   - `data/numbering.json` is empty: set the user's last number sent (`numbering.md`).
   - `layout/labels/`: delete the language files the user won't use, if they like (`en.json` or their main language stays).
   - `tests/fixtures/sample/` stays: it's the frozen copy the unit tests use, not the user's data.
   - `npm run check` passes with no documents ("No documents yet"); add theirs next (`add-a-document.md`, `import-a-spreadsheet.md`).

4. **Record it** in `docs/project.md` (Log: "removed the sample").

## Verify

- `npm run remove-sample` says "The sample is already gone."
- `npm run check` ends with `CODEPLATE CHECKS: PASS`.
- `grep -ri fernhill data archive docs/media README.md` finds nothing (`business.json` until you rebrand it); `npm run list` shows only the user's documents; `out/` has no sample PDFs.
