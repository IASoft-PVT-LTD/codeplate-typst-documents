# Rebrand: the user's business, logo and colours

Use this first, when the user's details replace Fernhill Studio's, or later when anything about their business changes (new address, new logo, new bank).

## Steps

1. **Protect sent documents.** Drafts are rebuilt from the data, so they will show the new details. Run `npm run list`: every document the user already sent must say `issued`; issue any that don't before you change anything (`issue-a-document.md`, rule 4). Issued documents keep the old details, as they were sent.

2. **Edit `business.json`:**
   - `name` (trading name, big in the header), `legalName` (in "From" and the footer; same as `name` if they trade under their own name), `tagline` (one short line, or `""`)
   - `address`: a list, one line per entry
   - `email`, `phone`, `website`, `registration` (e.g. "Registered in England and Wales, company no. …", or `""`)
   - `brand.color` (titles, lines, the total) and `brand.accent` (the payment block's bar), as `#rrggbb`. Pick a `color` dark enough for text on white: a contrast of at least 4.5:1 against white (most mid-to-dark colours pass; yellow and light green don't).
   - `payment.lines` (what to print: account name, sort code/account number, IBAN/BIC, or a payment link) and `payment.reference` (`{number}` becomes the invoice number)
   - `footer`: the closing line, or `""`

3. **The logo.** Put the user's file in `assets/` (e.g. `assets/logo.svg`; an SVG stays sharp at any size, a PNG or JPEG should be at least 600 px wide). Point `business.json` `logo` at it. Delete the old `assets/logo.svg` if it's no longer used. In `assets.json`, replace the logo entry: `path`, `kind: "image"`, `width`/`height` (an SVG's viewBox size, a PNG's pixel size; the `assets` check compares them), `use`, `license: "user-owned"`, `credit`: the user's business (files the user gave you are `user-owned`; `CodePlate-original` is only for CodePlate's own files, credited "CodePlate"). Update `CREDITS.md`. No logo? Set `"logo": null` and remove the entry; the header shows the name alone.
   - A very wide or very tall logo: the header sets its height to 15 mm (`header` in `layout/parts.typ`). For a wide wordmark, change `height: 15mm` to `width: 45mm`.
   - A logo with text in it: if it's an SVG with live text, the text needs its font in `assets/fonts/` or Typst warns; convert the text to outlines in their design tool, or use a PNG.

4. **Remove the sample** if you haven't: `npm run remove-sample -- --yes` (`remove-the-sample.md`). Then their last number sent (`numbering.md`) and their clients and documents (`add-a-document.md`, `import-a-spreadsheet.md`). If they have clients in another language, translate the fields in `business.json` `languages` too (`languages-and-currencies.md`).

5. **Record it** in `docs/project.md` (Business, Look, Terms).

## Verify

- `npm run check` ends with `CODEPLATE CHECKS: PASS` (`assets` confirms the logo entry matches the file).
- `npm run preview` and open the first page of each document: the name, logo, colours, address and payment block are theirs; the logo isn't too big or blurry; nothing says Fernhill (`grep -ri fernhill business.json data layout` finds nothing; `archive/` may, if the sample's issued invoice is still there: remove the sample).
