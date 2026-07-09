const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');

const INPUT_XLSX = process.argv[2] || path.join('Data', 'PD System (2).xlsx');
const OUTPUT_PDF = process.argv[3] || path.join('Data', 'PD Staff Badges.pdf');

const LOGO_WHITE_LOCKUP = path.join('assets', 'logos', 'CTE LOGO WHITE.png');
const LOGO_NAVY_LOCKUP = path.join('assets', 'logos', 'Dallas ISD CTE Logo.png');
const LOGO_NAVY_BUG = path.join('assets', 'logos', 'blue circle DISD CTE WHIT.png');

const NAVY = '#0B2340';
const RED = '#B22234';
const WHITE = '#FFFFFF';
const BORDER = '#9CA3AF';
const NAME_COLOR = '#0B2340';
const DEPT_COLOR = '#B22234';
const ID_COLOR = '#4B5563';

const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 36;

const COLS = 2;
const ROWS = 2;
const BADGE_W = (PAGE_W - MARGIN * 2) / COLS;
const BADGE_H = (PAGE_H - MARGIN * 2) / ROWS;

function readBadges(file) {
  const wb = xlsx.readFile(file);
  const ws = wb.Sheets['Staff Barcodes'];
  if (!ws) throw new Error('Staff Barcodes sheet not found');
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = rows[0].map((h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
  const idx = (key) => headers.indexOf(key);
  const colId = idx('staffid') >= 0 ? idx('staffid') : idx('barcodevalue');
  const colLast = idx('lastname');
  const colFirst = idx('firstname');
  const colDept = idx('department');

  const badges = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const staffId = String(r[colId] || '').trim();
    const last = String(r[colLast] || '').trim();
    const first = String(r[colFirst] || '').trim();
    const dept = String(r[colDept] || '').trim();
    if (!staffId) continue;
    if (!first && !last) continue;
    if (!/^[0-9]+$/.test(staffId)) continue;
    badges.push({
      staffId,
      firstName: titleCase(first),
      lastName: titleCase(last),
      displayName: titleCase([first, last].filter(Boolean).join(' ')),
      department: dept || 'Career and Technical Education'
    });
  }
  badges.sort((a, b) => {
    const byLast = a.lastName.localeCompare(b.lastName, undefined, { sensitivity: 'base' });
    if (byLast !== 0) return byLast;
    const byFirst = a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' });
    if (byFirst !== 0) return byFirst;
    return a.staffId.localeCompare(b.staffId);
  });
  return badges;
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b([a-z])/g, (_m, c) => c.toUpperCase());
}

async function makeBarcode(text) {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text: String(text),
    scale: 3,
    height: 12,
    includetext: false,
    backgroundcolor: 'FFFFFF'
  });
}

function drawCell(doc, badge, x, y, w, h, barcodePng, logoBuf) {
  const headerH = 58;

  doc.lineWidth(0.75).strokeColor(BORDER)
    .roundedRect(x + 4, y + 4, w - 8, h - 8, 8).stroke();

  doc.save();
  doc.path(`M ${x + 4} ${y + 4 + 8}` +
    ` Q ${x + 4} ${y + 4} ${x + 4 + 8} ${y + 4}` +
    ` L ${x + w - 4 - 8} ${y + 4}` +
    ` Q ${x + w - 4} ${y + 4} ${x + w - 4} ${y + 4 + 8}` +
    ` L ${x + w - 4} ${y + 4 + headerH}` +
    ` L ${x + 4} ${y + 4 + headerH} Z`)
    .fill(NAVY);
  doc.restore();

  const logoMaxW = w - 60;
  const logoMaxH = headerH - 16;
  const logoAspect = 1933 / 423;
  let logoW = logoMaxW;
  let logoH = logoW / logoAspect;
  if (logoH > logoMaxH) {
    logoH = logoMaxH;
    logoW = logoH * logoAspect;
  }
  const logoX = x + (w - logoW) / 2;
  const logoY = y + 4 + (headerH - logoH) / 2;
  doc.image(logoBuf, logoX, logoY, { width: logoW, height: logoH });

  const bodyTop = y + 4 + headerH + 8;
  const bodyBottom = y + h - 6;
  const inX = x + 12;
  const inW = w - 24;

  doc.fillColor(NAME_COLOR).font('Helvetica-Bold');
  let nameSize = 24;
  doc.fontSize(nameSize);
  while (doc.widthOfString(badge.displayName) > inW - 4 && nameSize > 12) {
    nameSize -= 1;
    doc.fontSize(nameSize);
  }
  const nameY = bodyTop + 4;
  doc.text(badge.displayName, inX, nameY, { width: inW, align: 'center', lineBreak: false });

  const ruleY = nameY + nameSize + 4;
  doc.lineWidth(1.2).strokeColor(RED)
    .moveTo(x + w / 2 - 40, ruleY).lineTo(x + w / 2 + 40, ruleY).stroke();

  const deptText = badge.department.toUpperCase();
  doc.fillColor(DEPT_COLOR).font('Helvetica-Bold');
  let deptSize = 11;
  doc.fontSize(deptSize);
  while (doc.widthOfString(deptText) > inW - 4 && deptSize > 7) {
    deptSize -= 0.5;
    doc.fontSize(deptSize);
  }
  const deptY = ruleY + 6;
  doc.text(deptText, inX, deptY, { width: inW, align: 'center', lineBreak: false });

  const idH = 12;
  const barcodeMaxH = 56;
  const idY = bodyBottom - idH;
  const barcodeBottom = idY - 4;
  const barcodeTop = Math.max(deptY + deptSize + 8, barcodeBottom - barcodeMaxH);
  const barcodeH = barcodeBottom - barcodeTop;
  const barcodeW = Math.min(inW - 8, 250);
  const barcodeX = x + (w - barcodeW) / 2;
  doc.image(barcodePng, barcodeX, barcodeTop, { width: barcodeW, height: barcodeH });

  doc.fillColor(ID_COLOR).font('Helvetica').fontSize(8)
    .text('ID ' + badge.staffId, inX, idY, { width: inW, align: 'center', lineBreak: false });
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
  const barcodes = {};
  for (const b of badges) {
    if (!barcodes[b.staffId]) {
      barcodes[b.staffId] = await makeBarcode(b.staffId);
    }
  }

  console.log('Building PDF...');
  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: 'Dallas ISD CTE Staff Badges',
      Author: 'Dallas ISD Career and Technical Education'
    }
  });
  const out = fs.createWriteStream(OUTPUT_PDF);
  doc.pipe(out);

  const perPage = COLS * ROWS;
  for (let i = 0; i < badges.length; i++) {
    if (i > 0 && i % perPage === 0) {
      doc.addPage({ size: [PAGE_W, PAGE_H], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    }
    const slot = i % perPage;
    const col = slot % COLS;
    const row = Math.floor(slot / COLS);
    const xPos = MARGIN + col * BADGE_W;
    const yPos = MARGIN + row * BADGE_H;
    drawCell(doc, badges[i], xPos, yPos, BADGE_W, BADGE_H, barcodes[badges[i].staffId], whiteLockup);
  }

  doc.end();
  await new Promise((res) => out.on('finish', res));
  const stats = fs.statSync(OUTPUT_PDF);
  console.log('Wrote', OUTPUT_PDF, '(' + Math.round(stats.size / 1024) + ' KB)');
  console.log('Pages:', Math.ceil(badges.length / perPage));
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
