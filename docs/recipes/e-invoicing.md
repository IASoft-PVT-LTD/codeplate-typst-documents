# E-invoices (Factur-X/ZUGFeRD, XRechnung, Peppol)

Use this when a client or the user's country asks for a structured e-invoice instead of (or as well as) a PDF. This recipe is a starting point, not a finished feature: e-invoicing rules differ by country and change often.

## Steps

1. **Find out what's actually required.** Ask the user what their client or tax authority asked for, in their words, and the deadline. Common cases:
   - **Factur-X / ZUGFeRD** (France, Germany): a PDF/A-3 with an XML file (UN/CEFACT CII) attached inside it. The PDF this template makes is already PDF/A-3b, which allows attachments.
   - **XRechnung** (German public sector) or **Peppol BIS** (many EU public bodies, Belgium, the Nordics, Australia, Singapore…): an XML file on its own, often sent through a Peppol access point. The PDF is then only a human-readable copy.
   - **Country portals** (Italy's SdI, Poland's KSeF, and others): XML submitted to a government system. That needs their software or an access-point provider; say so plainly.

   Tell the user what you know is commonly required, that the rules may have changed since your training, and that they should confirm with their accountant or the client.

2. **Generate the XML from the same data.** Write `src/einvoice.mjs` that turns one document's data (the object `buildDocument` returns, plus the raw amounts in `totals.raw`) into the XML the profile needs, using exact decimal strings, never floats. Add the fields the standard requires that the template doesn't hold yet (buyer and seller identifiers, the unit codes like `HUR` or `C62`, payment means) to `business.json`, `data/clients.csv` and `src/load.mjs`, with checks in `loadProject` that they are present.

3. **Attach it to the PDF (Factur-X/ZUGFeRD).** Write the XML next to the document's data (`out/.data/<number>.xml`) and attach it in `layout/document.typ` with Typst's `pdf.attach` (read its parameters in the docs for the installed Typst version: the file name the profile requires, the relationship, the MIME type `text/xml`). Factur-X also needs specific XMP metadata in the PDF; check whether the installed Typst can write it before promising this to the user.

4. **Validate with an official validator** for the profile (the Factur-X/ZUGFeRD and XRechnung projects publish validators; Peppol has its own). Add the validation to `checks/run.mjs` only if it runs offline; otherwise, document the manual step in `docs/project.md`.

## Verify

- `npm run check` ends with `CODEPLATE CHECKS: PASS`, with a test for the XML of one sample document (amounts, totals and tax per rate match `totals.raw`).
- The official validator accepts the file for at least one real document, and the user (or their accountant) has confirmed the profile.
- `npm run preview`: the human-readable PDF still looks right.
