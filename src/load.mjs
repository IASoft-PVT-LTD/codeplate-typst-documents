// Reads the project's data, checks it, and turns every document into the plain JSON that
// layout/document.typ draws. All the money math happens here (src/money.mjs), so Typst
// only lays out text it is given.
//
//   business.json              who you are: name, address, tax, numbering, payment details,
//                              other languages ("languages"), a minimum charge per line
//   data/clients.csv|.json     who you bill (and in which language)
//   data/documents.csv         one row per line item (rows with the same number form one document)
//   data/documents.json        the same documents as JSON, for data that comes from another app
//   data/numbering.json        the last number issued per document type (src/archive.mjs)
//   archive/                   issued documents, frozen: read from here, never worked out again
//   layout/labels/<lang>.json  the words on the page, one file per language
//
// loadProject() never throws for bad data: it returns { documents, problems }, where each
// problem names the file and line, so the agent can fix them all in one go.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from './csv.mjs';
import { addDays, formatDate, parseDate } from './dates.mjs';
import {
  PCT_SCALE, PRICE_SCALE, QTY_SCALE, applyMinimum, computeTotals, formatMoney, formatPercent, formatPrice, formatQty,
  fromDecimalString, lineNet, minorDigits, parseDecimal, toDecimalString,
} from './money.mjs';
import { compilePattern, findGaps } from './numbering.mjs';
import { NUMBERING, loadArchive, readNumbering, sourceOf } from './archive.mjs';

// Fields of a document (CSV: on its first row only).
export const HEADER_FIELDS = ['type', 'client', 'issued', 'due', 'reference', 'corrects', 'notes', 'currency'];
export const LABELS_DIR = 'layout/labels';
// The type that corrects an issued invoice (docs/recipes/credit-notes.md).
export const CREDIT_NOTE = 'credit-note';
// What business.json "languages.<lang>" may say differently in that language.
const TRANSLATED = ['tagline', 'registration', 'footer', 'payment', 'taxLabel'];

function readJson(root, rel, problems) {
  try {
    return JSON.parse(readFileSync(join(root, rel), 'utf8'));
  } catch (e) {
    problems.push(`${rel}: ${e.code === 'ENOENT' ? 'file is missing' : e.message}`);
    return null;
  }
}

function readCsv(root, rel, problems) {
  try {
    const text = readFileSync(join(root, rel), 'utf8');
    const comma = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0].includes(';');
    return { rows: parseCsv(text), comma };
  } catch (e) {
    problems.push(`${rel}: ${e.message}`);
    return { rows: [], comma: false };
  }
}

const splitLines = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/\r?\n|\|/)).map((s) => String(s).trim()).filter(Boolean);

