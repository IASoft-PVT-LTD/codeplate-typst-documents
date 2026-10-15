# Other languages, currencies and paper sizes

Use this when some clients need their documents in another language, all documents should be in another language, a client pays in another currency, or the user needs US Letter paper.

Every word on the page comes from `layout/labels/<lang>.json`, one file per language with the same keys. `en` is the main one. `de`, `fr`, `es` and `pl` ship too, written by CodePlate and **not yet checked by a native speaker**: each starts with a `$review` note saying so. The sample's Kranich Verlag gets German documents (`INV-2026-044`).

## Steps

1. **Some clients in another language** (the usual case):
   - In `data/clients.csv`, set that client's `language` (`de`). Empty means the business's `language`.
   - In `business.json` `languages`, give the language its locale, and the business's own words in that language:

     ```json
     "languages": {
       "de": {
         "locale": "de-DE",
         "tagline": "Markendesign & Illustration",
         "registration": "Eingetragen in England und Wales, Company No. 12345678",
         "taxLabel": "USt.",
         "payment": { "lines": ["Überweisung an …", "IBAN …"], "reference": "Bitte geben Sie {number} als Verwendungszweck an." },
         "footer": "Vielen Dank für die Zusammenarbeit."
       }
     }
     ```

     Only `locale` is required; the others replace the main fields for that language when present. The locale sets dates ("31. Oktober 2026") and numbers ("655,00 €", "2,5"). Pick the client's country: `de-AT`, `fr-CH`, `es-MX` differ from `de-DE`, `fr-FR`, `es-ES` in small ways.
   - The data stays as typed: descriptions, details and notes for that client are written in their language. Units typed in the main language (`hour`) can be translated by the language file's optional `"units": { "hour": "Std." }`; units not listed print as typed.
   - Tell the user the shipped label file hasn't been reviewed (rule 12). When a native speaker has checked it, replace its `$review` note with who and when.

2. **Add a language** that doesn't ship (`it`, `nl`, `pt`, `sv`…):
   - copy `layout/labels/en.json` to `layout/labels/<code>.json` (the code is what clients' `language` says);
   - translate every value; keep `{p}`, `{t}` and `{base}`; replace `$comment` with a `$review` note like the shipped ones ("Written by …, not yet reviewed by a native speaker…");
   - add its `locale` (and any translated fields) to `business.json` `languages`.

   The `data` check fails if a language in use is missing a key that `en.json` has (a language no client uses only warns), and `tests/languages.test.mjs` checks every shipped file has every key and a `$review` note. A new key for a feature goes into **every** file.

3. **All documents in another language.** Set `business.json` `language` and `locale` to it (`"de"`, `"de-DE"`), and write the main fields (`tagline`, `payment`, `footer`…) in that language. That language's file is then the one every other must match. Issued documents keep the language they were issued in.

4. **A client who pays in another currency.** Set that client's `currency` in `data/clients.csv` (or one document's `currency` on its first row). Their unit prices are then in that currency, and the minimum charge comes from that currency's `lineMinimum` entry. Amounts are formatted for the document's language (`€8,242.00` in en-GB, `8.242,00 €` in de-DE). Currencies with no minor unit (JPY) or three (KWD) are handled. Exchange rates are not: the template never converts. If the user's tax authority wants the tax shown in their home currency too, that's a new field (rate and date from the user, the conversion in `src/money.mjs` with a test) and a line in `totals`.

5. **US Letter paper.** In `layout/theme.typ`, set `page-size = "us-letter"`. Check the margins still look right.

6. **Record it** in `docs/project.md` (Money and language: which clients get which language, who reviewed the labels).

## Verify

- `npm run check` ends with `CODEPLATE CHECKS: PASS` (`data` names any missing label or locale).
- `npm run preview -- <a document for that client>`: every word on the page is in their language (no English left except the data and addresses), dates and amounts follow the locale, long labels don't wrap badly in the details box, the table header or the title. Compare with a main-language document: it's unchanged.
- For a new currency: `npm run list` shows the right symbol and decimals.
