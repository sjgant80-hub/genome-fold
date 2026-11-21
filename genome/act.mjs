// node genome/act.mjs < input.json → {"output":<the fold>} or {"status":"refused","why":"..."}; exits 0 only with an output.
// input: {"docs":[{"name":"<file>","text":"<text>"}],"name":"<slug>","title":"...","escalate":"kar","repo":"owner/name",
// "by":"...","born":"YYYY-MM-DD"}. A corpus that does not fold into a cell is refused with what is missing.
import { act } from './cell.mjs';
import { input, say } from './io.mjs';
let out;
try {
  const r = await act(input());
  out = r.ok ? { output: r } : { status: 'refused', why: r.missing.join('; ') };
} catch (e) { out = { status: 'refused', why: 'the fold threw: ' + (e && e.message) }; }
say(out);
process.exit(out.status === 'refused' ? 1 : 0);
