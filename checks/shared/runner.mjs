// The check runner shared by CodePlate's document and video templates.
//
//   import { createRunner } from './shared/runner.mjs';
//   const run = createRunner();
//   await run.step('data', () => { ...; return true; });
//   await run.step('render', () => ..., { render: true });
//   run.finish();
//
// Each step prints its own output, then "--- <name>: pass|FAIL (<s>s)". A failing step
// doesn't stop the later ones, so one run shows every problem; the end of each failed
// step's output is repeated above the summary.
//
// Time budget: codeplate.json's checks.budget (seconds) caps the whole run, and steps
// marked { render: true } may take at most 60 seconds together (spec §6). A full run
// over budget fails the "budget" step, so slow checks get noticed and fixed. Steps marked
// { setup: true } (first-time downloads, like a renderer's browser) don't count.
//
// The last line is CODEPLATE CHECKS: PASS or CODEPLATE CHECKS: FAIL (<n> failed).
//   --skip=a,b   skip steps (for a quick loop; always finish with a full run)
//   --only=a,b   run only these steps
//
// This file is shared by every CodePlate document and video template. It lives in
// codeplate's shared/checks/ and is copied into each template's checks/shared/; edit
// it there, not here.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const RENDER_BUDGET_SECONDS = 60;

const listArg = (name) => new Set((process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '').split(',').filter(Boolean));

export function createRunner({ manifestPath = 'codeplate.json' } = {}) {
  const skip = listArg('skip');
  const only = listArg('only');
  let budget = null;
  try {
    budget = JSON.parse(readFileSync(manifestPath, 'utf8')).checks?.budget ?? null;
  } catch {
    // No manifest: no budget.
  }
  const results = [];
  const started = Date.now();
  let renderSeconds = 0;
  let setupSeconds = 0;
  let captured = '';

  // Runs a program without a shell (paths with spaces are safe) and echoes its output.
  // Returns { ok, status, stdout, stderr, out }.
  function sh(cmd, args = [], opts = {}) {
    const r = spawnSync(cmd, args, {
      encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true,
      ...opts, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...(opts.env ?? {}) },
    });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? `${r.error.message}\n` : ''}`;
    if (!opts.quiet) {
      process.stdout.write(out);
      captured += out;
    }
    return { ok: r.status === 0, status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', out };
  }

  async function step(name, fn, { render = false, setup = false } = {}) {
    if (skip.has(name) || (only.size && !only.has(name))) {
      console.log(`\n--- ${name}: skipped`);
      results.push({ name, ok: true, skipped: true });
      return true;
    }
    console.log(`\n--- ${name}`);
    const start = Date.now();
    captured = '';
    const log = console.log;
    console.log = (...a) => {
      captured += `${a.join(' ')}\n`;
      log(...a);
    };
    let ok = false;
    try {
      ok = (await fn()) !== false;
    } catch (e) {
      // Errors meant for the user (a missing tool, bad data) print as a message; bugs print a stack.
      console.log(e?.userFacing ? e.message : (e?.stack ?? String(e)));
    } finally {
      console.log = log;
    }
    const seconds = (Date.now() - start) / 1000;
    if (render) renderSeconds += seconds;
    if (setup) setupSeconds += seconds;
    console.log(`--- ${name}: ${ok ? 'pass' : 'FAIL'} (${seconds.toFixed(1)}s)`);
    results.push({ name, ok, seconds, tail: ok ? '' : captured.trim().split('\n').slice(-40).join('\n') });
    return ok;
  }

  function finish() {
    const total = (Date.now() - started) / 1000 - setupSeconds;
    const full = !skip.size && !only.size;
    if (full) {
      const over = [];
      if (budget && total > budget) over.push(`the checks took ${total.toFixed(1)}s, over the ${budget}s budget in codeplate.json`);
      if (renderSeconds > RENDER_BUDGET_SECONDS) over.push(`rendering took ${renderSeconds.toFixed(1)}s, over the ${RENDER_BUDGET_SECONDS}s render budget`);
      const note = `${total.toFixed(1)}s${budget ? ` of ${budget}s` : ''}; rendering ${renderSeconds.toFixed(1)}s of ${RENDER_BUDGET_SECONDS}s${setupSeconds >= 0.1 ? `; setup ${setupSeconds.toFixed(1)}s not counted` : ''}`;
      results.push({ name: `budget (${note})`, ok: over.length === 0, tail: over.join('\n') });
    }
    const failed = results.filter((r) => !r.ok);
    for (const r of failed.filter((f) => f.tail)) console.log(`\n=== ${r.name} failed; the end of its output:\n${r.tail}`);
    console.log(`\n${results.map((r) => `${r.ok ? (r.skipped ? 'skip' : 'pass') : 'FAIL'}  ${r.name}${r.seconds !== undefined ? ` (${r.seconds.toFixed(1)}s)` : ''}`).join('\n')}`);
    console.log(failed.length ? `CODEPLATE CHECKS: FAIL (${failed.length} failed)` : 'CODEPLATE CHECKS: PASS');
    process.exitCode = failed.length ? 1 : 0;
    return failed.length === 0;
  }

  return { step, sh, finish, log: (...a) => console.log(...a) };
}
