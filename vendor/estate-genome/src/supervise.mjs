#!/usr/bin/env node
// supervise.mjs — run one hook's command line under a bound, and take its whole process tree down with it.
//   node supervise.mjs <timeoutMs> <command line>
// Exits with the hook's own code, 124 when the bound was hit, 127 when it could not start.
//
// Why a separate process: a shell started by spawnSync with a timeout is killed when the bound is hit, but the
// command it started carries on (on Windows the tree is walked parent to child, so once the shell is gone its
// children cannot be found). Found by this repo's own tests on Windows: a timed-out hook kept the part's folder open.
// The same fix as witness's runner.mjs: kill the tree while this process is still its ancestor.
import { spawn, spawnSync } from 'node:child_process';

const [, , boundArg, cmd] = process.argv;
const bound = Number(boundArg);
if (!Number.isFinite(bound) || bound <= 0 || typeof cmd !== 'string' || cmd.trim() === '') {
  console.error('supervise: usage — node supervise.mjs <timeoutMs> <command line>');
  process.exit(2);
}
const onWindows = process.platform === 'win32';
const child = spawn(cmd, { stdio: 'inherit', shell: true, detached: !onWindows, windowsHide: true });

function killTree() {
  try {
    if (onWindows) spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore', windowsHide: true });
    else process.kill(-child.pid, 'SIGKILL');
  } catch { /* already gone is the good case */ }
}

let timedOut = false;
const timer = setTimeout(() => { timedOut = true; killTree(); }, bound);
child.on('exit', (code, signal) => {
  clearTimeout(timer);
  killTree();
  if (timedOut) process.exit(124);
  process.exit(signal ? 143 : (code ?? 1));
});
child.on('error', (e) => {
  clearTimeout(timer);
  console.error(`supervise: could not start: ${e.message}`);
  process.exit(127);
});
