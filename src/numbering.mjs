// Document numbers from a pattern in business.json, like "INV-{yyyy}-{nnn}":
//   {yyyy}  the year the document is issued
//   {nnn}   a sequence number, zero-padded to as many digits as there are n's
// Everything else is literal text.
//
// Each document type is a series. data/numbering.json stores the last number *issued*
// (sent) in each series, so the next number never depends only on which rows are still
// in data/: deleting rows can't make the sequence start again (src/archive.mjs writes it;
// docs/recipes/numbering.md).

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function compilePattern(pattern) {
  if (!/\{n+\}/.test(pattern)) throw new Error(`numbering pattern "${pattern}" needs a sequence like {nnn}`);
  let re = '^';
  const groups = [];
  for (const part of pattern.split(/(\{yyyy\}|\{n+\})/)) {
    if (part === '{yyyy}') {
      re += '(\\d{4})';
      groups.push('year');
    } else if (/^\{n+\}$/.test(part)) {
      re += `(\\d{${part.length - 2},})`;
      groups.push('seq');
    } else re += escape(part);
  }
  const regex = new RegExp(`${re}$`);
  const width = pattern.match(/\{(n+)\}/)[1].length;
  return {
    pattern,
    hasYear: pattern.includes('{yyyy}'),
    parse(number) {
      const m = regex.exec(number);
      if (!m) return null;
      const out = {};
      groups.forEach((g, i) => {
        out[g] = Number(m[i + 1]);
      });
      return out;
    },
    format({ year, seq }) {
      return pattern.replace('{yyyy}', String(year)).replace(/\{n+\}/, String(seq).padStart(width, '0'));
    },
  };
}

// The stored last-issued number, parsed, if it counts for `year` (patterns without
// {yyyy} run on forever, so it always counts).
function lastFor(p, last, year) {
  const parsed = last ? p.parse(last) : null;
  if (!parsed) return 0;
  return !p.hasYear || parsed.year === year ? parsed.seq : 0;
}

// The next free number for a pattern: one after the highest of the numbers already used
// that year and the last number issued (data/numbering.json).
export function nextNumber(pattern, used, year, last = null) {
  const p = compilePattern(pattern);
  let max = lastFor(p, last, year);
  for (const n of used) {
    const parsed = p.parse(n);
    if (parsed && (!p.hasYear || parsed.year === year)) max = Math.max(max, parsed.seq);
  }
  return p.format({ year, seq: max + 1 });
}

// Gaps in a sequence (per year when the pattern has {yyyy}): many tax authorities expect
// invoice numbers to run without gaps. Returns messages like "INV-2026-044 is missing".
// With `last` (the last number issued), the sequence must also reach it (an issued
// document whose rows were deleted is missing) and the first draft after it must follow
// it directly.
export function findGaps(pattern, used, last = null) {
  const p = compilePattern(pattern);
  const byYear = new Map();
  for (const n of used) {
    const parsed = p.parse(n);
    if (!parsed) continue;
    const key = parsed.year ?? 0;
    byYear.set(key, [...(byYear.get(key) ?? []), parsed.seq]);
  }
  const lastParsed = last ? p.parse(last) : null;
  if (lastParsed && !byYear.has(lastParsed.year ?? 0)) byYear.set(lastParsed.year ?? 0, []);
  const gaps = [];
  for (const [year, seqs] of [...byYear].sort((a, b) => a[0] - b[0])) {
    const L = lastParsed && (lastParsed.year ?? 0) === year ? lastParsed.seq : 0;
    const sorted = [...new Set(seqs)].sort((a, b) => a - b);
    if (!sorted.length && L) {
      // Only the stored number for this year: nothing in data/ to compare (all sent before
      // this project, or removed with the sample). Fine.
      continue;
    }
    const from = L ? Math.min(sorted[0], L + 1) : sorted[0];
    const to = Math.max(sorted.at(-1), L);
    // Numbers below the first one in data/ (and up to L) were issued before this project.
    const have = new Set(sorted);
    for (let s = from; s <= to; s++) if (!have.has(s)) gaps.push(p.format({ year, seq: s }));
  }
  return gaps;
}
