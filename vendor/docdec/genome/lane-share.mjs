// lane-share.mjs — DocDec's lane, as pure functions: the share of a question's content words found in the index, and
// the measurement that chose the share on DocDec's own sets. genome/cell.mjs runs it; genome/lane-measure.mjs records it.
import { STOP } from '../src/late.mjs';

export const SHARES = [0.5, 0.6, 0.67, 0.75, 0.8, 1];
export const words = (t) => String(t).toLowerCase().match(/[a-z0-9]+/g) || [];
export const content = (q) => words(q).filter((w) => w.length >= 3 && !STOP.has(w));
export const vocabulary = (passages) => new Set(passages.flatMap((p) => words(p.title + ' ' + p.text)));

// laneShare(question, vocab) → the share of the question's content words found in the index (0 when it has none)
export function laneShare(question, vocab) {
  const c = content(question);
  return c.length === 0 ? 0 : c.filter((w) => vocab.has(w)).length / c.length;
}

// measure(s1) → the share chosen on tune by balanced accuracy, and what it does on eval.
// s1: { paragraphs, questions (about the indexed passages: in lane), oos (off-topic: out of lane) }.
// Tune = the first half of each set in file order; eval = the second half.
export function measure(s1) {
  const vocab = vocabulary(s1.paragraphs);
  const inq = s1.questions.map((q) => q.text), oos = s1.oos.map((q) => q.text);
  const cut = (a) => [a.slice(0, Math.floor(a.length / 2)), a.slice(Math.floor(a.length / 2))];
  const [inT, inE] = cut(inq), [ooT, ooE] = cut(oos);
  const accepted = (qs, t) => qs.filter((q) => laneShare(q, vocab) >= t).length;
  const refused = (qs, t) => qs.length - accepted(qs, t);
  const r4 = (x) => Math.round(x * 10000) / 10000;
  let best = null;
  for (const t of SHARES) {
    const bal = (accepted(inT, t) / inT.length + refused(ooT, t) / ooT.length) / 2;
    if (best === null || bal > best.bal) best = { t, bal };
  }
  const t = best.t;
  return {
    rule: `in lane when at least ${Math.round(t * 100)}% of the question's content words appear as whole words in the indexed passages`,
    share: t,
    tune: { inLaneAccepted: r4(accepted(inT, t) / inT.length), offTopicRefused: r4(refused(ooT, t) / ooT.length), n: [inT.length, ooT.length] },
    eval: { inLaneAccepted: r4(accepted(inE, t) / inE.length), offTopicRefused: r4(refused(ooE, t) / ooE.length), n: [inE.length, ooE.length] },
  };
}
