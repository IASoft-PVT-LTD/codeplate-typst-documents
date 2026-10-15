// Finds a command-line tool that a template's checks and scripts need, the same way
// on Windows, macOS and Linux, and checks its version. The lookup order:
//   1. an environment variable holding the full path (TYPST, FFMPEG, FFPROBE, ...)
//   2. the template's assets/fetched/tools/<tool>/ folders (binaries `npm run setup` downloads)
//   3. PATH
//   4. the usual install folders: winget, Scoop and Chocolatey on Windows; Homebrew
//      and MacPorts on macOS; ~/.local/bin, /usr/local/bin, Linuxbrew and Snap on Linux
//
// From a shell (prints the path, or how to install the tool, and exits 1):
//   node checks/shared/find-tool.mjs typst --accept 0.15
// From code:
//   import { findTool } from './shared/find-tool.mjs';
//   const typst = findTool('typst', { accept: '0.15' });   // { path, version } or { error }
//
// `accept` is a version rule: "0.15" (that major.minor, any patch), "0.15.1" (exactly),
// ">=6.1" (that version or newer). Leave it out to take any version.
//
// "browser" (Chrome, Edge or Chromium, for Marp and the slide checks) is never run to read
// a version: on Windows `chrome --version` opens a window. It is found by file only.
//
// This file is shared by every CodePlate document and video template. It lives in
// codeplate's shared/checks/ and is copied into each template's checks/shared/; edit
// it there, not here.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';
const HOME = homedir();
const env = (k) => process.env[k] ?? '';

