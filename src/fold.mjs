// fold.mjs — the fold engine's kernel. Pure and total: any input gives a result with reasons, never a throw. No I/O, no
// clock, no model. It runs the same in Node and in the browser (the page carries this file byte for byte).
//
// A corpus (documents of plain text or markdown) folds into a cell:
//   index     the corpus cut into passages (a blank line or a markdown heading ends a passage)
//   answerer  extractive, no language model: the passage that best carries the question's content words (BM25), and in
//             it the sentence that carries the most of them, returned as an answer record {source, start, end, text}
//   judge     a record is verified only when its text is exactly the source passage's characters at its offsets AND
//             the passage carries at least the lane share of the question's content words; refused when malformed
//   lane      the share of a question's content words that the corpus uses, with the share chosen on a tune split of
//             questions generated from the corpus's own terms against a fixed off-topic set, and measured on the rest
//   cases     the good case is a real sentence record; the bad case is the same record with one word altered
//   seed      a drafted seed.json, and the manifest check (the estate genome's describe) run on it
// Composes, unchanged: DocDec's findSpan and sentenceAround (its gate), DocDec's lane share and its tune/eval
// measurement, and the estate genome's describe. They are vendored, pinned to their commits (vendor/VENDOR.json).
import { findSpan, sentenceAround } from '../vendor/docdec/src/gate.mjs';
import { words, content, vocabulary, laneShare, measure } from '../vendor/docdec/genome/lane-share.mjs';
import { at, describe } from '../vendor/estate-genome/src/genome.mjs';

export const LIMITS = { docs: 1000, chars: 3000000 };
export const BM25 = { k1: 1.2, b: 0.75 };
export const QUESTIONS = { min: 20, max: 400, terms: 3 };
// The generated in-lane questions: a passage's rarest content words set in a question frame. Each frame adds words of
// its own, as a real question does, so a generated question never reads as pure corpus vocabulary.
export const TEMPLATES = ['What does the text say about X?', 'Where is X explained?', 'Which part covers X?',
  'What happens with X?', 'Who is responsible for X?'];
// The fixed off-topic set: everyday questions no corpus folded here is meant to answer. Its first half tunes the lane,
// its second half measures it.
export const OFF_TOPIC = [
  'What is the best pizza topping?', 'How long should I boil an egg?', 'Who won the football world cup in 1966?',
  'What is the capital city of Australia?', 'How do I fix a flat bicycle tyre?', 'Which planet has the most moons?',
  'What temperature should I bake bread at?', 'How tall is Mount Everest?', 'Who painted the Mona Lisa?',
  'What is a good name for a puppy?', 'How many strings does a violin have?', 'When does the tennis season start?',
  'What should I plant in a shady garden?', 'How do I make a cup of green tea?', 'Which film won best picture last year?',
  'What is the fastest land animal?', 'How do I tune a guitar by ear?', 'Where can I watch the northern lights?',
  'What time does the sun set in winter?', 'How do I clean a cast iron pan?', 'Who wrote the novel Moby Dick?',
  'What is the rule for offside in football?', 'How much water should a cactus get?', 'What colour goes with navy blue?',
  'How do I train for a marathon?', 'Which cheese is best on toast?', 'What is the tallest building in the world?',
  'How do I knit a scarf for beginners?', 'Where do penguins live in the wild?', 'What is the recipe for pancakes?',
  'How many players are on a rugby team?', 'What is the plot of Romeo and Juliet?', 'How do I stop my cat scratching?',
  'Which beach is best for surfing?', 'How do volcanoes erupt?', 'What snacks are good for a picnic?',
  'How do I change a car tyre?', 'Who invented the telephone?', 'What is the weather like in Iceland?',
  'How do I grow tomatoes indoors?', 'Which board game is fun for six people?', 'What makes a rainbow appear?',
  'How long do goldfish live?', 'What is the best way to learn chess?', 'Who sang the song Yesterday?',
  'How do I make my sourdough rise?', 'Which mountains are in Scotland?', 'What do koalas eat?',
  'How do I draw a horse?', 'What is the loudest musical instrument?', 'How far away is the moon?',
  'Which dance is popular at weddings?', 'How do I keep roses healthy?', 'What is the oldest tree on earth?',
  'How do I play the drums?', 'Which country makes the most coffee?', 'What should I pack for a ski trip?',
  'How do bees make honey?', 'What is a good stretch after running?', 'Who discovered penicillin?',
];
export const STATUS = ['verified', 'unverified', 'refused'];

