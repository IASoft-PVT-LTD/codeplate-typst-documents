// The building blocks of a document. document.typ puts them in order.
// Each part takes `doc`, the JSON that src/load.mjs builds for one document (every
// amount is already formatted: never do money math here).
//
// The <cp-…> metadata markers are read by the checks (`typst eval`), so they can prove
// that every line item and the total made it onto the page. Keep one per thing.
#import "theme.typ": *

// A label and its value, stacked.
#let field(label, value) = {
  text(size: size.small, fill: muted, label)
  linebreak()
  value
}

#let address-block(lines) = lines.join(linebreak())

// Logo and business name on the left, the document title and number on the right.
#let header(doc) = {
  grid(
    columns: (1fr, auto),
    align: (left + horizon, right + horizon),
    {
      if doc.seller.logo != none {
        box(image(doc.seller.logo, height: 15mm), baseline: 30%)
        h(4mm)
      }
      box(baseline: 20%, {
        text(size: size.name, weight: "semibold", doc.seller.name)
        if doc.seller.tagline != "" {
          linebreak()
          text(size: size.small, fill: muted, doc.seller.tagline)
        }
      })
    },
    {
      // A long title ("Rechnungskorrektur", "Factura rectificativa") is set smaller so it
      // stays on one line next to the logo.
      let title-size = if doc.title.clusters().len() > 12 { size.title * 0.7 } else { size.title }
      text(size: title-size, weight: "bold", fill: brand(doc), doc.title)
      linebreak()
      text(size: size.body, fill: muted, doc.number)
      [#metadata(doc.number) <cp-number>]
    },
  )
}

