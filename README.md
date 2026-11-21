# genome-fold

**Live: https://sjgant80-hub.github.io/genome-fold/**

Fold a folder of documents (plain text or markdown) into a question-answering **cell** you can check. No language model: every answer is a
sentence of the documents, word for word, with its passage and character offsets. Questions outside the documents' subject are refused.
The cell is written, ready to push as its own repository, only when the [estate genome](https://sjgant80-hub.github.io/estate-genome/)'s
birth check admits it; otherwise the engine says what is missing.

```bash
node bin/fold.mjs my-docs/ my-cell/ --name my-cell --title "our returns policy" --repo your-org/my-cell --by "your name" --escalate "your team"
echo '{"question":"How long do I have to return an item?"}' | node my-cell/genome/act.mjs
```

A folded cell, live: **[the Consumer Rights Act 2015, Part 1](https://sjgant80-hub.github.io/consumer-rights-cell/)**
([repository](https://github.com/sjgant80-hub/consumer-rights-cell)).

## Measured (pre-registered in [PREREG.md](PREREG.md) before any number was computed)

On DocDec's S1 set (SQuAD 2.0, CC BY-SA 4.0), held-out questions, DocDec v2's published numbers beside each. **3 of 8 rules pass, 5 fail**:
the right passage 0.7051 (pass), off-topic refused 0.9786 (pass), a median answer in 0.59 ms (pass); off-topic refused by the lane alone 0.6738,
answerable questions answered with a verified record 0.47, from the right passage 0.3733, unanswerable questions refused 0.3448, and verified
records holding a gold answer 0.3134 all fail. This cell has no reader and no 34 MB model. Every number is in `data/measure.json`, re-derived in CI.

## What is in here

| Part | Files |
|---|---|
| Vendored pieces, pinned (DocDec's span and sentence finders and lane; the estate genome's birth check and hooks) | `vendor/`, `vendor/VENDOR.json` |
| The fold kernel (pure; the same in Node and the browser) | `src/fold.mjs` |
| The cell writer and command line | `src/writer.mjs`, `bin/fold.mjs`, `cell-template/` |
| The measurement | `src/measure.mjs`, `scripts/measure.mjs`, `PREREG.md`, `data/` |
| The pages (this engine's and every folded cell's) | `src/page.mjs`, `src/build-page.mjs`, `page/`, `index.html` |
| The demo corpus and its converter | `examples/consumer-rights-act/` |
| The engine's own genome (it is a cell too) | `seed.json`, `genome/` |

Every file of logic is mutation-gated CLEAN by [witness](https://github.com/sjgant80-hub/witness) v0.6 in CI, with no exemptions
(`scripts/gates.mjs`, `data/gates.json`); the kernel's exports are fuzzed. The page explains the rest: how it works, traced from a real run,
the blueprint, adoption and limits.

## Licences

Code: MIT, `LICENSE`, © 2026 Simon Gant. Test data in `data/`: SQuAD 2.0, CC BY-SA 4.0 (`data/NOTICE.md`). The Consumer Rights Act 2015
text in `examples/consumer-rights-act/`: Open Government Licence v3.0. Made by Kar. Supplied by
[AI Native Solutions](https://www.ai-nativesolutions.com); support is agreed per deployment, in each deployment's agreement.
