// Unpacks a .zip (stored or deflated entries, the kind tool releases ship) into a folder,
// dropping the archive's single top-level folder if it has one. Keeps Unix file modes, so
// binaries stay executable on macOS and Linux. Used by fetch.mjs for "unpack" entries.
//
// This file is shared by every CodePlate document and video template. It lives in
// codeplate's shared/checks/ and is copied into each template's checks/shared/; edit
// it there, not here.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';

export function unzip(buf, into) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('broken zip directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const attrs = buf.readUInt32LE(p + 38);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.push({ name, method, csize, local, mode: (attrs >>> 16) & 0o777 });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const tops = new Set(entries.map((e) => e.name.split('/')[0]));
  const strip = tops.size === 1 && entries.some((e) => e.name.includes('/')) ? `${[...tops][0]}/` : '';
  const root = normalize(into);
  let files = 0;
  for (const e of entries) {
    const rel = e.name.startsWith(strip) ? e.name.slice(strip.length) : e.name;
    if (!rel || rel.endsWith('/')) continue;
    const target = normalize(join(root, rel));
    if (!target.startsWith(root + sep)) throw new Error(`zip entry ${e.name} points outside the folder`);
    const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
    const body = buf.subarray(start, start + e.csize);
    const data = e.method === 8 ? inflateRawSync(body) : e.method === 0 ? body : null;
    if (!data) throw new Error(`zip entry ${e.name} uses compression method ${e.method}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    if (process.platform !== 'win32' && e.mode) chmodSync(target, e.mode);
    files++;
  }
  return files;
}
