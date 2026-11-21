// genome.mjs — the birth check's judge. Pure and total: garbage in gives a verdict with reasons, never a throw.
//
// A part is admitted as a cell only when all four traits hold:
//   describe  · it ships a seed.json that says what it is, its lane, its interface, its judge, its hooks, where it came from
//   verify    · its judge calls a known-good case verified and refuses to call a known-bad case verified
//   prune     · it reports its health, and its tombstone round-trips: applied it changes the part, restored it is byte-identical
//   boundary  · it accepts an in-lane input, and refuses an out-of-lane one, naming who it escalates to
// The runner (bin/genome-check.mjs) executes the part's own hooks and hands their output here. This module only judges.

export const GENOME = '1';
export const TRAITS = ['describe', 'verify', 'prune', 'boundary'];
export const STATUSES = ['verified', 'unverified', 'refused'];
export const KINDS = ['repo', 'agent', 'contract', 'model', 'tool', 'service'];

const SLUG = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const DATE = /^\d{4}-\d{2}-\d{2}/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// at(o, k) → o[k] if o is a plain object and reading it does not throw, else undefined
export function at(o, k) {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return undefined;
  try { return o[k]; } catch { return undefined; }
}
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const has = (o, k) => at(o, k) !== undefined;

// parseSeed(text) → { ok, seed } or { ok:false, why }
export function parseSeed(src) {
  if (typeof src !== 'string') return { ok: false, why: 'no seed.json text' };
  let v;
  try { v = JSON.parse(src); } catch { return { ok: false, why: 'seed.json is not valid JSON' }; }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return { ok: false, why: 'seed.json must be one JSON object' };
  return { ok: true, seed: v };
}

// lastJson(out) → the last line of a hook's output that parses as a JSON object, else null (hooks may log before it)
export function lastJson(out) {
  if (typeof out !== 'string') return null;
  const lines = out.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('{')) continue;
    try { return JSON.parse(line); } catch { /* not this line: a line that starts with { and parses is always an object */ }
  }
  return null;
}

// describe(seed) → { trait:'describe', pass, reasons }: the manifest any agent can find, route to and compose by
export function describe(seed) {
  const r = [];
  const need = (ok, why) => { if (!ok) r.push(why); };
  const lane = at(seed, 'lane'), io = at(seed, 'interface'), judge = at(seed, 'judge'), cases = at(judge, 'cases');
  const bound = at(seed, 'boundary'), health = at(seed, 'health'), tomb = at(seed, 'tombstone'), prov = at(seed, 'provenance');
  need(at(seed, 'genome') === GENOME, `genome must be "${GENOME}"`);
  need(SLUG.test(text(at(seed, 'name'))), 'name must be a lower-case slug');
  need(KINDS.includes(at(seed, 'kind')), `kind must be one of ${KINDS.join(', ')}`);
  const purpose = text(at(seed, 'purpose'));
  need(purpose.length >= 20 && purpose.length <= 400, 'purpose must say what it does in 20 to 400 characters');
  need(SLUG.test(text(at(lane, 'id'))), 'lane.id must be a lower-case slug');
  need(text(at(lane, 'accepts')) !== '', 'lane.accepts must say what it takes');
  need(text(at(lane, 'refuses')) !== '', 'lane.refuses must say what it turns away');
  need(text(at(io, 'in')) !== '', 'interface.in must say what goes in');
  need(text(at(io, 'out')) !== '', 'interface.out must say what comes out');
  need(text(at(judge, 'what')) !== '', 'judge.what must say what makes an output right');
  need(text(at(judge, 'run')) !== '', 'judge.run must be the command that runs the judge');
  need(has(cases, 'good') && has(cases, 'bad'), 'judge.cases must hold a good and a bad case');
  need(JSON.stringify(at(cases, 'good')) !== JSON.stringify(at(cases, 'bad')), 'judge.cases.good and .bad must differ');
  need(text(at(bound, 'run')) !== '', 'boundary.run must be the command that checks the lane');
  need(has(bound, 'inLane') && has(bound, 'outOfLane'), 'boundary must hold an inLane and an outOfLane sample');
  need(JSON.stringify(at(bound, 'inLane')) !== JSON.stringify(at(bound, 'outOfLane')), 'boundary.inLane and .outOfLane must differ');
  need(text(at(bound, 'escalate')) !== '', 'boundary.escalate must name who out-of-lane input goes to');
  need(text(at(health, 'run')) !== '', 'health.run must be the command that reports health');
  need(text(at(tomb, 'apply')) !== '' && text(at(tomb, 'restore')) !== '', 'tombstone must have an apply and a restore command');
  need(REPO.test(text(at(prov, 'repo'))), 'provenance.repo must be owner/name');
  need(text(at(prov, 'by')) !== '', 'provenance.by must say who made it');
  need(DATE.test(text(at(prov, 'born'))), 'provenance.born must be a date (YYYY-MM-DD)');
  return { trait: 'describe', pass: r.length === 0, reasons: r };
}

// a hook's run as the runner records it: { code, out }
const ran = (run) => Number.isInteger(at(run, 'code'));
const statusOf = (run) => at(lastJson(at(run, 'out')), 'status');

