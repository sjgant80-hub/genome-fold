// The fold kernel: every decision point pinned by a case that fails if it flips. Small corpora only, so the mutation
// gate stays fast; the real-corpus numbers live in the measurement (PREREG.md, data/measure.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import F from '../src/fold.mjs';
import { docsOf, passagesOf, buildIndex, isIndex, terms, answer, judgeRecord, inLaneOf, act, laneQuestions, chooseLane, alter,
  cases, draftSeed, preview, fold, engineJudge, engineLane, LIMITS, OFF_TOPIC, TEMPLATES, QUESTIONS, BM25 } from '../src/fold.mjs';
import { laneShare, vocabulary, measure } from '../vendor/docdec/genome/lane-share.mjs';

const KETTLE = `# The kettle

The kettle boils water in about three minutes. Descale the kettle every month with white vinegar.

## Safety

Never fill the kettle above the maximum line. Unplug the kettle before cleaning the element.

The base must stay dry; wipe spills from the base at once.`;
const META = { name: 'kettle-cell', title: 'the kettle manual', escalate: 'kar', repo: 'sjgant80-hub/kettle-cell', by: 'Kar', born: '2026-11-21' };
const kettle = () => buildIndex(passagesOf([{ name: 'kettle.md', text: KETTLE }]));

// BM25 written out again, independently, to pin the kernel's scores to the formula
function bm25(ps, q) {
  const toks = ps.map((p) => (p.title + ' ' + p.text).toLowerCase().match(/[a-z0-9]+/g) || []);
  const avg = toks.reduce((a, t) => a + t.length, 0) / ps.length;
  return toks.map((t) => q.reduce((s, w) => {
    const f = t.filter((x) => x === w).length, d = toks.filter((u) => u.includes(w)).length;
    const idf = Math.log(1 + (ps.length - d + 0.5) / (d + 0.5));
    return s + idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * t.length / avg));
  }, 0));
}

test('docsOf: text only, safe distinct names, and the character limit is inclusive', () => {
  assert.deepEqual(docsOf([{ name: 'a b/c.md', text: 'x' }, { name: '', text: 'y' }, { text: '  ' }, { name: 'n' }, 5, null]),
    [{ name: 'a-b-c.md', text: 'x' }, { name: 'doc', text: 'y' }]);
  assert.deepEqual(docsOf([{ name: 'x', text: '1' }, { name: 'x', text: '2' }, { name: 'x-2', text: '3' }, { name: 'x', text: '4' }]).map((d) => d.name),
    ['x', 'x-2', 'x-2-3', 'x-4']);
  assert.deepEqual(docsOf([{ name: 'x', text: '1' }, { name: 'x-3', text: '2' }, { name: 'x', text: '3' }]).map((d) => d.name), ['x', 'x-3', 'x-3-3']);
  assert.equal(docsOf([{ text: 'a'.repeat(LIMITS.chars) }]).length, 1);
  assert.equal(docsOf([{ text: 'a'.repeat(LIMITS.chars + 1) }]).length, 0);
  assert.equal(docsOf(Array.from({ length: LIMITS.docs + 5 }, () => ({ text: 'a' }))).length, LIMITS.docs);
  assert.deepEqual(docsOf('not a list'), []);
});

test('passagesOf: blank lines and headings cut passages; a heading titles what follows; whitespace is one space', () => {
  assert.deepEqual(passagesOf([{ name: 'k.md', text: 'Intro  line\r\nmore\n\n# Part one #\nBody one.\n   \nBody two\n\n#nohead\n\n## \nLast.' }]), [
    { id: 'k.md#0', title: 'k.md', text: 'Intro line more' },
    { id: 'k.md#1', title: 'Part one', text: 'Body one.' },
    { id: 'k.md#2', title: 'Part one', text: 'Body two' },
    { id: 'k.md#3', title: 'Part one', text: '#nohead' },
    { id: 'k.md#4', title: 'k.md', text: 'Last.' },
  ]);
  assert.deepEqual(passagesOf([{ name: 'e', text: '# Only a heading\n\n' }]), []);
});

