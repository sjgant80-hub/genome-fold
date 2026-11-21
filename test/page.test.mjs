// The pages' code: what they show (src/page.mjs), how they are assembled (src/build-page.mjs), and how the browser links
// the modules they carry (page/loader.js), run here in Node with data: URLs in place of Blob URLs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as F from '../src/fold.mjs';
import P, { esc, badge, passageHtml, answerHtml, checksHtml, laneHtml, casesHtml, foldHtml, measureRows, docsFromPaste, slug } from '../src/page.mjs';
import B, { MODULES, carryable, moduleTags, dataTag, fill, pct, passesLine, humanName, demoHtml, enginePage, cellPage, read } from '../src/build-page.mjs';

const KETTLE = '# The kettle\n\nThe kettle boils water in about three minutes. Descale the kettle every month with white vinegar.\n\n## Safety\n\nNever fill the kettle above the maximum line.\n';
const META = { name: 'kettle-cell', title: 'the kettle <manual>', escalate: 'kar', repo: 'sjgant80-hub/kettle-cell', by: 'Kar', born: '2026-11-21' };
const R = F.fold({ ...META, docs: [{ name: 'kettle.md', text: KETTLE }] });
const REC = { question: 'q', source: 'kettle.md#0', start: 47, end: 97, text: 'Descale the kettle every month with white vinegar.' };

test('esc: HTML-safe text; anything that is not text, a number or a boolean shows as nothing', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(esc(0.5), '0.5');
  assert.equal(esc(false), 'false');
  assert.equal(esc(null), '');
  assert.equal(esc({ toString() { return '<b>'; } }), '');
});

test('badge: the three statuses, and anything else shows as refused', () => {
  assert.equal(badge('verified'), '<span class="badge b-verified">verified</span>');
  assert.equal(badge('unverified'), '<span class="badge b-unverified">not verified</span>');
  assert.equal(badge('refused'), '<span class="badge b-refused">refused</span>');
  assert.equal(badge('toString'), '<span class="badge b-refused">refused</span>');
  assert.equal(badge(undefined), badge('refused'));
  assert.equal(badge({ toString() { throw new Error('x'); } }), badge('refused'));
});

test('passageHtml: the cited passage with exactly the record\'s characters marked', () => {
  const h = passageHtml(R.index, REC);
  assert.equal(h, '<blockquote class="passage"><div class="ptitle">The kettle · <code>kettle.md#0</code></div>The kettle boils water in about three minutes. ' +
    '<mark>Descale the kettle every month with white vinegar.</mark></blockquote>');
  assert.ok(passageHtml(R.index, { ...REC, start: 0, end: 3 }).includes('</div><mark>The</mark> kettle'));
  const p = R.index.passages[0].text;
  assert.ok(passageHtml(R.index, { ...REC, start: 0, end: p.length }).includes(`<mark>${p}</mark></blockquote>`));
  for (const bad of [{ ...REC, start: -1 }, { ...REC, end: p.length + 1 }, { ...REC, start: '0' }, { ...REC, end: 9.5 }]) {
    assert.ok(!passageHtml(R.index, bad).includes('<mark>'), JSON.stringify(bad));
    assert.ok(passageHtml(R.index, bad).includes(p));
  }
  assert.equal(passageHtml(R.index, { ...REC, source: 'nope' }), '');
  assert.equal(passageHtml(null, REC), '');
});

test('answerHtml: a verified record with its source, offsets and passage; else the refusal, why, and to whom', () => {
  const v = answerHtml(R.index, { status: 'verified', record: REC });
  assert.ok(v.startsWith('<p><span class="badge b-verified">verified</span> <strong>Descale the kettle every month with white vinegar.</strong></p>'));
  assert.ok(v.includes('source <code>kettle.md#0</code>, characters 47 to 97'));
  assert.ok(v.includes('<mark>'));
  assert.equal(answerHtml(R.index, { status: 'refused', why: 'out <of> lane', escalate: 'kar' }),
    '<p><span class="badge b-refused">refused</span> out &lt;of&gt; lane · escalated to <code>kar</code></p>');
  assert.equal(answerHtml(R.index, { status: 'unverified', why: 'withheld' }), '<p><span class="badge b-unverified">not verified</span> withheld</p>');
});

