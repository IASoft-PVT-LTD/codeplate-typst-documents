# Project decisions

<!-- codeplate:project-stub -->

This file is still the template stub. The agent replaces it after interviewing the user (see "Interview" in AGENTS.md), then adds every later decision here, so a future session knows what was agreed.

Suggested layout once filled in:

- **Business:** trading name, legal name, what they do
- **Typst:** the binary that works on this computer (path and version)
- **Look:** logo file, brand colours, font, paper size (A4 or US Letter)
- **Tax:** registered or not; label (VAT, GST, sales tax), tax number, rates and their names, rounding; standard notes (reverse charge, exemptions)
- **Money and language:** currency, locale, document language; clients who pay in another currency or get another language (and who reviewed those labels); a minimum charge per line
- **Numbering:** pattern per document type, the last number sent before this project (in `data/numbering.json`), gapless or not
- **Terms:** payment days, quote validity, payment details printed, closing line
- **Data:** where line items come from (typed in, a spreadsheet export, another app), the import command and its column mapping
- **Sent documents:** issued with `npm run issue` when sent; `archive/` is in the user's backups
- **Open questions:**
- **Log:** one dated line per notable change
