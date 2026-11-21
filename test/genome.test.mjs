// The fold engine as a cell of the estate genome: its seed's cases and samples behave as the birth check needs, its
// hooks are the kernel's own functions, and the pinned birth check admits it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { judge, inLane, act, health } from '../genome/cell.mjs';
import { describe } from '../vendor/estate-genome/src/genome.mjs';
import { check } from '../vendor/estate-genome/src/run.mjs';

const seed = JSON.parse(readFileSync(new URL('../seed.json', import.meta.url), 'utf8'));

test('the seed describes the engine in full', () => {
  assert.deepEqual(describe(seed), { trait: 'describe', pass: true, reasons: [] });
});

test('judge: the good case is verified, the bad case (one word altered) is not, garbage is refused', async () => {
  assert.equal(await judge(seed.judge.cases.good), 'verified');
  assert.equal(await judge(seed.judge.cases.bad), 'unverified');
  assert.equal(await judge({ corpus: seed.judge.cases.good.corpus, record: { ...seed.judge.cases.good.record, start: 'x' } }), 'refused');
  assert.equal(await judge(null), 'refused');
});

test('lane: a corpus is taken; a question with no corpus is not', async () => {
  assert.equal(await inLane(seed.boundary.inLane), true);
  assert.equal(await inLane(seed.boundary.outOfLane), false);
  assert.equal(await inLane({ corpus: [] }), false);
});

test('act folds the corpus into a cell, or says what is missing', async () => {
  const r = await act({ docs: seed.boundary.inLane.corpus, name: 'kettle-cell', title: 'the kettle manual', escalate: 'kar', repo: 'sjgant80-hub/kettle-cell', by: 'Kar', born: '2026-11-21' });
  assert.equal(r.ok, true);
  assert.equal(r.seed.name, 'kettle-cell');
  assert.equal('index' in r, false);
  assert.equal((await act({ docs: [] })).ok, false);
});

test('health says what the engine cannot measure from inside its repository', async () => {
  assert.deepEqual(await health(), { used: null, dependedOn: null, lastEarned: null });
});

test('the birth check at the pinned commit admits the engine', () => {
  const c = check(fileURLToPath(new URL('../', import.meta.url)));
  assert.equal(c.line, 'ADMITTED: a cell (4 of 4: describe yes, verify yes, prune yes, boundary yes)');
});
