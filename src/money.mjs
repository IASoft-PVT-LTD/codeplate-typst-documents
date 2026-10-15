// Money math with exact integers, never floating point: 0.1 + 0.2 must be 0.3 on an invoice.
//
// Amounts are BigInt "minor units" (pence, cents; yen have none) of the document's currency.
// Quantities have up to 3 decimals (1.5 hours, 0.25 days), unit prices up to 4 (0.0875 per
// word), percentages (tax rates, discounts) up to 3. Rounding is half away from zero, to
// the currency's minor unit, once per line and once per tax rate (see computeTotals).

export const QTY_SCALE = 3;
export const PRICE_SCALE = 4;
export const PCT_SCALE = 3;

const pow10 = (n) => 10n ** BigInt(n);

// "1234.5" -> 12345000n with scale 4. Accepts a leading minus and, when `comma` is set
// (semicolon-separated CSV from European spreadsheets), "1234,5". Thousands separators
// are refused: "1,234" is ambiguous.
export function parseDecimal(input, { scale, what = 'number', comma = false, allowNegative = false }) {
  const raw = String(input ?? '').trim();
  const s = comma ? raw.replace(',', '.') : raw;
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) {
    const hint = /[,.].*[,.]|\d,\d{3}\b/.test(raw) ? ' (no thousands separators: write 1234.50)' : '';
    throw new Error(`${what} "${raw}" is not a number${hint}`);
  }
  const [, minus, whole, frac = ''] = m;
  if (frac.length > scale) throw new Error(`${what} "${raw}" has more than ${scale} decimals`);
  if (minus && !allowNegative) throw new Error(`${what} "${raw}" can't be negative`);
  const v = BigInt(whole) * pow10(scale) + BigInt(frac.padEnd(scale, '0') || '0');
  return minus ? -v : v;
}

// Divide and round half away from zero.
export function roundDiv(n, d) {
  const neg = (n < 0n) !== (d < 0n);
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (ad * 2n);
  return neg ? -q : q;
}

// Decimal places of a currency's minor unit (GBP 2, JPY 0, KWD 3).
export function minorDigits(currency) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    throw new Error(`"${currency}" is not an ISO 4217 currency code (like GBP, EUR, USD)`);
  }
}

// A line's net amount in minor units: quantity x unit price, less a percentage discount.
export function lineNet({ qty, price, discount = 0n }, digits) {
  const gross = roundDiv(qty * price, pow10(QTY_SCALE + PRICE_SCALE - digits));
  const off = roundDiv(gross * discount, pow10(PCT_SCALE + 2));
  return gross - off;
}

// A minimum charge per line (business.json "lineMinimum", per currency, in minor units):
// a line whose net amount is above zero but below the minimum is charged the minimum.
// Free lines (0) and credits (negative) are left alone. Returns { net, applied }.
export function applyMinimum(net, minimum) {
  if (minimum === undefined || minimum === null || net <= 0n || net >= minimum) return { net, applied: false };
  return { net: minimum, applied: true };
}

// Tax on a net amount at a percentage rate (scaled by PCT_SCALE).
export function taxOn(net, rate) {
  return roundDiv(net * rate, pow10(PCT_SCALE + 2));
}

// Subtotal, tax per rate and total. Tax is worked out once per rate on the sum of the
// lines at that rate ("per-rate" rounding, what most tax authorities expect), or on each
// line and then added up ("per-line"). Lines are { net, taxName }; rates maps a name to
// its scaled percentage.
export function computeTotals(lines, rates, rounding = 'per-rate') {
  const subtotal = lines.reduce((a, l) => a + l.net, 0n);
  const byRate = new Map();
  for (const l of lines) {
    if (l.taxName === null || l.taxName === undefined) continue; // no tax charged
    const t = byRate.get(l.taxName) ?? { name: l.taxName, rate: rates[l.taxName], base: 0n, amount: 0n };
    t.base += l.net;
    if (rounding === 'per-line') t.amount += taxOn(l.net, t.rate);
    byRate.set(l.taxName, t);
  }
  const taxes = [...byRate.values()].sort((a, b) => (b.rate > a.rate ? 1 : b.rate < a.rate ? -1 : 0));
  if (rounding !== 'per-line') for (const t of taxes) t.amount = taxOn(t.base, t.rate);
  const taxTotal = taxes.reduce((a, t) => a + t.amount, 0n);
  return { subtotal, taxes, taxTotal, total: subtotal + taxTotal };
}

// 123456n with 2 digits -> "1234.56" (exact, for Intl and for JSON).
export function toDecimalString(v, digits) {
  const neg = v < 0n;
  const a = (neg ? -v : v).toString().padStart(digits + 1, '0');
  const s = digits ? `${a.slice(0, -digits)}.${a.slice(-digits)}` : a;
  return neg ? `-${s}` : s;
}

// "4404.40" (a document's totals.raw value) -> 440440n, for comparing documents' totals.
export function fromDecimalString(s, digits) {
  return parseDecimal(s, { scale: digits, what: 'amount', allowNegative: true });
}

export function formatMoney(minor, { currency, locale, digits }) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(toDecimalString(minor, digits));
}

// A unit price may carry more decimals than the currency (0.0875 per word): show them
// all, but at least the currency's.
export function formatPrice(price, { currency, locale, digits }) {
  const s = toDecimalString(price, PRICE_SCALE).replace(/0+$/, '');
  const shown = Math.max(digits, s.split('.')[1]?.length ?? 0);
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: shown, maximumFractionDigits: shown }).format(s);
}

export function formatQty(qty, locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: QTY_SCALE }).format(toDecimalString(qty, QTY_SCALE));
}

export function formatPercent(pct, locale) {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: PCT_SCALE }).format(toDecimalString(pct, PCT_SCALE + 2));
}
