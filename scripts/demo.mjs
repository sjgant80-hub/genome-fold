// node scripts/demo.mjs <out-dir> [--ci <run-url>] — fold the Consumer Rights Act 2015, Part 1 (examples/consumer-rights-act/
// corpus, made from the XML in sources/ by prepare.mjs) into the cell repository folder <out-dir>, and record the run for the
// engine's page in data/demo.json. With --ci, only adds the cell's CI run (its URL and its birth-check line) to the record.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { foldFolder, readCorpus } from '../src/writer.mjs';
import { act } from '../src/fold.mjs';

const at = (p) => new URL('../' + p, import.meta.url);
const DEMO = at('data/demo.json');
const args = process.argv.slice(2);
if (args[0] === '--ci') {
  const d = JSON.parse(readFileSync(DEMO, 'utf8'));
  d.ci = { url: args[1], line: args[2] };
  writeFileSync(DEMO, JSON.stringify(d, null, 1) + '\n');
  console.log('recorded the cell\'s CI run: ' + args[1]);
  process.exit(0);
}
const out = args[0];
if (!out) { console.error('usage: node scripts/demo.mjs <out-dir> | --ci <run-url> "<line>"'); process.exit(2); }

const xml = gunzipSync(readFileSync(at('examples/consumer-rights-act/sources/part-1.xml.gz')));
const ATTRIBUTION = 'Contains public sector information licensed under the Open Government Licence v3.0. Source: the Consumer Rights Act 2015, ' +
  'Part 1, from legislation.gov.uk (https://www.legislation.gov.uk/ukpga/2015/15/part/1), the text as revised to 29 October 2026, retrieved ' +
  '21 November 2026 and converted to markdown, one file per chapter, by genome-fold (examples/consumer-rights-act/prepare.mjs). Editorial ' +
  'notes and amendment marks were left out; the words of the law were not changed.';
const QUESTIONS = [
  'Must a service be performed with reasonable care and skill?',
  'How long do I have to reject faulty goods?',
  'What is the best pizza topping?',
];
const NOTES = {
  'How long do I have to reject faulty goods?': 'Verified, but not the answer: the sentence really is in the Act at those positions (section 21, partial rejection), yet the time limit '
    + 'for the short-term right to reject (30 days) is in section 22(3). Verified means the words are there, not that they are the best answer.',
};
const meta = {
  name: 'consumer-rights-cell', title: 'the Consumer Rights Act 2015, Part 1', escalate: 'kar', repo: 'sjgant80-hub/consumer-rights-cell',
  by: 'Kar, for Simon Gant', born: '2026-11-21', examples: QUESTIONS.slice(0, 2),
  licence: { name: 'the Open Government Licence v3.0', url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', attribution: ATTRIBUTION },
};
const corpusDir = new URL('../examples/consumer-rights-act/corpus/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const r = foldFolder(corpusDir, out, meta);
if (!r.shipped) { console.log('NOT SHIPPED:\n  - ' + r.missing.join('\n  - ')); process.exit(1); }

const { index, lane, cases, samples, check, counts } = r.result;
const asked = QUESTIONS.map((question) => ({ question, result: act(index, lane.share, { question }, meta.escalate), ...(NOTES[question] ? { note: NOTES[question] } : {}) }));
const cited = new Set([cases.good.source, ...asked.map((a) => a.result.record && a.result.record.source).filter(Boolean)]);
const corpus = readCorpus(corpusDir);
const demo = {
  born: meta.born, repo: meta.repo, live: 'https://sjgant80-hub.github.io/consumer-rights-cell/',
  source: { what: 'Part 1 of the Consumer Rights Act 2015 (sections 1 to 60), as revised to 29 October 2026', url: 'https://www.legislation.gov.uk/ukpga/2015/15/part/1/data.xml',
    sha256: createHash('sha256').update(xml).digest('hex'), retrieved: '2026-11-21', licence: 'Contains public sector information licensed under the Open Government Licence v3.0.' },
  files: corpus.files, sections: corpus.docs.reduce((n, d) => n + (d.text.match(/^### Section /gm) || []).length, 0),
  counts, lane, cases, samples, check, line: r.line, asked, passages: index.passages.filter((p) => cited.has(p.id)),
};
writeFileSync(DEMO, JSON.stringify(demo, null, 1) + '\n');
console.log(`${r.line}\nfolded ${counts.docs} files, ${counts.passages} passages → ${r.dir}`);
for (const a of asked) console.log(`  ${a.question} → ${a.result.status}${a.result.record ? ' ' + a.result.record.source + ' “' + a.result.record.text.slice(0, 90) + '…”' : ''}`);
