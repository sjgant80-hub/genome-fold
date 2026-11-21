#!/usr/bin/env node
// fold — fold a corpus folder into a cell folder, shipped only when the estate genome's birth check admits it.
//   node bin/fold.mjs <corpus-dir> <out-dir> --name <slug> --title "<what the corpus is>" --repo <owner/name>
//        --by "<who folded it>" --escalate <who> [--lane <slug>] [--born YYYY-MM-DD]
//        [--licence "<licence name>"] [--licence-url <url>] [--attribution "<attribution text>"] [--keep]
// Exit 0: the cell was written and admitted. Exit 1: not shipped (what is missing is printed). Exit 2: usage.
import { foldFolder } from '../src/writer.mjs';

const args = process.argv.slice(2);
const pos = [], o = { born: new Date().toISOString().slice(0, 10) };
let keep = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--keep') keep = true;
  else if (args[i].startsWith('--')) o[args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = args[++i];
  else pos.push(args[i]);
}
if (pos.length !== 2 || !o.name) { console.error('usage: fold <corpus-dir> <out-dir> --name <slug> --title "..." --repo owner/name --by "..." --escalate <who>'); process.exit(2); }
const meta = { name: o.name, title: o.title, lane: o.lane, escalate: o.escalate, repo: o.repo, by: o.by, born: o.born };
if (o.licence) meta.licence = { name: o.licence, url: o.licenceUrl, attribution: o.attribution };
const r = foldFolder(pos[0], pos[1], meta, { keep });
if (r.shipped) {
  console.log(`folded: ${r.counts.docs} document(s), ${r.counts.passages} passages, ${r.counts.questions} lane questions → ${r.dir}`);
  if (r.skipped.length) console.log('skipped (not text): ' + r.skipped.join(', '));
  console.log(`lane: ${r.result.lane.rule} (eval: in-lane accepted ${r.result.lane.eval.inLaneAccepted}, off-topic refused ${r.result.lane.eval.offTopicRefused})`);
  console.log(r.line);
  process.exit(0);
}
console.log('NOT SHIPPED. What is missing:');
for (const m of r.missing) console.log('  - ' + m);
if (r.line) console.log(r.line);
if (r.kept) console.log('kept for inspection: ' + r.kept);
process.exit(1);
