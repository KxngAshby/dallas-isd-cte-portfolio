const fs = require('fs');
const path = require('path');

async function main() {
  const pdfPath = process.argv[2];
  const outPath = process.argv[3];
  const pageNum = Number(process.argv[4] || 1);
  if (!pdfPath || !outPath) {
    console.error('usage: preview-page.js <pdf> <out.png> [pageNum]');
    process.exit(1);
  }

  const { getDocument } = require('pdfjs-dist/legacy/build/pdf.js');
  const sharp = require('sharp');

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = getDocument({ data, disableFontFace: true, useSystemFonts: false });
  const doc = await loadingTask.promise;
  console.log('pages=', doc.numPages);
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });

  const opList = await page.getOperatorList();
  const svgGfx = new (require('pdfjs-dist/legacy/build/pdf.js')).SVGGraphics(page.commonObjs, page.objs);
  const svg = await svgGfx.getSVG(opList, viewport);
  const svgString = svg.toString();

  await sharp(Buffer.from(svgString)).png().toFile(outPath);
  console.log('wrote', outPath);
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
