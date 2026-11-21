// bin/fold.mjs: the command line around the writer — usage, a corpus that does not fold, and one that does.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/fold.mjs', import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), 'genome-fold-cli-'));
after(() => rmSync(TMP, { recursive: true, force: true }));
const run = (...a) => spawnSync(process.execPath, [BIN, ...a], { encoding: 'utf8' });
const META = ['--name', 'kettle-cell', '--title', 'the kettle manual', '--repo', 'sjgant80-hub/kettle-cell', '--by', 'Kar', '--escalate', 'kar', '--born', '2026-11-21'];

test('usage: two folders and a name, else exit 2', () => {
  assert.equal(run().status, 2);
  assert.equal(run(TMP, ...META).status, 2);
  assert.equal(run(TMP, join(TMP, 'o'), '--title', 'x').status, 2);
  assert.match(run().stderr, /usage: fold <corpus-dir> <out-dir> --name <slug>/);
});

test('a corpus that does not fold is not shipped: exit 1 and what is missing', () => {
  const d = join(TMP, 'empty'); mkdirSync(d); writeFileSync(join(d, 'e.txt'), 'of the and');
  const r = run(d, join(TMP, 'empty-out'), ...META, '--keep');
  assert.equal(r.status, 1);
  assert.equal(r.stdout, 'NOT SHIPPED. What is missing:\n  - the corpus has no content words to fold: give it plain-text or markdown documents\n');
  assert.equal(existsSync(join(TMP, 'empty-out')), false);
});

test('a corpus that folds is shipped: exit 0, the counts, the lane and the birth check line', () => {
  const d = join(TMP, 'kettle'); mkdirSync(d);
  writeFileSync(join(d, 'kettle.md'), '# The kettle\n\nThe kettle boils water in about three minutes. Descale the kettle every month with white vinegar.\n');
  writeFileSync(join(d, 'pic.png'), 'x');
  const out = join(TMP, 'kettle-out');
  const r = run(d, out, ...META, '--licence', 'CC0 1.0', '--licence-url', 'https://creativecommons.org/publicdomain/zero/1.0/', '--attribution', 'Test text.');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines[0], `folded: 1 document(s), 1 passages, 20 lane questions → ${out}`);
  assert.equal(lines[1], 'skipped (not text): pic.png');
  assert.match(lines[2], /^lane: in lane when at least \d+% .* \(eval: in-lane accepted [\d.]+, off-topic refused [\d.]+\)$/);
  assert.equal(lines[3], 'ADMITTED: a cell (4 of 4: describe yes, verify yes, prune yes, boundary yes)');
  assert.ok(readdirSync(out).includes('CORPUS-LICENCE.md'));
});