test('buildIndex keeps passages with an id and text, the first of each id, and is the only thing read as an index', () => {
  const ix = buildIndex([{ id: 'a', title: 'T', text: 'one two' }, { id: '', text: 'no id' }, { id: 'b', text: ' ' }, { id: 'a', text: 'again' }, { id: 'c', text: 'three' }, 7]);
  assert.deepEqual(ix.passages.map((p) => p.id), ['a', 'c']);
  assert.deepEqual(ix.passages[1], { id: 'c', title: '', text: 'three' });
  assert.equal(isIndex(ix), true);
  assert.equal(isIndex({ ...ix }), false);
  assert.equal(isIndex(null), false);
});

test('terms: distinct content words, in order', () => {
  assert.deepEqual(terms('Why did the Kettle, the KETTLE, boil in 2015?'), ['kettle', 'boil', '2015']);
  assert.deepEqual(terms(42), []);
});

test('answer: the BM25 best passage, and in it the sentence carrying the most question weight, anchored by findSpan', () => {
  const ix = kettle();
  const a = answer(ix, 'How often should I descale with vinegar?');
  assert.deepEqual(a.record, { source: 'kettle.md#0', start: 47, end: 97, text: 'Descale the kettle every month with white vinegar.' });
  assert.equal(a.passage, 0);
  const want = bm25(ix.passages, ['often', 'should', 'descale', 'vinegar']);
  assert.ok(Math.abs(a.score - want[0]) < 1e-12, `${a.score} vs ${want[0]}`);
  const b = answer(ix, 'What must stay dry at once?');
  assert.deepEqual(b.record, { source: 'kettle.md#2', start: 0, end: 58, text: 'The base must stay dry; wipe spills from the base at once.' });
  assert.deepEqual(terms('What must stay dry at once?'), ['stay', 'dry', 'once']);
  assert.ok(Math.abs(b.score - bm25(ix.passages, ['stay', 'dry', 'once'])[2]) < 1e-12);
  assert.deepEqual(BM25, { k1: 1.2, b: 0.75 });
});

test('answer: every word counted (repeats raise a passage), and the earliest passage and sentence win a tie', () => {
  const ix = buildIndex([{ id: 'a', text: 'Red fox. Blue fox runs.' }, { id: 'b', text: 'Red fox. Blue fox runs.' }, { id: 'c', text: 'Green owl. Owl owl sleeps.' }]);
  assert.deepEqual(answer(ix, 'fox?').record, { source: 'a', start: 0, end: 8, text: 'Red fox.' });
  const o = answer(ix, 'owl?');
  assert.deepEqual(o.record, { source: 'c', start: 0, end: 10, text: 'Green owl.' });
  assert.ok(Math.abs(o.score - bm25(ix.passages, ['owl'])[2]) < 1e-12);
  assert.deepEqual(answer(ix, 'Blue runs?').record, { source: 'a', start: 9, end: 23, text: 'Blue fox runs.' });
});

test('answer: a word only in the title picks the passage and its first sentence', () => {
  const ix = buildIndex([{ id: 'a', title: 'Ferns', text: 'They like shade. They need water.' }, { id: 'b', title: 'Cacti', text: 'Dry soil.' }]);
  assert.deepEqual(answer(ix, 'ferns?').record, { source: 'a', start: 0, end: 16, text: 'They like shade.' });
});

test('answer refuses: no index, no content words, no shared word, and a sentence findSpan cannot anchor', () => {
  const ix = kettle();
  assert.equal(answer(null, 'kettle?').refuse, true);
  assert.equal(answer({}, 'kettle?').why, 'no index to answer from');
  assert.equal(answer(ix, 'Is it of the?').why, 'the question has no content words');
  assert.equal(answer(ix, 'zebra giraffe?').why, 'no passage uses any of the question\'s content words');
  const greek = buildIndex([{ id: 'g', text: 'Alpha ΟΔΟΣ.' }]);
  assert.equal(answer(greek, 'alpha?').why, 'the sentence could not be anchored to its offsets');
});

const GOOD = { question: 'How often should I descale the kettle?', source: 'kettle.md#0', start: 47, end: 97, text: 'Descale the kettle every month with white vinegar.' };

