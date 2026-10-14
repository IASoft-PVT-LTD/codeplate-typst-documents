// Downloads the files assets.json lists with a "fetch" entry (models, voices, tool
// binaries) into assets/fetched/, checking each one's size and SHA-256. Files already
// there with the right hash are kept, so it's cheap to run again.
//
//   import { fetchAssets } from './shared/fetch.mjs';
//   await fetchAssets('.', { only: (a) => a.path.startsWith('assets/fetched/kokoro/') });
//   node checks/shared/fetch.mjs [path-prefix]          from a shell
//
// Entries with a "platform" are fetched only on that platform (win32, darwin, linux).
// Entries with fetch.unpack (a folder under assets/fetched/) are zips: after the download
// they're unpacked there (the archive's top folder dropped), e.g. a tool and its data files.
// This file is shared by every CodePlate document and video template. It lives in
// codeplate's shared/checks/ and is copied into each template's checks/shared/; edit
// it there, not here.
import { createHash } from 'node:crypto';
import { unzip } from './unzip.mjs';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function fetchList(root = '.', { only = () => true } = {}) {
  const data = JSON.parse(readFileSync(join(root, 'assets.json'), 'utf8'));
  return (data.assets ?? []).filter((a) => a.fetch && (!a.platform || a.platform === process.platform) && only(a));
}

// Returns the entries that were downloaded. Throws (userFacing) on a network error or a
// hash mismatch, saying which file and what to do.
export async function fetchAssets(root = '.', { only, log = console.log } = {}) {
  const got = [];
  for (const a of fetchList(root, { only })) {
    const target = join(root, a.path);
    const unpacked = !a.fetch.unpack || existsSync(join(root, a.fetch.unpack));
    if (existsSync(target) && unpacked && sha256(readFileSync(target)) === a.fetch.sha256) continue;
    if (existsSync(target) && !unpacked && sha256(readFileSync(target)) === a.fetch.sha256) {
      unzip(readFileSync(target), join(root, a.fetch.unpack));
      got.push(a);
      continue;
    }
    log(`downloading ${a.path} (${(a.fetch.bytes / 1e6).toFixed(1)} MB) from ${new URL(a.fetch.url).host}`);
    let buf;
    try {
      const res = await fetch(a.fetch.url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      const err = new Error(`Could not download ${a.path} from ${a.fetch.url}: ${e.message}. Check the connection (or a proxy) and run it again.`);
      err.userFacing = true;
      throw err;
    }
    if (buf.length !== a.fetch.bytes || sha256(buf) !== a.fetch.sha256) {
      const err = new Error(`${a.path}: the download doesn't match assets.json (size ${buf.length}, expected ${a.fetch.bytes}; or a different SHA-256). It was not saved. If the source really changed, update the entry from its page (${a.source}).`);
      err.userFacing = true;
      throw err;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(`${target}.part`, buf);
    rmSync(target, { force: true });
    renameSync(`${target}.part`, target);
    if (a.fetch.unpack) {
      rmSync(join(root, a.fetch.unpack), { recursive: true, force: true });
      log(`unpacking into ${a.fetch.unpack}`);
      unzip(buf, join(root, a.fetch.unpack));
    }
    got.push(a);
  }
  return got;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const prefix = process.argv[2] ?? '';
  fetchAssets('.', { only: (a) => a.path.startsWith(prefix) }).then(
    (got) => console.log(got.length ? `${got.length} file(s) downloaded or unpacked` : 'everything is already downloaded'),
    (e) => {
      console.error(e.message);
      process.exitCode = 1;
    },
  );
}
