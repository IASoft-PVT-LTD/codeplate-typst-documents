import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMinimum, computeTotals, formatMoney, fromDecimalString, formatPercent, formatPrice, formatQty, lineNet, minorDigits, parseDecimal, roundDiv, taxOn,
  toDecimalString, PCT_SCALE, PRICE_SCALE, QTY_SCALE,
} from '../src/money.mjs';

const qty = (s) => parseDecimal(s, { scale: QTY_SCALE });
const price = (s) => parseDecimal(s, { scale: PRICE_SCALE, allowNegative: true });
const pct = (s) => parseDecimal(s, { scale: PCT_SCALE });

test('parseDecimal: exact, strict about format', () => {
  assert.equal(parseDecimal('1234.5', { scale: 4 }), 12345000n);
  assert.equal(parseDecimal('0.0875', { scale: 4 }), 875n);
  assert.equal(parseDecimal('7', { scale: 2 }), 700n);
  assert.equal(parseDecimal('12,5', { scale: 2, comma: true }), 1250n);
  assert.throws(() => parseDecimal('1,234.50', { scale: 2, what: 'unit price' }), /no thousands separators/);
  assert.throws(() => parseDecimal('1.23456', { scale: 4 }), /more than 4 decimals/);
  assert.throws(() => parseDecimal('-1', { scale: 2 }), /can't be negative/);
  assert.equal(parseDecimal('-1', { scale: 2, allowNegative: true }), -100n);
  assert.throws(() => parseDecimal('', { scale: 2 }), /not a number/);
  assert.throws(() => parseDecimal('£5', { scale: 2 }), /not a number/);
});

test('roundDiv rounds half away from zero', () => {
  assert.equal(roundDiv(5n, 2n), 3n);
  assert.equal(roundDiv(-5n, 2n), -3n);
  assert.equal(roundDiv(4n, 3n), 1n);
  assert.equal(roundDiv(149n, 100n), 1n);
  assert.equal(roundDiv(150n, 100n), 2n);
});

test('currencies have their own minor units', () => {
  assert.equal(minorDigits('GBP'), 2);
  assert.equal(minorDigits('JPY'), 0);
  assert.equal(minorDigits('KWD'), 3);
  assert.throws(() => minorDigits('POUNDS'), /ISO 4217/);
});

test('line amounts: quantity x price, discount, rounding to the penny', () => {
  assert.equal(lineNet({ qty: qty('3'), price: price('380') }, 2), 114000n);
  assert.equal(lineNet({ qty: qty('2.5'), price: price('58') }, 2), 14500n);
  // 3,250 words at 0.0875 = 284.375 -> 284.38
  assert.equal(lineNet({ qty: qty('3250'), price: price('0.0875') }, 2), 28438n);
  // 12 x 85 less 10% = 918
  assert.equal(lineNet({ qty: qty('12'), price: price('85'), discount: pct('10') }, 2), 91800n);
  // Yen: no minor unit
  assert.equal(lineNet({ qty: qty('1.5'), price: price('3333') }, 0), 5000n);
  // A refund line
  assert.equal(lineNet({ qty: qty('1'), price: price('-50') }, 2), -5000n);
});

test('tax is rounded once per rate by default, or per line', () => {
  const rates = { standard: pct('20'), zero: pct('0') };
  // Three lines of 0.33 at 20%: per rate 0.99 x 20% = 0.198 -> 0.20; per line 3 x 0.066 -> 3 x 0.07 = 0.21
  const lines = [{ net: 33n, taxName: 'standard' }, { net: 33n, taxName: 'standard' }, { net: 33n, taxName: 'standard' }, { net: 1000n, taxName: 'zero' }];
  const perRate = computeTotals(lines, rates);
  assert.equal(perRate.subtotal, 1099n);
  assert.equal(perRate.taxTotal, 20n);
  assert.equal(perRate.total, 1119n);
  assert.deepEqual(perRate.taxes.map((t) => [t.name, t.base, t.amount]), [['standard', 99n, 20n], ['zero', 1000n, 0n]]);
  assert.equal(computeTotals(lines, rates, 'per-line').taxTotal, 21n);
  assert.equal(taxOn(359000n, pct('20')), 71800n);
  assert.equal(taxOn(1000n, pct('7.5')), 75n);
});

test('formatting follows the locale and currency', () => {
  assert.equal(toDecimalString(123456n, 2), '1234.56');
  assert.equal(toDecimalString(5n, 2), '0.05');
  assert.equal(toDecimalString(-5n, 2), '-0.05');
  assert.equal(toDecimalString(42n, 0), '42');
  assert.equal(formatMoney(440440n, { currency: 'GBP', locale: 'en-GB', digits: 2 }), '£4,404.40');
  assert.equal(formatMoney(824200n, { currency: 'EUR', locale: 'en-GB', digits: 2 }), '€8,242.00');
  assert.match(formatMoney(824200n, { currency: 'EUR', locale: 'de-DE', digits: 2 }), /^8\.242,00\s€$/);
  assert.equal(formatMoney(5000n, { currency: 'JPY', locale: 'ja-JP', digits: 0 }), '￥5,000');
  assert.equal(formatPrice(price('0.0875'), { currency: 'GBP', locale: 'en-GB', digits: 2 }), '£0.0875');
  assert.equal(formatPrice(price('45'), { currency: 'GBP', locale: 'en-GB', digits: 2 }), '£45.00');
  assert.equal(formatQty(qty('2.5'), 'en-GB'), '2.5');
  assert.equal(formatQty(qty('2.5'), 'de-DE'), '2,5');
  assert.equal(formatPercent(pct('20'), 'en-GB'), '20%');
  assert.equal(formatPercent(pct('7.5'), 'en-GB'), '7.5%');
});

test('minimum charge per line: under, at and over, free lines and credits left alone', () => {
  const min = parseDecimal('50.00', { scale: 2 }); // 5000n pence
  assert.deepEqual(applyMinimum(3500n, min), { net: 5000n, applied: true });
  assert.deepEqual(applyMinimum(5000n, min), { net: 5000n, applied: false });
  assert.deepEqual(applyMinimum(5001n, min), { net: 5001n, applied: false });
  assert.deepEqual(applyMinimum(1n, min), { net: 5000n, applied: true });
  assert.deepEqual(applyMinimum(0n, min), { net: 0n, applied: false }, 'a free line stays free');
  assert.deepEqual(applyMinimum(-3500n, min), { net: -3500n, applied: false }, 'a credit is not raised');
  assert.deepEqual(applyMinimum(3500n, undefined), { net: 3500n, applied: false }, 'no minimum for this currency');
  // Each currency has its own minor unit: 150 zł, 5000 yen, 10.000 dinar.
  assert.equal(parseDecimal('150', { scale: minorDigits('PLN') }), 15000n);
  assert.equal(parseDecimal('5000', { scale: minorDigits('JPY') }), 5000n);
  assert.equal(parseDecimal('10.000', { scale: minorDigits('KWD') }), 10000n);
  assert.throws(() => parseDecimal('10.5', { scale: minorDigits('JPY') }), /more than 0 decimals/);
  // 190 words at 0.38 = 72.20 zł, under 150 zł
  assert.deepEqual(applyMinimum(lineNet({ qty: qty('190'), price: price('0.38') }, 2), 15000n), { net: 15000n, applied: true });
});

test('totals read back exactly from their decimal strings', () => {
  assert.equal(fromDecimalString('4404.40', 2), 440440n);
  assert.equal(fromDecimalString('-456.00', 2), -45600n);
  assert.equal(fromDecimalString('5000', 0), 5000n);
});
