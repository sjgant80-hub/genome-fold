// page.mjs — what the pages show, as pure functions: HTML strings built from the kernel's own results, every value
// escaped. The engine's page and every folded cell's page carry this file byte for byte, beside the kernel.
import { isIndex } from './fold.mjs';
import { at } from '../vendor/estate-genome/src/genome.mjs';

const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');
const list = (v) => (Array.isArray(v) ? v : []);
export const LABEL = { verified: 'verified', unverified: 'not verified', refused: 'refused' };

// esc(v) → text safe to place in HTML (anything that is not a string, number or boolean shows as nothing)
export const esc = (v) => str(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// badge(status) → a status pill; an unknown status shows as refused
export function badge(status) {
  const s = typeof status === 'string' && Object.hasOwn(LABEL, status) ? status : 'refused';
  return `<span class="badge b-${s}">${LABEL[s]}</span>`;
}

// passageHtml(index, record) → the cited passage with the record's characters marked, or '' when the record does not
// name a passage of the index
export function passageHtml(index, record) {
  const i = isIndex(index) ? index.byId.get(at(record, 'source')) : undefined;
  if (i === undefined) return '';
  const p = index.passages[i], s = at(record, 'start'), e = at(record, 'end');
  const ok = Number.isInteger(s) && Number.isInteger(e) && s >= 0 && e <= p.text.length;
  const body = ok ? esc(p.text.slice(0, s)) + '<mark>' + esc(p.text.slice(s, e)) + '</mark>' + esc(p.text.slice(e)) : esc(p.text);
  return `<blockquote class="passage"><div class="ptitle">${esc(p.title)} · <code>${esc(p.id)}</code></div>${body}</blockquote>`;
}

// answerHtml(index, r) → what the cell's act() said, shown plainly: the verified record with its passage and offsets, or
// the refusal and why
export function answerHtml(index, r) {
  const rec = at(r, 'record'), status = at(r, 'status');
  if (status === 'verified') {
    return `<p>${badge('verified')} <strong>${esc(at(rec, 'text'))}</strong></p>` +
      `<p class="small">source <code>${esc(at(rec, 'source'))}</code>, characters ${esc(at(rec, 'start'))} to ${esc(at(rec, 'end'))}</p>` +
      passageHtml(index, rec);
  }
  const why = esc(at(r, 'why')), up = esc(at(r, 'escalate'));
  return `<p>${badge(status)} ${why}${up ? ` · escalated to <code>${up}</code>` : ''}</p>`;
}

// checksHtml(check) → the birth check as far as the browser runs it: one row per trait
export function checksHtml(check) {
  const row = (name, t, what) => {
    const pass = at(t, 'pass');
    const mark = pass === true ? '<span class="ok">yes</span>' : pass === false ? '<span class="no">no</span>' : '<span class="na">in CI</span>';
    return `<tr><th scope="row">${name}</th><td>${mark}</td><td>${what}</td></tr>`;
  };
  const d = at(check, 'describe'), v = at(check, 'verify'), b = at(check, 'boundary'), p = at(check, 'prune');
  const reasons = list(at(d, 'reasons'));
  return '<table class="checks"><thead><tr><th>Trait</th><th>Holds</th><th>What was checked</th></tr></thead><tbody>' +
    row('describe', d, reasons.length === 0 ? 'seed.json passes every manifest check of the estate genome' : reasons.map(esc).join('; ')) +
    row('verify', v, `the judge on the good case: ${esc(at(v, 'good'))}; on the bad case: ${esc(at(v, 'bad'))}`) +
    row('boundary', b, `in-lane sample taken: ${esc(at(b, 'inLane'))}; off-topic sample taken: ${esc(at(b, 'outOfLane'))}`) +
    row('prune', p, esc(at(p, 'why'))) + '</tbody></table>';
}

// laneHtml(lane) → the lane rule and what it did on the generated questions it was chosen and measured on
export function laneHtml(lane) {
  const t = at(lane, 'tune'), e = at(lane, 'eval'), n = (x) => list(at(x, 'n'));
  return `<p>${esc(at(lane, 'rule'))}.</p><table><thead><tr><th></th><th>in-lane accepted</th><th>off-topic refused</th><th>questions</th></tr></thead><tbody>` +
    `<tr><th scope="row">tune (chose the share)</th><td>${esc(at(t, 'inLaneAccepted'))}</td><td>${esc(at(t, 'offTopicRefused'))}</td><td>${esc(n(t)[0])} + ${esc(n(t)[1])}</td></tr>` +
    `<tr><th scope="row">eval (measured it)</th><td>${esc(at(e, 'inLaneAccepted'))}</td><td>${esc(at(e, 'offTopicRefused'))}</td><td>${esc(n(e)[0])} + ${esc(n(e)[1])}</td></tr></tbody></table>`;
}

// casesHtml(cs, v) → the judge's good and bad case, each with the verdict the judge gave it
export function casesHtml(cs, v) {
  const rec = (x) => (x ? `<code>${esc(at(x, 'source'))}</code> ${esc(at(x, 'start'))}–${esc(at(x, 'end'))}: “${esc(at(x, 'text'))}”` : 'none');
  return '<ul>' +
    `<li>good case (a real sentence record), for the question “${esc(at(at(cs, 'good'), 'question'))}”: ${rec(at(cs, 'good'))} → ${badge(at(v, 'good'))}</li>` +
    `<li>bad case (the same record, one word altered): ${rec(at(cs, 'bad'))} → ${badge(at(v, 'bad'))}</li></ul>`;
}

// foldHtml(r) → a fold's result: what is missing, or the counts, the lane, the cases with the judge's verdicts, the
// samples, the birth-check preview and the drafted seed.json
export function foldHtml(r) {
  const missing = list(at(r, 'missing')), c = at(r, 'counts'), cs = at(r, 'cases'), s = at(r, 'samples'), seed = at(r, 'seed');
  const head = at(r, 'ok') === true
    ? `<p>${badge('verified')} The corpus folds into a cell: ${esc(at(c, 'docs'))} document(s), ${esc(at(c, 'passages'))} passages, ${esc(at(c, 'questions'))} generated lane questions.</p>`
    : `<p>${badge('refused')} Not shipped. What is missing:</p><ul>${missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`;
  if (cs === undefined) return head;
  return head + '<h4>The lane</h4>' + laneHtml(at(r, 'lane')) +
    '<h4>The judge\'s cases</h4>' + casesHtml(cs, at(at(r, 'check'), 'verify')) +
    '<h4>The lane\'s samples</h4><ul>' +
    `<li>in lane: “${esc(at(at(s, 'inLane'), 'question'))}”</li><li>out of lane: “${esc(at(at(s, 'outOfLane'), 'question'))}”</li></ul>` +
    '<h4>The birth check, in the browser</h4>' + checksHtml(at(r, 'check')) +
    `<details><summary>The drafted seed.json</summary><pre>${esc(JSON.stringify(seed ?? null, null, 2))}</pre></details>`;
}

// measureRows(m) → the pre-registered measurement's table rows, DocDec v2's published number beside each
export function measureRows(m) {
  const ms = at(m, 'metrics'), d = at(m, 'docdec');
  const rows = [
    ['M1', 'Right passage (answerer alone)', 'answerable', at(d, 'colbertTop1') + ' (ColBERT top-1); cosine ' + at(d, 'cosineTop1')],
    ['M2', 'Off-topic refused (no verified answer leaves)', 'off-topic', at(d, 'offTopicRefused')],
    ['M2lane', 'Off-topic refused by the lane alone', 'off-topic', '—'],
    ['M3', 'Answerable answered with a verified record', 'answerable', at(d, 'answered')],
    ['M3right', '… and from the right passage', 'answerable', at(d, 'answeredRight')],
    ['M4', 'Unanswerable refused', 'unanswerable', at(d, 'unanswerableRefused')],
    ['M5', 'Verified record holds a gold answer', 'answerable', at(d, 'exactAnswers') + ' (exact short answers)'],
  ];
  const tr = ([k, what, of, ref]) => {
    const x = at(ms, k);
    return `<tr><th scope="row">${k}</th><td>${what}</td><td>${esc(at(x, 'value'))} <span class="small">(${esc(at(x, 'count'))} of ${esc(at(x, 'of'))} ${of})</span></td>` +
      `<td>${esc(ref)}</td><td>at least ${esc(at(x, 'rule'))}</td><td>${at(x, 'pass') === true ? '<span class="ok">pass</span>' : '<span class="no">fail</span>'}</td></tr>`;
  };
  const t = at(ms, 'M6');
  return rows.map(tr).join('') +
    `<tr><th scope="row">M6</th><td>Median time of one answer, this laptop</td><td>${esc(at(t, 'medianMs'))} ms <span class="small">(${esc(at(t, 'of'))} questions)</span></td>` +
    `<td>${esc(at(d, 'secondsPerQuestion'))} s (local reader)</td><td>at most ${esc(at(t, 'rule'))} ms</td><td>${at(t, 'pass') === true ? '<span class="ok">pass</span>' : '<span class="no">fail</span>'}</td></tr>`;
}

// docsFromPaste(text) → the pasted text as documents: a line "=== name ===" starts a new document; text before the first
// such line is one document called pasted.md
export function docsFromPaste(text) {
  const docs = [];
  let name = 'pasted.md', buf = [];
  const flush = () => { const t = buf.join('\n'); if (t.trim() !== '') docs.push({ name, text: t }); buf = []; };
  for (const line of str(text).split('\n')) {
    const m = /^=== *(.+?) *===$/.exec(line.trim());
    if (m) { flush(); name = m[1]; } else buf.push(line);
  }
  flush();
  return docs;
}

// slug(s) → a lower-case name the genome accepts, from any title
export const slug = (s) => str(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'my-cell';

export default { LABEL, esc, badge, passageHtml, answerHtml, checksHtml, laneHtml, casesHtml, foldHtml, measureRows, docsFromPaste, slug };
