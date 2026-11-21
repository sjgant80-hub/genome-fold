// node genome/act.mjs < input.json → {"output":<the fold>} or {"status":"refused","why":"..."}; exits 0 only with an output.
// input: {"docs":[{"name":"<file>","text":"<text>"}],"name":"<slug>","title":"...","escalate":"kar","repo":"owner/name",
// "by":"...","born":"YYYY-MM-DD"}. A corpus that does not fold into a cell is refused with what is missing.
// The fold is total (fuzzed in CI), so there is no error path to catch here.
import { act } from './cell.mjs';
import { input, say } from './io.mjs';
const r = await act(input());
const out = r.ok ? { output: r } : { status: 'refused', why: r.missing.join('; ') };
say(out);
process.exit(out.status === 'refused' ? 1 : 0);
