// cell.mjs — this folded cell's answers for the birth check (seed.json, genome/), and its act. Written by genome-fold
// (https://github.com/sjgant80-hub/genome-fold); the same file in every folded cell. All three are the fold kernel's
// own functions (kernel/src/fold.mjs) over this cell's index (data/index.json) and lane share (data/lane.json).
// judge  verified only when the record's text is exactly its passage's characters at its offsets and that passage uses
//        at least the lane share of the question's content words; refused when it is not an answer record of this index
// lane   in lane when at least the lane share of the question's content words are words this corpus uses
// act    the guarded answer: out of lane is refused and escalated; an answer leaves only as a verified record
import { readFileSync } from 'node:fs';
import { buildIndex, judgeRecord, inLaneOf, act as guarded } from '../kernel/src/fold.mjs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
export const INDEX = buildIndex(read('../data/index.json').passages);
export const LANE = read('../data/lane.json');
const ESCALATE = read('../seed.json').boundary.escalate;

export async function judge(input) {
  return judgeRecord(INDEX, input, LANE.share);
}

export async function inLane(input) {
  return inLaneOf(INDEX, input, LANE.share);
}

// act(input) → {status:'verified', record} or {status:'refused'|'unverified', why[, escalate]}
export async function act(input) {
  return guarded(INDEX, LANE.share, input, ESCALATE);
}

// health: a folded cell cannot see who asks it from inside its repository, so it says so
export async function health() {
  return { used: null, dependedOn: null, lastEarned: null };
}