// What each tool is called, how it reports its version, and how to install it.
// `{v}` in an install hint is replaced by the accepted version.
export const TOOLS = {
  typst: {
    env: 'TYPST',
    names: ['typst'],
    versionArgs: ['--version'],
    versionRe: /typst (\d+\.\d+\.\d+)/,
    winget: 'Typst.Typst',
    install: {
      win32: 'winget install --id Typst.Typst -e --version {v}',
      darwin: 'brew install typst (then check `typst --version`), or unpack typst-aarch64-apple-darwin.tar.xz from https://github.com/typst/typst/releases into ~/.local/bin',
      linux: 'unpack typst-x86_64-unknown-linux-musl.tar.xz from https://github.com/typst/typst/releases into ~/.local/bin',
    },
  },
  ffmpeg: {
    env: 'FFMPEG',
    names: ['ffmpeg'],
    versionArgs: ['-version'],
    versionRe: /ffmpeg version n?(\d+(?:\.\d+){0,2})/,
    winget: 'Gyan.FFmpeg',
    install: {
      win32: 'winget install --id Gyan.FFmpeg -e',
      darwin: 'brew install ffmpeg',
      linux: 'sudo apt install ffmpeg (or your distribution\'s package)',
    },
  },
  browser: {
    env: 'CHROME_PATH',
    names: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'msedge', 'microsoft-edge', 'microsoft-edge-stable'],
    versionArgs: null,
    // Installed browsers and Playwright's Chromium, by full path (they are rarely on PATH).
    paths: () => {
      const out = [];
      if (WIN) {
        for (const base of [env('ProgramFiles'), env('ProgramFiles(x86)'), env('LOCALAPPDATA')].filter(Boolean)) {
          out.push(join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'), join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            join(base, 'Chromium', 'Application', 'chrome.exe'));
        }
      } else if (MAC) {
        for (const base of ['/Applications', join(HOME, 'Applications')]) {
          out.push(join(base, 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'), join(base, 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge'),
            join(base, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
            join(base, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'));
        }
      } else {
        out.push('/opt/google/chrome/chrome', '/opt/microsoft/msedge/msedge', '/snap/bin/chromium');
      }
      // Playwright's own Chromium (`npx playwright install chromium`), newest first.
      const cache = WIN ? join(env('LOCALAPPDATA'), 'ms-playwright') : MAC ? join(HOME, 'Library', 'Caches', 'ms-playwright') : join(HOME, '.cache', 'ms-playwright');
      for (const d of safeList(cache).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
        const root = join(cache, d);
        out.push(join(root, 'chrome-win64', 'chrome.exe'), join(root, 'chrome-win', 'chrome.exe'), join(root, 'chrome-linux64', 'chrome'),
          join(root, 'chrome-linux', 'chrome'));
        for (const mac of ['chrome-mac-arm64', 'chrome-mac-x64', 'chrome-mac']) {
          out.push(join(root, mac, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
            join(root, mac, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'));
        }
      }
      return out;
    },
    install: {
      win32: 'Microsoft Edge comes with Windows; or install Google Chrome; or run `npx playwright install chromium`',
      darwin: 'install Google Chrome (https://www.google.com/chrome/), or run `npx playwright install chromium`',
      linux: 'install Chromium or Google Chrome (e.g. `sudo apt install chromium-browser`), or run `npx playwright install chromium`',
    },
  },
  // espeak-ng (GPL-3.0) is only ever run as a separate program: it turns text into
  // phonemes for the Kokoro voice. A copy unpacked without an installer needs
  // ESPEAK_DATA_PATH pointing at the folder that holds espeak-ng-data.
  'espeak-ng': {
    env: 'ESPEAK_NG',
    names: ['espeak-ng'],
    versionArgs: ['--version'],
    versionRe: /text-to-speech:\s*(\d+\.\d+(?:\.\d+)?)/,
    versionEnv: (path) => (existsSync(join(dirname(path), 'espeak-ng-data')) ? { ESPEAK_DATA_PATH: dirname(path) } : {}),
    paths: () => {
      const out = [];
      if (WIN) {
        for (const base of [env('ProgramFiles'), env('ProgramFiles(x86)')].filter(Boolean)) out.push(join(base, 'eSpeak NG', 'espeak-ng.exe'));
        const programs = join(env('LOCALAPPDATA'), 'Programs');
        for (const d of safeList(programs).filter((n) => /^espeak-ng/i.test(n))) out.push(join(programs, d, 'eSpeak NG', 'espeak-ng.exe'), join(programs, d, 'espeak-ng.exe'));
      }
      return out;
    },
    install: {
      win32: 'winget install --id eSpeak-NG.eSpeak-NG -e (it asks for permission to install)',
      darwin: 'brew install espeak-ng',
      linux: 'sudo apt install espeak-ng',
    },
  },
  rhubarb: {
    env: 'RHUBARB',
    names: ['rhubarb'],
    versionArgs: ['--version'],
    versionRe: /version (\d+\.\d+\.\d+)/,
    install: {
      win32: 'run `npm run setup` (it downloads Rhubarb Lip Sync into assets/fetched/tools/rhubarb/)',
      darwin: 'run `npm run setup` (it downloads Rhubarb Lip Sync into assets/fetched/tools/rhubarb/; on Apple silicon it needs Rosetta: softwareupdate --install-rosetta)',
      linux: 'run `npm run setup` (it downloads Rhubarb Lip Sync into assets/fetched/tools/rhubarb/)',
    },
  },
  ffprobe: {
    env: 'FFPROBE',
    names: ['ffprobe'],
    versionArgs: ['-version'],
    versionRe: /ffprobe version n?(\d+(?:\.\d+){0,2})/,
    winget: 'Gyan.FFmpeg',
    install: {
      win32: 'winget install --id Gyan.FFmpeg -e (ffprobe comes with it)',
      darwin: 'brew install ffmpeg (ffprobe comes with it)',
      linux: 'sudo apt install ffmpeg (ffprobe comes with it)',
    },
  },
};

// Folders where installers usually put binaries, for when PATH hasn't caught up
// (a fresh winget install only reaches PATH in new terminals).
function usualDirs(spec) {
  const dirs = [];
  if (WIN) {
    const local = env('LOCALAPPDATA');
    dirs.push(join(local, 'Microsoft', 'WinGet', 'Links'));
    // winget's portable installs unpack to Packages\<id>_<source>\<folder>\.
    const pkgs = join(local, 'Microsoft', 'WinGet', 'Packages');
    if (spec.winget && existsSync(pkgs)) {
      for (const p of safeList(pkgs).filter((n) => n.startsWith(`${spec.winget}_`))) {
        const root = join(pkgs, p);
        dirs.push(root);
        for (const sub of safeList(root)) {
          dirs.push(join(root, sub));
          dirs.push(join(root, sub, 'bin'));
        }
      }
    }
    dirs.push(join(HOME, 'scoop', 'shims'), 'C:\\ProgramData\\chocolatey\\bin', join(HOME, '.cargo', 'bin'));
    for (const pf of [env('ProgramFiles'), env('ProgramFiles(x86)')].filter(Boolean)) {
      for (const n of spec.names) dirs.push(join(pf, n), join(pf, n, 'bin'));
    }
  } else {
    if (MAC) dirs.push('/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin');
    dirs.push(join(HOME, '.local', 'bin'), join(HOME, '.cargo', 'bin'), '/usr/local/bin', '/usr/bin',
      '/home/linuxbrew/.linuxbrew/bin', '/snap/bin');
  }
  return dirs;
}

function safeList(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function candidatesIn(dir, names) {
  const exts = WIN ? ['.exe', '.cmd', '.bat', ''] : [''];
  const out = [];
  for (const n of names) for (const e of exts) out.push(join(dir, n + e));
  return out;
}

export function versionOf(path, spec) {
  if (!spec.versionArgs) return null;
  const r = spawnSync(path, spec.versionArgs, {
    encoding: 'utf8', timeout: 20000, windowsHide: true, shell: WIN && /\.(cmd|bat)$/i.test(path),
    env: { ...process.env, ...(spec.versionEnv?.(path) ?? {}) },
  });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return text.match(spec.versionRe)?.[1] ?? null;
}

const parts = (v) => v.split('.').map((n) => Number(n));

// Does `version` satisfy the rule `accept` ("0.15", "0.15.1", ">=6.1")?
export function accepts(accept, version) {
  if (!accept) return true;
  if (!version) return false;
  if (accept.startsWith('>=')) {
    const want = parts(accept.slice(2));
    const have = parts(version);
    for (let i = 0; i < want.length; i++) {
      const h = have[i] ?? 0;
      if (h !== want[i]) return h > want[i];
    }
    return true;
  }
  const want = parts(accept);
  const have = parts(version);
  return want.every((n, i) => have[i] === n);
}

// Returns { path, version, via } for the first candidate whose version is accepted,
// or { error } saying what was found and how to install the right version.
// requireTool() does the same but throws the error (marked userFacing, so the check
// runner prints it without a stack trace).
export function findTool(name, { accept, root = process.cwd(), spec: given } = {}) {
  const spec = given ?? TOOLS[name];
  if (!spec) throw new Error(`find-tool: unknown tool "${name}"`);
  const seen = new Set();
  const rejected = [];
  const tryPath = (p, via) => {
    const full = resolve(p);
    if (seen.has(full.toLowerCase()) || !isFile(full)) return null;
    seen.add(full.toLowerCase());
    const version = versionOf(full, spec);
    if (accepts(accept, version)) return { path: full, version, via };
    rejected.push(`${full} (${version ? `version ${version}` : 'no version output'})`);
    return null;
  };

  const fromEnv = env(spec.env);
  if (fromEnv) {
    const hit = tryPath(fromEnv, `$${spec.env}`);
    if (hit) return hit;
    if (!isFile(fromEnv)) rejected.push(`$${spec.env}=${fromEnv} (no such file)`);
  }
  const groups = [
    ['assets/fetched/tools', safeList(join(root, 'assets', 'fetched', 'tools')).flatMap((d) => [join(root, 'assets', 'fetched', 'tools', d), join(root, 'assets', 'fetched', 'tools', d, 'bin')])],
    ['PATH', env('PATH').split(delimiter).filter(Boolean)],
    ['usual install folder', usualDirs(spec)],
  ];
  for (const [via, dirs] of groups) {
    for (const d of dirs) {
      for (const c of candidatesIn(d, spec.names)) {
        const hit = tryPath(c, via);
        if (hit) return hit;
      }
    }
  }
  for (const c of spec.paths?.() ?? []) {
    const hit = tryPath(c, 'usual install folder');
    if (hit) return hit;
  }
  const hint = (spec.install?.[process.platform] ?? spec.install?.linux ?? '').replaceAll('{v}', accept?.replace(/^>=/, '') ?? 'latest');
  const lines = [`${name}${accept ? ` ${accept}` : ''} was not found.`];
  if (rejected.length) lines.push(`Found, but not an accepted version: ${rejected.join('; ')}.`);
  if (hint) lines.push(`Install it: ${hint}`);
  lines.push(`Or set ${spec.env} to the full path of the binary.`);
  return { error: lines.join('\n') };
}

export function requireTool(name, options) {
  const r = findTool(name, options);
  if (r.error) {
    const err = new Error(r.error);
    err.userFacing = true;
    throw err;
  }
  return r;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [name, ...rest] = process.argv.slice(2);
  const i = rest.indexOf('--accept');
  const accept = i >= 0 ? rest[i + 1] : undefined;
  if (!name) {
    console.error(`usage: node find-tool.mjs <${Object.keys(TOOLS).join('|')}> [--accept 0.15]`);
    process.exit(2);
  }
  const r = findTool(name, { accept });
  if (r.error) {
    console.error(r.error);
    process.exit(1);
  }
  console.log(r.path);
  console.error(`${name}${r.version ? ` ${r.version}` : ""} (found via ${r.via})`);
}
