// writer.mjs — the cell writer: a corpus folder in, a cell folder out, ready to push as a repository. It is shipped only
// when the estate genome's birth check (pinned, vendor/estate-genome/src/run.mjs) admits it; otherwise nothing is left
// at the destination and the writer reports what is missing.
//
// A folded cell holds: seed.json; data/ (the index of passages, the lane measurement, the generated lane questions);
// corpus/ (the source files, byte for byte); kernel/ (the fold kernel and the vendored pieces it composes, byte for
// byte); genome/ (the estate genome's pinned hooks, plus cell.mjs and act.mjs from cell-template/); the birth-check
// workflow; FOLD.json (what was folded, by which engine commit, every hash); README.md; index.html (the cell's own page,
// which carries the kernel byte for byte and answers in the browser); LICENSE (MIT, the code); and CORPUS-LICENCE.md
// (the corpus's own licence, when one is given).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, renameSync, rmSync } from 'node:fs';
import { join, relative, sep, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fold, OFF_TOPIC } from './fold.mjs';
import { check } from '../vendor/estate-genome/src/run.mjs';
import { cellPage } from './build-page.mjs';

export const ENGINE = fileURLToPath(new URL('../', import.meta.url));
export const TEXT = /\.(md|markdown|txt)$/i;
export const KERNEL = ['src/fold.mjs', 'src/page.mjs', 'vendor/docdec/src/gate.mjs', 'vendor/docdec/src/late.mjs', 'vendor/docdec/genome/lane-share.mjs',
  'vendor/estate-genome/src/genome.mjs'];
export const HOOKS = ['health.mjs', 'io.mjs', 'judge.mjs', 'lane.mjs', 'tombstone.mjs'];
const sha = (b) => createHash('sha256').update(b).digest('hex');
const json = (v) => JSON.stringify(v, null, 1) + '\n';

