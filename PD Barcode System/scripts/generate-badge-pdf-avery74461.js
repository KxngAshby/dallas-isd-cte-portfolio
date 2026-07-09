/**
 * Generates a print-ready PDF of CTE staff badges for Avery template 74461
 * (clip-style name badge inserts; compatible with 5390, 5383, 74549).
 *
 * Sheet: US Letter portrait, 8 badges per page (2 columns x 4 rows).
 * Each insert: 3.5" x 2.25" with micro-perforated tear strips between rows.
 *
 * Layout accounts for:
 * - Avery sheet margins (not edge-to-edge grid)
 * - Vertical pitch between perforated rows (slightly more than label height)
 * - Safe inset inside each tear-off cell so art stays on the insert
 *
 * Print options:
 * 1. Direct print — Letter portrait, Actual size / 100% scale (no "Fit to page").
 * 2. Avery Design & Print — upload at avery.com/templates/74461
 *
 * Fine-tune CALIBRATION below if your printer drifts slightly.
 *
 * Usage:
 *   npm run badges:avery74461
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const {
  LOGO_WHITE_LOCKUP,
  AVERY74461_BADGE_LAYOUT,
  readBadges,
  buildBarcodeMap,
  drawCompactBadge,
  scaleBadgeLayout
} = require('./badge-shared');

const INPUT_XLSX = process.argv[2] || path.join('Data', 'PD System (2).xlsx');
const OUTPUT_PDF = process.argv[3] || path.join('Data', 'PD Staff Badges Avery 74461.pdf');

const PAGE_W = 612;
const PAGE_H = 792;

/** Avery 74461 / 5390 sheet geometry (Letter portrait, inches x 72 pt). */
const AVERY74461_SHEET = {
  marginLeft: 49.5,
  marginTop: 54,
  labelW: 252,
  labelH: 162,
  pitchX: 252,
  pitchY: 166.5,
  perfInset: 6,
  cols: 2,
  rows: 4
};

/** Printer drift tweaks (pt). Positive offset moves badges right/down on the sheet. */
const CALIBRATION = {
  offsetX: 13.5,
  offsetY: 18
};

const PER_PAGE = AVERY74461_SHEET.cols * AVERY74461_SHEET.rows;

function badgeSlotRect(slot) {
  const col = slot % AVERY74461_SHEET.cols;
  const row = Math.floor(slot / AVERY74461_SHEET.cols);
  const inset = AVERY74461_SHEET.perfInset;
  const x = AVERY74461_SHEET.marginLeft +
    col * AVERY74461_SHEET.pitchX +
    inset +
    CALIBRATION.offsetX;
  const y = AVERY74461_SHEET.marginTop +
    row * AVERY74461_SHEET.pitchY +
    inset +
    CALIBRATION.offsetY;
  const w = AVERY74461_SHEET.labelW - inset * 2;
  const h = AVERY74461_SHEET.labelH - inset * 2;
  return { x, y, w, h };
}

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

  console.log('Building Avery 74461 print-ready PDF...');
  console.log('Sheet layout: top', AVERY74461_SHEET.marginTop, 'pt, pitchY', AVERY74461_SHEET.pitchY, 'pt, inset', AVERY74461_SHEET.perfInset, 'pt');

  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: 'Dallas ISD CTE Staff Badges (Avery 74461)',
      Author: 'Dallas ISD Career and Technical Education'
    }
  });
  const out = fs.createWriteStream(OUTPUT_PDF);
  doc.pipe(out);

  const logoImage = doc.openImage(whiteLockup);
  const drawLayout = scaleBadgeLayout(
    AVERY74461_BADGE_LAYOUT,
    AVERY74461_SHEET.labelW - AVERY74461_SHEET.perfInset * 2,
    AVERY74461_SHEET.labelH - AVERY74461_SHEET.perfInset * 2
  );

  for (let i = 0; i < badges.length; i++) {
    if (i > 0 && i % PER_PAGE === 0) {
      doc.addPage({ size: [PAGE_W, PAGE_H], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    }
    const slot = i % PER_PAGE;
    const rect = badgeSlotRect(slot);
    drawCompactBadge(
      doc,
      badges[i],
      barcodes[badges[i].staffId],
      logoImage,
      rect.x,
      rect.y,
      drawLayout
    );
  }

  doc.end();
  await new Promise((res) => out.on('finish', res));
  const stats = fs.statSync(OUTPUT_PDF);
  console.log('Wrote', OUTPUT_PDF, '(' + Math.round(stats.size / 1024) + ' KB)');
  console.log('Pages:', Math.ceil(badges.length / PER_PAGE), '(Avery 74461, 8 badges per sheet)');
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