test('judgeRecord: exact characters at the offsets, and the passage carries the lane share of the question', () => {
  const ix = kettle();
  assert.equal(judgeRecord(ix, GOOD, 0.5), 'verified');
  assert.equal(judgeRecord(ix, { ...GOOD, text: 'Descale the kettle every week with white vinegar.' }, 0.5), 'unverified');
  assert.equal(judgeRecord(ix, { ...GOOD, start: 46 }, 0.5), 'unverified');
  assert.equal(judgeRecord(ix, { ...GOOD, start: 0, end: 3, text: 'The' }, 0.5), 'verified');
  // the share is inclusive: often, descale, kettle → descale and kettle are in the passage, 2 of 3; and 2 of 4 at 0.5
  assert.equal(judgeRecord(ix, GOOD, 0.75), 'unverified');
  assert.equal(judgeRecord(ix, GOOD, 0.6), 'verified');
  assert.equal(judgeRecord(ix, { ...GOOD, question: 'kettle descale zebra giraffe' }, 0.5), 'verified');
  assert.equal(judgeRecord(ix, { ...GOOD, question: 'kettle descale zebra giraffe' }, 0.51), 'unverified');
  assert.equal(judgeRecord(ix, { ...GOOD, question: 'zebra giraffe?' }, 0.5), 'unverified');
  // offsets that slice the same characters from the wrong place are not the record
  const p = ix.passages[0].text;
  assert.equal(judgeRecord(ix, { ...GOOD, start: -9, end: -3, text: p.slice(-9, -3) }, 0.5), 'unverified');
  assert.equal(judgeRecord(ix, { ...GOOD, start: 47, end: 1000, text: p.slice(47) }, 0.5), 'unverified');
});

test('judgeRecord refuses what is not an answer record of this index', () => {
  const ix = kettle();
  for (const bad of [null, 'x', [], {}, { ...GOOD, question: 5 }, { ...GOOD, start: '47' }, { ...GOOD, start: 47.5 }, { ...GOOD, end: '97' },
    { ...GOOD, start: '0', end: 3, text: 'The' }, { ...GOOD, start: 0, end: '3', text: 'The' }, { ...GOOD, text: '' }, { ...GOOD, start: 0, end: 0, text: '' },
    { ...GOOD, text: '   ' }, { ...GOOD, text: 7 }, { ...GOOD, source: 'kettle.md#9' }, { ...GOOD, source: 0 }]) {
    assert.equal(judgeRecord(ix, bad, 0.5), 'refused', JSON.stringify(bad));
  }
  assert.equal(judgeRecord({ ...ix }, GOOD, 0.5), 'refused');
});

test('inLaneOf: a question whose content words the corpus uses, at least the share of them, inclusive', () => {
  const ix = kettle();
  assert.equal(inLaneOf(ix, { question: 'kettle zebra' }, 0.5), true);
  assert.equal(inLaneOf(ix, { question: 'kettle zebra giraffe' }, 0.5), false);
  assert.equal(inLaneOf(ix, { question: 'kettle descale zebra' }, 0.67), false);
  assert.equal(inLaneOf(ix, { question: 'kettle descale vinegar zebra giraffe lion' }, 0.5), true);
  for (const bad of [null, {}, { question: 5 }, { question: ['kettle descale'] }, 'kettle']) assert.equal(inLaneOf(ix, bad, 0.5), false, JSON.stringify(bad));
  assert.equal(inLaneOf(null, { question: 'kettle' }, 0.5), false);
  assert.equal(inLaneOf({ vocab: new Set(['kettle']) }, { question: 'kettle' }, 0.5), false);
});

