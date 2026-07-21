const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../client/dist/index.html');
const dest = path.join(__dirname, '../ReactApp.html');

if (!fs.existsSync(src)) {
  console.error('Missing client/dist/index.html — run vite build first.');
  process.exit(1);
}

fs.writeFileSync(dest, fs.readFileSync(src, 'utf8'), 'utf8');
console.log('Wrote ReactApp.html from client/dist/index.html');
