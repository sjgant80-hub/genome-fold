// DocDec v2 · src/late.mjs — L1, late interaction (ColBERT-style MaxSim), pure.
//
// A single-vector retriever squeezes a paragraph into one point and compares points. Late interaction keeps one vector
// per token: every question token looks for its best-matching token anywhere in the passage, and the passage's score is
// the sum of those best matches. A specific term the question hinges on can no longer be averaged away by the rest of
// the paragraph — and when it has NO good match, that shows up as one weak token (the evidence signal the gate reads).
// No I/O, no model, no clock. Vectors arrive already quantised (int8, x/127) so every score is reproducible exactly.

const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x) => (typeof x === 'string' ? x : '');

// the same stopword list as DocDec v1's kernel, so "content token" means the same thing in both versions
export const STOP = new Set(('a an and the of to in on for is are was were be been being as at by with from this that these those it its ' +
  'which who whom whose what when where why how do does did not no nor can could would should will shall may might must ' +
  'i you he she they we me him her them us my your his their our or if then than so such about into over under out up down ' +
  'have has had been more most some any all each both few other own same very s t').split(' '));
const SPECIAL = new Set(['[CLS]', '[SEP]', '[MASK]', '[PAD]', '[unused0]', '[unused1]', '[UNK]']);

// isContent(token) → true for a question token that carries meaning: not a special token, not punctuation, not a stopword
export function isContent(token) {
  const t = str(token);
  if (t.length === 0 || SPECIAL.has(t)) return false;
  const bare = t.startsWith('##') ? t.slice(2) : t;
  if (!/[a-z0-9]/i.test(bare)) return false;
  return !STOP.has(bare.toLowerCase());
}

// fromInt8(bytes, dim) → Float32Array of the dequantised rows (x / 127). bytes: Int8Array or array of ints.
export function fromInt8(bytes, dim) {
  const b = bytes && typeof bytes.length === 'number' ? bytes : [];
  const d = Number.isInteger(dim) && dim > 0 ? dim : 1;
  const n = Math.floor(b.length / d) * d;
  return Float32Array.from({ length: n }, (_, i) => (Number(b[i]) || 0) / 127);
}

// b64ToInt8(s) → Int8Array; works in any JS runtime with atob (browsers, Node 16+). An Int8Array stores each byte
// modulo 256, so 200 reads back as -56: the signed bytes come back exactly as they were written.
export function b64ToInt8(s) {
  let bin = '';
  try { bin = atob(str(s)); } catch (_) { bin = ''; }
  return Int8Array.from(bin, (ch) => ch.charCodeAt(0));
}

// maxsim(Q, D, dim) → { score, sims, best }: Q and D are flat Float32Arrays of unit rows. For every question row the
// best dot product over all passage rows (sims) and which passage row it was (best); score = sum(sims) / rows(Q).
export function maxsim(Q, D, dim) {
  const d = Number.isInteger(dim) && dim > 0 ? dim : 1;
  const q = Q && Q.length ? Q : new Float32Array(0);
  const p = D && D.length ? D : new Float32Array(0);
  const nq = Math.floor(q.length / d), nd = Math.floor(p.length / d);
  const sims = new Float32Array(nq), best = new Int32Array(nq);
  if (nq === 0) return { score: 0, sims, best };
  let total = 0;
  for (let i = 0; i !== nq; i++) {
    let m = -Infinity, at = -1;
    const qo = i * d;
    for (let j = 0; j !== nd; j++) {
      const po = j * d;
      let x = 0;
      for (let k = 0; k < d; k++) x += q[qo + k] * p[po + k];
      if (x > m) { m = x; at = j; }
    }
    if (at < 0) m = 0;
    sims[i] = m; best[i] = at;
    total += m;
  }
  return { score: total / nq, sims, best };
}

// evidence(qTokens, sims, best, dTokens) → the per-token audit of one question/passage match: each content token, its
// best match in the passage and how strong it is, and the WEAKEST content token (the one the passage supports least).
export function evidence(qTokens, sims, best, dTokens) {
  const qt = arr(qTokens), dt = arr(dTokens);
  const rows = [];
  qt.forEach((tok, i) => {
    if (!isContent(tok)) return;
    const s = sims && Number.isFinite(sims[i]) ? sims[i] : 0;
    const j = best && Number.isInteger(best[i]) ? best[i] : -1;
    rows.push({ token: tok, sim: s, at: j, matched: j >= 0 && j < dt.length ? dt[j] : null });
  });
  let weakest = null;
  for (const r of rows) if (weakest === null || r.sim < weakest.sim) weakest = r;
  return { tokens: rows, weakest: weakest ? weakest.sim : 0, weakestToken: weakest ? weakest.token : null };
}

// byIdOrder(items) → Map(String(id) → its position in plain string order): a tie-break with no comparison to get wrong
export function byIdOrder(items) {
  const ids = [...new Set(arr(items).map((x) => String(x && x.id)))].sort();
  return new Map(ids.map((id, i) => [id, i]));
}

// rank(scored) → the same items sorted best first; equal scores by id, so the order never depends on input order
// (equal ids keep their input order: the sort is stable)
export function rank(scored) {
  const xs = arr(scored).filter((x) => x && typeof x === 'object')
    .map((x) => ({ ...x, score: Number.isFinite(x.score) ? x.score : -Infinity }));
  const pos = byIdOrder(xs);
  return xs.sort((a, b) => (b.score - a.score) || (pos.get(String(a.id)) - pos.get(String(b.id))));
}

// cosine(a, b) → the single-vector baseline's similarity (byte-identical to DocDec v1's rerun.mjs)
export function cosine(a, b) {
  const x = a && a.length ? a : [], y = b && b.length ? b : [];
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < x.length && i < y.length; i++) { d += x[i] * y[i]; na += x[i] * x[i]; nb += y[i] * y[i]; }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export default { STOP, isContent, fromInt8, b64ToInt8, maxsim, evidence, byIdOrder, rank, cosine };
