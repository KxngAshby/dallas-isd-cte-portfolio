/**
 * Capture preview/scanner-ui in Chromium for review.
 * Usage: node scripts/screenshot-scanner-preview.js
 */
const http = require('http');
const path = require('path');
const fs = require('fs');

const PREVIEW_DIR = path.join(__dirname, '..', 'preview', 'scanner-ui');
const PORT = 3456;
const OUT = path.join(PREVIEW_DIR, 'screenshot-main-check-in.png');

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PREVIEW_DIR, urlPath.replace(/^\//, ''));
  if (!filePath.startsWith(PREVIEW_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png'
  };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

async function main() {
  const server = http.createServer(serveStatic);
  await new Promise(function (resolve) { server.listen(PORT, resolve); });

  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.log('Installing playwright (one-time)...');
    require('child_process').execSync('npm install playwright --no-save', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
    playwright = require('playwright');
  }

  const browser = await playwright.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 834, height: 1100 } });
  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: OUT, fullPage: true });
  await browser.close();
  server.close();

  console.log('Screenshot:', OUT);
  console.log('Live preview: http://127.0.0.1:' + PORT + '/');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
