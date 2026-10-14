# Credit notes

Use this when an issued invoice was wrong (overcharged, a job cancelled, a discount agreed later) and the user needs to give some or all of it back. An issued invoice is never edited (rule 4): the correction is a credit note that refers to it.

The sample has one: `CN-2026-001` credits one packaging illustration from the issued `INV-2026-041`.

## Steps

1. **The invoice must be issued.** `npm run list` must show it as `issued`. If it was sent but isn't issued yet, issue it first (`npm run issue -- <number>`, `issue-a-document.md`). If it was never sent, don't write a credit note: correct the draft itself.

2. **The type.** `business.json` `documents` has `"credit-note": { "numbering": "CN-{yyyy}-{nnn}", "gapless": true }` (a series of its own; change the pattern to the user's). If the user removed it, add it back. Every language in use needs a `credit-note` label (all shipped label files have one).

3. **The number:** `npm run next -- credit-note`.

4. **The rows** in `data/documents.csv`, like an invoice (`add-a-document.md`), with:
   - `type`: `credit-note`; `client`: the invoice's client;
   - `corrects`: the invoice number (it prints as "Corrects invoice INV-2026-041" in the details box);
   - `issued`: today, never before the invoice's date;
   - lines for **what is credited, entered as positive amounts**: e.g. 500 words at `0.38`, or the cancelled line as it was on the invoice. The credit note prints them, the tax and the total as negative amounts ("Total credited -£456.00"). Use the original lines' tax rates (and the same currency: the check insists).
   - `notes`: one sentence saying why ("The invoice counted 18,200 words; the correct count is 17,700.").

   A credit note has no payment block and no due date, and the minimum charge never applies to it.

5. **The checks guard it:** `corrects` must name an issued invoice for the same client in the same currency, the credit note can't be dated before it, and all credit notes for one invoice together can't exceed its total.

6. **A replacement invoice**, if the user still wants to bill the corrected amount: a new invoice with the next number, as usual. Never reuse the old number.

7. **Send, then issue** the credit note too (`npm run issue -- CN-2026-002`), and record it in `docs/project.md`.

What a credit note must say differs by country (the wording of the title, a reference to the original invoice's date, the reason). The shipped titles are "Credit note", "Rechnungskorrektur", "Avoir", "Factura rectificativa" and "Faktura korygująca"; tell the user to confirm the wording with their accountant (rule 12).

## Verify

- `npm run check` ends with `CODEPLATE CHECKS: PASS`; the `data` step lists the credit note with a negative total.
- `npm run list`: the total is minus what was credited, and the original invoice is unchanged (still `issued`, same total).
- `npm run preview -- <credit note number>`: the title reads as a credit, "Corrects invoice" shows the invoice number, the amounts are negative, there's no payment block.