test('checksHtml: one row per trait, yes / no / in CI, and the manifest\'s reasons when it fails', () => {
  const h = checksHtml(R.check);
  assert.ok(h.includes('<tr><th scope="row">describe</th><td><span class="ok">yes</span></td><td>seed.json passes every manifest check of the estate genome</td></tr>'));
  assert.ok(h.includes('<th scope="row">verify</th><td><span class="ok">yes</span></td><td>the judge on the good case: verified; on the bad case: unverified</td>'));
  assert.ok(h.includes('in-lane sample taken: true; off-topic sample taken: false'));
  assert.ok(h.includes('<th scope="row">prune</th><td><span class="na">in CI</span></td>'));
  const f = checksHtml({ ...R.check, describe: { pass: false, reasons: ['a <b>', 'c'] } });
  assert.ok(f.includes('<th scope="row">describe</th><td><span class="no">no</span></td><td>a &lt;b&gt;; c</td>'));
});

test('laneHtml and casesHtml: the rule and its numbers; the two cases with their verdicts', () => {
  const l = laneHtml(R.lane);
  assert.ok(l.startsWith(`<p>${esc(R.lane.rule)}.</p>`));
  assert.ok(l.includes(`<tr><th scope="row">tune (chose the share)</th><td>${R.lane.tune.inLaneAccepted}</td><td>${R.lane.tune.offTopicRefused}</td><td>10 + 30</td></tr>`));
  assert.ok(l.includes('<th scope="row">eval (measured it)</th>'));
  const c = casesHtml(R.cases, R.check.verify);
  assert.ok(c.includes(`for the question “${R.cases.good.question}”: <code>kettle.md#0</code> ${R.cases.good.start}–${R.cases.good.end}: “${R.cases.good.text}” → ${badge('verified')}`));
  assert.ok(c.includes(`one word altered): <code>kettle.md#0</code> ${R.cases.bad.start}–${R.cases.bad.end}: “${R.cases.bad.text}” → ${badge('unverified')}`));
  assert.ok(casesHtml({ good: null, bad: null }, {}).includes(': none → '));
});

test('foldHtml: a folded cell in full, or what is missing', () => {
  const h = foldHtml(R);
  assert.ok(h.startsWith(`<p>${badge('verified')} The corpus folds into a cell: 1 document(s), 2 passages, 20 generated lane questions.</p><h4>The lane</h4>`));
  assert.ok(h.includes(`<li>in lane: “${R.samples.inLane.question}”</li><li>out of lane: “${R.samples.outOfLane.question}”</li>`));
  assert.ok(h.includes('<details><summary>The drafted seed.json</summary><pre>{\n  &quot;genome&quot;: &quot;1&quot;'));
  const no = F.fold({ docs: [{ name: 'e', text: 'of the' }] });
  assert.equal(foldHtml(no), `<p>${badge('refused')} Not shipped. What is missing:</p><ul><li>${no.missing[0]}</li></ul>`);
  const greek = F.fold({ ...META, docs: [{ name: 'g', text: 'Alpha ΟΔΟΣ.' }] });
  assert.ok(foldHtml(greek).includes('Not shipped.') && foldHtml(greek).includes('<h4>The lane</h4>'));
});

test('measureRows: each metric with its count, DocDec\'s number, the rule and pass or fail', () => {
  const m = JSON.parse(read('data/measure.json'));
  const h = measureRows(m);
  assert.equal((h.match(/<tr>/g) || []).length, 8);
  const x = m.metrics.M1;
  assert.ok(h.includes(`<tr><th scope="row">M1</th><td>Right passage (answerer alone)</td><td>${x.value} <span class="small">(${x.count} of ${x.of} answerable)</span></td>` +
    `<td>${m.docdec.colbertTop1} (ColBERT top-1); cosine ${m.docdec.cosineTop1}</td><td>at least ${x.rule}</td><td><span class="${x.pass ? 'ok">pass' : 'no">fail'}</span></td></tr>`));
  assert.ok(h.includes(`<td>${m.metrics.M6.medianMs} ms <span class="small">(840 questions)</span></td><td>15.6 s (local reader)</td><td>at most 100 ms</td><td><span class="${m.metrics.M6.pass ? 'ok">pass' : 'no">fail'}</span></td></tr>`));
  assert.equal(m.metrics.M6.pass, true);
  const flip = (k) => measureRows({ ...m, metrics: { ...m.metrics, [k]: { ...m.metrics[k], pass: !m.metrics[k].pass } } });
  for (const k of ['M1', 'M6']) assert.notEqual(flip(k), h, k);
  assert.ok(measureRows({}).includes('<span class="no">fail</span>'));
});

test('docsFromPaste: "=== name ===" lines start documents; empty documents are dropped', () => {
  assert.deepEqual(docsFromPaste('intro\n=== a.md ===\nA text.\n\n=== b.txt===\n  \n===  c  ===\nC.'), [
    { name: 'pasted.md', text: 'intro' }, { name: 'a.md', text: 'A text.\n' }, { name: 'c', text: 'C.' }]);
  assert.deepEqual(docsFromPaste('=== x ===\n=== y ===\nY'), [{ name: 'y', text: 'Y' }]);
  assert.deepEqual(docsFromPaste(null), []);
});