// From | Bill to | the details box (dates, reference, tax numbers).
#let parties(doc) = {
  let w = doc.labels
  let details = (
    (w.number, doc.number),
    (w.issued, doc.issued.text),
  )
  if doc.due != none { details.push((w.due, text(weight: "semibold", doc.due.text))) }
  if doc.validUntil != none { details.push((w.validUntil, text(weight: "semibold", doc.validUntil.text))) }
  if doc.at("corrects", default: "") != "" { details.push((w.corrects, text(weight: "semibold", doc.corrects))) }
  if doc.reference != "" { details.push((w.reference, doc.reference)) }
  grid(
    columns: (1fr, 1fr, 66mm),
    column-gutter: 6mm,
    {
      field(w.from, {
        text(weight: "semibold", doc.seller.legalName)
        linebreak()
        address-block(doc.seller.address)
        if doc.seller.email != "" { linebreak(); doc.seller.email }
        if doc.seller.phone != "" { linebreak(); doc.seller.phone }
        if doc.seller.taxNumber != "" { linebreak(); [#doc.seller.taxLabel #doc.seller.taxNumber] }
      })
    },
    {
      field(if doc.type == "quote" { w.preparedFor } else { w.billTo }, {
        text(weight: "semibold", doc.client.name)
        if doc.client.contact != "" { linebreak(); doc.client.contact }
        if doc.client.address.len() > 0 { linebreak(); address-block(doc.client.address) }
        if doc.client.email != "" { linebreak(); doc.client.email }
        if doc.client.taxNumber != "" { linebreak(); [#w.taxNumber #doc.client.taxNumber] }
      })
    },
    block(fill: panel, inset: 4mm, radius: 2mm, width: 100%, grid(
      columns: (auto, 1fr),
      row-gutter: 2.2mm,
      column-gutter: 3mm,
      ..details.map(((k, v)) => (text(size: size.small, fill: muted, k), align(right, v))).flatten(),
    )),
  )
}

// The line items. The header row repeats on every page; a row never splits across pages.
#let items(doc) = {
  let w = doc.labels
  let cols = (1fr, auto, auto)
  let heads = (w.description, w.quantity, w.unitPrice)
  if doc.showDiscount { cols.push(auto); heads.push(w.discount) }
  if doc.showTax { cols.push(auto); heads.push(w.rate) }
  cols.push(auto)
  heads.push(w.amount)
  let n = cols.len()

  let row(it) = {
    let cells = ()
    cells.push({
      // Tabular figures widen hyphens too: keep the description proportional.
      set text(number-width: "proportional")
      it.description
      [#metadata((index: it.index, description: it.description, net: it.net)) <cp-line>]
      if it.details != "" {
        linebreak()
        text(size: size.small, fill: muted, it.details)
      }
      // The line's note, and "Minimum charge" when the minimum was applied (src/load.mjs).
      if it.at("note", default: "") != "" {
        linebreak()
        text(size: size.small, fill: muted, style: "italic", it.note)
      }
    })
    cells.push(if it.unit != "" [#it.quantity #text(fill: muted, number-width: "proportional", it.unit)] else { it.quantity })
    cells.push(it.unitPrice)
    if doc.showDiscount { cells.push(it.discount) }
    if doc.showTax { cells.push(it.tax) }
    cells.push(text(weight: "semibold", it.net))
    cells
  }

  set table.cell(breakable: false)
  // Tabular figures line the amounts up in columns.
  set text(number-width: "tabular")
  table(
    columns: cols,
    stroke: none,
    inset: (x: 2mm, y: 2.4mm),
    align: (x, y) => if x == 0 { left + top } else { right + top },
    table.header(
      repeat: true,
      ..heads.map(h => text(size: size.small, weight: "semibold", fill: brand(doc), h)),
      table.hline(stroke: 0.8pt + brand(doc)),
    ),
    ..doc.items.map(it => (..row(it), table.hline(stroke: 0.4pt + rule))).flatten(),
  )
}

// Subtotal, tax per rate and the total, kept together on one page.
#let totals(doc) = {
  let w = doc.labels
  let rows = ((w.subtotal, doc.totals.subtotal),)
  for t in doc.totals.taxes {
    rows.push(([#t.label #text(fill: muted, size: size.small, w.taxOn.replace("{base}", t.base))], t.amount))
  }
  set text(number-width: "tabular")
  block(breakable: false, width: 100%, align(right, box(width: 80mm, {
    grid(
      columns: (1fr, auto),
      row-gutter: 2.4mm,
      align: (left, right),
      ..rows.flatten(),
    )
    v(2mm)
    line(length: 100%, stroke: 0.8pt + brand(doc))
    v(1mm)
    grid(
      columns: (1fr, auto),
      align: (left + horizon, right + horizon),
      text(weight: "semibold", if doc.type == "invoice" { w.totalDue } else if doc.type == "credit-note" { w.totalCredited } else { w.total }),
      text(size: size.total, weight: "bold", fill: brand(doc), doc.totals.total),
    )
    [#metadata(doc.totals.total) <cp-total>]
  })))
}

// Notes, how to pay (invoices) or how to accept (quotes).
#let closing(doc) = {
  let w = doc.labels
  set block(spacing: 5mm)
  if doc.notes != "" {
    block(breakable: false, {
      text(size: size.small, weight: "semibold", fill: muted, w.notes)
      linebreak()
      doc.notes
    })
  }
  if doc.payment != none {
    block(breakable: false, width: 100%, stroke: (left: 2pt + accent(doc)), inset: (left: 4mm, y: 1mm), {
      text(size: size.small, weight: "semibold", fill: muted, w.payment)
      linebreak()
      doc.payment.lines.join(linebreak())
      if doc.payment.reference != "" {
        linebreak()
        text(weight: "semibold", doc.payment.reference)
      }
    })
  }
  if doc.type == "quote" {
    block(breakable: false, text(fill: muted, w.acceptance))
  }
  if doc.footer != "" {
    v(2mm)
    text(fill: brand(doc), weight: "semibold", doc.footer)
  }
}

// Top of every page after the first: which document this page belongs to.
#let page-header(doc) = context {
  if counter(page).get().first() > 1 {
    set text(size: size.small, fill: muted)
    grid(columns: (1fr, auto), [#doc.seller.name], [#doc.title #doc.number])
  }
}

// Bottom of every page: legal line, "continued" on all but the last page, page numbers.
#let page-footer(doc) = context {
  let w = doc.labels
  let p = counter(page).get().first()
  let t = counter(page).final().first()
  set text(size: size.small, fill: muted)
  if p < t {
    align(right, text(style: "italic", w.continued))
    v(1mm)
  }
  line(length: 100%, stroke: 0.4pt + rule)
  v(0.5mm)
  grid(
    columns: (1fr, auto),
    {
      let bits = (doc.seller.legalName,)
      if doc.seller.registration != "" { bits.push(doc.seller.registration) }
      if doc.seller.website != "" { bits.push(doc.seller.website) }
      bits.join(" · ")
    },
    w.page.replace("{p}", str(p)).replace("{t}", str(t)),
  )
}
