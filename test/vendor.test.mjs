// The vendored pieces are the upstream files, byte for byte, at the commit they are pinned to.
// Two checks per file: its bytes hash to the recorded sha256 (offline), and they equal the upstream file at that commit
// (read from a sibling clone with git when one is on this machine, else fetched from GitHub at that exact commit).
// No skip: if the upstream file cannot be read, the test fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VENDOR = JSON.parse(readFileSync(new URL('../vendor/VENDOR.json', import.meta.url), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');

async function upstream(f) {
  const sibling = ROOT + '../' + f.repo.split('/')[1];
  if (existsSync(sibling + '/.git')) {
    try { return execFileSync('git', ['-C', sibling, 'show', `${f.commit}:${f.upstream}`], { maxBuffer: 1 << 26 }); }
    catch { /* the sibling clone does not have that commit: fetch it instead */ }
  }
  const r = await fetch(`https://raw.githubusercontent.com/${f.repo}/${f.commit}/${f.upstream}`);
  assert.equal(r.status, 200, `upstream ${f.repo}@${f.commit.slice(0, 7)}:${f.upstream} could not be read`);
  return Buffer.from(await r.arrayBuffer());
}

test('every vendored file is pinned to a full commit and hashes to its recorded sha256', () => {
  assert.ok(VENDOR.files.length >= 13);
  for (const f of VENDOR.files) {
    assert.match(f.commit, /^[0-9a-f]{40}$/, f.path);
    assert.equal(sha(readFileSync(ROOT + f.path)), f.sha256, f.path);
  }
});

test('every vendored file equals the upstream file at its pinned commit, byte for byte', async () => {
  for (const f of VENDOR.files) {
    const up = await upstream(f);
    assert.equal(sha(up), f.sha256, `${f.path} differs from ${f.repo}@${f.commit.slice(0, 7)}:${f.upstream}`);
    assert.ok(Buffer.compare(up, readFileSync(ROOT + f.path)) === 0, f.path);
  }
});

test('the pieces the fold kernel composes are there and are what it expects', async () => {
  const gate = await import('../vendor/docdec/src/gate.mjs');
  const lane = await import('../vendor/docdec/genome/lane-share.mjs');
  const genome = await import('../vendor/estate-genome/src/genome.mjs');
  assert.deepEqual(gate.findSpan('The  Normans settled.', 'the normans'), { start: 0, end: 12, text: 'The  Normans' });
  assert.deepEqual(gate.sentenceAround('One. Two three. Four.', 5, 8), { start: 5, end: 15, text: 'Two three.' });
  assert.equal(lane.laneShare('church zzzq', lane.vocabulary([{ title: 'a', text: 'church' }])), 0.5);
  assert.equal(genome.GENOME, '1');
  assert.equal(typeof genome.describe, 'function');
});