test('slug: a lower-case name the genome accepts, from any title', () => {
  assert.equal(slug('  The Harbour Kayak Club handbook! '), 'the-harbour-kayak-club-handbook');
  assert.equal(slug('x'.repeat(70)), 'x'.repeat(60));
  assert.equal(slug('***'), 'my-cell');
  assert.equal(slug(null), 'my-cell');
});

// the loader, exactly as the page carries it, with data: URLs standing in for Blob URLs
const linkModules = new Function(read('page/loader.js') + '\nreturn linkModules;')();
const mods = Object.fromEntries(MODULES.map((p) => [p, read(p)]));
const dataUrl = (src) => 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');

test('the loader links the carried modules and the linked kernel folds exactly as the kernel does', async () => {
  const link = linkModules(mods, dataUrl);
  const K = await import(link('src/fold.mjs')), PP = await import(link('src/page.mjs'));
  const r = K.fold({ ...META, docs: [{ name: 'kettle.md', text: KETTLE }] });
  assert.deepEqual({ ok: r.ok, seed: r.seed, lane: r.lane, cases: r.cases, check: r.check }, { ok: R.ok, seed: R.seed, lane: R.lane, cases: R.cases, check: R.check });
  assert.equal(PP.foldHtml(r), foldHtml(R));
  assert.equal(link('src/fold.mjs'), link('src/fold.mjs'));
  const a = K.act(r.index, r.lane.share, { question: 'How often should I descale the kettle?' }, 'kar');
  assert.equal(PP.answerHtml(r.index, a), answerHtml(R.index, F.act(R.index, R.lane.share, { question: 'How often should I descale the kettle?' }, 'kar')));
});

test('the loader resolves ./ and ../ against the importing module, and refuses a module the page does not carry', async () => {
  const seen = [];
  const link = linkModules({ 'a/b/m.mjs': "import { x } from './n.mjs';\nimport { y } from '../c/o.mjs';\nexport const z = x + y;", 'a/b/n.mjs': 'export const x = 1;', 'a/c/o.mjs': 'export const y = 2;' },
    (src) => { seen.push(src); return dataUrl(src); });
  assert.equal((await import(link('a/b/m.mjs'))).z, 3);
  assert.equal(seen.length, 3);
  assert.ok(seen[2].includes(`from '${dataUrl('export const x = 1;')}'`));
  assert.throws(() => linkModules({}, dataUrl)('missing.mjs'), /this page does not carry the module missing\.mjs/);
  assert.throws(() => linkModules({ 'm.mjs': "import './x.mjs'; import { q } from './x.mjs';" }, dataUrl)('m.mjs'), /does not carry the module x\.mjs/);
});

test('build: modules carried as their exact bytes; data escaped; markers all filled', () => {
  const tags = moduleTags();
  for (const p of MODULES) assert.ok(tags.includes(`<script type="text/plain" data-module="${p}">${read(p)}</script>`), p);
  assert.equal(carryable('a </SCRIPT> b'), false);
  assert.equal(carryable('a <!-- b'), false);
  assert.equal(carryable('a < b'), true);
  assert.throws(() => moduleTags((p) => (p === 'src/page.mjs' ? 'x</script>' : 'ok')), /src\/page\.mjs cannot be carried/);
  assert.equal(dataTag({ a: '</script><b>' }), '<script type="application/json" id="data">{"a":"\\u003c/script>\\u003cb>"}</script>');
  assert.equal(fill('<!--A--> and <!--A--> and <!--B:c-->', { A: 'x', 'B:c': 'y' }), 'x and x and y');
  assert.throws(() => fill('<!--A-->', { A: 'x', C: 'y' }), /the template has no marker <!--C-->/);
  assert.throws(() => fill('<!--A--> <!--D-->', { A: 'x' }), /the marker <!--D--> was not filled/);
  assert.equal(fill('<!-- a comment --> <!--A-->', { A: 'x' }), '<!-- a comment --> x');
  assert.equal(pct(0.3448), '34%');
  assert.equal(humanName('consumer-rights-act-2015-cell'), 'Consumer Rights Act 2015');
  assert.equal(humanName('-a--b-'), 'A B');
});

