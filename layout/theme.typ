// The look of every document: page size, margins, type sizes, colours.
// Brand colours and the font family come from business.json ("brand"); everything else
// is set here. Change sizes and spacing here, not in parts.typ, so all documents agree.

#let page-size = "a4"            // "us-letter" for the US and Canada
#let margin = (left: 18mm, right: 18mm, top: 18mm, bottom: 26mm)

#let size = (
  body: 9.5pt,
  small: 8pt,
  title: 26pt,
  name: 13pt,
  total: 13pt,
)

#let ink = rgb("#1f2328")        // body text
#let muted = rgb("#5f6670")      // labels, details, footer
#let rule = rgb("#d6d9dd")       // thin lines
#let panel = rgb("#f5f6f7")      // background of the details box

// Brand colours from the document data (business.json "brand").
#let brand(doc) = rgb(doc.brand.color)
#let accent(doc) = rgb(doc.brand.accent)

// "en-GB" -> (lang: "en", region: "gb"), for hyphenation and quotes.
#let lang-of(doc) = {
  let parts = doc.locale.split("-")
  (lang: lower(parts.at(0)), region: if parts.len() > 1 { lower(parts.at(1)) } else { none })
}
