// node scripts/gates.mjs [--write] [--timeout <ms>] — run witness v0.6's mutation gate on every file of logic in this
// repository, one at a time. Exit 1 when any is not CLEAN or uses an exemption. --write records the counts in
// data/gates.json (the page shows them); without it, the counts must equal the recorded ones.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const GATES = [
  ['src/fold.mjs', 'test/fold.test.mjs'], ['src/writer.mjs', 'test/writer.test.mjs'], ['bin/fold.mjs', 'test/cli.test.mjs'],
  ['cell-template/genome/act.mjs', 'test/cell.test.mjs'], ['genome/act.mjs', 'test/genome.test.mjs'], ['src/measure.mjs', 'test/measure.test.mjs'],
  ['src/page.mjs', 'test/page.test.mjs'], ['src/build-page.mjs', 'test/page.test.mjs'], ['page/loader.js', 'test/page.test.mjs'],
  ['examples/consumer-rights-act/prepare.mjs', 'test/prepare.test.mjs'],
];
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), write = args.includes('--write');
const timeout = args.includes('--timeout') ? args[args.indexOf('--timeout') + 1] : '60000';
if (!existsSync(ROOT + '.witness/witness.mjs')) { console.error('clone witness v0.6 into .witness first'); process.exit(2); }
const files = {};
let bad = 0;
for (const [file, t] of GATES) {
  const r = spawnSync(process.execPath, ['.witness/witness.mjs', 'mutate', file, '--cap', '100000', '--timeout', timeout, '--test', 'node', '--test', t],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  const out = r.stdout || '';
  let j = null;
  try { j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)); } catch { j = null; }
  const ok = j !== null && j.clean === true && j.ignored.length === 0;
  if (!ok) bad++;
  files[file] = { test: t, total: j ? j.total : null, killed: j ? j.killed : null, clean: ok };
  console.log(`${ok ? 'CLEAN' : 'NOT CLEAN'} ${file} ${j ? j.killed + '/' + j.total : '(no result: ' + ((j && j.reason) || r.stderr.slice(0, 200)) + ')'}`);
  if (j && j.survived.length) for (const s of j.survived) console.log(`  survived: line ${s.line} ${s.from} -> ${s.to}`);
}
const path = ROOT + 'data/gates.json';
if (write) writeFileSync(path, JSON.stringify({ witness: 'v0.6', files }, null, 1) + '\n');
else {
  const rec = JSON.parse(readFileSync(path, 'utf8')).files;
  for (const [f, g] of Object.entries(files)) {
    if (!rec[f] || rec[f].total !== g.total || rec[f].killed !== g.killed) { console.log(`data/gates.json is stale for ${f}: run node scripts/gates.mjs --write`); bad++; }
  }
}
process.exit(bad === 0 ? 0 : 1);
