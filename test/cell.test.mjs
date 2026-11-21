// The hooks every folded cell carries (cell-template/genome/): planted into a fresh cell, they answer through the kernel
// over that cell's own index and lane share. No birth check here (test/writer.test.mjs runs it), so this stays fast.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { cellFiles, plant } from '../src/writer.mjs';
import { fold } from '../src/fold.mjs';

const TMP = mkdtempSync(join(tmpdir(), 'genome-fold-cell-'));
after(() => rmSync(TMP, { recursive: true, force: true }));
const KETTLE = '# The kettle\n\nThe kettle boils water in about three minutes. Descale the kettle every month with white vinegar.\n\n## Safety\n\nNever fill the kettle above the maximum line. Unplug the kettle before cleaning the element.\n';
const META = { name: 'kettle-cell', title: 'the kettle manual', escalate: 'simon', repo: 'sjgant80-hub/kettle-cell', by: 'Kar', born: '2026-11-21' };
const docs = [{ name: 'kettle.md', text: KETTLE }];
const result = fold({ ...META, docs });
const CELL = join(TMP, 'cell');
plant(CELL, cellFiles(result, TMP, { files: [], skipped: [] }, META));
const ask = (q) => spawnSync(process.execPath, ['genome/act.mjs'], { cwd: CELL, input: JSON.stringify({ question: q }) + '\n', encoding: 'utf8' });

test('act.mjs: a verified record and exit 0; a refusal, escalated to the seed\'s party, and exit 1', () => {
  const yes = ask('How often should I descale the kettle?');
  assert.equal(yes.status, 0);
  assert.deepEqual(JSON.parse(yes.stdout), { status: 'verified', record: { question: 'How often should I descale the kettle?', source: 'kettle.md#0', start: 47, end: 97, text: 'Descale the kettle every month with white vinegar.' } });
  const no = ask('What is the best pizza topping?');
  assert.equal(no.status, 1);
  assert.deepEqual(JSON.parse(no.stdout), { status: 'refused', why: 'out of lane: too few of the question\'s words are words this corpus uses', escalate: 'simon' });
  const withheld = ask('vinegar element zebra giraffe');
  assert.equal(withheld.status, 1);
  assert.equal(JSON.parse(withheld.stdout).status, 'unverified');
});

test('cell.mjs: judge, lane and health over the cell\'s own index and lane share', async () => {
  const cell = await import(pathToFileURL(join(CELL, 'genome', 'cell.mjs')).href);
  assert.equal(cell.LANE.share, result.lane.share);
  assert.equal(cell.INDEX.passages.length, 2);
  assert.equal(await cell.judge(result.cases.good), 'verified');
  assert.equal(await cell.judge(result.cases.bad), 'unverified');
  assert.equal(await cell.judge({ nonsense: true }), 'refused');
  assert.equal(await cell.inLane(result.samples.inLane), true);
  assert.equal(await cell.inLane(result.samples.outOfLane), false);
  assert.equal((await cell.act({ question: 'How often should I descale the kettle?' })).status, 'verified');
  assert.deepEqual(await cell.health(), { used: null, dependedOn: null, lastEarned: null });
});
