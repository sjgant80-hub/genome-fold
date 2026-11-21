// run.mjs — the birth check's hands: run a part's own hooks and collect the evidence the kernel (genome.mjs) judges.
// Every hook is a shell command from the part's seed.json, run in the part's own folder. Cases and samples go in on
// stdin as one line of JSON; the hook answers with a JSON line on stdout. The tombstone is tried on a scratch COPY of
// the part, never the part itself: apply, hash, restore, hash.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseSeed, at, birth, verdictLine } from './genome.mjs';

export const SKIP = ['.git', 'node_modules', '.witness'];

// files(dir) → every file under dir as a sorted list of forward-slash relative paths, skipping SKIP folders
export function files(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (SKIP.includes(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.push(relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

// treeHash(dir) → sha256 over every file's path and bytes: equal hashes mean byte-identical trees
export function treeHash(dir) {
  const h = createHash('sha256');
  for (const f of files(dir)) h.update(f + '\0' + createHash('sha256').update(readFileSync(join(dir, f))).digest('hex') + '\n');
  return h.digest('hex');
}

// copyTree(src, dst) → dst holds a copy of src's files (SKIP folders left out)
export function copyTree(src, dst) {
  for (const f of files(src)) {
    const to = join(dst, ...f.split('/'));
    mkdirSync(join(to, '..'), { recursive: true });
    copyFileSync(join(src, ...f.split('/')), to);
  }
}

// hook(cmd, cwd, input, timeoutMs) → { code, out }: run under supervise.mjs, which kills the hook's whole process tree
// when the bound is hit (code 124). spawnSync keeps a larger bound only as a backstop.
const SUPERVISE = fileURLToPath(new URL('./supervise.mjs', import.meta.url));
export function hook(cmd, cwd, input, timeoutMs) {
  const r = spawnSync(process.execPath, [SUPERVISE, String(timeoutMs), cmd], {
    cwd, input: input === undefined ? '' : JSON.stringify(input) + '\n', encoding: 'utf8', timeout: timeoutMs + 15000, windowsHide: true,
  });
  const out = String(r.stdout || '');
  const code = r.status === null ? 124 : r.status;   // null: the backstop had to kill the supervisor itself
  return code === 124 ? { code, out: out + '\n(timed out)' } : { code, out };
}

// scratch() → a fresh folder under the system temp folder; only folders made here are ever removed
function scratch() { return mkdtempSync(join(tmpdir(), 'genome-tomb-')); }
function removeScratch(d) {
  const base = resolve(tmpdir()) + sep;
  if (resolve(d).startsWith(base + 'genome-tomb-')) rmSync(d, { recursive: true, force: true });
}

// collect(dir, seed, timeoutMs) → the runs object genome.mjs judges
export function collect(dir, seed, timeoutMs) {
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const judge = at(seed, 'judge'), cases = at(judge, 'cases'), bound = at(seed, 'boundary');
  const runs = { judge: {}, boundary: {}, health: undefined, tombstone: {} };
  if (str(at(judge, 'run'))) {
    runs.judge.good = hook(judge.run, dir, at(cases, 'good'), timeoutMs);
    runs.judge.bad = hook(judge.run, dir, at(cases, 'bad'), timeoutMs);
  }
  if (str(at(bound, 'run'))) {
    runs.boundary.inLane = hook(bound.run, dir, at(bound, 'inLane'), timeoutMs);
    runs.boundary.outOfLane = hook(bound.run, dir, at(bound, 'outOfLane'), timeoutMs);
  }
  if (str(at(at(seed, 'health'), 'run'))) runs.health = hook(seed.health.run, dir, undefined, timeoutMs);
  const tomb = at(seed, 'tombstone');
  if (str(at(tomb, 'apply')) && str(at(tomb, 'restore'))) {
    const copy = scratch();
    try {
      copyTree(dir, copy);
      const before = treeHash(copy);
      const a = hook(tomb.apply, copy, undefined, timeoutMs);
      const applied = treeHash(copy);
      const b = hook(tomb.restore, copy, undefined, timeoutMs);
      runs.tombstone = { before, applied, restored: treeHash(copy), applyCode: a.code, restoreCode: b.code };
    } finally { removeScratch(copy); }
  }
  return runs;
}

// check(dir, opts) → { dir, seedFound, result, line, runs }: the whole birth check of one part
export function check(dir, opts = {}) {
  const timeoutMs = Number.isInteger(opts.timeoutMs) ? opts.timeoutMs : 60000;
  const path = join(dir, 'seed.json');
  const seedFound = existsSync(path) && statSync(path).isFile();
  const parsed = seedFound ? parseSeed(readFileSync(path, 'utf8')) : { ok: false, why: 'no seed.json' };
  const seed = parsed.ok ? parsed.seed : {};
  const runs = parsed.ok ? collect(dir, seed, timeoutMs) : {};
  const result = birth(seed, runs);
  if (!parsed.ok) result.traits[0].reasons.unshift(parsed.why);
  return { dir, seedFound, result, line: verdictLine(result), runs };
}

export default { SKIP, files, treeHash, copyTree, hook, collect, check };
