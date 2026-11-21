// cell.mjs — the fold engine's answers for the birth check (seed.json, genome/), and its act.
// judge  the engine's work is a folded cell, so its judge re-folds the corpus it is given and judges the answer record by
//        that cell: verified only when the record's text is exactly the cited passage's characters at its offsets and
//        the passage uses at least the folded lane share of the question's content words (src/fold.mjs engineJudge)
// lane   a corpus of plain-text or markdown documents that has content words to fold (engineLane); anything else,
//        a question with no corpus included, is refused and goes to kar
// act    fold the corpus (src/fold.mjs fold): the drafted cell when its preview passes, else what is missing
// All three are the kernel's own functions; this file only wires them to the hooks.
import { engineJudge, engineLane, fold } from '../src/fold.mjs';

export async function judge(input) {
  return engineJudge(input);
}

export async function inLane(input) {
  return engineLane(input);
}

// act(input) → the fold's result without the in-memory index: what genome/act.mjs prints
export async function act(input) {
  const { ok, missing, counts, lane, cases, samples, seed, check } = fold(input);
  return { ok, missing, counts, lane, cases, samples, seed, check };
}

// health: the engine cannot see who folds with it from inside its repository, so it says so
export async function health() {
  return { used: null, dependedOn: null, lastEarned: null };
}