test('passesLine: the number that passed, in words', () => {
  const m = (...p) => ({ metrics: Object.fromEntries(p.map((x, i) => ['M' + i, { pass: x }])) });
  assert.equal(passesLine(m(true, false, false)), 'One of three pass; two fail, and they stay failed.');
  assert.equal(passesLine(m(true, true, true, false, false, false, false, 'yes')), 'Three of eight pass; five fail, and they stay failed.');
  assert.equal(passesLine(m()), 'No of no pass; no fail, and they stay failed.');
});

const DEMO = { born: '2026-11-21', live: 'https://x.github.io/c/', repo: 'x/c', sections: 2,
  source: { what: 'An Act', url: 'https://example.org/a.xml', sha256: 'ab'.repeat(32), licence: 'OGL <v3>' },
  files: [{ path: 'a.md' }], counts: R.counts, lane: R.lane, cases: R.cases, check: R.check, samples: R.samples, line: 'ADMITTED: a cell',
  passages: R.index.passages, asked: [{ question: 'How often?', result: { status: 'verified', record: REC }, note: 'a <note>' }, { question: 'Pizza?', result: { status: 'refused', why: 'no' } }] };

test('demoHtml: the traced run, from the recorded demo; the CI line when there is one', () => {
  const h = demoHtml(DEMO);
  assert.ok(h.includes('(sha256 <code>abababababababab…</code>) and turned into 1 markdown files'));
  assert.ok(h.includes('OGL &lt;v3&gt;'));
  assert.ok(h.includes('<strong>Passages and index.</strong> 2 passages (one per subsection) under 2 section headings.'));
  assert.ok(h.includes('<p class="small">a &lt;note&gt;</p>'));
  assert.ok(h.includes('<mark>Descale the kettle every month with white vinegar.</mark>'));
  assert.ok(h.includes('<code>ADMITTED: a cell</code>.</li>'));
  assert.ok(!h.includes("cell's own CI"));
  assert.ok(demoHtml({ ...DEMO, ci: { url: 'https://ci/1', line: 'ADMITTED in CI' } }).includes(`In the cell's own CI: <a href="https://ci/1">ADMITTED in CI</a>.`));
  assert.equal((h.match(/<div class="card">/g) || []).length, 2);
});

test('enginePage and cellPage fill every marker of their templates', () => {
  const m = JSON.parse(read('data/measure.json'));
  const gates = { files: Object.fromEntries(['src/fold.mjs', 'src/writer.mjs', 'bin/fold.mjs', 'cell-template/genome/act.mjs', 'src/measure.mjs', 'src/page.mjs',
    'src/build-page.mjs', 'page/loader.js', 'genome/act.mjs', 'examples/consumer-rights-act/prepare.mjs'].map((f) => [f, { killed: 3, total: 3 }])) };
  const e = enginePage(m, DEMO, gates);
  assert.ok(e.includes('<td><code>src/fold.mjs</code></td>') && e.includes('CLEAN 3/3, 18 exports fuzzed'));
  assert.equal(/<!--[A-Z][A-Za-z0-9:_./-]*-->/.test(e), false);
  assert.ok(e.includes(`<strong>${passesLine(m)}</strong>`));
  assert.ok(e.includes(`(measured: ${m.metrics.M6.medianMs} ms a question, against 15.6 s`));
  assert.ok(e.includes(`(${pct(m.metrics.M4.value)} refused)`));
  const c = cellPage(R, { ...META, examples: ['Is it <safe>?'], licence: { name: 'OGL v3.0', attribution: 'Contains public sector information.' } }, { commit: 'abcdef123456' }, [{ path: 'kettle.md' }]);
  assert.ok(c.includes('<title>Kettle Cell</title>'));
  assert.ok(c.includes('<h1>Ask the kettle &lt;manual&gt;, and check every answer.</h1>'));
  assert.ok(c.includes(`<button type="button" class="ghost" data-q="${esc(R.cases.good.question)}">`));
  assert.ok(c.includes('data-q="Is it &lt;safe&gt;?"'));
  assert.ok(c.includes('The source text (<code>corpus/</code>) is under OGL v3.0. Contains public sector information.'));
  assert.ok(c.includes('<code>abcdef1</code>') && c.includes('<code>kettle.md</code>'));
  assert.ok(c.includes(dataTag({ passages: R.index.passages, lane: R.lane, seed: R.seed })));
  const plain = cellPage(R, {}, { commit: null }, []);
  assert.ok(plain.includes('The source text keeps its own licence.') && plain.includes('<h1>Ask kettle-cell, and check') && plain.includes('byte for byte: none</td>'));
  assert.ok(cellPage(R, { licence: { name: 'X' } }, { commit: 'a' }, []).includes('is under X. </p>'));
  assert.equal(typeof B.enginePage, 'function');
  assert.equal(typeof P.foldHtml, 'function');
});
