# genome-fold — pre-registration of the measurement

Written and committed **before** any number below was computed on DocDec's question sets. The commit that adds this file
is the seal. Whatever the numbers say is published, failures included. Date: 2026-11-21.

## 1 · What is measured

The fold engine folds a corpus into a cell with no language model: a BM25 passage choice, the best-supported sentence in
that passage, a judge, and a vocabulary lane. This measures how that cell does on a public question set that DocDec v2
already published numbers for, so the two can be read side by side.

**The kernel measured** is `src/fold.mjs` at commit `98e8190` (sha256
`33badba6c12288ca2cefe58cac771e5c69d47394ab64be36beb5b64c77a9f471`). The measurement script records the sha256 of the
kernel it ran. If the kernel changes before the numbers are computed, the result file says so and names the change.

## 2 · Data and split

DocDec's S1 set, `data/v2/s1.json` at `sjgant80-hub/docdecdemo@612bf8c` (sha256
`278ee00d3d2e77d253a0636afab3972e7cf9756f62fbc424a9c775d080509453`), built from SQuAD 2.0 dev (Rajpurkar, Jia and Liang,
2018; CC BY-SA 4.0): 130 paragraphs from 3 articles (the corpus), 600 in-corpus questions (300 answerable, each with the
id of its gold paragraph, and 300 written to be unanswerable), and 600 off-topic questions from other SQuAD articles. Only
the paragraphs and the questions are taken from the file (`data/s1-text.json`, re-derived from the upstream file in CI).

DocDec's split, in file order: the first 180 of each question set are DocDec's tune split, the remaining 420 its eval
split. **The fold engine uses none of DocDec's questions for anything**: its only tuned number, the lane share, is chosen
on its own generated questions, exactly as for any corpus. So every DocDec question is held out from it. The numbers below
are reported on DocDec's eval split (420 in-corpus: 217 answerable and 203 unanswerable; 420 off-topic), so that they sit
next to DocDec v2's published eval numbers on the same questions.

## 3 · The cell

The 130 paragraphs are indexed as passages with DocDec's own ids and titles (`buildIndex`, not re-cut, so a passage id is
a gold paragraph id). The lane share is chosen by `laneQuestions` and `chooseLane` (DocDec's lane measurement, unchanged,
over the generated questions and the fixed off-topic set in `src/fold.mjs`), as `fold` does. A question is put to the cell
with `act`: out of lane is refused; in lane, the answerer's record leaves only when the judge verifies it.

## 4 · Measurements and their pass rules (eval split)

| # | Measurement | Of | Passes only if | DocDec v2 published, same questions |
|---|---|---|---|---|
| M1 | right-passage rate of the extractive answerer (`answer`, lane not applied): the record's source is the gold paragraph | 217 answerable | at least 0.6682 (DocDec's published cosine top-1, B0) | ColBERT top-1 0.8295; cosine top-1 0.6682 |
| M2 | off-topic questions refused: `act` returns no verified record | 420 off-topic | at least 0.82 (the eval refusal of DocDec's own word-overlap lane, tuned on its real questions) | 1.0 (420 of 420) |
| M2-lane | the same, counting only refusals by the lane check | 420 off-topic | at least 0.82 | — |
| M3 | answerable questions answered with a verified record (`act` status verified) | 217 answerable | at least 0.5899 (DocDec v2 answered 128 of 217) | 0.5899 |
| M3-right | answerable questions answered with a verified record from the gold paragraph | 217 answerable | at least 0.5300 (DocDec v2's recall, 115 of 217) | 0.5300 |
| M4 | unanswerable questions refused (no verified record) | 203 unanswerable | at least 0.8867 (DocDec v2, 180 of 203) | 0.8867 |
| M5 | answerable questions whose verified record contains a gold answer (SQuAD normalisation, `normalize` from DocDec's gate; the normalised gold is a substring of the normalised record text) | 217 answerable | at least 0.4608 (DocDec v2's exact short answers, 100 of 217) | 0.4608 exact |
| M6 | median time of one `act` call on this laptop (shared with other jobs, conditions recorded) | all 840 eval questions | at most 100 ms | 15.6 s per question, local reader |

Also reported, no claim: the lane's own tune and eval numbers on the generated questions, and the share chosen.

## 5 · Honest limits fixed in advance

- This answerer has **no reader and no 34 MB model**: it returns a whole sentence, not a short answer, and its retrieval is
  word overlap. DocDec v2 uses ColBERT (34 MB, int8) and a 7B local reader. The comparison shows what a no-model cell gets,
  not that it does DocDec's job.
- "Verified" means the record's text is exactly the source's characters at its offsets and the passage uses at least the
  lane share of the question's content words. It does **not** mean the sentence answers the question. SQuAD 2.0's
  unanswerable questions are written to look answerable from a real paragraph; a vocabulary lane and a support check
  are not built to refuse them (M4 tests it anyway).
- No stemming: "boil" does not match "boils". Word overlap only.
- One public benchmark, three Wikipedia articles, not a client's corpus.
