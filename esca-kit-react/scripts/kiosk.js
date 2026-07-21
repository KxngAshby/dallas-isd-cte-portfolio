/**
 * Starts API + Vite Hub and opens Chrome/Edge to the counselor kiosk.
 * Usage: npm run kiosk  (from repo root)
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';

function run(cmd, args, cwd) {
  const child = spawn(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: isWin,
    env: process.env,
  });
  child.on('exit', (code) => {
    if (code && code !== 0) process.exitCode = code;
  });
  return child;
}

const server = run('npm', ['run', 'dev'], path.join(root, 'server'));
const client = run('npm', ['run', 'dev'], path.join(root, 'client'));

const url = 'http://localhost:5173/';
setTimeout(() => {
  if (isWin) {
    // Prefer Chrome app mode for kiosk feel; fall back to default browser
    const chromePaths = [
      process.env.CHROME_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ].filter(Boolean);

    let opened = false;
    for (const exe of chromePaths) {
      try {
        const require = createRequire(import.meta.url);
        const fs = require('fs');
        if (fs.existsSync(exe)) {
          spawn(exe, [`--app=${url}`, '--start-maximized'], { detached: true, stdio: 'ignore' }).unref();
          opened = true;
          break;
        }
      } catch {
        /* try next */
      }
    }
    if (!opened) {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    }
  } else {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
  console.log('\nESCA Kiosk Hub →', url);
  console.log('API health       → http://localhost:3001/health');
  console.log('Press Ctrl+C to stop.\n');
}, 2500);

function shutdown() {
  server.kill('SIGTERM');
  client.kill('SIGTERM');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
