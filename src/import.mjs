// One-command import of line items from another program's export (a time tracker, a jobs
// spreadsheet, a shop): `npm run import -- <export.csv>`. docs/recipes/import-a-spreadsheet.md
//
// data/import.json (the "profile") says how the export's columns become documents:
//
//   {
//     "type": "invoice",               the document type to make
//     "dateFormat": "DD/MM/YYYY",      how the export writes dates (DD, MM, YYYY, any separator)
//     "dateColumn": "Date",            the column with each row's date (for "issued" and sorting)
//     "decimalComma": false,           true when the export writes 12,50 for twelve and a half
//     "issued": "end-of-month",        the documents' date: "end-of-month" (of the latest row),
//                                      "latest" (the latest row's date), "today" or YYYY-MM-DD;
//                                      `--issued YYYY-MM-DD` on the command line wins
//     "id": "{Entry ID}",              what identifies a row; "" = a fingerprint of the whole row
//     "clients": { "Lato": "lato" },   names in the export -> client ids, when they differ
//     "document": { "client": "{Client}", "currency": "{Currency}", "reference": "", "notes": "" },
//     "line": { "description": "{Task}", "details": "{Date:date}[ · PO {PO}]", "quantity": "{Hours}",
//               "unit": "hour", "unit_price": "{Rate}", "discount": "", "tax": "", "line_note": "" }
//   }
//
// Values are templates: {Column} is that column of the row, {Column:date} its date written
// for the client's language, [ … ] is left out when a column inside it is empty, anything
// else is text as it is ("hour").
//
// Rows become one document per client, numbered in the order of each client's first row,
// continuing the series (data/numbering.json and data/). Each line keeps its row's id in
// the `source` column, so running the same export again adds nothing. Nothing is written
// unless every row is good and the project still loads cleanly afterwards.
// Money is never calculated here: quantities and prices are copied as plain decimals and
// src/money.mjs does the math.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { csvLine, parseCsv, parseRows } from './csv.mjs';
import { dateFormatRegex, endOfMonth, formatDate, parseDate, parseDateAs, today } from './dates.mjs';
import { PRICE_SCALE, QTY_SCALE, PCT_SCALE, parseDecimal } from './money.mjs';
import { nextNumber } from './numbering.mjs';
import { languageFor } from './load.mjs';

export const PROFILE = 'data/import.json';
export const DOCUMENTS_CSV = 'data/documents.csv';
// Every column data/documents.csv can have, in the order a new file gets them.
export const CSV_COLUMNS = ['number', 'type', 'client', 'issued', 'due', 'reference', 'corrects', 'description', 'details',
  'quantity', 'unit', 'unit_price', 'discount', 'tax', 'line_note', 'notes', 'currency', 'source'];
const LINE_FIELDS = ['description', 'details', 'quantity', 'unit', 'unit_price', 'discount', 'tax', 'line_note'];
const DOC_FIELDS = ['client', 'currency', 'reference', 'notes'];

const norm = (s) => String(s ?? '').trim().toLowerCase();

// Fills a template from one export row. `columns` are the export's (lowercased) headers.
// Throws for a column that isn't in the export.
export function fillTemplate(template, row, { columns, dateFormat, locale }) {
  const value = (name, fmt) => {
    const key = norm(name);
    if (!columns.includes(key)) throw new Error(`the template "${template}" uses the column "${name}", which the export doesn't have (it has: ${columns.join(', ')})`);
    const v = String(row[key] ?? '').trim();
    if (!v || fmt !== 'date') return v;
    return formatDate(parseDateAs(v, dateFormat, name), locale, 'medium');
  };
  const fill = (part) => {
    let empty = false;
    const out = part.replace(/\{([^{}:]+)(?::(date))?\}/g, (_, name, fmt) => {
      const v = value(name, fmt);
      if (!v) empty = true;
      return v;
    });
    return { out, empty };
  };
  return String(template ?? '').split(/(\[[^\]]*\])/).map((seg) => {
    if (seg.startsWith('[') && seg.endsWith(']')) {
      const { out, empty } = fill(seg.slice(1, -1));
      return empty ? '' : out;
    }
    return fill(seg).out;
  }).join('').trim();
}

