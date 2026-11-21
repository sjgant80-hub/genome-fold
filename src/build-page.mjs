// build-page.mjs — assemble the pages from page/: the template, the shared style and loader, every module the page runs
// as the exact bytes of its file, and the data. The engine's page is built by scripts/make-page.mjs; every folded cell's
// page by the writer. A template marker <!--KEY--> must be filled, and none may be left over.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex } from './fold.mjs';
import P from './page.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const MODULES = ['src/fold.mjs', 'src/page.mjs', 'vendor/docdec/src/gate.mjs', 'vendor/docdec/src/late.mjs',
  'vendor/docdec/genome/lane-share.mjs', 'vendor/estate-genome/src/genome.mjs'];
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
export const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// carryable(src) → true when a module's bytes can sit inside a <script> element unchanged
export const carryable = (src) => !/<\/script|<!--/i.test(src);

// moduleTags(readFile) → each module as a <script type="text/plain" data-module="<path>"> holding its exact bytes
export function moduleTags(readFile = read) {
  return MODULES.map((p) => {
    const src = readFile(p);
    if (!carryable(src)) throw new Error(`${p} cannot be carried inside a script element`);
    return `<script type="text/plain" data-module="${p}">${src}</script>`;
  }).join('\n');
}

// dataTag(data) → the page's data as JSON in a script element, every < escaped so it cannot close the element
export const dataTag = (data) => `<script type="application/json" id="data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

// fill(template, parts) → the template with every <!--KEY--> replaced by parts[KEY]
export function fill(template, parts) {
  let out = template;
  for (const [k, v] of Object.entries(parts)) {
    const marker = `<!--${k}-->`;
    if (!out.includes(marker)) throw new Error(`the template has no marker ${marker}`);
    out = out.split(marker).join(v);
  }
  const left = out.match(/<!--[A-Z][A-Za-z0-9:_./-]*-->/);
  if (left) throw new Error(`the marker ${left[0]} was not filled`);
  return out;
}

export const pct = (v) => Math.round(v * 100) + '%';

// passesLine(measure) → how many of the pre-registered rules passed, in words
export function passesLine(measure) {
  const all = Object.values(measure.metrics), n = all.filter((m) => m.pass === true).length;
  return `${WORDS[n]} of ${WORDS[all.length].toLowerCase()} pass; ${WORDS[all.length - n].toLowerCase()} fail, and they stay failed.`;
}

// humanName(slug) → a short page name from a cell's name: its first four words, capitalised
export const humanName = (slug) => slug.split('-').filter((w) => w !== '').slice(0, 4).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

// demoHtml(demo) → the traced real run on the engine's page, from data/demo.json (what scripts/demo.mjs recorded)
export function demoHtml(demo) {
  const ix = buildIndex(demo.passages);
  const ci = demo.ci ? ` In the cell's own CI: <a href="${P.esc(demo.ci.url)}">${P.esc(demo.ci.line)}</a>.` : '';
  const asked = demo.asked.map((a) => `<div class="card"><p><strong>“${P.esc(a.question)}”</strong></p>${P.answerHtml(ix, a.result)}` +
    `${a.note ? `<p class="small">${P.esc(a.note)}</p>` : ''}</div>`).join('');
  return `<p>Folded on ${P.esc(demo.born)} with the command line, from the text as published on legislation.gov.uk. The cell is live:
<a href="${P.esc(demo.live)}">${P.esc(demo.live)}</a> (repository <a href="https://github.com/${P.esc(demo.repo)}">${P.esc(demo.repo)}</a>).</p>
<ol class="flow">
<li><strong>The source.</strong> ${P.esc(demo.source.what)}, fetched as XML from <a href="${P.esc(demo.source.url)}">${P.esc(demo.source.url)}</a>
(sha256 <code>${P.esc(demo.source.sha256.slice(0, 16))}…</code>) and turned into ${demo.files.length} markdown files, one per chapter, by
<code>examples/consumer-rights-act/prepare.mjs</code>. ${P.esc(demo.source.licence)}</li>
<li><strong>Passages and index.</strong> ${demo.counts.passages} passages (one per subsection) under ${demo.sections} section headings.</li>
<li><strong>Lane.</strong> ${demo.counts.questions} questions written from the Act's own rarest words, against the fixed off-topic set. ${P.laneHtml(demo.lane)}</li>
<li><strong>The judge's cases.</strong> ${P.casesHtml(demo.cases, demo.check.verify)}</li>
<li><strong>Lane samples.</strong> In lane: “${P.esc(demo.samples.inLane.question)}”. Out of lane: “${P.esc(demo.samples.outOfLane.question)}”.</li>
<li><strong>Seed and birth check.</strong> The drafted seed.json passed the manifest check, and the birth check on the written folder said:
<code>${P.esc(demo.line)}</code>.${ci}</li>
<li><strong>Asking it.</strong> Three questions, as they came out (the second is a miss, kept to show what verified does and does not mean):${asked}</li>
</ol>`;
}

// enginePage(measure, demo, gates) → the engine's index.html
export function enginePage(measure, demo, gates) {
  const parts = { STYLE: read('page/style.css'), LOADER: read('page/loader.js'), MODULES: moduleTags(), MEASURE: P.measureRows(measure),
    DEMO: demoHtml(demo), PASSES: passesLine(measure), MS: String(measure.metrics.M6.medianMs), DS: String(measure.docdec.secondsPerQuestion) };
  for (const k of ['M2', 'M3right', 'M4']) parts['M:' + k] = pct(measure.metrics[k].value);
  for (const [file, g] of Object.entries(gates.files)) parts['GATE:' + file] = `CLEAN ${g.killed}/${g.total}`;
  return fill(read('page/engine.html'), parts);
}

// cellPage(result, meta, engine, files) → a folded cell's index.html: the fold's result, its passages and seed as data.
// engine: {commit}; files: the corpus files [{path}]
export function cellPage(result, meta, engine, files) {
  const s = result.seed, title = (meta && meta.title) || s.name, lic = meta && meta.licence;
  const examples = [result.cases.good.question, ...((meta && meta.examples) || [])];
  const list = files.map((f) => `<code>${P.esc(f.path)}</code>`).join(', ');
  return fill(read('page/cell.html'), {
    NAME: P.esc(humanName(s.name)), TITLE: P.esc(title), PURPOSE: P.esc(s.purpose),
    COUNTS: `${result.counts.docs} document(s), ${result.counts.passages} passages`, LANE: P.laneHtml(result.lane),
    CASES: P.casesHtml(result.cases, result.check.verify), CHECK: P.checksHtml(result.check), FILES: list || 'none',
    ENGINE: `<code>${P.esc(String(engine.commit).slice(0, 7))}</code>`, REPO: P.esc(s.provenance.repo),
    LICENCE: lic ? `The source text (<code>corpus/</code>) is under ${P.esc(lic.name)}. ${P.esc(lic.attribution || '')}` : 'The source text keeps its own licence.',
    EXAMPLES: examples.map((q) => `<button type="button" class="ghost" data-q="${P.esc(q)}">${P.esc(q)}</button>`).join(''),
    DATA: dataTag({ passages: result.index.passages, lane: result.lane, seed: s }),
    STYLE: read('page/style.css'), LOADER: read('page/loader.js'), MODULES: moduleTags(),
  });
}

export default { ROOT, MODULES, read, carryable, moduleTags, dataTag, fill, pct, passesLine, humanName, demoHtml, enginePage, cellPage };
