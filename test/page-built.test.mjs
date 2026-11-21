// The built page (index.html) is what the gated code and the shipped data make, nothing else: a fixpoint of the build,
// carrying every module byte for byte, its kernel runnable from the page itself, its links and colours whole, its words
// plain. And the recorded demo run re-derives from the Act's corpus in this repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { enginePage, MODULES, read } from '../src/build-page.mjs';
import { readCorpus } from '../src/writer.mjs';
import { fold, act } from '../src/fold.mjs';
import { docsFromPaste } from '../src/page.mjs';

const json = (p) => JSON.parse(read(p));
const HTML = read('index.html');
const visible = HTML.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');

test('index.html is a fixpoint of the build from the gated code and the shipped data', () => {
  assert.equal(HTML, enginePage(json('data/measure.json'), json('data/demo.json'), json('data/gates.json')));
});

test('the page carries every module as the exact bytes of its file, and the loader verbatim', () => {
  for (const p of MODULES) {
    const m = HTML.match(new RegExp(`<script type="text/plain" data-module="${p.replace(/[./]/g, '\\$&')}">([\\s\\S]*?)</script>`));
    assert.ok(m, p);
    assert.equal(m[1], read(p), p);
  }
  assert.ok(HTML.includes('<script>\n' + read('page/loader.js') + '\n</script>'));
});

test('the kernel the page carries, linked as the page links it, folds the page\'s own sample corpus into a cell', async () => {
  const mods = {};
  for (const m of HTML.matchAll(/<script type="text\/plain" data-module="([^"]+)">([\s\S]*?)<\/script>/g)) mods[m[1]] = m[2];
  const loader = HTML.match(/<script>\n([\s\S]*?)\n<\/script>/)[1];
  const link = new Function(loader + '\nreturn linkModules;')()(mods, (src) => 'data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  const K = await import(link('src/fold.mjs'));
  const sample = HTML.match(/<textarea id="corpus" spellcheck="false">([\s\S]*?)<\/textarea>/)[1];
  const r = K.fold({ docs: docsFromPaste(sample), name: 'the-harbour-kayak-club-handbook', title: 'the Harbour Kayak Club handbook', escalate: 'kar',
    repo: 'your-org/the-harbour-kayak-club-handbook', by: 'you', born: '2026-11-21' });
  assert.equal(r.ok, true, r.missing.join('; '));
  const q = HTML.match(/<input type="text" id="question" value="([^"]*)">/)[1];
  assert.equal(K.act(r.index, r.lane.share, { question: q }, 'kar').status, 'verified');
});

test('every in-page link has a target, every colour token is defined, and it explains itself', () => {
  for (const m of HTML.matchAll(/href="#([^"]+)"/g)) assert.ok(HTML.includes(`id="${m[1]}"`), m[1]);
  for (const m of HTML.matchAll(/(?:href|src)="(?!https?:|#|mailto:)([^"]+)"/g)) assert.ok(existsSync(new URL('../' + m[1], import.meta.url)), m[1]);
  const css = read('page/style.css');
  for (const m of HTML.matchAll(/var\((--[a-z0-9-]+)\)/g)) assert.ok(css.includes(m[1] + ':'), m[1]);
  assert.ok(css.includes('@media (prefers-color-scheme: dark)') && css.includes(':root:not([data-theme="light"])') && css.includes(':root[data-theme="dark"]'));
  assert.ok(HTML.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
  for (const id of ['start', 'try', 'how', 'trace', 'measured', 'blueprint', 'adoption', 'limits', 'paper']) assert.ok(HTML.includes(`id="${id}"`), id);
  assert.match(HTML, /<title>[A-Z][a-z]+( [A-Z][a-z]+){1,3}<\/title>/);
});

test('plain public words: no private vocabulary, no prices, the maker and the supplier named', () => {
  assert.doesNotMatch(visible, /\btorus\b|\bkappa\b|\bphi\b|[◊κφ]/i);
  assert.doesNotMatch(visible, /[£$€]\s?\d/);
  assert.ok(visible.includes('Made by Kar.') && visible.includes('AI Native Solutions') && visible.includes('Support is agreed per deployment, in each deployment\'s agreement.'));
});

test('data/gates.json says what the gates hold now: every file CLEAN, with today\'s mutant counts', async () => {
  const w = pathToFileURL(new URL('../.witness/witness.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;
  assert.ok(existsSync(new URL('../.witness/witness.mjs', import.meta.url)), 'clone witness v0.6 into .witness first');
  const { mutants } = await import(w);
  for (const [f, g] of Object.entries(json('data/gates.json').files)) {
    assert.equal(g.clean, true, f);
    assert.equal(g.killed, g.total, f);
    assert.equal(g.total, mutants(read(f)).length, `${f}: the file changed since its gate ran`);
  }
});

test('the recorded demo run re-derives from the Act\'s corpus in this repository', () => {
  const d = json('data/demo.json');
  const c = readCorpus(new URL('../examples/consumer-rights-act/corpus/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const r = fold({ docs: c.docs, name: 'consumer-rights-cell', title: 'the Consumer Rights Act 2015, Part 1', escalate: 'kar', repo: d.repo, by: 'Kar, for Simon Gant', born: d.born });
  assert.equal(r.ok, true);
  assert.deepEqual([d.counts, d.lane, d.cases, d.samples, d.check], [r.counts, r.lane, r.cases, r.samples, r.check]);
  for (const a of d.asked) assert.deepEqual(a.result, act(r.index, r.lane.share, { question: a.question }, 'kar'), a.question);
  assert.deepEqual(d.files, c.files);
  for (const p of d.passages) assert.deepEqual(p, r.index.passages[r.index.byId.get(p.id)]);
});