// Checks data/import.json; returns a list of problems.
export function checkProfile(profile, business) {
  const problems = [];
  if (!profile || typeof profile !== 'object') return [`${PROFILE} must be a JSON object`];
  if (!business.documents?.[profile.type]) problems.push(`${PROFILE}: "type" "${profile.type}" is not one of ${Object.keys(business.documents ?? {}).join(', ')}`);
  if (profile.type === 'credit-note') problems.push(`${PROFILE}: credit notes are written by hand (docs/recipes/credit-notes.md), not imported`);
  try {
    dateFormatRegex(profile.dateFormat ?? 'YYYY-MM-DD');
  } catch (e) {
    problems.push(`${PROFILE}: ${e.message}`);
  }
  const issued = profile.issued ?? 'today';
  if (!['today', 'end-of-month', 'latest'].includes(issued)) {
    try {
      parseDate(issued, `${PROFILE} "issued"`);
    } catch {
      problems.push(`${PROFILE}: "issued" is "end-of-month", "latest", "today" or a date like 2026-10-31`);
    }
  }
  if ((issued === 'end-of-month' || issued === 'latest') && !profile.dateColumn) problems.push(`${PROFILE}: "issued": "${issued}" needs "dateColumn"`);
  for (const k of ['description', 'quantity', 'unit_price']) if (!profile.line?.[k]) problems.push(`${PROFILE}: "line.${k}" is required`);
  if (!profile.document?.client) problems.push(`${PROFILE}: "document.client" is required (like "{Client}")`);
  for (const k of Object.keys(profile.line ?? {})) if (!LINE_FIELDS.includes(k)) problems.push(`${PROFILE}: "line.${k}" is not a line field (${LINE_FIELDS.join(', ')})`);
  for (const k of Object.keys(profile.document ?? {})) if (!DOC_FIELDS.includes(k)) problems.push(`${PROFILE}: "document.${k}" is not a document field (${DOC_FIELDS.join(', ')})`);
  return problems;
}