// business.json, checked.
export function loadBusiness(root, problems) {
  const b = readJson(root, 'business.json', problems);
  if (!b) return null;
  const at = (msg) => problems.push(`business.json: ${msg}`);
  for (const k of ['name', 'currency', 'locale', 'language']) if (!b[k]) at(`"${k}" is required`);
  if (!Array.isArray(b.address) || !b.address.length) at('"address" must be a list of lines');
  try {
    minorDigits(b.currency);
  } catch (e) {
    at(e.message);
  }
  const checkLocale = (locale, where) => {
    try {
      Intl.getCanonicalLocales(locale);
    } catch {
      at(`${where} "${locale}" is not a locale (like en-GB, de-DE, en-US)`);
    }
  };
  checkLocale(b.locale, '"locale"');
  // Other languages: { "de": { "locale": "de-DE", "footer": "…", "payment": { … } } }.
  b.languages = b.languages ?? {};
  for (const [lang, l] of Object.entries(b.languages)) {
    if (lang === b.language) at(`"languages.${lang}": ${lang} is already the main "language"; put its words in the main fields`);
    if (!l?.locale) at(`"languages.${lang}.locale" is required (like de-DE): it sets the date and number format`);
    else checkLocale(l.locale, `"languages.${lang}.locale"`);
    for (const k of Object.keys(l ?? {})) {
      if (k !== 'locale' && !TRANSLATED.includes(k)) at(`"languages.${lang}.${k}" is not something a language can change (${TRANSLATED.join(', ')})`);
    }
  }
  if (b.brand?.color && !/^#[0-9a-fA-F]{6}$/.test(b.brand.color)) at('"brand.color" must be a colour like #2f5d50');
  if (b.brand?.accent && !/^#[0-9a-fA-F]{6}$/.test(b.brand.accent)) at('"brand.accent" must be a colour like #d9a441');
  if (b.logo && !existsSync(join(root, b.logo))) at(`logo ${b.logo} does not exist`);
  if (b.logo && !/\.(svg|png|jpe?g)$/i.test(b.logo)) at('the logo must be an SVG, PNG or JPEG');
  b.rates = {};
  if (b.tax) {
    for (const [name, v] of Object.entries(b.tax.rates ?? {})) {
      try {
        b.rates[name] = parseDecimal(v, { scale: PCT_SCALE, what: `tax rate "${name}"` });
      } catch (e) {
        at(e.message);
      }
    }
    if (!Object.keys(b.rates).length) at('"tax.rates" needs at least one rate, or remove "tax" if you don\'t charge tax');
    if (!(b.tax.default in (b.tax.rates ?? {}))) at(`"tax.default" must be one of the rates (${Object.keys(b.tax.rates ?? {}).join(', ')})`);
    if (!['per-rate', 'per-line'].includes(b.tax.rounding ?? 'per-rate')) at('"tax.rounding" is "per-rate" or "per-line"');
  }
  // A minimum charge per line, per currency: { "GBP": "50.00", "EUR": "60.00" }.
  b.minimums = {};
  for (const [cur, v] of Object.entries(b.lineMinimum ?? {})) {
    try {
      const code = cur.toUpperCase();
      b.minimums[code] = parseDecimal(v, { scale: minorDigits(code), what: `lineMinimum ${cur}` });
    } catch (e) {
      at(`"lineMinimum": ${e.message}`);
    }
  }
  if (!b.documents || !Object.keys(b.documents).length) at('"documents" must describe at least one document type (invoice, quote…)');
  b.patterns = {};
  for (const [type, d] of Object.entries(b.documents ?? {})) {
    try {
      b.patterns[type] = compilePattern(d.numbering ?? '');
    } catch (e) {
      at(`documents.${type}: ${e.message}`);
    }
  }
  if (b.documents?.[CREDIT_NOTE] && !b.documents.invoice) at(`documents."${CREDIT_NOTE}" corrects invoices, so "documents" needs "invoice" too`);
  return b;
}

// layout/labels/<lang>.json -> { en: { … }, de: { … } }. Keys starting with "$" are notes.
export function loadLabels(root, problems) {
  const dir = join(root, LABELS_DIR);
  const out = {};
  if (!existsSync(dir)) {
    problems.push(`${LABELS_DIR}/: missing (one file per language, like en.json)`);
    return out;
  }
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const words = readJson(root, `${LABELS_DIR}/${f}`, problems);
    if (words) out[f.slice(0, -5)] = Object.fromEntries(Object.entries(words).filter(([k]) => !k.startsWith('$')));
  }
  return out;
}

// Keys of the main language's labels that another language's file doesn't have
// ("units" is optional: units not in it print as typed).
export function missingLabels(base, words) {
  return Object.keys(base).filter((k) => k !== 'units' && !k.startsWith('$') && !(k in words));
}

export function loadClients(root, problems) {
  const clients = new Map();
  const csv = existsSync(join(root, 'data/clients.csv'));
  const json = existsSync(join(root, 'data/clients.json'));
  if (!csv && !json) problems.push('data/: no clients.csv or clients.json');
  const add = (c, where) => {
    const id = String(c.id ?? '').trim();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return problems.push(`${where}: client id "${id}" must be lowercase letters, digits and dashes`);
    if (clients.has(id)) return problems.push(`${where}: client id "${id}" is used twice`);
    if (!c.name) problems.push(`${where}: client "${id}" has no name`);
    const currency = String(c.currency ?? '').trim().toUpperCase() || null;
    if (currency) {
      try {
        minorDigits(currency);
      } catch (e) {
        problems.push(`${where}: ${e.message}`);
      }
    }
    clients.set(id, {
      id, name: String(c.name ?? ''), contact: String(c.contact ?? ''), email: String(c.email ?? ''),
      address: splitLines(c.address), currency, taxNumber: String(c.tax_number ?? c.taxNumber ?? ''),
      language: String(c.language ?? '').trim().toLowerCase() || null, tax: String(c.tax ?? '').trim() || null, where,
    });
    return null;
  };
  if (csv) for (const r of readCsv(root, 'data/clients.csv', problems).rows) add(r, `data/clients.csv line ${r._line}`);
  if (json) {
    const list = readJson(root, 'data/clients.json', problems) ?? [];
    list.forEach((c, i) => add(c, `data/clients.json [${i}]`));
  }
  return clients;
}

// Raw documents from data/documents.csv and data/documents.json, before checking.
export function readDocuments(root, problems) {
  const docs = [];
  const byNumber = new Map();
  if (existsSync(join(root, 'data/documents.csv'))) {
    const { rows, comma } = readCsv(root, 'data/documents.csv', problems);
    for (const r of rows) {
      const where = `data/documents.csv line ${r._line}`;
      if (!r.number) {
        problems.push(`${where}: "number" is empty (every line item names its document)`);
        continue;
      }
      let doc = byNumber.get(r.number);
      if (!doc) {
        doc = { number: r.number, items: [], where, comma };
        for (const k of HEADER_FIELDS) doc[k] = r[k] ?? '';
        byNumber.set(r.number, doc);
        docs.push(doc);
      } else {
        for (const k of HEADER_FIELDS) {
          if (r[k] && r[k] !== doc[k]) problems.push(`${where}: ${k} "${r[k]}" differs from the first row of ${r.number} ("${doc[k]}"); leave it empty on later rows`);
        }
      }
      doc.items.push({
        where, description: r.description, details: r.details ?? '', quantity: r.quantity, unit: r.unit ?? '',
        unitPrice: r.unit_price, discount: r.discount ?? '', tax: r.tax ?? '', note: r.line_note ?? '', source: r.source ?? '',
      });
    }
  }
  if (existsSync(join(root, 'data/documents.json'))) {
    const list = readJson(root, 'data/documents.json', problems) ?? [];
    if (!Array.isArray(list)) problems.push('data/documents.json: must be a list of documents');
    else {
      list.forEach((d, i) => {
        const where = `data/documents.json [${i}] (${d.number ?? 'no number'})`;
        if (byNumber.has(d.number)) return problems.push(`${where}: number ${d.number} is also used in ${byNumber.get(d.number).where}`);
        const doc = { number: String(d.number ?? ''), where, comma: false, items: [] };
        for (const k of HEADER_FIELDS) doc[k] = d[k] === undefined || d[k] === null ? '' : String(d[k]);
        (d.items ?? []).forEach((it, j) => doc.items.push({
          where: `${where} item ${j + 1}`, description: it.description, details: it.details ?? '', quantity: String(it.quantity ?? ''),
          unit: it.unit ?? '', unitPrice: String(it.unitPrice ?? ''), discount: String(it.discount ?? ''), tax: it.tax ?? '',
          note: it.note ?? '', source: it.source ?? '',
        }));
        byNumber.set(doc.number, doc);
        docs.push(doc);
        return null;
      });
    }
  }
  return docs;
}

// The language a client's documents are in: { lang, locale, b } where `b` is business.json
// with that language's fields from "languages" (tagline, footer, payment…). locale is null
// when the language isn't set up in business.json.
export function languageFor(b, client) {
  const lang = client?.language || b.language;
  if (lang === b.language) return { lang, locale: b.locale, b };
  const l = b.languages?.[lang];
  if (!l) return { lang, locale: null, b };
  const over = Object.fromEntries(TRANSLATED.filter((k) => k in l).map((k) => [k, l[k]]));
  return { lang, locale: l.locale, b: { ...b, ...over } };
}

// Checks one raw document and builds what the layout draws.
function buildDocument(doc, { business: b0, clients, labels }, problems, warnings) {
  const at = (msg, where = doc.where) => problems.push(`${where}: ${msg}`);
  const before = problems.length;
  const type = doc.type;
  const cfg = b0.documents?.[type];
  if (!cfg) at(`type "${type}" is not one of ${Object.keys(b0.documents ?? {}).join(', ')} (business.json "documents")`);
  else if (b0.patterns[type] && !b0.patterns[type].parse(doc.number)) at(`number ${doc.number} doesn't match the ${type} pattern "${cfg.numbering}"`);
  const client = clients.get(doc.client);
  if (!client) at(`client "${doc.client}" is not in data/clients (ids: ${[...clients.keys()].join(', ')})`);
  const { lang, locale, b } = languageFor(b0, client);
  if (!locale) at(`client "${doc.client}" is in language "${lang}", but business.json "languages" has no "${lang}" (with its locale)`, client?.where);
  const words = labels[lang] ?? {};
  if (!labels[lang]) at(`there is no ${LABELS_DIR}/${lang}.json for language "${lang}"`, lang === b0.language ? 'business.json' : client?.where);
  else if (type && !words[type]) at(`${LABELS_DIR}/${lang}.json has no label for the type "${type}"`, `${LABELS_DIR}/${lang}.json`);
  const credit = type === CREDIT_NOTE;
  if (credit && !doc.corrects) at('a credit note names the invoice it corrects in "corrects" (like INV-2026-041)');
  if (!credit && doc.corrects) at(`"corrects" is only for credit notes (this is a ${type})`);

  let issued = null;
  try {
    issued = parseDate(doc.issued, 'issued');
  } catch (e) {
    at(e.message);
  }
  let due = null;
  let validUntil = null;
  if (issued && cfg) {
    try {
      if (cfg.dueDays !== undefined || type === 'invoice') {
        due = doc.due ? parseDate(doc.due, 'due') : addDays(issued, cfg.dueDays ?? 30);
        if (due < issued) at(`due ${due} is before issued ${issued}`);
      }
      if (cfg.validDays !== undefined) validUntil = doc.due ? parseDate(doc.due, 'due') : addDays(issued, cfg.validDays);
    } catch (e) {
      at(e.message);
    }
  }
  const currency = (doc.currency || client?.currency || b.currency || '').toUpperCase();
  let digits = 2;
  try {
    digits = minorDigits(currency);
  } catch (e) {
    at(e.message);
  }
  if (!doc.items.length) at('has no line items');
  // The minimum charge applies to everything except credit notes.
  const minimum = credit ? undefined : b.minimums[currency];
  if (!credit && Object.keys(b.minimums).length && minimum === undefined) {
    warnings.add(`business.json "lineMinimum" has no ${currency} entry, so ${currency} documents have no minimum charge`);
  }

  const lines = [];
  for (const it of doc.items) {
    const w = it.where;
    if (!String(it.description ?? '').trim()) at('a line item needs a description', w);
    try {
      const qty = parseDecimal(it.quantity, { scale: QTY_SCALE, what: 'quantity', comma: doc.comma });
      const entered = parseDecimal(it.unitPrice, { scale: PRICE_SCALE, what: 'unit price', comma: doc.comma, allowNegative: !credit });
      // A credit note's lines are entered as what is credited (positive) and print negative.
      const price = credit ? -entered : entered;
      if (qty === 0n) at('quantity is 0', w);
      const discount = it.discount ? parseDecimal(String(it.discount).replace(/%$/, ''), { scale: PCT_SCALE, what: 'discount', comma: doc.comma }) : 0n;
      if (discount > 100n * 10n ** BigInt(PCT_SCALE)) at(`discount ${it.discount}% is over 100%`, w);
      let taxName = null;
      if (b.tax) {
        // The line's rate, else the client's usual one (clients "tax"), else the default.
        taxName = it.tax || client?.tax || b.tax.default;
        if (!(taxName in b.rates)) at(`tax "${taxName}" is not one of the rates in business.json (${Object.keys(b.rates).join(', ')})`, w);
      } else if (it.tax || client?.tax) {
        at(`tax "${it.tax || client.tax}" is set${it.tax ? '' : ` for client "${client.id}"`}, but business.json has no "tax" section`, w);
      }
      const { net, applied } = applyMinimum(lineNet({ qty, price, discount }, digits), minimum);
      lines.push({ it, qty, price, discount, taxName, net, minimum: applied });
    } catch (e) {
      at(credit && /can't be negative/.test(e.message) ? `${e.message}: in a credit note, enter what you credit as a positive price; it prints as a negative amount` : e.message, w);
    }
  }
  if (problems.length > before) return null;

  const fmt = { currency, locale, digits };
  const totals = computeTotals(lines, b.rates, b.tax?.rounding);
  if (totals.total < 0n && !credit) {
    at(`the total is negative (${formatMoney(totals.total, fmt)}); to give money back, issue a credit note`);
    return null;
  }
  const money = (v) => formatMoney(v, fmt);
  const rateText = (name) => (b.tax ? formatPercent(b.rates[name], locale) : '');
  const taxLabel = b.taxLabel ?? b.tax?.label ?? '';
  const unitWord = (u) => words.units?.[u] ?? u;
  return {
    number: doc.number,
    type,
    title: words[type] ?? type,
    language: lang,
    locale,
    currency,
    issued: { iso: issued, text: formatDate(issued, locale) },
    due: due ? { iso: due, text: formatDate(due, locale) } : null,
    validUntil: validUntil ? { iso: validUntil, text: formatDate(validUntil, locale) } : null,
    reference: doc.reference,
    corrects: doc.corrects,
    notes: doc.notes,
    seller: {
      name: b.name, legalName: b.legalName ?? b.name, tagline: b.tagline ?? '', address: b.address, email: b.email ?? '',
      phone: b.phone ?? '', website: b.website ?? '', registration: b.registration ?? '',
      taxLabel, taxNumber: b.tax?.number ?? '',
      logo: b.logo ? `/${b.logo.replace(/\\/g, '/').replace(/^\//, '')}` : null,
    },
    brand: { color: b.brand?.color ?? '#333333', accent: b.brand?.accent ?? b.brand?.color ?? '#333333', font: b.brand?.font ?? 'Inter' },
    client: client && { id: client.id, name: client.name, contact: client.contact, email: client.email, address: client.address, taxNumber: client.taxNumber },
    showTax: Boolean(b.tax),
    showDiscount: lines.some((l) => l.discount > 0n),
    items: lines.map((l, index) => ({
      index,
      description: String(l.it.description).trim(),
      details: String(l.it.details ?? '').trim(),
      // The line's own note, and "Minimum charge" when the minimum was applied.
      note: [String(l.it.note ?? '').trim(), l.minimum ? words.minimumApplied ?? '' : ''].filter(Boolean).join(' · '),
      quantity: formatQty(l.qty, locale),
      unit: unitWord(String(l.it.unit ?? '').trim()),
      unitPrice: formatPrice(l.price, fmt),
      discount: l.discount > 0n ? formatPercent(l.discount, locale) : '',
      tax: l.taxName ? rateText(l.taxName) : '',
      net: money(l.net),
    })),
    totals: {
      subtotal: money(totals.subtotal),
      taxes: totals.taxes.map((t) => ({ label: `${taxLabel} ${rateText(t.name)}`, base: money(t.base), amount: money(t.amount) })),
      total: money(totals.total),
      // Exact amounts, for the checks and for exports.
      raw: { subtotal: toDecimalString(totals.subtotal, digits), tax: toDecimalString(totals.taxTotal, digits), total: toDecimalString(totals.total, digits) },
    },
    payment: type === 'invoice' && b.payment
      ? { lines: b.payment.lines ?? [], reference: (b.payment.reference ?? '').replaceAll('{number}', doc.number) }
      : null,
    footer: b.footer ?? '',
    labels: words,
  };
}

// A number's place in its type's sequence (year, then sequence), comparable; null if it
// doesn't match the pattern.
function position(business, type, number) {
  const p = business.patterns[type]?.parse(number ?? '');
  return p ? (p.year ?? 0) * 1e9 + p.seq : null;
}

// Loads and checks everything. Returns { business, clients, documents, raw, archive,
// numbering, problems, warnings }. Issued documents come from archive/ and carry
// `frozen: { issuedOn, pdf, sha256 }`.
export function loadProject(root = '.') {
  const problems = [];
  const warningSet = new Set();
  const business = loadBusiness(root, problems);
  const labels = loadLabels(root, problems);
  const clients = loadClients(root, problems);
  const raw = readDocuments(root, problems);
  const numbering = readNumbering(root, problems);
  const archive = loadArchive(root, problems);
  const result = { business, clients, documents: [], raw, archive, numbering, problems, warnings: [] };
  if (!business) return result;

  // Every language in use has every word the main language has.
  const base = labels[business.language];
  const used = new Set([business.language, ...[...clients.values()].map((c) => c.language).filter(Boolean)]);
  for (const [lang, words] of Object.entries(labels)) {
    if (!base || lang === business.language) continue;
    const missing = missingLabels(base, words);
    if (!missing.length) continue;
    const msg = `${LABELS_DIR}/${lang}.json is missing ${missing.map((k) => `"${k}"`).join(', ')} (every language needs every key in ${business.language}.json)`;
    if (used.has(lang)) problems.push(msg);
    else warningSet.add(`${msg}; no client uses it yet`);
  }

  for (const d of raw) {
    const rec = archive.get(d.number);
    if (rec) {
      // Issued: the archived document, exactly as it was sent. Its rows must not change.
      if (JSON.stringify(sourceOf(d)) !== JSON.stringify(rec.source)) {
        problems.push(`${d.where}: ${d.number} was issued on ${rec.issuedOn} and its rows have changed since. Put them back exactly as they were (${rec.file} has them under "source"); to correct it, issue a credit note.`);
      }
      result.documents.push({ ...rec.document, frozen: { issuedOn: rec.issuedOn, pdf: `archive/${rec.pdf}`, sha256: rec.sha256 } });
      continue;
    }
    const built = buildDocument(d, { business, clients, labels }, problems, warningSet);
    if (built) result.documents.push(built);
  }
  for (const [n, rec] of archive) {
    if (!raw.some((d) => d.number === n)) problems.push(`${n} was issued on ${rec.issuedOn} (${rec.file}) but its rows are no longer in data/. Put them back exactly as they were (they're under "source" in that file): an issued document can't be deleted (issue a credit note instead).`);
  }

  // The numbering store: known types, numbers in their pattern, never behind an issued document.
  for (const [type, last] of Object.entries(numbering)) {
    if (!business.documents?.[type]) problems.push(`${NUMBERING}: "${type}" is not a document type in business.json`);
    else if (last && position(business, type, last) === null) problems.push(`${NUMBERING}: "${type}": "${last}" doesn't match the pattern "${business.documents[type].numbering}"`);
  }
  for (const [n, rec] of archive) {
    const here = position(business, rec.type, n);
    const last = position(business, rec.type, numbering[rec.type]);
    if (here !== null && (last === null || last < here)) problems.push(`${NUMBERING}: "${rec.type}" must be at least ${n}, which was issued (${rec.file}); the last number issued never goes back`);
  }

  // Credit notes correct an issued invoice, in its currency, on or after its date, and
  // together never by more than its total.
  const byNumber = new Map(result.documents.map((d) => [d.number, d]));
  const credited = new Map();
  for (const d of result.documents.filter((x) => x.type === CREDIT_NOTE)) {
    const where = raw.find((r) => r.number === d.number)?.where ?? d.number;
    const inv = byNumber.get(d.corrects);
    if (!inv || inv.type !== 'invoice') {
      problems.push(`${where}: credit note ${d.number} corrects "${d.corrects}", which is not an invoice in data/`);
      continue;
    }
    if (!inv.frozen) {
      problems.push(`${where}: credit note ${d.number} corrects ${d.corrects}, which hasn't been issued. Correct a draft by editing it; once it has been sent, run \`npm run issue -- ${d.corrects}\`, then credit it.`);
      continue;
    }
    if (d.client?.id !== inv.client?.id) problems.push(`${where}: credit note ${d.number} is for "${d.client?.id}", but ${inv.number} was for "${inv.client?.id}"`);
    if (d.currency !== inv.currency) problems.push(`${where}: credit note ${d.number} is in ${d.currency}, but ${inv.number} is in ${inv.currency}`);
    if (d.issued.iso < inv.issued.iso) problems.push(`${where}: credit note ${d.number} is dated ${d.issued.iso}, before ${inv.number} (${inv.issued.iso})`);
    const digits = minorDigits(inv.currency);
    const sum = (credited.get(inv.number) ?? 0n) - fromDecimalString(d.totals.raw.total, digits);
    credited.set(inv.number, sum);
    if (sum > fromDecimalString(inv.totals.raw.total, digits)) {
      problems.push(`${where}: the credit notes for ${inv.number} add up to more than its total (${inv.totals.total})`);
    }
  }

  // Number sequences: no gaps where business.json asks for it (invoices, usually).
  for (const [type, cfg] of Object.entries(business.documents ?? {})) {
    if (!cfg.gapless || !business.patterns[type]) continue;
    const numbers = raw.filter((d) => d.type === type || archive.get(d.number)?.type === type).map((d) => d.number);
    for (const gap of findGaps(cfg.numbering, numbers, numbering[type])) {
      problems.push(`${type} numbers have a gap: ${gap} is missing (business.json documents.${type}.gapless is on: numbers that were sent can't be reused or skipped; ${NUMBERING} holds the last one issued)`);
    }
  }

  // Imported lines carry the id of the export row they came from: one row, one line.
  const sources = new Map();
  for (const d of raw) {
    for (const it of d.items) {
      if (!it.source) continue;
      if (sources.has(it.source)) problems.push(`${it.where}: source "${it.source}" was already imported (${sources.get(it.source)}); delete the duplicate line`);
      else sources.set(it.source, it.where);
    }
  }

  // Fonts the layout asks for must be shipped in assets/fonts/ (the checks ignore system fonts).
  const fontsDir = join(root, 'assets/fonts');
  const fontFiles = existsSync(fontsDir) ? readdirSync(fontsDir) : [];
  const family = business.brand?.font ?? 'Inter';
  if (!fontFiles.some((f) => f.replace(/[-_ ]/g, '').toLowerCase().startsWith(family.replace(/[-_ ]/g, '').toLowerCase()))) {
    warningSet.add(`no file in assets/fonts/ looks like the "${family}" family (brand.font); Typst will say if it can't find it`);
  }
  result.warnings = [...warningSet];
  return result;
}