// verify(seed, runs) → the judge tells right from wrong: good → verified, bad → never verified
export function verify(seed, runs) {
  const r = [];
  const good = at(at(runs, 'judge'), 'good'), bad = at(at(runs, 'judge'), 'bad');
  if (!ran(good)) r.push('the judge did not run on the good case');
  else {
    const s = statusOf(good);
    if (!STATUSES.includes(s)) r.push('the judge gave no status on the good case (verified, unverified or refused)');
    else if (s !== 'verified') r.push(`the judge did not verify the known-good case (said ${s})`);
    if (at(good, 'code') !== 0) r.push(`the judge exited ${at(good, 'code')} on the good case`);
  }
  if (!ran(bad)) r.push('the judge did not run on the bad case');
  else {
    const s = statusOf(bad);
    if (!STATUSES.includes(s)) r.push('the judge gave no status on the bad case (verified, unverified or refused)');
    else if (s === 'verified') r.push('the judge called the known-bad case verified');
  }
  return { trait: 'verify', pass: r.length === 0, reasons: r };
}

// prune(seed, runs) → it reports its health, and its tombstone is reversible
export function prune(seed, runs) {
  const r = [];
  const h = at(runs, 'health');
  if (!ran(h)) r.push('the health hook did not run');
  else {
    const v = lastJson(at(h, 'out'));
    if (v === null) r.push('the health hook printed no JSON');
    else {
      const flag = (k) => { const x = at(v, k); if (!(x === null || typeof x === 'boolean')) r.push(`health.${k} must be true, false or null`); };
      flag('used'); flag('dependedOn');
      if (typeof at(v, 'passing') !== 'boolean') r.push('health.passing must be measured (true or false)');
      const le = at(v, 'lastEarned');
      if (!(le === null || DATE.test(text(le)))) r.push('health.lastEarned must be a date or null');
    }
  }
  const t = at(runs, 'tombstone');
  const before = text(at(t, 'before'));
  if (before === '') r.push('the tombstone was not tried');
  else {
    if (at(t, 'applyCode') !== 0) r.push('tombstone apply failed');
    if (at(t, 'restoreCode') !== 0) r.push('tombstone restore failed');
    if (text(at(t, 'applied')) === before) r.push('tombstone apply changed nothing');
    if (text(at(t, 'restored')) !== before) r.push('tombstone restore did not bring back the identical part');
  }
  return { trait: 'prune', pass: r.length === 0, reasons: r };
}

// boundary(seed, runs) → in-lane is taken; out-of-lane is refused and escalated to the declared party
export function boundary(seed, runs) {
  const r = [];
  const inRun = at(at(runs, 'boundary'), 'inLane'), outRun = at(at(runs, 'boundary'), 'outOfLane');
  if (!ran(inRun)) r.push('the lane check did not run on the in-lane sample');
  else {
    const v = lastJson(at(inRun, 'out'));
    if (at(v, 'inLane') !== true) r.push('the lane check did not accept its own in-lane sample');
    if (at(v, 'status') === 'refused') r.push('the lane check refused its own in-lane sample');
  }
  if (!ran(outRun)) r.push('the lane check did not run on the out-of-lane sample');
  else {
    const v = lastJson(at(outRun, 'out'));
    if (at(v, 'inLane') !== false) r.push('the lane check did not mark the out-of-lane sample out of lane');
    if (at(v, 'status') !== 'refused') r.push('the lane check did not refuse the out-of-lane sample');
    const want = text(at(at(seed, 'boundary'), 'escalate'));
    if (want === '' || text(at(v, 'escalate')) !== want) r.push(`the lane check did not escalate to "${want}"`);
  }
  return { trait: 'boundary', pass: r.length === 0, reasons: r };
}

// birth(seed, runs) → { admitted, cell, traits }: a cell only when all four hold
export function birth(seed, runs) {
  const traits = [describe(seed), verify(seed, runs), prune(seed, runs), boundary(seed, runs)];
  const admitted = traits.every((t) => t.pass);
  return { admitted, cell: admitted ? 'cell' : 'part', traits };
}

// verdictLine(result) → one plain line a person or an agent can read
export function verdictLine(result) {
  const traits = Array.isArray(at(result, 'traits')) ? result.traits : [];
  const marks = TRAITS.map((name) => {
    const t = traits.find((x) => at(x, 'trait') === name);
    return `${name} ${at(t, 'pass') === true ? 'yes' : 'no'}`;
  });
  const n = traits.filter((t) => at(t, 'pass') === true).length;
  return `${at(result, 'admitted') === true ? 'ADMITTED: a cell' : 'NOT ADMITTED: a part'} (${n} of 4: ${marks.join(', ')})`;
}

// describeText(src) → the check anyone can run without the part's code: parse + describe (the census and the page use this)
export function describeText(src) {
  const p = parseSeed(src);
  if (!p.ok) return { declared: false, describes: false, reasons: [p.why] };
  const d = describe(p.seed);
  return { declared: true, describes: d.pass, reasons: d.reasons, name: text(at(p.seed, 'name')), lane: text(at(at(p.seed, 'lane'), 'id')) };
}

export default { GENOME, TRAITS, STATUSES, KINDS, at, parseSeed, lastJson, describe, verify, prune, boundary, birth, verdictLine, describeText };