const str = (v) => (typeof v === 'string' ? v : '');
const list = (v) => (Array.isArray(v) ? v : []);
const BUILT = new WeakSet();   // indexes made by buildIndex: nothing else is read as one

// docsOf(docs) → [{name, text}]: the documents with text, a safe distinct name each, at most LIMITS.docs of them and
// LIMITS.chars of text in all (documents past the limit are dropped; fold reports how many)
export function docsOf(docs) {
  const out = [], seen = new Set();
  let chars = 0;
  for (const d of list(docs).slice(0, LIMITS.docs)) {
    const text = str(at(d, 'text'));
    chars += text.length;
    if (text.trim() === '' || chars > LIMITS.chars) continue;
    let name = str(at(d, 'name')).trim().replace(/[^A-Za-z0-9._-]+/g, '-') || 'doc';
    while (seen.has(name)) name = name + '-' + (out.length + 1);
    seen.add(name);
    out.push({ name, text });
  }
  return out;
}

// passagesOf(docs) → [{id, title, text}]: each document cut at blank lines and markdown headings; a heading becomes the
// title of the passages under it (the document's name until the first heading); whitespace inside a passage is one space
export function passagesOf(docs) {
  const out = [];
  for (const d of docsOf(docs)) {
    let title = d.name, k = 0, buf = [];
    const flush = () => {
      const text = buf.join(' ').replace(/\s+/g, ' ').trim();
      buf = [];
      if (text !== '') out.push({ id: d.name + '#' + k++, title, text });
    };
    for (const line of d.text.split(/\r?\n/)) {
      const h = /^ {0,3}#{1,6}\s+(.*?)[\s#]*$/.exec(line);
      if (h) { flush(); title = h[1] || d.name; }
      else if (line.trim() === '') flush();
      else buf.push(line);
    }
    flush();
  }
  return out;
}

// buildIndex(passages) → the index: passages with a non-empty id and text (first of each id kept), their word counts,
// document frequencies, vocabulary and an id lookup. Opaque: only an index built here is ever read as one.
export function buildIndex(passages) {
  const ps = [], byId = new Map();
  for (const p of list(passages)) {
    const id = str(at(p, 'id')), text = str(at(p, 'text'));
    if (id === '' || text.trim() === '' || byId.has(id)) continue;
    byId.set(id, ps.length);
    ps.push({ id, title: str(at(p, 'title')), text });
  }
  const toks = ps.map((p) => words(p.title + ' ' + p.text));
  const tf = toks.map((t) => { const m = new Map(); for (const w of t) m.set(w, (m.get(w) || 0) + 1); return m; });
  const df = new Map();
  for (const m of tf) for (const w of m.keys()) df.set(w, (df.get(w) || 0) + 1);
  const total = toks.reduce((a, t) => a + t.length, 0);
  const index = { passages: ps, byId, tf, len: toks.map((t) => t.length), df, avg: total / Math.max(1, ps.length), vocab: vocabulary(ps) };
  BUILT.add(index);
  return index;
}
export const isIndex = (index) => BUILT.has(index);

// idf(index, w) → BM25's inverse document frequency (always above 0 for a word the corpus uses)
function idf(index, w) {
  const n = index.passages.length, d = index.df.get(w) || 0;
  return Math.log(1 + (n - d + 0.5) / (d + 0.5));
}

// terms(question) → the question's distinct content words, in order (DocDec's content words: 3+ letters, no stopwords)
export const terms = (question) => [...new Set(content(str(question)))];

