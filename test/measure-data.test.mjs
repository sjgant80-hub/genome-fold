// The published measurement re-derives from the shipped data: data/s1-text.json from DocDec's upstream S1 file at its
// pinned commit, and data/measure.json + data/measure-questions.json from data/s1-text.json with the current kernel.
// Only the timing (M6) and the date are left out: they depend on the machine and the moment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractS1, measureS1, S1, RULES } from '../src/measure.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => JSON.parse(readFileSync(ROOT + p, 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');

async function upstreamS1() {
  const sibling = ROOT + '../docdecdemo';
  if (existsSync(sibling + '/.git')) {
    try { return execFileSync('git', ['-C', sibling, 'show', `${S1.commit}:${S1.path}`], { maxBuffer: 1 << 26 }); } catch { /* fetch it instead */ }
  }
  const r = await fetch(`https://raw.githubusercontent.com/${S1.repo}/${S1.commit}/${S1.path}`);
  assert.equal(r.status, 200, 'the upstream S1 file could not be read');
  return Buffer.from(await r.arrayBuffer());
}

test('data/s1-text.json is exactly the paragraphs and questions of DocDec\'s S1 file at its pinned commit', async () => {
  const up = await upstreamS1();
  assert.equal(sha(up), S1.sha256);
  assert.deepEqual(read('data/s1-text.json'), extractS1(JSON.parse(up.toString('utf8'))));
});

test('data/measure.json and data/measure-questions.json re-derive from data/s1-text.json with the current kernel', () => {
  const pub = read('data/measure.json'), m = measureS1(read('data/s1-text.json'));
  assert.equal(pub.kernel.sha256, sha(readFileSync(ROOT + 'src/fold.mjs')), 'the kernel changed since the measurement: re-run scripts/measure.mjs');
  assert.equal(pub.data.extractSha256, sha(readFileSync(ROOT + 'data/s1-text.json')));
  assert.deepEqual(pub.lane, m.lane);
  assert.deepEqual(pub.n, m.n);
  const { M6, ...rest } = pub.metrics;
  assert.deepEqual(rest, m.metrics);
  assert.equal(M6.rule, RULES.M6ms);
  assert.equal(M6.pass, M6.medianMs <= RULES.M6ms);
  assert.deepEqual(read('data/measure-questions.json'), m.rows);
});
