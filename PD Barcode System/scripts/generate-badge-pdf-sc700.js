/**
 * Generates a print-ready PDF of CTE staff badges sized for the
 * Precision SC700 ID card printer.
 *
 * Each PDF page = 1 CR80 card (3.375" x 2.125"). Feed the resulting PDF
 * to the SC700 driver with "Actual size" / 100% scaling and it will
 * print one badge per pre-cut blank card.
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const {
  LOGO_WHITE_LOCKUP,
  SC700_LAYOUT,
  readBadges,
  buildBarcodeMap,
  drawCompactBadge
} = require('./badge-shared');

const INPUT_XLSX = process.argv[2] || path.join('Data', 'PD System (2).xlsx');
const OUTPUT_PDF = process.argv[3] || path.join('Data', 'PD Staff Badges SC700.pdf');

const PAGE_W = SC700_LAYOUT.badgeW;
const PAGE_H = SC700_LAYOUT.badgeH;

async function main() {
  console.log('Reading', INPUT_XLSX);
  const badges = readBadges(INPUT_XLSX);
  console.log('Eligible badges:', badges.length);

  if (!fs.existsSync(LOGO_WHITE_LOCKUP)) {
    throw new Error('Missing logo: ' + LOGO_WHITE_LOCKUP);
  }
  const whiteLockup = fs.readFileSync(LOGO_WHITE_LOCKUP);

  console.log('Rendering barcodes...');
  const barcodes = await buildBarcodeMap(badges);

  console.log('Building SC700 print-ready PDF...');
  console.log('Page size:', PAGE_W, 'x', PAGE_H, 'pt (CR80, 3.375" x 2.125")');

  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: 'Dallas ISD CTE Staff Badges (SC700)',
      Author: 'Dallas ISD Career and Technical Education'
    }
  });
  const out = fs.createWriteStream(OUTPUT_PDF);
  doc.pipe(out);

  const logoImage = doc.openImage(whiteLockup);

  for (let i = 0; i < badges.length; i++) {
    if (i > 0) {
      doc.addPage({ size: [PAGE_W, PAGE_H], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    }
    drawCompactBadge(doc, badges[i], barcodes[badges[i].staffId], logoImage, 0, 0, SC700_LAYOUT);
  }

  doc.end();
  await new Promise((res) => out.on('finish', res));
  const stats = fs.statSync(OUTPUT_PDF);
  console.log('Wrote', OUTPUT_PDF, '(' + Math.round(stats.size / 1024) + ' KB)');
  console.log('Pages:', badges.length, '(1 CR80 badge per page for the Precision SC700)');
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