// scores(index, ts) → each passage's BM25 score for the words ts
function scores(index, ts) {
  const { k1, b } = BM25;
  return index.passages.map((p, i) => ts.reduce((s, w) => {
    const f = index.tf[i].get(w) || 0;
    return s + idf(index, w) * f * (k1 + 1) / (f + k1 * (1 - b + b * index.len[i] / index.avg));
  }, 0));
}

// bestSentence(index, i, ts) → in passage i, the sentence (DocDec's sentenceAround) around an occurrence of a question
// word that carries the most idf weight of the question's words; the earliest wins a tie
function bestSentence(index, i, ts) {
  const text = index.passages[i].text, want = new Set(ts);
  let best = null, bestScore = -1;
  for (const m of text.matchAll(/[A-Za-z0-9]+/g)) {
    if (!want.has(m[0].toLowerCase())) continue;
    const s = sentenceAround(text, m.index, m.index + m[0].length);
    const has = new Set(words(s.text));
    const score = ts.reduce((a, w) => a + (has.has(w) ? idf(index, w) : 0), 0);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return best || sentenceAround(text, 0, 0);
}

// answer(index, question) → { record:{source,start,end,text}, passage, score } or { refuse:true, why }
// The record's offsets come from DocDec's findSpan, so its text is the passage's own characters.
export function answer(index, question) {
  const ts = terms(question);
  if (!isIndex(index)) return { refuse: true, why: 'no index to answer from' };
  if (ts.length === 0) return { refuse: true, why: 'the question has no content words' };
  const sc = scores(index, ts);
  let best = 0;
  sc.forEach((s, i) => { if (s > sc[best]) best = i; });
  if (!(sc[best] > 0)) return { refuse: true, why: 'no passage uses any of the question\'s content words' };
  const s = bestSentence(index, best, ts), p = index.passages[best];
  const span = findSpan(p.text.slice(s.start), s.text);
  if (span === null) return { refuse: true, why: 'the sentence could not be anchored to its offsets' };
  return { record: { source: p.id, start: s.start + span.start, end: s.start + span.end, text: span.text }, passage: best, score: sc[best] };
}

// support(question, passage) → the share of the question's content words the passage (title and text) uses
const support = (question, passage) => laneShare(str(question), vocabulary([passage]));

// judgeRecord(index, record, share) → 'verified' | 'unverified' | 'refused'
//   refused     not an answer record {question, source, start, end, text} with whole-number offsets and some text, or
//               its source is not a passage of this index
//   unverified  its text is not exactly the passage's characters at its offsets, or the passage carries less than the
//               lane share of the question's content words
export function judgeRecord(index, record, share) {
  const q = at(record, 'question'), src = at(record, 'source'), start = at(record, 'start'), end = at(record, 'end'), text = at(record, 'text');
  const i = isIndex(index) ? index.byId.get(src) : undefined;
  if (typeof q !== 'string' || !Number.isInteger(start) || !Number.isInteger(end) || str(text).trim() === '' || i === undefined) return 'refused';
  const p = index.passages[i];
  const exact = start >= 0 && end - start === text.length && p.text.slice(start, end) === text;
  return exact && support(q, p) >= share ? 'verified' : 'unverified';
}

// inLaneOf(index, input, share) → true when input is {question} and at least the lane share of its content words are
// words the corpus uses
export function inLaneOf(index, input, share) {
  const q = at(input, 'question');
  return typeof q === 'string' && isIndex(index) && laneShare(q, index.vocab) >= share;
}

// act(index, share, input, escalate) → the guarded answer: out of lane is refused and escalated; an answer leaves only
// as a verified record; a record the judge will not verify is withheld, never shown
export function act(index, share, input, escalate) {
  if (!inLaneOf(index, input, share)) {
    return { status: 'refused', why: 'out of lane: too few of the question\'s words are words this corpus uses', escalate: str(escalate) };
  }
  const question = at(input, 'question'), a = answer(index, question);
  if (a.refuse) return { status: 'refused', why: a.why };
  const record = { question, ...a.record };
  const verdict = judgeRecord(index, record, share);
  if (verdict === 'verified') return { status: 'verified', record };
  return { status: verdict, why: 'withheld: the best passage carries too few of the question\'s words to verify an answer' };
}

// rarest(index, i, n) → up to n of passage i's content words, rarest in the corpus first, first occurrence breaking ties
function rarest(index, i, n) {
  const p = index.passages[i];
  return [...new Set(content(p.text))].sort((a, b) => index.df.get(a) - index.df.get(b)).slice(0, n);
}

// laneQuestions(index) → the generated in-lane questions, in passage order: between QUESTIONS.min and QUESTIONS.max of
// them, spread evenly over the passages that have content words; question k uses 1 + (k mod #terms) of its passage's
// rarest words in frame k mod #frames
export function laneQuestions(index) {
  if (!isIndex(index)) return [];
  const pool = index.passages.map((p, i) => rarest(index, i, QUESTIONS.terms)).filter((t) => t.length > 0);
  if (pool.length === 0) return [];
  const n = Math.min(QUESTIONS.max, Math.max(QUESTIONS.min, pool.length));
  return Array.from({ length: n }, (_, k) => {
    const t = pool[Math.floor((k * pool.length) / n)];
    return TEMPLATES[k % TEMPLATES.length].replace('X', t.slice(0, 1 + (k % t.length)).join(' '));
  });
}

// chooseLane(index, questions) → DocDec's lane measurement, unchanged: the share chosen on the first half of the
// generated questions and the off-topic set (best balanced accuracy, the lowest share on a tie), measured on the rest
export function chooseLane(index, questions) {
  if (!isIndex(index)) return null;
  return measure({ paragraphs: index.passages, questions: list(questions).map((text) => ({ text })), oos: OFF_TOPIC.map((text) => ({ text })) });
}

// alter(record, index) → the same record with one word altered: its first content word swapped for the next content word
// of the corpus in alphabetical order (the one before it when it is the last, the word doubled when it is the only one)
export function alter(record, index) {
  const text = str(at(record, 'text'));
  const m = [...text.matchAll(/[A-Za-z0-9]+/g)].find((x) => content(x[0]).length > 0);
  if (!m || !isIndex(index)) return null;
  const w = m[0].toLowerCase(), v = [...index.vocab].filter((x) => content(x).length > 0).sort();
  const swap = v.find((x) => x > w) || v.filter((x) => x < w).pop() || w + w;
  return { ...record, text: text.slice(0, m.index) + swap + text.slice(m.index + m[0].length) };
}

// cases(index, share, questions) → { good, bad }: the good case is the first generated question the cell answers with a
// verified record; the bad case is that record with one word altered. null when no question gets a verified record.
export function cases(index, share, questions) {
  for (const q of list(questions)) {
    const r = act(index, share, { question: q });
    if (r.status === 'verified') return { good: r.record, bad: alter(r.record, index) };
  }
  return null;
}

const cap = (s, n) => (s.length > n ? s.slice(0, n - 1).trim() + '…' : s);

// draftSeed(meta, parts) → the cell's seed.json. meta: {name, title, lane, escalate, repo, by, born}; parts: {cases,
// samples}. Anything missing is left empty, for the manifest check to name.
export function draftSeed(meta, parts) {
  const m = (k) => str(at(meta, k)).trim();
  const title = cap(m('title') || m('name'), 120), c = at(parts, 'cases'), s = at(parts, 'samples');
  return {
    genome: '1', name: m('name'), kind: 'repo',
    purpose: `Answers questions about ${title} from its own text only: the best-supported sentence, word for word, with its passage and character offsets. Refuses questions outside its lane.`,
    lane: { id: m('lane') || m('name'), accepts: `a question about ${title}`, refuses: `questions whose words the ${title} text does not use` },
    interface: {
      in: '{"question":"<text>"} to ask (node genome/act.mjs); an answer record {question,source,start,end,text} to audit',
      out: 'a verified answer record (passage id, character offsets, the exact sentence), or a refusal that says why',
    },
    judge: {
      what: 'an answer record is right when its text is exactly the cited passage\'s characters at its offsets and that passage uses at least the lane share of the question\'s content words',
      run: 'node genome/judge.mjs', cases: { good: at(c, 'good') ?? null, bad: at(c, 'bad') ?? null },
    },
    boundary: { run: 'node genome/lane.mjs', inLane: at(s, 'inLane') ?? null, outOfLane: at(s, 'outOfLane') ?? null, escalate: m('escalate') },
    health: { run: 'node genome/health.mjs' },
    tombstone: { apply: 'node genome/tombstone.mjs apply', restore: 'node genome/tombstone.mjs restore' },
    act: { run: 'node genome/act.mjs', in: '{"question":"<text>"}' },
    provenance: { repo: m('repo'), by: m('by'), born: m('born') },
  };
}

// preview(index, share, seed) → the birth check as far as it runs without files: describe (the genome's own manifest
// check), verify (the judge on the seed's cases) and boundary (the lane on its samples). Prune needs the written cell.
export function preview(index, share, seed) {
  const cs = at(at(seed, 'judge'), 'cases'), b = at(seed, 'boundary');
  const d = describe(seed);
  const good = judgeRecord(index, at(cs, 'good'), share), bad = judgeRecord(index, at(cs, 'bad'), share);
  const inL = inLaneOf(index, at(b, 'inLane'), share), outL = inLaneOf(index, at(b, 'outOfLane'), share);
  return {
    describe: { pass: d.pass, reasons: d.reasons },
    verify: { pass: good === 'verified' && bad !== 'verified', good, bad },
    boundary: { pass: inL && !outL, inLane: inL, outOfLane: outL },
    prune: { pass: null, why: 'the tombstone round-trip runs on the written cell folder, in the birth check' },
  };
}

// fold(input) → { ok, missing, ... }. input: { docs:[{name,text}], name, title, lane, escalate, repo, by, born }.
// ok only when the corpus folds into a cell whose manifest, judge and lane pass the preview; otherwise missing names
// what stopped it, and nothing is drafted as shippable.
export function fold(input) {
  const docs = docsOf(at(input, 'docs'));
  const index = buildIndex(passagesOf(docs));
  const questions = laneQuestions(index);
  const counts = { docs: docs.length, dropped: list(at(input, 'docs')).length - docs.length, passages: index.passages.length, questions: questions.length };
  if (questions.length === 0) return { ok: false, missing: ['the corpus has no content words to fold: give it plain-text or markdown documents'], counts };
  const lane = chooseLane(index, questions);
  const c = cases(index, lane.share, questions);
  const outOfLane = OFF_TOPIC.find((q) => !inLaneOf(index, { question: q }, lane.share));
  const samples = { inLane: c ? { question: c.good.question } : null, outOfLane: outOfLane === undefined ? null : { question: outOfLane } };
  const seed = draftSeed(input, { cases: c, samples });
  const check = preview(index, lane.share, seed);
  const missing = [];
  if (c === null) missing.push('no generated question gets a verified answer record, so the cell has no good case');
  if (outOfLane === undefined) missing.push('every off-topic question is in lane, so the lane refuses nothing');
  for (const r of check.describe.reasons) missing.push('seed.json: ' + r);
  return { ok: missing.length === 0, missing, counts, index, questions, lane, cases: c, samples, seed, check };
}

// engineJudge(input) → the engine's own judge (its genome): input {corpus:[{name,text}], record}; the corpus is folded
// and the record judged by the folded cell's judge
export function engineJudge(input) {
  const index = buildIndex(passagesOf(at(input, 'corpus')));
  const questions = laneQuestions(index);
  if (questions.length === 0) return 'refused';
  return judgeRecord(index, at(input, 'record'), chooseLane(index, questions).share);
}

// engineLane(input) → the engine's lane: input {corpus:[{name,text}]} whose text yields questions to fold from
export const engineLane = (input) => laneQuestions(buildIndex(passagesOf(at(input, 'corpus')))).length > 0;

export default { LIMITS, BM25, QUESTIONS, TEMPLATES, OFF_TOPIC, STATUS, docsOf, passagesOf, buildIndex, isIndex, terms,
  answer, judgeRecord, inLaneOf, act, laneQuestions, chooseLane, alter, cases, draftSeed, preview,
  fold, engineJudge, engineLane };
