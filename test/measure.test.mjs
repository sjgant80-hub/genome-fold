// The measurement's code, on a small synthetic set whose every number is worked out by hand, and its rules held to
// PREREG.md and to DocDec's own published record. The real run is re-derived in test/measure-data.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import M, { S1, SPLIT, RULES, r4, atLeast, atMost, extractS1, docdecRef, containsGold, cellOf, rows, metrics, measureS1 } from '../src/measure.mjs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const filler = (n, k) => Array.from({ length: n }, (_, i) => ({ qid: k + i, text: 'filler zzzq ' + i, goldId: 'K#0', impossible: false, answers: ['x'] }));
const SYN = {
  paragraphs: [
    { id: 'K#0', title: 'Kettles', text: 'The kettle boils water in three minutes. Descale the kettle every month.' },
    { id: 'K#1', title: 'Kettles', text: 'Never fill the kettle above the line. The base must stay dry.' },
    { id: 'T#0', title: 'Toasters', text: 'The toaster browns bread in two minutes. Empty the crumb tray every week.' },
  ],
  questions: [...filler(SPLIT, 'f'),
    { qid: 'a1', text: 'How often should I descale the kettle?', goldId: 'K#0', impossible: false, answers: ['every month'] },
    { qid: 'a2', text: 'How often is the crumb tray emptied?', goldId: 'K#1', impossible: false, answers: ['every week'] },
    { qid: 'a3', text: 'What is the best pizza topping?', goldId: 'K#1', impossible: false, answers: ['dry'] },
    { qid: 'u1', text: 'What must stay dry?', goldId: null, impossible: true, answers: [] },
    { qid: 'u2', text: 'Who won the cup?', goldId: null, impossible: true, answers: [] }],
  oos: [...filler(SPLIT, 'g'),
    { qid: 'o1', text: 'What is the best pizza topping?' },
    { qid: 'o2', text: 'descale crumb zebra' },
    { qid: 'o3', text: 'How often should I descale the kettle?' }],
  col: { dropped: true },
};

test('rows: one per eval question (the first SPLIT of each set are DocDec\'s tune split and are not read)', () => {
  const cell = cellOf(SYN);
  assert.equal(cell.lane.share, 0.5);
  assert.equal(cell.generated.length, 20);
  const rs = rows(SYN, cell);
  assert.deepEqual(rs.map((r) => [r.qid, r.set, r.inLane, r.status, r.top, r.source, r.contains]), [
    ['a1', 'answerable', true, 'verified', 'K#0', 'K#0', true],
    ['a2', 'answerable', true, 'verified', 'T#0', 'T#0', true],
    ['a3', 'answerable', false, 'refused', null, null, false],
    ['u1', 'unanswerable', true, 'verified', 'K#1', 'K#1', false],
    ['u2', 'unanswerable', false, 'refused', null, null, false],
    ['o1', 'offTopic', false, 'refused', null, null, false],
    ['o2', 'offTopic', true, 'unverified', 'K#0', null, false],
    ['o3', 'offTopic', true, 'verified', 'K#0', 'K#0', false],
  ]);
  assert.deepEqual(rs.map((r) => r.gold), ['K#0', 'K#1', 'K#1', null, null, null, null, null]);
});

test('metrics: M1 to M5 as PREREG.md defines them, each with its rule and verdict', () => {
  const m = measureS1(SYN);
  const v = (k) => [m.metrics[k].count, m.metrics[k].of, m.metrics[k].value];
  assert.deepEqual(v('M1'), [1, 3, 0.3333]);
  assert.deepEqual(v('M2'), [2, 3, 0.6667]);
  assert.deepEqual(v('M2lane'), [1, 3, 0.3333]);
  assert.deepEqual(v('M3'), [2, 3, 0.6667]);
  assert.deepEqual(v('M3right'), [1, 3, 0.3333]);
  assert.deepEqual(v('M4'), [1, 2, 0.5]);
  assert.deepEqual(v('M5'), [2, 3, 0.6667]);
  assert.deepEqual(Object.fromEntries(Object.entries(m.metrics).map(([k, x]) => [k, [x.rule, x.pass]])), {
    M1: [0.6682, false], M2: [0.82, false], M2lane: [0.82, false], M3: [0.5899, true], M3right: [0.53, false], M4: [0.8867, false], M5: [0.4608, true] });
  assert.deepEqual(m.n, { paragraphs: 3, generated: 20, answerable: 3, unanswerable: 2, offTopic: 3 });
  assert.equal(m.rows.length, 8);
  assert.deepEqual(metrics([{ set: 'answerable', status: 'verified', top: 'a', gold: 'b', source: 'a', contains: false }]).M3right.count, 0);
  assert.deepEqual(metrics([{ set: 'answerable', status: 'refused', top: 'a', gold: 'a', source: null, contains: false }]).M1.count, 1);
  assert.ok(Number.isNaN(metrics('garbage').M1.value));
});

