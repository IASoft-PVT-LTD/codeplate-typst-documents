# Tax set-ups

Use this when the user charges VAT, GST or sales tax in a way the sample doesn't, isn't registered at all, or needs a note about tax on some invoices. Set up what the user tells you; don't decide what they must charge (rule 12).

## Steps

1. **The `tax` section of `business.json`:**
   - `label`: what the tax is called on the page (`VAT`, `GST`, `Sales tax`, `MwSt.`, `TVA`); for documents in another language, `languages.<lang>.taxLabel` (`languages-and-currencies.md`)
   - `number`: their tax registration number, printed under their address (`""` if none)
   - `rates`: named rates as plain percentages, e.g. `{ "standard": "20", "reduced": "5", "zero": "0" }` or `{ "gst": "10" }` or `{ "state": "8.875" }`
   - `default`: the rate used when a line's `tax` column is empty
   - `rounding`: `"per-rate"` (tax worked out once on the sum of the lines at each rate; the default, and what most authorities expect) or `"per-line"` (each line rounded, then added up). If the user's accounting software does it the other way and totals differ by a penny, match their software.

2. **Not registered for tax** (many freelancers): remove the whole `tax` section, and empty the `tax` column in `data/clients.csv`. The Tax column and tax lines disappear; a `tax` value on a line or client is then an error. Issued documents keep the tax they were issued with. If their country wants a statement instead (e.g. "VAT not applicable, art. 293 B du CGI" in France, or "Not registered for GST"), put it in `business.json` `footer` or a document's `notes`, in the words the user gives you.

3. **A line at another rate:** put the rate's name in that row's `tax` column (`zero`, `reduced`). A line outside the scope of tax that must still show 0%: a rate like `"exempt": "0"`. **A client whose lines are usually at another rate** (reverse charge, an exempt charity): set the client's `tax` column in `data/clients.csv` (the sample's `tidewater` and `kranich` have `zero`); a line's own `tax` still wins.

4. **Reverse charge and other notes:** a client abroad whose business accounts for the tax. Use a 0% rate for their lines (the client's `tax` column) and the wording the user gives you in the document's `notes`. If the same note goes on every invoice for that client, ask whether to add a client column for it (`note` in `data/clients.csv`, read in `loadClients`, shown by `closing` in `layout/parts.typ`) instead of repeating it.

5. **Prices that include tax** (retail, some countries' B2C): the template takes net prices. If the user only has gross prices, ask whether you may convert them (net = gross ÷ (1 + rate), rounded to 4 decimals for the unit price), or add a `pricesIncludeTax` option: a function in `src/money.mjs` that splits gross into net and tax per rate, with tests for the rounding, and the totals block showing "includes VAT of …". Don't do this silently: it changes amounts.

6. **Two taxes at once** (e.g. GST + PST in parts of Canada): each line can carry one rate name; a combined rate (`"gst-pst": "12"`) prints one line. If the user needs each tax shown separately, that's a change in `computeTotals` (a rate can list its components) with tests; plan it with the user first.

7. **A rate changes** (the government raises VAT): add the new rate under a new name or change the value, and tell the user it changes every draft at that rate. Documents already sent must be issued first (`issue-a-document.md`); issued ones keep the old rate.

8. **Record it** in `docs/project.md` (Tax).

## Verify

- `npm test` passes, including any test you added for a new rule.
- `npm run check` ends with `CODEPLATE CHECKS: PASS`.
- `npm run list`: work out one invoice's tax by hand (sum of lines at a rate × rate, rounded to the cent) and compare.
- `npm run preview`: the tax label, the rates in the Tax column, the "VAT 20% on £…" lines and the notes read correctly.
