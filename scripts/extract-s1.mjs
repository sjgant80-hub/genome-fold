// node scripts/extract-s1.mjs [path/to/s1.json] — take the paragraphs and questions (only) from DocDec's S1 set, pinned,
// into data/s1-text.json. Without a path it reads the upstream file at the pinned commit from GitHub. The file's sha256
// must be the pinned one. test/measure-data.test.mjs re-derives the output from the upstream file in CI.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extractS1, S1 } from '../src/measure.mjs';

const path = process.argv[2];
const bytes = path ? readFileSync(path) : Buffer.from(await (await fetch(`https://raw.githubusercontent.com/${S1.repo}/${S1.commit}/${S1.path}`)).arrayBuffer());
const got = createHash('sha256').update(bytes).digest('hex');
if (got !== S1.sha256) { console.error(`extract-s1: sha256 ${got} is not the pinned ${S1.sha256}`); process.exit(1); }
const out = extractS1(JSON.parse(bytes.toString('utf8')));
writeFileSync(new URL('../data/s1-text.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(`s1-text.json: ${out.paragraphs.length} paragraphs, ${out.questions.length} in-corpus questions, ${out.oos.length} off-topic`);
