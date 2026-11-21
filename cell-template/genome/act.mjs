// node genome/act.mjs < {"question":"<text>"} → the guarded answer, one line of JSON:
//   {"status":"verified","record":{"question","source","start","end","text"}} and exit 0, or
//   {"status":"refused"|"unverified","why":"..."} and exit 1 (out of lane also names who it escalates to).
// Written by genome-fold; the same file in every folded cell.
import { act } from './cell.mjs';
import { input, say } from './io.mjs';
const r = await act(input());
say(r);
process.exit(r.status === 'verified' ? 0 : 1);
