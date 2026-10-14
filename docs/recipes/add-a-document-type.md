# Receipts, pro forma invoices, deposits and "amount paid"

Use this when the user needs a document the sample doesn't have: a receipt, a pro forma invoice, a deposit invoice, or an invoice that shows what was already paid. Credit notes are built in: `credit-notes.md`.

## Steps

1. **A new type** (receipt, pro forma):
   - `business.json` `documents`: add it with its own numbering, e.g. `"receipt": { "numbering": "REC-{yyyy}-{nnn}", "gapless": true }`. Add `dueDays` if it has a payment due date (a pro forma might), `validDays` if it expires.
   - `layout/labels/`: a label for the type (`"receipt": "Receipt"`) in **every** language file, plus any new words (the `data` check names a missing one).
   - `src/load.mjs` `buildDocument`: payment details only print for `type === 'invoice'`; decide per type (a pro forma usually shows them, a receipt doesn't). The "Bill to" heading is chosen in `parties` and the total's label in `totals` (`layout/parts.typ`); pick the right ones for the new type.
   - `data/numbering.json` gets the type's last issued number when you first `npm run issue` one; nothing to add by hand.
   - Add a test in `tests/load.test.mjs` that a document of the new type loads and gets its label.

2. **Deposits and amount paid** ("50% upfront", "less deposit paid"):
   - Add a `paid` field to the document (CSV first row / JSON, and `HEADER_FIELDS` in `src/load.mjs`), parsed with `parseDecimal` in `buildDocument` (currency decimals, not negative).
   - In `src/money.mjs`, add `balance = total - paid` (a function with a test: paid 0, paid in full, overpaid is an error).
   - In `totals` in `layout/parts.typ`, after the total: an "Amount paid" line and a "Balance due" line in the total's style, and move the `<cp-total>` marker to whichever amount is "the" total the user expects the client to pay; update `probeLayout` in `src/verify.mjs` if you change which string it compares (`doc.totals.total` vs a new `doc.totals.balance`).
   - A deposit invoice (an invoice *for* 50%) is simpler: one line, "Deposit: 50% of quote QUO-2026-007", for half the amount.

3. **Record it** in `docs/project.md`.

## Verify

- `npm test` passes, including the new tests.
- `npm run check` ends with `CODEPLATE CHECKS: PASS`; the `data` step lists the new document with the right total.
- `npm run preview` on the new document: the title, numbering, wording, totals and payment block (or its absence) are right for its type, in every language a client uses.
