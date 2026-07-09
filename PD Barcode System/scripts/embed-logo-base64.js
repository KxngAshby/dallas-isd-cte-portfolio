const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const src = path.join('assets', 'logos', process.argv[2] || 'CTE LOGO WHITE.png');
  const width = Number(process.argv[3] || 600);
  const out = path.join('assets', 'logos', '_inline-' + path.basename(src, '.png') + '-' + width + '.b64.txt');
  const buf = await sharp(src).resize({ width: width }).png({ compressionLevel: 9 }).toBuffer();
  const b64 = buf.toString('base64');
  fs.writeFileSync(out, b64);
  console.log('size:', Math.round(buf.length / 1024), 'KB | base64 chars:', b64.length, '| wrote', out);
}

main().catch((e) => { console.error(e); process.exit(1); });
