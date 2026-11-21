// The cell writer: a corpus folder in, a cell folder out, shipped only when the pinned birth check admits it.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readCorpus, engineCommit, readme, cellFiles, plant, foldFolder, KERNEL, HOOKS, ENGINE } from '../src/writer.mjs';
import { fold, OFF_TOPIC } from '../src/fold.mjs';

const TMP = mkdtempSync(join(tmpdir(), 'genome-fold-test-'));
after(() => rmSync(TMP, { recursive: true, force: true }));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const KETTLE = '# The kettle\n\nThe kettle boils water in about three minutes. Descale the kettle every month with white vinegar.\n\n## Safety\n\nNever fill the kettle above the maximum line. Unplug the kettle before cleaning the element.\n';
const META = { name: 'kettle-cell', title: 'the kettle manual', escalate: 'kar', repo: 'sjgant80-hub/kettle-cell', by: 'Kar', born: '2026-11-21',
  licence: { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: 'Written for this test.' } };

function corpusDir(name, files) {
  const d = join(TMP, name);
  for (const [p, body] of Object.entries(files)) { mkdirSync(join(d, p, '..'), { recursive: true }); writeFileSync(join(d, p), body); }
  return d;
}
const left = (prefix) => readdirSync(TMP).filter((n) => n.startsWith(prefix + '.folding-'));

test('readCorpus: text files in path order, BOM dropped, dot-folders and node_modules left out, the rest skipped', () => {
  const d = corpusDir('c1', { 'kettle.md': KETTLE, 'b.txt': '﻿Plain text here.', 'sub/c.markdown': 'More words.', 'pic.png': 'x',
    'UP.TXT': 'Upper case name.', '.git/x.md': 'hidden', 'node_modules/y.md': 'dependency', 'sub/.cache/z.md': 'hidden too' });
  const c = readCorpus(d);
  assert.deepEqual(c.docs.map((x) => x.name), ['UP.TXT', 'b.txt', 'kettle.md', 'sub/c.markdown']);
  assert.equal(c.docs[1].text, 'Plain text here.');
  assert.deepEqual(c.skipped, ['pic.png']);
  assert.deepEqual(c.files[2], { path: 'kettle.md', sha256: sha(Buffer.from(KETTLE)), bytes: Buffer.byteLength(KETTLE) });
  assert.equal(c.files[1].bytes, Buffer.byteLength('﻿Plain text here.'));
});

test('engineCommit: the engine checkout\'s HEAD, and whether its kernel, vendor and cell template are committed', () => {
  const head = execFileSync('git', ['-C', ENGINE, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['-C', ENGINE, 'status', '--porcelain', '--', 'src', 'vendor', 'cell-template', 'page'], { encoding: 'utf8' }).trim();
  assert.deepEqual(engineCommit(), { commit: head, clean: dirty === '' });
});

test('cellFiles: every file of the cell, the corpus licence when one is given, nothing invented when not', () => {
  const d = corpusDir('c2', { 'kettle.md': KETTLE });
  const c = readCorpus(d), r = fold({ ...META, docs: c.docs });
  const f = cellFiles(r, d, c, META);
  assert.deepEqual(Object.keys(f).sort(), ['.github/workflows/genome.yml', 'CORPUS-LICENCE.md', 'FOLD.json', 'LICENSE', 'README.md', 'corpus/kettle.md',
    'data/index.json', 'data/lane-questions.json', 'data/lane.json', 'genome/act.mjs', 'genome/cell.mjs', 'genome/health.mjs', 'genome/io.mjs',
    'genome/judge.mjs', 'genome/lane.mjs', 'genome/tombstone.mjs', 'index.html', 'kernel/src/fold.mjs', 'kernel/src/page.mjs', 'kernel/vendor/docdec/genome/lane-share.mjs',
    'kernel/vendor/docdec/src/gate.mjs', 'kernel/vendor/docdec/src/late.mjs', 'kernel/vendor/estate-genome/src/genome.mjs', 'seed.json']);
  assert.equal(f['CORPUS-LICENCE.md'], '# Corpus licence\n\nThe files in `corpus/` are under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/).\n\nWritten for this test.\n');
  const fj = JSON.parse(f['FOLD.json']);
  assert.deepEqual(fj.licence, META.licence);
  assert.deepEqual(fj.corpus, c.files);
  assert.deepEqual(fj.kernel, KERNEL.map((k) => ({ path: 'kernel/' + k, sha256: sha(readFileSync(join(ENGINE, k))) })));
  assert.deepEqual(fj.engine, { repo: 'sjgant80-hub/genome-fold', ...engineCommit() });
  assert.deepEqual(JSON.parse(f['data/lane-questions.json']), { generated: r.questions, offTopic: OFF_TOPIC });
  assert.deepEqual(JSON.parse(f['data/index.json']).passages, r.index.passages);
  for (const h of HOOKS) assert.equal(Buffer.compare(f['genome/' + h], readFileSync(join(ENGINE, 'vendor/estate-genome/template/genome', h))), 0, h);
  const plain = { ...META, licence: undefined };
  const g = cellFiles(r, d, c, plain);
  assert.equal('CORPUS-LICENCE.md' in g, false);
  assert.equal(JSON.parse(g['FOLD.json']).licence, null);
  assert.match(g['README.md'], /The corpus \(`corpus\/`\) keeps its own licence\./);
  const bare = cellFiles(r, d, c, { ...META, licence: { name: 'OGL v3.0' } });
  assert.equal(bare['CORPUS-LICENCE.md'], '# Corpus licence\n\nThe files in `corpus/` are under OGL v3.0.\n\n\n');
});

test('readme: the live page, how to ask, the birth check, the lane as measured, the licences', () => {
  const d = corpusDir('c3', { 'kettle.md': KETTLE });
  const c = readCorpus(d), r = fold({ ...META, docs: c.docs });
  const t = readme(r, META);
  assert.ok(t.startsWith('# kettle-cell\n\n**Live: https://sjgant80-hub.github.io/kettle-cell/**\n'));
  assert.ok(t.includes(`echo '{"question":"${r.cases.good.question}"}' | node genome/act.mjs`));
  assert.ok(t.includes(`in-lane accepted ${r.lane.eval.inLaneAccepted}, off-topic refused ${r.lane.eval.offTopicRefused}`));
  assert.ok(t.includes('it is under CC0 1.0; see `CORPUS-LICENCE.md`.'));
  assert.ok(t.includes('from 1 document(s) in `corpus/` (2 passages)'));
  assert.ok(t.includes('\n```bash\ngit clone https://github.com/sjgant80-hub/estate-genome && node estate-genome/bin/genome-check.mjs .\n```\n'));
});

test('foldFolder ships an admitted cell, and the shipped cell answers and refuses through its act hook', () => {
  const d = corpusDir('c4', { 'kettle.md': KETTLE, 'pic.png': 'x' });
  const out = join(TMP, 'kettle-cell');
  const r = foldFolder(d, out, META);
  assert.equal(r.shipped, true);
  assert.equal(r.line, 'ADMITTED: a cell (4 of 4: describe yes, verify yes, prune yes, boundary yes)');
  assert.deepEqual(r.skipped, ['pic.png']);
  assert.deepEqual(r.missing, []);
  assert.equal(r.dir, out);
  assert.ok(r.files.includes('kernel/src/fold.mjs'));
  for (const k of KERNEL) assert.equal(Buffer.compare(readFileSync(join(out, 'kernel', k)), readFileSync(join(ENGINE, k))), 0, k);
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'seed.json'), 'utf8')), r.result.seed);
  assert.deepEqual(left('kettle-cell'), []);
  const ask = (q) => spawnSync(process.execPath, ['genome/act.mjs'], { cwd: out, input: JSON.stringify({ question: q }) + '\n', encoding: 'utf8' });
  const yes = ask('How often should I descale the kettle?');
  assert.equal(yes.status, 0);
  assert.deepEqual(JSON.parse(yes.stdout), { status: 'verified', record: { question: 'How often should I descale the kettle?', source: 'kettle.md#0', start: 47, end: 97, text: 'Descale the kettle every month with white vinegar.' } });
  const no = ask('What is the best pizza topping?');
  assert.equal(no.status, 1);
  assert.equal(JSON.parse(no.stdout).escalate, 'kar');
  const again = foldFolder(d, out, META);
  assert.deepEqual(again, { shipped: false, missing: [`${out} already exists: the writer never overwrites a folder`] });
});