test('act: out of lane is refused and escalated; in lane leaves only as a verified record', () => {
  const ix = kettle();
  assert.deepEqual(act(ix, 0.5, { question: 'How often should I descale the kettle?' }, 'kar'), { status: 'verified', record: GOOD });
  assert.deepEqual(act(ix, 0.5, { question: 'What is the best pizza topping?' }, 'kar'),
    { status: 'refused', why: 'out of lane: too few of the question\'s words are words this corpus uses', escalate: 'kar' });
  assert.equal(act(ix, 0.5, { question: 'pizza' }, 7).escalate, '');
  // in lane at the corpus, but the best passage carries too few of the words: withheld, no text shown
  const w = act(ix, 0.5, { question: 'vinegar element spills zebra' }, 'kar');
  assert.deepEqual(w, { status: 'unverified', why: 'withheld: the best passage carries too few of the question\'s words to verify an answer' });
  // a share of 0 lets a wordless question into the lane; the answerer still refuses it
  assert.deepEqual(act(ix, 0, { question: 'of the' }, 'kar'), { status: 'refused', why: 'the question has no content words' });
});

test('laneQuestions: frames over each passage\'s rarest words, spread evenly, between the min and max count', () => {
  const ix = buildIndex([{ id: 'a', text: 'Alpha beta gamma beta.' }, { id: 'b', text: 'Of the and.' }, { id: 'c', text: 'Gamma delta.' }]);
  const q = laneQuestions(ix);
  assert.equal(q.length, QUESTIONS.min);
  assert.deepEqual(q.slice(0, 12), [
    'What does the text say about alpha?', 'Where is alpha beta explained?', 'Which part covers alpha beta gamma?',
    'What happens with alpha?', 'Who is responsible for alpha beta?', 'What does the text say about alpha beta gamma?',
    'Where is alpha explained?', 'Which part covers alpha beta?', 'What happens with alpha beta gamma?', 'Who is responsible for alpha?',
    'What does the text say about delta?', 'Where is delta gamma explained?',
  ]);
  assert.equal(q[19], 'Who is responsible for delta gamma?');
  const big = buildIndex(Array.from({ length: QUESTIONS.max + 50 }, (_, i) => ({ id: 'p' + i, text: 'word' + i + ' shared' })));
  const bq = laneQuestions(big);
  assert.equal(bq.length, QUESTIONS.max);
  assert.equal(bq[1], 'Where is word1 shared explained?');
  assert.equal(bq[QUESTIONS.max - 1], 'Who is responsible for word448 shared?');
  const mid = buildIndex(Array.from({ length: 30 }, (_, i) => ({ id: 'p' + i, text: 'word' + i })));
  assert.equal(laneQuestions(mid).length, 30);
  assert.deepEqual(laneQuestions(buildIndex([{ id: 'x', text: 'Of the and.' }])), []);
  assert.deepEqual(laneQuestions(null), []);
  assert.equal(TEMPLATES.length, 5);
});

test('chooseLane is DocDec\'s measurement, unchanged, over the generated questions and the fixed off-topic set', () => {
  const ix = kettle(), q = laneQuestions(ix);
  const want = measure({ paragraphs: ix.passages, questions: q.map((text) => ({ text })), oos: OFF_TOPIC.map((text) => ({ text })) });
  assert.deepEqual(chooseLane(ix, q), want);
  assert.equal(chooseLane(null, q), null);
  assert.equal(OFF_TOPIC.length, 60);
  assert.equal(new Set(OFF_TOPIC).size, 60);
});

test('alter: the first content word swapped for the next corpus content word, else the previous, else doubled', () => {
  const ix = buildIndex([{ id: 'a', text: 'The goods had hello zulu.' }]);
  const r = { question: 'q', source: 'a', start: 0, end: 25, text: 'The goods had hello zulu.' };
  assert.deepEqual(alter(r, ix), { ...r, text: 'The hello had hello zulu.' });
  assert.deepEqual(alter({ ...r, text: 'Zulu goods' }, ix), { ...r, text: 'hello goods' });
  assert.deepEqual(alter({ ...r, text: 'hello' }, ix), { ...r, text: 'zulu' });
  const one = buildIndex([{ id: 'a', text: 'Of the kettle.' }]);
  assert.deepEqual(alter({ text: 'the kettle.' }, one), { text: 'the kettlekettle.' });
  assert.equal(alter({ text: 'of the' }, ix), null);
  assert.equal(alter(r, null), null);
});