// readCorpus(dir) → { docs:[{name,text}], files:[{path,sha256,bytes}], skipped:[path] }: every .md, .markdown and .txt
// file under dir (dot-folders and node_modules left out), in path order; anything else is listed as skipped
export function readCorpus(dir) {
  const all = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else all.push(relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  const docs = [], files = [], skipped = [];
  for (const f of all.sort()) {
    if (!TEXT.test(f)) { skipped.push(f); continue; }
    const bytes = readFileSync(join(dir, f));
    docs.push({ name: f, text: bytes.toString('utf8').replace(/^﻿/, '') });
    files.push({ path: f, sha256: sha(bytes), bytes: bytes.length });
  }
  return { docs, files, skipped };
}

// engineCommit() → { commit, clean } of the engine's own checkout (clean: its kernel, vendored pieces, cell template and
// page templates are committed), or nulls when it is not a git checkout
export function engineCommit() {
  try {
    const commit = execFileSync('git', ['-C', ENGINE, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const dirty = execFileSync('git', ['-C', ENGINE, 'status', '--porcelain', '--', 'src', 'vendor', 'cell-template', 'page'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { commit, clean: dirty.trim() === '' };
  } catch { return { commit: null, clean: null }; }
}

// readme(result, meta) → the cell's README.md
export function readme(result, meta) {
  const s = result.seed, repo = s.provenance.repo, [owner, name] = repo.split('/');
  const lic = meta.licence;
  return [
    `# ${s.name}`, '',
    `**Live: https://${owner}.github.io/${name}/**`, '',
    s.purpose, '',
    `A cell folded by [genome-fold](https://github.com/sjgant80-hub/genome-fold) from ${result.counts.docs} document(s) in \`corpus/\` ` +
      `(${result.counts.passages} passages). No language model: the answer is a sentence of the corpus, word for word, with the ` +
      'passage it came from and its character offsets, so anyone can check it.', '',
    '## Ask it', '',
    '```bash', `echo '{"question":"${result.cases.good.question.replace(/'/g, '')}"}' | node genome/act.mjs`, '```', '',
    'A question outside the lane is refused and escalated; an answer leaves only when the judge verifies it.', '',
    '## The birth check', '',
    'This repository is admitted as a cell of the estate genome only when its four traits hold on its own hooks: it describes ' +
      'itself (`seed.json`), its judge tells a real answer record from the same record with one word altered, its health and ' +
      'reversible tombstone work, and its lane takes an in-lane question and refuses an off-topic one. CI runs the check on every push ' +
      '(`uses: sjgant80-hub/estate-genome@v1`).', '',
    '```bash', 'git clone https://github.com/sjgant80-hub/estate-genome && node estate-genome/bin/genome-check.mjs .', '```', '',
    '## The lane', '',
    `${result.lane.rule}. The share was chosen on half of the questions generated from this corpus's own words and a fixed ` +
      `off-topic set, and measured on the other half: in-lane accepted ${result.lane.eval.inLaneAccepted}, off-topic refused ` +
      `${result.lane.eval.offTopicRefused}. The questions are in \`data/lane-questions.json\`.`, '',
    '## Licence', '',
    'The code (`kernel/`, `genome/`) is MIT, `LICENSE`, by Simon Gant. ' +
      (lic ? `The corpus (\`corpus/\`) is not: it is under ${lic.name}; see \`CORPUS-LICENCE.md\`.` : 'The corpus (`corpus/`) keeps its own licence.'), '',
    'Supplied by [AI Native Solutions](https://www.ai-nativesolutions.com). Support is agreed per deployment, in each deployment\'s agreement.', '',
  ].join('\n');
}

// cellFiles(result, corpusDir, corpus, meta) → { '<path in the cell>': string | Buffer }: every file of the cell
export function cellFiles(result, corpusDir, corpus, meta) {
  const files = {};
  const kernel = KERNEL.map((k) => ({ path: 'kernel/' + k, bytes: readFileSync(join(ENGINE, k)) }));
  files['seed.json'] = JSON.stringify(result.seed, null, 2) + '\n';
  files['data/index.json'] = json({ passages: result.index.passages });
  files['data/lane.json'] = json(result.lane);
  files['data/lane-questions.json'] = json({ generated: result.questions, offTopic: OFF_TOPIC });
  for (const f of corpus.files) files['corpus/' + f.path] = readFileSync(join(corpusDir, f.path));
  for (const k of kernel) files[k.path] = k.bytes;
  for (const h of HOOKS) files['genome/' + h] = readFileSync(join(ENGINE, 'vendor/estate-genome/template/genome', h));
  for (const h of ['cell.mjs', 'act.mjs']) files['genome/' + h] = readFileSync(join(ENGINE, 'cell-template/genome', h));
  files['.github/workflows/genome.yml'] = readFileSync(join(ENGINE, 'vendor/estate-genome/template/.github/workflows/genome.yml'));
  files.LICENSE = readFileSync(join(ENGINE, 'LICENSE'));
  const lic = meta.licence;
  if (lic) files['CORPUS-LICENCE.md'] = `# Corpus licence\n\nThe files in \`corpus/\` are under ${lic.name}${lic.url ? ` (${lic.url})` : ''}.\n\n${lic.attribution || ''}\n`;
  files['FOLD.json'] = json({
    engine: { repo: 'sjgant80-hub/genome-fold', ...engineCommit() },
    folded: result.seed.provenance.born, counts: result.counts, lane: { share: result.lane.share, rule: result.lane.rule },
    corpus: corpus.files, skipped: corpus.skipped, licence: lic || null, kernel: kernel.map((k) => ({ path: k.path, sha256: sha(k.bytes) })),
  });
  files['README.md'] = readme(result, meta);
  files['index.html'] = cellPage(result, meta, engineCommit(), corpus.files);
  return files;
}

// plant(dir, files) → writes every file under dir
export function plant(dir, files) {
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), body);
  }
}

// foldFolder(corpusDir, outDir, meta, opts) → { shipped, dir?, line?, missing, ... }
// meta: fold's {name, title, lane, escalate, repo, by, born} plus licence {name, url, attribution}.
// opts.edit(files, result) may add or change files before the check (the page is added this way); opts.keep leaves a
// rejected cell in its staging folder for inspection. The staging folder sits beside outDir and is renamed to outDir
// only when the birth check admits the cell.
export function foldFolder(corpusDir, outDir, meta, opts = {}) {
  const out = resolve(outDir);
  if (existsSync(out)) return { shipped: false, missing: [`${out} already exists: the writer never overwrites a folder`] };
  const corpus = readCorpus(corpusDir);
  const result = fold({ ...meta, docs: corpus.docs });
  if (!result.ok) return { shipped: false, missing: result.missing, counts: result.counts, skipped: corpus.skipped };
  const files = cellFiles(result, corpusDir, corpus, meta);
  if (opts.edit) opts.edit(files, result);
  mkdirSync(dirname(out), { recursive: true });
  const staging = mkdtempSync(out + '.folding-');
  plant(staging, files);
  const c = check(staging, { timeoutMs: opts.timeoutMs });
  if (!c.result.admitted) {
    const missing = c.result.traits.filter((t) => !t.pass).map((t) => `${t.trait}: ${t.reasons.join('; ')}`);
    if (!opts.keep) rmSync(staging, { recursive: true, force: true });
    return { shipped: false, missing, line: c.line, kept: opts.keep ? staging : null };
  }
  renameSync(staging, out);
  return { shipped: true, dir: out, line: c.line, missing: [], counts: result.counts, skipped: corpus.skipped, result, files: Object.keys(files).sort() };
}

export default { ENGINE, TEXT, KERNEL, HOOKS, readCorpus, engineCommit, readme, cellFiles, plant, foldFolder };