test('containsGold: a SQuAD-normalised gold answer inside the normalised text; empty golds never count', () => {
  const t = 'Descale the kettle every month.';
  assert.equal(containsGold(t, ['every month']), true);
  assert.equal(containsGold(t, ['EVERY Month!']), true);
  assert.equal(containsGold(t, ['every week', 'kettle']), true);
  assert.equal(containsGold(t, ['every week']), false);
  assert.equal(containsGold(t, ['', 'the']), false);
  assert.equal(containsGold(t, 'every month'), false);
});

test('atLeast and atMost are inclusive; r4 rounds to four places', () => {
  assert.equal(atLeast(0.5, 0.5), true);
  assert.equal(atLeast(0.4999, 0.5), false);
  assert.equal(atMost(100, 100), true);
  assert.equal(atMost(100.01, 100), false);
  assert.equal(r4(2 / 3), 0.6667);
  // numbers only: nothing is coerced into a pass
  assert.ok(Number.isNaN(r4('0.5')));
  for (const [v, t] of [[10n, 1], ['0.6', 0.5], [0.6, '0.5'], [null, 0], [0.6, undefined]]) {
    assert.equal(atLeast(v, t), false, `${typeof v} ${typeof t}`);
    assert.equal(atMost(t, v), false, `${typeof t} ${typeof v}`);
  }
  assert.equal(atMost(0.4, 0.5) && atLeast(0.6, 0.5), true);
});

test('extractS1 keeps only the paragraphs and the questions, and says where they came from and under what licence', () => {
  const e = extractS1(SYN);
  assert.deepEqual(Object.keys(e), ['source', 'licence', 'paragraphs', 'questions', 'oos']);
  assert.deepEqual(e.source, S1);
  assert.match(e.licence, /CC BY-SA 4\.0/);
  assert.deepEqual(e.paragraphs[0], SYN.paragraphs[0]);
  assert.deepEqual(e.questions[SPLIT], SYN.questions[SPLIT]);
  assert.deepEqual(e.oos[SPLIT], SYN.oos[SPLIT]);
  assert.deepEqual(extractS1({ paragraphs: [{ id: 'a', extra: 1 }] }).paragraphs, [{ id: 'a', title: null, text: null }]);
  assert.deepEqual(extractS1(null).questions, []);
});

test('the pass rules are DocDec\'s own published numbers, read from its record, and are the ones PREREG.md committed', () => {
  const ref = docdecRef(read('../vendor/docdec/data/v2/record.json'), read('../vendor/docdec/data/v2/measured.json'));
  assert.deepEqual(ref, { colbertTop1: 0.8295, cosineTop1: 0.6682, offTopicRefused: 1, answered: 0.5899, answeredRight: 0.53,
    unanswerableRefused: 0.8867, exactAnswers: 0.4608, secondsPerQuestion: 15.6 });
  const lane = read('../vendor/docdec/data/genome-lane.json');
  assert.deepEqual(RULES, { M1: ref.cosineTop1, M2: lane.eval.offTopicRefused, M2lane: lane.eval.offTopicRefused, M3: ref.answered,
    M3right: ref.answeredRight, M4: ref.unanswerableRefused, M5: ref.exactAnswers, M6ms: 100 });
  const prereg = readFileSync(new URL('../PREREG.md', import.meta.url), 'utf8');
  for (const t of ['at least 0.6682', 'at least 0.82', 'at least 0.5899', 'at least 0.5300', 'at least 0.8867', 'at least 0.4608', 'at most 100 ms']) {
    assert.ok(prereg.includes(t), t);
  }
  assert.ok(prereg.includes(S1.sha256) && prereg.includes(S1.commit.slice(0, 7)));
  assert.deepEqual(docdecRef(null, null).answered, NaN);
});

test('the default export carries the public surface', () => {
  for (const k of ['extractS1', 'docdecRef', 'containsGold', 'cellOf', 'rows', 'metrics', 'measureS1']) assert.equal(typeof M[k], 'function', k);
});