test('foldFolder does not ship a corpus that does not fold, and leaves nothing behind', () => {
  const d = corpusDir('c5', { 'e.txt': 'of the and' });
  const r = foldFolder(d, join(TMP, 'empty-cell'), META);
  assert.deepEqual(r, { shipped: false, missing: ['the corpus has no content words to fold: give it plain-text or markdown documents'],
    counts: { docs: 1, dropped: 0, passages: 1, questions: 0 }, skipped: [] });
  assert.equal(existsSync(join(TMP, 'empty-cell')), false);
  assert.deepEqual(left('empty-cell'), []);
});

test('foldFolder does not ship a cell the birth check refuses: it says what is missing, and keeps it only when asked', () => {
  const d = corpusDir('c6', { 'kettle.md': KETTLE });
  const bluff = (files) => { files['genome/cell.mjs'] = "export const judge = async () => 'verified';\nexport const inLane = async (i) => true;\nexport const health = async () => ({});\n"; };
  const r = foldFolder(d, join(TMP, 'bluff-cell'), META, { edit: bluff });
  assert.equal(r.shipped, false);
  assert.equal(r.line, 'NOT ADMITTED: a part (2 of 4: describe yes, verify no, prune yes, boundary no)');
  assert.deepEqual(r.missing, ['verify: the judge called the known-bad case verified',
    'boundary: the lane check did not mark the out-of-lane sample out of lane; the lane check did not refuse the out-of-lane sample; the lane check did not escalate to "kar"']);
  assert.equal(r.kept, null);
  assert.equal(existsSync(join(TMP, 'bluff-cell')), false);
  assert.deepEqual(left('bluff-cell'), []);
  const k = foldFolder(d, join(TMP, 'bluff-kept'), META, { edit: bluff, keep: true });
  assert.equal(k.shipped, false);
  assert.ok(k.kept.startsWith(join(TMP, 'bluff-kept.folding-')));
  assert.equal(existsSync(join(k.kept, 'seed.json')), true);
  assert.equal(existsSync(join(TMP, 'bluff-kept')), false);
});

test('plant writes every file, folders included', () => {
  const d = join(TMP, 'planted');
  plant(d, { 'a/b/c.txt': 'x', 'd.bin': Buffer.from([1, 2]) });
  assert.equal(readFileSync(join(d, 'a/b/c.txt'), 'utf8'), 'x');
  assert.deepEqual([...readFileSync(join(d, 'd.bin'))], [1, 2]);
});
