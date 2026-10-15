# Minimum charges and line notes

Use this when the user has a minimum fee per job or line ("I charge at least £35 for any job"), or wants a short remark under a line ("Agreed by email on 22 September", "Rush rate").

## Steps

1. **A minimum charge per line**, per currency, in `business.json`:

   ```json
   "lineMinimum": { "GBP": "35.00", "EUR": "40.00", "PLN": "150.00" }
   ```

   Plain decimals with no more decimals than the currency has. A line whose amount (after its discount) is above zero but below the minimum for the document's currency is charged the minimum, and prints "Minimum charge" (the `minimumApplied` label; "Mindestbetrag" in German…) in italics under it. Tax is worked out on the charged amount. Free lines (price 0) and credit notes are never raised. A currency with no entry has no minimum (the checks warn once, so you notice a missing one). The rule is `applyMinimum` in `src/money.mjs`; `tests/money.test.mjs` pins under, at and over the minimum.

   **Before you add or change it**, tell the user it changes every *draft* that has a line under the minimum, and check with `npm run list` that every document they already sent is `issued` (issued ones never change: `issue-a-document.md`). Name the drafts whose totals change.

   Wording: if the user wants different words ("Minimum fee"), change `minimumApplied` in each `layout/labels/<lang>.json` in use.

   A different rule (a minimum per document rather than per line, a minimum only for some clients) is a new function in `src/money.mjs` with its test, applied in `buildDocument` in `src/load.mjs`; ask exactly what the rule is first.

2. **A note under one line:** the `line_note` column in `data/documents.csv` (`note` in a JSON item), e.g. `Agreed by email on 22 September`. It prints in small italics under the line's `details`. If the minimum also applies, both show, joined by " · ". For an import, map it in `data/import.json` `line.line_note` (`import-a-spreadsheet.md`).

   `details` is for describing the work (a second line); `line_note` is a remark about the charge. Use whichever the user means.

3. **Record it** in `docs/project.md` (Terms: the minimum per currency; the date it started).

## Verify

- `npm test` passes (`tests/money.test.mjs` and `tests/load.test.mjs` cover the minimum).
- `npm run check` ends with `CODEPLATE CHECKS: PASS`.
- `npm run list`: drafts with a line under the minimum have the new totals; issued documents keep theirs. Check one line by hand: quantity × price < minimum → the minimum.
- `npm run preview` on a document with a raised line: the amount is the minimum and "Minimum charge" (in the client's language) is under the line; a line note shows in italics under its line.
