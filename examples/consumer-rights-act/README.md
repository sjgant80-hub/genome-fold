# The Consumer Rights Act 2015, Part 1: the demo corpus

- `sources/part-1.xml.gz`: Part 1 of the Consumer Rights Act 2015 (sections 1 to 60) as published by legislation.gov.uk
  (https://www.legislation.gov.uk/ukpga/2015/15/part/1/data.xml), the text as revised to 29 October 2026, retrieved 21 November 2026,
  sha256 `d43c398aa31fa46f41227af419dbe3351482eaeb477939daa56ffd751d242b76` (of the XML itself, after `gunzip`). It is kept
  compressed because the XML's editorial-note ids (`key-` and 32 hex digits) look like an API key to GitHub's secret scanning,
  which refused the plain file; they are reference ids from legislation.gov.uk, not secrets, and the bytes are unchanged.
- `prepare.mjs`: turns it into `corpus/`, one markdown file per chapter: a heading per chapter, cross-heading and section, and one paragraph
  per subsection. Editorial notes and amendment marks are left out; the words of the law are not changed. `test/prepare.test.mjs` checks the
  committed corpus is exactly what the committed XML gives.
- The folded cell: https://github.com/sjgant80-hub/consumer-rights-cell, live at https://sjgant80-hub.github.io/consumer-rights-cell/
  (`node scripts/demo.mjs <out-dir>` folds it and records the run in `data/demo.json`).

Contains public sector information licensed under the Open Government Licence v3.0
(https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
This is not legal advice; for anything that matters, read the Act itself.
