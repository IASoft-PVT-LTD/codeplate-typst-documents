// Checks that the files on disk still match assets.json (spec §5), so the agent can
// run it without CodePlate's tools:
//   - every listed file exists (fetched ones: after `npm run setup`), and every file
//     under assets/ is listed (license files named by an entry's licenseFile count as listed)
//   - PNG and SVG sizes match width/height (an SVG's viewBox), sprite sheets x frames
//   - an SVG has an element with every id in `groups`
//   - a WAV's sample rate, channels and duration match
//   - fonts under OFL-1.1 name a licenseFile that exists
//   - a fetched file's SHA-256 matches fetch.sha256
//
//   import { checkAssets } from './shared/assets.mjs';
//   const problems = checkAssets('.');            // [] when everything matches
//   node checks/shared/assets.mjs                  // prints the problems, exits 1 if any
//
// This file is shared by every CodePlate document and video template. It lives in
// codeplate's shared/checks/ and is copied into each template's checks/shared/; edit
// it there, not here.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FETCHED_DIR = 'assets/fetched/';
const SHIPPED_LICENSES = ['CodePlate-original', 'CC0-1.0', 'OFL-1.1'];
const FETCHED_LICENSES = ['CodePlate-original', 'CC0-1.0', 'OFL-1.1', 'MIT', 'Apache-2.0'];

export function pngSize(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 24 || !sig.every((b, i) => buf[i] === b) || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// The root <svg>'s viewBox size (or its width/height attributes), and every id in the file.
export function svgInfo(text) {
  const root = text.match(/<svg\b[^>]*>/)?.[0];
  if (!root) return null;
  const attr = (n) => root.match(new RegExp(`\\s${n}\\s*=\\s*["']([^"']*)["']`))?.[1];
  let width = null;
  let height = null;
  const vb = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (vb?.length === 4 && vb.every(Number.isFinite)) [width, height] = [vb[2], vb[3]];
  else if (attr('width') && attr('height')) [width, height] = [parseFloat(attr('width')), parseFloat(attr('height'))];
  const ids = new Set([...text.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]));
  return { width, height, ids };
}

// Sample rate, channels and duration (seconds) of a PCM or float WAV.
export function wavInfo(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let fmt = null;
  let dataBytes = null;
  for (let p = 12; p + 8 <= buf.length;) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(p + 10), sampleRate: buf.readUInt32LE(p + 12), byteRate: buf.readUInt32LE(p + 16) };
    if (id === 'data') dataBytes = Math.min(size, buf.length - p - 8);
    p += 8 + size + (size % 2);
  }
  if (!fmt || dataBytes === null || !fmt.byteRate) return null;
  return { sampleRate: fmt.sampleRate, channels: fmt.channels, duration: dataBytes / fmt.byteRate };
}

const SKIP = new Set(['fetched', 'generated']); // downloaded at setup, or made by the template's scripts
function filesUnder(root, rel) {
  const out = [];
  const walk = (r) => {
    const dir = join(root, r);
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${r}/${e.name}`;
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) walk(p);
      } else out.push(p);
    }
  };
  walk(rel);
  return out;
}

export function checkAssets(dir = '.', { requireFetched = true } = {}) {
  const root = resolve(dir);
  const problems = [];
  const fail = (path, msg) => problems.push(`${path}: ${msg}`);
  let data;
  try {
    data = JSON.parse(readFileSync(join(root, 'assets.json'), 'utf8'));
  } catch (e) {
    return [`assets.json: ${e.message}`];
  }
  const listed = new Set();
  const licenseFiles = new Set();
  for (const a of data.assets ?? []) {
    const p = a.path;
    listed.add(p);
    const fetched = Boolean(a.fetch);
    if (fetched && !p.startsWith(FETCHED_DIR)) fail(p, `fetched files live under ${FETCHED_DIR}`);
    if (!fetched && p.startsWith(FETCHED_DIR)) fail(p, `files under ${FETCHED_DIR} need a "fetch" entry (url, sha256, bytes)`);
    if (!(fetched ? FETCHED_LICENSES : SHIPPED_LICENSES).includes(a.license)) {
      fail(p, `license "${a.license}" is not allowed for a ${fetched ? 'fetched' : 'shipped'} file (${(fetched ? FETCHED_LICENSES : SHIPPED_LICENSES).join(', ')})`);
    }
    if (a.license === 'OFL-1.1' && a.kind !== 'font' && !fetched) fail(p, 'only fonts may ship under OFL-1.1');
    if (a.platform && !fetched) fail(p, '"platform" is only for fetched files');
    if (a.licenseFile) {
      licenseFiles.add(a.licenseFile);
      if (!existsSync(join(root, a.licenseFile))) fail(p, `its license file ${a.licenseFile} is missing`);
    } else if (a.license === 'OFL-1.1' && !fetched) {
      fail(p, 'OFL-1.1 fonts need "licenseFile": the OFL text shipped next to the font');
    }
    const full = join(root, p);
    if (!existsSync(full)) {
      if (!fetched) fail(p, 'listed in assets.json but missing on disk');
      else if (requireFetched && (!a.platform || a.platform === process.platform)) fail(p, 'not downloaded yet: run `npm run setup`');
      continue;
    }
    const buf = readFileSync(full);
    if (fetched && a.fetch.sha256 && createHash('sha256').update(buf).digest('hex') !== a.fetch.sha256) {
      fail(p, 'SHA-256 does not match fetch.sha256: delete it and run `npm run setup` again');
    }
    const lower = p.toLowerCase();
    if (a.kind === 'image' && lower.endsWith('.png')) {
      const s = pngSize(buf);
      if (!s) fail(p, 'not a valid PNG');
      else if (a.width !== undefined && a.height !== undefined) {
        const w = a.width * (a.frames ?? 1);
        if (s.width !== w || s.height !== a.height) fail(p, `PNG is ${s.width}x${s.height}, assets.json says ${w}x${a.height}`);
      }
    }
    if (a.kind === 'image' && lower.endsWith('.svg')) {
      const s = svgInfo(buf.toString('utf8'));
      if (!s) fail(p, 'not an SVG (no <svg> element)');
      else {
        if (a.width !== undefined && a.height !== undefined && (s.width !== a.width || s.height !== a.height)) {
          fail(p, `SVG viewBox is ${s.width}x${s.height}, assets.json says ${a.width}x${a.height}`);
        }
        for (const g of a.groups ?? []) if (!s.ids.has(g)) fail(p, `has no element with id="${g}" (listed in groups)`);
      }
    }
    if (a.kind === 'audio' && lower.endsWith('.wav') && (a.sampleRate || a.channels || a.duration !== undefined)) {
      const w = wavInfo(buf);
      if (!w) fail(p, 'not a readable WAV');
      else {
        if (a.sampleRate && w.sampleRate !== a.sampleRate) fail(p, `sample rate is ${w.sampleRate}, assets.json says ${a.sampleRate}`);
        if (a.channels && w.channels !== a.channels) fail(p, `${w.channels} channels, assets.json says ${a.channels}`);
        if (a.duration !== undefined && Math.abs(w.duration - a.duration) > 0.01) fail(p, `${w.duration.toFixed(3)}s long, assets.json says ${a.duration}s`);
      }
    }
  }
  for (const f of filesUnder(root, 'assets')) {
    if (!listed.has(f) && !licenseFiles.has(f)) fail(f, 'file under assets/ is not listed in assets.json');
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const problems = checkAssets(process.argv[2] ?? '.');
  for (const p of problems) console.log(p);
  if (problems.length) process.exit(1);
  console.log('assets.json matches the files on disk');
}