test('cases: the first generated question with a verified record is the good case; the bad case is it altered', () => {
  const ix = kettle(), q = laneQuestions(ix);
  const c = cases(ix, 0.5, q);
  assert.deepEqual(c.good, { question: 'Where is boils water explained?', source: 'kettle.md#0', start: 0, end: 46, text: 'The kettle boils water in about three minutes.' });
  assert.deepEqual(c.bad, { ...c.good, text: 'The line boils water in about three minutes.' });
  assert.equal(cases(ix, 2, q), null);
  assert.equal(cases(ix, 0.5, 'not a list'), null);
});

test('draftSeed: the manifest, with the title capped, the lane named, and nothing invented', () => {
  const s = draftSeed(META, { cases: { good: 1, bad: 2 }, samples: { inLane: 3, outOfLane: 4 } });
  assert.equal(s.purpose, 'Answers questions about the kettle manual from its own text only: the best-supported sentence, word for word, with its passage and character offsets. Refuses questions outside its lane.');
  assert.deepEqual(s.lane, { id: 'kettle-cell', accepts: 'a question about the kettle manual', refuses: 'questions whose words the the kettle manual text does not use' });
  assert.deepEqual(s.judge.cases, { good: 1, bad: 2 });
  assert.deepEqual([s.boundary.inLane, s.boundary.outOfLane, s.boundary.escalate], [3, 4, 'kar']);
  assert.deepEqual(s.provenance, { repo: 'sjgant80-hub/kettle-cell', by: 'Kar', born: '2026-11-21' });
  assert.equal(draftSeed({ ...META, lane: 'kettles' }, {}).lane.id, 'kettles');
  assert.equal(draftSeed({ name: 'n' }, {}).lane.accepts, 'a question about n');
  const t120 = 'x'.repeat(120);
  assert.equal(draftSeed({ title: t120 }, {}).lane.accepts, 'a question about ' + t120);
  assert.equal(draftSeed({ title: 'y'.repeat(121) }, {}).lane.accepts, 'a question about ' + 'y'.repeat(119) + '…');
  assert.equal(draftSeed({ title: 'ab '.repeat(60) }, {}).lane.accepts, 'a question about ' + 'ab '.repeat(40).trim() + '…');
  const e = draftSeed(null, null);
  assert.deepEqual([e.name, e.judge.cases.good, e.judge.cases.bad, e.boundary.inLane, e.boundary.outOfLane], ['', null, null, null, null]);
});

test('preview: describe, verify and boundary as the birth check judges them; prune is left to the written folder', () => {
  const ix = kettle();
  const seed = draftSeed(META, { cases: { good: GOOD, bad: { ...GOOD, text: 'x' + GOOD.text } }, samples: { inLane: { question: 'kettle?' }, outOfLane: { question: 'pizza?' } } });
  const ok = preview(ix, 0.5, seed);
  assert.deepEqual(ok.describe, { pass: true, reasons: [] });
  assert.deepEqual(ok.verify, { pass: true, good: 'verified', bad: 'unverified' });
  assert.deepEqual(ok.boundary, { pass: true, inLane: true, outOfLane: false });
  assert.equal(ok.prune.pass, null);
  const swap = (j, b) => preview(ix, 0.5, { ...seed, judge: { ...seed.judge, cases: j }, boundary: { ...seed.boundary, ...b } });
  assert.equal(swap({ good: GOOD, bad: GOOD }).verify.pass, false);
  assert.equal(swap({ good: { ...GOOD, start: 1 }, bad: { ...GOOD, text: 'x' } }).verify.pass, false);
  assert.equal(swap({ good: { ...GOOD, start: 1 }, bad: GOOD }).verify.pass, false);
  assert.equal(swap(seed.judge.cases, { outOfLane: { question: 'kettle?' } }).boundary.pass, false);
  assert.equal(swap(seed.judge.cases, { inLane: { question: 'pizza?' } }).boundary.pass, false);
  assert.equal(swap(seed.judge.cases, { inLane: { question: 'pizza?' }, outOfLane: { question: 'kettle?' } }).boundary.pass, false);
  assert.equal(preview(ix, 0.5, { ...seed, name: 'Bad Name' }).describe.pass, false);
});

