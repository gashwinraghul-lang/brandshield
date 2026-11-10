/* Starts the Express API and the Vite dev server together without extra dependencies. */
const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const children = [
  spawn(npm, ['--workspace', 'server', 'run', 'dev'], { cwd: root, stdio: 'inherit', shell: true }),
  spawn(npm, ['--workspace', 'client', 'run', 'dev'], { cwd: root, stdio: 'inherit', shell: true }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
for (const child of children) {
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 0);
  });
}
