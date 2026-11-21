// node scripts/measure.mjs — run the pre-registered measurement (PREREG.md) on data/s1-text.json and write
// data/measure.json (the numbers, their rules and verdicts, DocDec v2's published numbers beside them) and
// data/measure-questions.json (what the cell did with every eval question). test/measure-data.test.mjs re-derives
// everything here except the timing (M6), which depends on the machine and is recorded with its conditions.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus, totalmem, platform } from 'node:os';
import { measureS1, docdecRef, cellOf, RULES, atMost, S1, SPLIT, ESCALATE } from '../src/measure.mjs';
import { act } from '../src/fold.mjs';

const PREREG_KERNEL = { commit: '98e8190', sha256: '33badba6c12288ca2cefe58cac771e5c69d47394ab64be36beb5b64c77a9f471' };
const at = (p) => new URL('../' + p, import.meta.url);
const bytes = (p) => readFileSync(at(p));
const read = (p) => JSON.parse(bytes(p).toString('utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');

const s1 = read('data/s1-text.json');
const kernel = sha(bytes('src/fold.mjs'));
const m = measureS1(s1);

// M6: the median time of one guarded act() call over every eval question, after one untimed warm-up pass
const cell = cellOf(s1);
const qs = [...s1.questions.slice(SPLIT), ...s1.oos.slice(SPLIT)].map((q) => q.text);
for (const q of qs) act(cell.index, cell.lane.share, { question: q }, ESCALATE);
const ms = qs.map((q) => { const t = performance.now(); act(cell.index, cell.lane.share, { question: q }, ESCALATE); return performance.now() - t; }).sort((a, b) => a - b);
const median = Math.round(((ms[(ms.length - 1) >> 1] + ms[ms.length >> 1]) / 2) * 1000) / 1000;

const out = {
  prereg: 'PREREG.md',
  computed: new Date().toISOString(),
  kernel: { path: 'src/fold.mjs', sha256: kernel, preregistered: PREREG_KERNEL, same: kernel === PREREG_KERNEL.sha256 },
  data: { ...S1, extract: 'data/s1-text.json', extractSha256: sha(bytes('data/s1-text.json')), licence: s1.licence },
  split: { tuneSkipped: SPLIT, note: 'DocDec\'s tune split is not read; the engine tunes only on its own generated questions' },
  lane: m.lane,
  n: m.n,
  metrics: { ...m.metrics, M6: { medianMs: median, of: ms.length, rule: RULES.M6ms, pass: atMost(median, RULES.M6ms) } },
  docdec: { ...docdecRef(read('vendor/docdec/data/v2/record.json'), read('vendor/docdec/data/v2/measured.json')), from: 'vendor/docdec/data/v2/record.json' },
  machine: { cpu: cpus()[0].model, threads: cpus().length, memoryGb: Math.round(totalmem() / 2 ** 30), platform: platform(), node: process.version,
    conditions: 'one laptop shared with other jobs while measured; the timing is indicative, not a benchmark' },
};
writeFileSync(at('data/measure.json'), JSON.stringify(out, null, 1) + '\n');
writeFileSync(at('data/measure-questions.json'), JSON.stringify(m.rows) + '\n');
const line = (k) => { const x = out.metrics[k]; return `${k.padEnd(8)} ${String(x.value ?? x.medianMs + ' ms').padEnd(8)} rule ${x.rule}  ${x.pass ? 'PASS' : 'FAIL'}`; };
console.log(`kernel ${out.kernel.same ? 'as pre-registered' : 'CHANGED since the pre-registration'} · lane share ${m.lane.share}`);
for (const k of Object.keys(out.metrics)) console.log(line(k));
