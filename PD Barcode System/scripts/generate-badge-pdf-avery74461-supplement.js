/**
 * Avery 74461 supplement sheet — subset of badges by Staff ID.
 * Uses Staff Barcodes when present; falls back to Teacher Numbers TSV.
 *
 * Usage:
 *   node scripts/generate-badge-pdf-avery74461-supplement.js
 *   node scripts/generate-badge-pdf-avery74461-supplement.js xlsx out.pdf --tsv "Data/PD System - Teacher Numbers (1).tsv" 73216 93047
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const {
  LOGO_WHITE_LOCKUP,
  AVERY74461_BADGE_LAYOUT,
  resolveBadgesForIds,
  buildBarcodeMap,
  drawCompactBadge,
  scaleBadgeLayout
} = require('./badge-shared');

const args = process.argv.slice(2);
let tsvPath = path.join('Data', 'PD System - Teacher Numbers (1).tsv');
const fileArgs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tsv' && args[i + 1]) {
    tsvPath = args[++i];
  } else {
    fileArgs.push(args[i]);
  }
}

const INPUT_XLSX = fileArgs[0] || path.join('Data', 'PD System (2).xlsx');
const OUTPUT_PDF = fileArgs[1] || path.join('Data', 'PD Staff Badges Avery 74461 Supplement.pdf');
const STAFF_IDS = fileArgs.slice(2).filter(Boolean);

const PAGE_W = 612;
const PAGE_H = 792;

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

const CALIBRATION = { offsetX: 13.5, offsetY: 18 };
const PER_PAGE = AVERY74461_SHEET.cols * AVERY74461_SHEET.rows;

function badgeSlotRect(slot) {
  const col = slot % AVERY74461_SHEET.cols;
  const row = Math.floor(slot / AVERY74461_SHEET.cols);
  const inset = AVERY74461_SHEET.perfInset;
  return {
    x: AVERY74461_SHEET.marginLeft + col * AVERY74461_SHEET.pitchX + inset + CALIBRATION.offsetX,
    y: AVERY74461_SHEET.marginTop + row * AVERY74461_SHEET.pitchY + inset + CALIBRATION.offsetY,
    w: AVERY74461_SHEET.labelW - inset * 2,
    h: AVERY74461_SHEET.labelH - inset * 2
  };
}

async function main() {
  if (!STAFF_IDS.length) {
    throw new Error('Provide at least one Staff ID after the output PDF path.');
  }

  console.log('Reading', INPUT_XLSX);
  if (tsvPath) console.log('Teacher Numbers fallback:', tsvPath);
  const badges = resolveBadgesForIds(INPUT_XLSX, tsvPath, STAFF_IDS, true);
  console.log('Badges on supplement:', badges.length);
  badges.forEach((b) => console.log(' ', b.staffId, b.displayName));

  if (!fs.existsSync(LOGO_WHITE_LOCKUP)) {
    throw new Error('Missing logo: ' + LOGO_WHITE_LOCKUP);
  }
  const whiteLockup = fs.readFileSync(LOGO_WHITE_LOCKUP);
  const barcodes = await buildBarcodeMap(badges);

  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: 'Dallas ISD CTE Staff Badges Supplement (Avery 74461)',
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
    const rect = badgeSlotRect(i % PER_PAGE);
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
  console.log('Wrote', OUTPUT_PDF);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
