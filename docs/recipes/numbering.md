# Numbering: continue from the user's last number

Use this when setting up the user's numbering (always, after the interview), when they change their number format, or when the checks report a gap.

Each document type is a series with a pattern in `business.json` (`documents.<type>.numbering`: `{yyyy}` the year, `{nnn}` the sequence, padded to as many digits as n's). `data/numbering.json` stores the **last number issued** in each series. The next number is one after the highest of that stored number and the numbers in `data/` for that year, so deleting rows never sends the sequence back to 001.

## Steps

1. **Their pattern.** Set `numbering` to their scheme: `{yyyy}-{nnn}` for 2026-119, `INV-{nnnn}` for INV-0119 (no year: the sequence never restarts), `{yyyy}/{nnn}` works too (the file name becomes `2026-119.pdf`). Keep `gapless: true` for invoices and credit notes unless the user says their tax authority doesn't require it.

2. **Their last number sent**, before this project, goes in `data/numbering.json`:

   ```json
   {
     "$comment": "…",
     "invoice": "2026-118",
     "credit-note": null,
     "quote": null
   }
   ```

   Now `npm run next -- invoice` prints `2026-119`. The value must match the type's pattern (the `data` check says if it doesn't). Only set it by hand this once, or when the user tells you about numbers sent outside this project. Never lower it.

3. **From then on** `npm run issue` moves it forward as documents are sent (`issue-a-document.md`). Drafts above it can still be deleted or renumbered: they haven't gone out. The `gapless` check counts the stored number, so:
   - a draft that skips numbers (`2026-121` right after `2026-118`) is a gap;
   - an issued document whose rows were deleted is a gap (and a `data` problem of its own).

4. **A new year.** With `{yyyy}` in the pattern, the first invoice dated in a new year is `…-001` (`npm run next -- invoice 2027-01-04`). Nothing to change in `data/numbering.json`.

5. **Changing the pattern** (the user rebrands their numbers): start the new pattern at a clean point, usually a new year, and say so. Documents already in `data/` with the old pattern no longer match: either keep the old pattern until the year ends, or issue all of them first and move them to a record the user keeps elsewhere. Set `data/numbering.json` to the last number in the new pattern (or `null`). Ask the user before you do it: it touches their legal records.

6. **Record it** in `docs/project.md` (Numbering: pattern, last number sent before this project).

## Verify

- `npm run next -- invoice` prints the number the user expects next.
- `npm run check` ends with `CODEPLATE CHECKS: PASS` (no gap reported).
- Try it (then undo): delete the rows of the last draft; `npm run next -- invoice` doesn't go below the stored number.