// Works out what an import adds, without writing anything. Throws an Error listing every
// problem (with the export's line numbers) if any row is wrong.
//   text       the export file's contents
//   project    loadProject()'s result (business, clients, raw, numbering)
//   issued     a YYYY-MM-DD that overrides the profile's "issued"
// Returns { documents: [{ number, client, lines }], rows: [[…cells]], skipped, issued }.
export function planImport({ text, profile, project, issued: issuedArg, now = today() }) {
  const { business, clients, raw, numbering } = project;
  const fail = (list) => {
    throw new Error(`Nothing was imported:\n  ${list.join('\n  ')}`);
  };
  const profileProblems = checkProfile(profile, business);
  if (profileProblems.length) fail(profileProblems);
  const rows = parseCsv(text);
  if (!rows.length) fail(['the export has no rows']);
  const columns = Object.keys(rows[0]);
  const dateFormat = profile.dateFormat ?? 'YYYY-MM-DD';
  const aliases = new Map(Object.entries(profile.clients ?? {}).map(([k, v]) => [norm(k), v]));
  const byName = new Map([...clients.values()].map((c) => [norm(c.name), c]));
  const imported = new Set(raw.flatMap((d) => d.items.map((it) => it.source)).filter(Boolean));
  const seen = new Map();
  const problems = [];
  const fresh = [];
  let skipped = 0;
  for (const row of rows) {
    const at = `line ${row._line}`;
    try {
      // The row's id: the profile's "id" template, or a fingerprint of the whole row (a second
      // identical row in the same export gets "#2").
      let id = profile.id ? fillTemplate(profile.id, row, { columns, dateFormat, locale: business.locale }) : '';
      if (profile.id && !id) throw new Error(`the id ("${profile.id}") is empty`);
      if (!id) id = createHash('sha256').update(JSON.stringify(columns.map((c) => row[c]))).digest('hex').slice(0, 12);
      const n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      if (n > 1) {
        if (profile.id) throw new Error(`the id "${id}" appears twice in the export`);
        id = `${id}#${n}`;
      }
      if (imported.has(id)) {
        skipped += 1;
        continue;
      }
      const name = fillTemplate(profile.document.client, row, { columns, dateFormat, locale: business.locale });
      const client = clients.get(aliases.get(norm(name)) ?? '') ?? clients.get(name) ?? byName.get(norm(name));
      if (!client) throw new Error(`no client "${name}" in data/clients (add the client, or map the name to an id in ${PROFILE} "clients")`);
      const { locale } = languageFor(business, client);
      const ctx = { columns, dateFormat, locale: locale ?? business.locale };
      const doc = Object.fromEntries(DOC_FIELDS.map((k) => [k, profile.document[k] ? fillTemplate(profile.document[k], row, ctx) : '']));
      const currency = client.currency ?? business.currency;
      if (doc.currency && doc.currency.toUpperCase() !== currency) throw new Error(`the row is in ${doc.currency}, but ${client.name} is billed in ${currency} (data/clients)`);
      const line = Object.fromEntries(LINE_FIELDS.map((k) => [k, profile.line[k] ? fillTemplate(profile.line[k], row, ctx) : '']));
      const comma = Boolean(profile.decimalComma);
      for (const [k, scale] of [['quantity', QTY_SCALE], ['unit_price', PRICE_SCALE], ['discount', PCT_SCALE]]) {
        if (!line[k]) continue;
        parseDecimal(line[k], { scale, what: k.replace('_', ' '), comma, allowNegative: k === 'unit_price' });
        if (comma) line[k] = line[k].replace(',', '.');
      }
      if (!line.description) throw new Error('the description is empty');
      const date = profile.dateColumn ? parseDateAs(row[norm(profile.dateColumn)], dateFormat, profile.dateColumn) : null;
      fresh.push({ id, client, doc, line, date, at });
    } catch (e) {
      problems.push(`${at}: ${e.message}`);
    }
  }
  if (problems.length) fail(problems);

  let issued = issuedArg ?? profile.issued ?? 'today';
  if (issued === 'today') issued = now;
  else if (issued === 'end-of-month' || issued === 'latest') {
    const latest = fresh.map((f) => f.date).sort().at(-1) ?? now;
    issued = issued === 'latest' ? latest : endOfMonth(latest);
  }
  parseDate(issued, 'issued');

  // One document per client, in the order of each client's first row.
  const groups = new Map();
  for (const f of fresh) {
    if (!groups.has(f.client.id)) groups.set(f.client.id, []);
    groups.get(f.client.id).push(f);
  }
  const type = profile.type;
  const used = raw.filter((d) => d.type === type).map((d) => d.number);
  const out = { documents: [], rows: [], skipped, issued };
  for (const [clientId, lines] of groups) {
    const number = nextNumber(business.documents[type].numbering, used, Number(issued.slice(0, 4)), numbering[type]);
    used.push(number);
    // Document fields come from the client's rows: the first non-empty value, or every
    // different value joined (several PO numbers in one reference).
    const field = (k) => [...new Set(lines.map((l) => l.doc[k]).filter(Boolean))].join(', ');
    out.documents.push({ number, client: lines[0].client.name, lines: lines.length });
    lines.forEach((l, i) => {
      const first = i === 0;
      out.rows.push({
        number, type: first ? type : '', client: first ? clientId : '', issued: first ? issued : '', due: '',
        reference: first ? field('reference') : '', corrects: '', notes: first ? field('notes') : '', currency: '',
        ...l.line, source: l.id,
      });
    });
  }
  return out;
}

// Appends planned rows to data/documents.csv, adding any column the file doesn't have yet.
// Returns the previous text (to put back if the result doesn't load).
export function writeImport(root, plan) {
  const path = join(root, DOCUMENTS_CSV);
  const before = existsSync(path) ? readFileSync(path, 'utf8') : null;
  let text = before ?? `${CSV_COLUMNS.join(',')}\n`;
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0];
  const sep = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  const parsed = parseRows(text, sep).filter((r) => r.cells.some((c) => c.trim() !== ''));
  const header = parsed[0].cells.map((h) => h.trim().toLowerCase());
  const missing = CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) {
    // Rewrite with the new columns at the end (the values are unchanged).
    const all = [...header, ...missing];
    const pad = (cells) => all.map((_, i) => cells[i] ?? '');
    text = `${[csvLine(all, sep), ...parsed.slice(1).map((r) => csvLine(pad(r.cells), sep))].join('\n')}\n`;
    header.push(...missing);
  }
  const add = plan.rows.map((r) => csvLine(header.map((h) => r[h] ?? ''), sep));
  writeFileSync(path, `${text.replace(/\s*$/, '\n')}${add.join('\n')}\n`);
  return before;
}

export function restoreDocuments(root, before) {
  const path = join(root, DOCUMENTS_CSV);
  if (before === null) writeFileSync(path, `${CSV_COLUMNS.join(',')}\n`);
  else writeFileSync(path, before);
}

export const readProfile = (root, path = PROFILE) => JSON.parse(readFileSync(join(root, path), 'utf8'));
