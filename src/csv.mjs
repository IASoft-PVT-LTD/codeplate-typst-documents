// A small CSV reader (RFC 4180): commas, "quoted, fields", "" for a quote inside quotes,
// line breaks inside quotes, CRLF or LF, an optional UTF-8 BOM (Excel adds one).
// Semicolon-separated files (Excel in many European locales) are detected from the header.
//
//   parseCsv(text) -> [{ header: value, ... }], each row also has a hidden `_line` (1-based,
//   the line the row starts on) so errors can point at it.

export function parseRows(text, sep = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else {
        if (c === '\n') line++;
        field += c;
      }
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push({ cells: row, line: rowLine });
      row = [];
      field = '';
      line++;
      rowLine = line;
    } else {
      field += c;
    }
  }
  if (quoted) throw new Error(`line ${rowLine}: a quoted field is never closed (missing ")`);
  if (field !== '' || row.length) {
    row.push(field);
    rows.push({ cells: row, line: rowLine });
  }
  return rows;
}

export function parseCsv(text) {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0];
  const sep = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  const rows = parseRows(text, sep).filter((r) => r.cells.some((c) => c.trim() !== ''));
  if (!rows.length) return [];
  const header = rows[0].cells.map((h) => h.trim().toLowerCase());
  const seen = new Set();
  for (const h of header) {
    if (!h) throw new Error('line 1: a column has no name');
    if (seen.has(h)) throw new Error(`line 1: the column "${h}" appears twice`);
    seen.add(h);
  }
  return rows.slice(1).map((r) => {
    if (r.cells.length > header.length) throw new Error(`line ${r.line}: ${r.cells.length} fields but the header has ${header.length} (a comma inside a value needs "quotes")`);
    const obj = {};
    header.forEach((h, i) => {
      obj[h] = (r.cells[i] ?? '').trim();
    });
    Object.defineProperty(obj, '_line', { value: r.line, enumerable: false });
    return obj;
  });
}

// One CSV line from a list of values: quotes a value only when it needs them.
export function csvLine(cells, sep = ',') {
  return cells.map((v) => {
    const s = String(v ?? '');
    return s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(sep);
}
