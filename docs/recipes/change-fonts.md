# Change the font

Use this when the user wants another typeface (their brand font, a serif, a second font for headings).

## Steps

1. **Check the licence first.** The font files ship inside the project and get embedded in every PDF, so the licence must allow both: the SIL Open Font License (OFL) does, and so do most fonts on Google Fonts (check each one's licence on its page). Fonts bought from a foundry often need a desktop *and* an embedding licence, and many forbid sharing the files: ask the user what their licence says, and if they can't say, use an OFL font. Never copy a font from the user's system folder.

2. **Get the files.** Static `.ttf` or `.otf` files, one per style you need: Regular, Italic, a bold weight (SemiBold or Bold). The layout uses `weight: "semibold"` and `"bold"`; if the family has only Regular and Bold, Typst picks the nearest. Prefer static files over a single variable font file.

3. **Add them** to `assets/fonts/` with the licence file (e.g. `assets/fonts/OFL-Lora.txt` when there's a second family; the existing `OFL.txt` belongs to Inter). Remove the Inter files and `OFL.txt` if nothing uses them any more.

4. **List them** in `assets.json` (one entry per file: `kind: "font"`, `license: "OFL-1.1"`, `licenseFile` pointing at its licence text, `credit` the designers, `source` the download page) and in `CREDITS.md`.

5. **Use it.** Set `business.json` `brand.font` to the family name *inside* the files (what `typst fonts --font-path assets/fonts --ignore-system-fonts --ignore-embedded-fonts` lists, e.g. `Source Serif 4`, not the file name). For a second family just for headings, add `brand.headingFont`, pass it through `buildDocument`'s `brand`, and use it in `header` and `totals` with `text(font: doc.brand.headingFont, …)`.

6. **Look at it.** Different fonts have different widths: check the table columns and the details box still fit.

## Verify

- `npm run check` ends with `CODEPLATE CHECKS: PASS`: `assets` confirms the font entries and licence files; `pdf` fails on `unknown font family` warnings and checks the fonts are embedded.
- `npm run preview`: the new font is on every part of the page (headings, table, footer) and the figures in the Amount column still line up.