test('fold: a corpus becomes a cell whose preview passes, or it names what is missing', () => {
  const r = fold({ docs: [{ name: 'kettle.md', text: KETTLE }, { name: 'x' }], ...META });
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.counts, { docs: 1, dropped: 1, passages: 3, questions: 20 });
  assert.equal(r.lane.share, 0.5);
  assert.deepEqual(r.samples, { inLane: { question: 'Where is boils water explained?' }, outOfLane: { question: OFF_TOPIC[0] } });
  assert.deepEqual(r.seed.judge.cases, r.cases);
  assert.equal(r.check.verify.pass && r.check.boundary.pass && r.check.describe.pass, true);
  assert.deepEqual(r.questions, laneQuestions(r.index));

  const empty = fold({ docs: [{ name: 'e', text: 'of the and' }] });
  assert.deepEqual(empty, { ok: false, missing: ['the corpus has no content words to fold: give it plain-text or markdown documents'], counts: { docs: 1, dropped: 0, passages: 1, questions: 0 } });
  assert.equal(fold(null).ok, false);

  const greek = fold({ docs: [{ name: 'g', text: 'Alpha ΟΔΟΣ.' }], ...META });
  assert.equal(greek.ok, false);
  assert.equal(greek.cases, null);
  assert.equal(greek.samples.inLane, null);
  assert.deepEqual(greek.missing.slice(0, 1), ['no generated question gets a verified answer record, so the cell has no good case']);

  const everything = fold({ docs: [{ name: 'all', text: OFF_TOPIC.join(' ') + ' ' + TEMPLATES.join(' ') }], ...META });
  assert.equal(everything.samples.outOfLane, null);
  assert.ok(everything.missing.includes('every off-topic question is in lane, so the lane refuses nothing'));
  assert.equal(everything.ok, false);

  const unnamed = fold({ docs: [{ name: 'kettle.md', text: KETTLE }] });
  assert.equal(unnamed.ok, false);
  assert.ok(unnamed.missing.includes('seed.json: name must be a lower-case slug'));
});

test('the engine\'s own judge and lane: fold the corpus, judge the record by the folded cell', () => {
  const corpus = [{ name: 'kettle.md', text: KETTLE }];
  assert.equal(engineJudge({ corpus, record: GOOD }), 'verified');
  assert.equal(engineJudge({ corpus, record: { ...GOOD, text: GOOD.text.replace('month', 'week') } }), 'unverified');
  assert.equal(engineJudge({ corpus: [{ name: 'e', text: 'of the' }], record: GOOD }), 'refused');
  assert.equal(engineJudge(null), 'refused');
  assert.equal(engineLane({ corpus }), true);
  assert.equal(engineLane({ corpus: [{ name: 'e', text: 'of the' }] }), false);
  assert.equal(engineLane({ question: 'What is the best pizza topping?' }), false);
});

test('the default export carries the public surface', () => {
  for (const k of ['fold', 'answer', 'judgeRecord', 'inLaneOf', 'act', 'laneQuestions', 'chooseLane', 'alter', 'cases', 'draftSeed', 'preview', 'engineJudge', 'engineLane']) {
    assert.equal(typeof F[k], 'function', k);
  }
  assert.equal(laneShare('kettle', vocabulary([{ title: '', text: 'kettle' }])), 1);
});

test('hostile values in any argument give a result, never a throw', () => {
  const circular = {}; circular.self = circular;
  const toxic = { get question() { throw new Error('x'); }, get text() { throw new Error('x'); }, toString() { throw new Error('x'); } };
  const ix = kettle();
  for (const v of [null, undefined, NaN, '', 'x'.repeat(200000), [], {}, circular, toxic, () => {}, 10n, -1]) {
    answer(ix, v); judgeRecord(ix, v, v); inLaneOf(ix, v, v); act(ix, v, v, v); alter(v, ix); cases(ix, v, [v]);
    draftSeed(v, v); preview(ix, v, v); chooseLane(ix, v); fold({ docs: [v] }); engineJudge({ corpus: [v], record: v });
  }
  assert.equal(act(ix, 0.5, toxic, 'kar').status, 'refused');
});
