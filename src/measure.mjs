// measure.mjs — the pre-registered measurement (PREREG.md), as pure functions. Pure and total: garbage in gives numbers
// that say so (NaN rates over nothing), never a throw. The timing (M6) is taken by scripts/measure.mjs, around this.
//
// The cell is folded from DocDec's S1 paragraphs exactly as fold does for any corpus: the paragraphs become passages with
// their own ids, and the lane share is chosen on the engine's own generated questions. None of DocDec's questions is used
// to tune anything; the numbers are taken on DocDec's eval split (all but the first SPLIT of each question set).
import { buildIndex, laneQuestions, chooseLane, answer, act, inLaneOf } from './fold.mjs';
import { normalize } from '../vendor/docdec/src/gate.mjs';
import { at } from '../vendor/estate-genome/src/genome.mjs';

export const S1 = { repo: 'sjgant80-hub/docdecdemo', commit: '612bf8c633660e06bfce79f62878ab9a503d8d47', path: 'data/v2/s1.json',
  sha256: '278ee00d3d2e77d253a0636afab3972e7cf9756f62fbc424a9c775d080509453' };
export const LICENCE = 'SQuAD 2.0 (Rajpurkar, Jia and Liang, 2018, "Know What You Don\'t Know: Unanswerable Questions for SQuAD"), CC BY-SA 4.0. Taken from DocDec\'s S1 set; this file is under CC BY-SA 4.0, not MIT.';
export const SPLIT = 180;
// the pass rules, as committed in PREREG.md before any number was computed (test/measure.test.mjs holds them to it)
export const RULES = { M1: 0.6682, M2: 0.82, M2lane: 0.82, M3: 0.5899, M3right: 0.53, M4: 0.8867, M5: 0.4608, M6ms: 100 };
export const ESCALATE = 'kar';

const str = (v) => (typeof v === 'string' ? v : '');
const list = (v) => (Array.isArray(v) ? v : []);
const get = (o, ...ks) => ks.reduce((v, k) => at(v, k), o);
const num = (x) => typeof x === 'number';
export const r4 = (x) => (num(x) ? Math.round(x * 10000) / 10000 : NaN);
export const atLeast = (v, t) => num(v) && num(t) && v >= t;
export const atMost = (v, t) => num(v) && num(t) && v <= t;

// extractS1(s1) → only what the measurement reads from DocDec's S1 file: the paragraphs and the two question sets
export function extractS1(s1) {
  const pick = (a, keys) => list(a).map((o) => Object.fromEntries(keys.map((k) => [k, at(o, k) ?? null])));
  return {
    source: S1, licence: LICENCE,
    paragraphs: pick(at(s1, 'paragraphs'), ['id', 'title', 'text']),
    questions: pick(at(s1, 'questions'), ['qid', 'text', 'goldId', 'impossible', 'answers']),
    oos: pick(at(s1, 'oos'), ['qid', 'text']),
  };
}

// docdecRef(record, measured) → DocDec v2's published eval numbers on the same questions, read from its own record
export function docdecRef(record, measured) {
  const v2 = get(record, 's1', 'v2'), c1 = get(record, 'claims', 'C1', 'detail', 's1');
  const n = get(v2, 'answerable');
  return {
    colbertTop1: at(c1, 'colbert'), cosineTop1: at(c1, 'cosine'), offTopicRefused: get(record, 'offTopic', 'v2', 'refusal'),
    answered: r4(get(v2, 'answeredAnswerable') / n), answeredRight: at(v2, 'recall'), unanswerableRefused: at(v2, 'refusal'),
    exactAnswers: r4(Math.round(get(v2, 'spans', 'em') * get(v2, 'spans', 'answered')) / n),
    secondsPerQuestion: at(measured, 'localSecondsPerQuestion'),
  };
}

// containsGold(text, answers) → a gold answer, SQuAD-normalised, is a substring of the normalised text
export function containsGold(text, answers) {
  const t = normalize(text);
  return list(answers).some((g) => { const n = normalize(g); return n !== '' && t.includes(n); });
}

// rate(rows, f) → { count, of, value }: how many of rows satisfy f
function rate(rows, f) {
  const count = rows.filter(f).length;
  return { count, of: rows.length, value: r4(count / rows.length) };
}

// cellOf(s1) → the folded cell: index, generated questions, lane
export function cellOf(s1) {
  const index = buildIndex(list(at(s1, 'paragraphs')));
  const generated = laneQuestions(index);
  return { index, generated, lane: chooseLane(index, generated) };
}

// rows(s1, cell) → one row per eval question: what the answerer and the guarded cell did with it
export function rows(s1, cell) {
  const share = get(cell, 'lane', 'share'), index = at(cell, 'index');
  const row = (q, set) => {
    const question = str(at(q, 'text')), r = act(index, share, { question }, ESCALATE);
    const verified = r.status === 'verified';
    return { qid: str(at(q, 'qid')), set, gold: at(q, 'goldId') ?? null, inLane: inLaneOf(index, { question }, share), status: r.status,
      top: get(answer(index, question), 'record', 'source') ?? null, source: verified ? r.record.source : null,
      contains: verified && containsGold(r.record.text, at(q, 'answers')) };
  };
  return [
    ...list(at(s1, 'questions')).slice(SPLIT).map((q) => row(q, at(q, 'impossible') === false ? 'answerable' : 'unanswerable')),
    ...list(at(s1, 'oos')).slice(SPLIT).map((q) => row(q, 'offTopic')),
  ];
}

// metrics(rs) → M1 to M5 with their rules and verdicts (PREREG.md section 4)
export function metrics(rs) {
  const of = (set) => list(rs).filter((r) => at(r, 'set') === set);
  const ans = of('answerable'), unans = of('unanswerable'), off = of('offTopic');
  const verified = (r) => at(r, 'status') === 'verified';
  const m = {
    M1: rate(ans, (r) => r.top === r.gold), M2: rate(off, (r) => !verified(r)), M2lane: rate(off, (r) => !r.inLane),
    M3: rate(ans, verified), M3right: rate(ans, (r) => verified(r) && r.source === r.gold), M4: rate(unans, (r) => !verified(r)),
    M5: rate(ans, (r) => r.contains),
  };
  for (const k of Object.keys(m)) Object.assign(m[k], { rule: RULES[k], pass: atLeast(m[k].value, RULES[k]) });
  return m;
}

// measureS1(s1) → the whole pure measurement: the lane as chosen, the counts, the metrics, the rows
export function measureS1(s1) {
  const cell = cellOf(s1), rs = rows(s1, cell);
  const n = { paragraphs: cell.index.passages.length, generated: cell.generated.length, answerable: 0, unanswerable: 0, offTopic: 0 };
  for (const r of rs) n[r.set]++;
  return { lane: cell.lane, n, metrics: metrics(rs), rows: rs };
}

export default { S1, LICENCE, SPLIT, RULES, ESCALATE, r4, atLeast, atMost, extractS1, docdecRef, containsGold, cellOf, rows, metrics, measureS1 };
