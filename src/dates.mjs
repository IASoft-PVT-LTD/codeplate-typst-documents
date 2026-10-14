// Calendar dates as plain "YYYY-MM-DD" strings, worked out in UTC so a document dated
// 2026-10-01 says 1 October everywhere, whatever the computer's time zone.

export function parseDate(input, what = 'date') {
  const s = String(input ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`${what} "${s}" must be written YYYY-MM-DD (like 2026-10-01)`);
  return realDate(Number(m[1]), Number(m[2]), Number(m[3]), s, what);
}

function realDate(y, mo, d, s, what) {
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    throw new Error(`${what} "${s}" is not a real date`);
  }
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Dates the way another program exports them, for imports: a format made of DD, MM and
// YYYY with any separator, like "DD/MM/YYYY", "MM/DD/YYYY", "DD.MM.YYYY" or "YYYY-MM-DD".
// Single-digit days and months ("2/10/2026") are accepted. Returns "YYYY-MM-DD".
export function dateFormatRegex(format) {
  const order = [];
  const re = String(format).replace(/YYYY|MM|DD|[.*+?^${}()|[\]\\]/g, (t) => {
    if (t === 'YYYY') { order.push('y'); return '(\\d{4})'; }
    if (t === 'MM') { order.push('m'); return '(\\d{1,2})'; }
    if (t === 'DD') { order.push('d'); return '(\\d{1,2})'; }
    return `\\${t}`;
  });
  if (order.length !== 3 || new Set(order).size !== 3) throw new Error(`date format "${format}" needs DD, MM and YYYY once each`);
  return { regex: new RegExp(`^${re}$`), order };
}

export function parseDateAs(input, format, what = 'date') {
  const s = String(input ?? '').trim();
  const { regex, order } = dateFormatRegex(format);
  const m = regex.exec(s);
  if (!m) throw new Error(`${what} "${s}" is not written ${format}`);
  const v = {};
  order.forEach((k, i) => { v[k] = Number(m[i + 1]); });
  return realDate(v.y, v.m, v.d, s, what);
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The last day of the month a date is in: 2026-10-14 -> 2026-10-31.
export function endOfMonth(iso) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// "long": 1 October 2026 (the details box); "medium": 1 Oct 2026 (inside line details).
export function formatDate(iso, locale, style = 'long') {
  return new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
