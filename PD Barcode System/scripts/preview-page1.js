const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const bwipjs = require('bwip-js');
const sharp = require('sharp');

const NAVY = '#0B2340';
const RED = '#B22234';
const BORDER = '#9CA3AF';
const ID_COLOR = '#4B5563';

const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 36;
const COLS = 2;
const ROWS = 2;
const BADGE_W = (PAGE_W - MARGIN * 2) / COLS;
const BADGE_H = (PAGE_H - MARGIN * 2) / ROWS;

function titleCase(s) {
  return s.toLowerCase().replace(/\b([a-z])/g, (_m, c) => c.toUpperCase());
}

function readBadges(file, count) {
  const wb = xlsx.readFile(file);
  const ws = wb.Sheets['Staff Barcodes'];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = rows[0].map((h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
  const idx = (k) => headers.indexOf(k);
  const colId = idx('staffid');
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
    if (!staffId || (!first && !last)) continue;
    if (!/^[0-9]+$/.test(staffId)) continue;
    badges.push({
      staffId,
      displayName: titleCase([first, last].filter(Boolean).join(' ')),
      department: dept || 'Career and Technical Education'
    });
  }
  badges.sort((a, b) => a.displayName.localeCompare(b.displayName));
  const step = Math.max(1, Math.floor(badges.length / count));
  const sample = [];
  for (let i = 0; i < count; i++) {
    sample.push(badges[Math.min(i * step, badges.length - 1)]);
  }
  return sample;
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

function renderBadgeSvg(badge, x, y, w, h, logoB64, barcodeB64) {
  const headerH = 58;
  const logoAspect = 1933 / 423;
  const logoMaxW = w - 60;
  const logoMaxH = headerH - 16;
  let logoW = logoMaxW;
  let logoH = logoW / logoAspect;
  if (logoH > logoMaxH) {
    logoH = logoMaxH;
    logoW = logoH * logoAspect;
  }
  const logoX = x + (w - logoW) / 2;
  const logoY = y + 4 + (headerH - logoH) / 2;

  const cornerR = 8;
  const headerPath =
    `M ${x + 4} ${y + 4 + cornerR}` +
    ` Q ${x + 4} ${y + 4} ${x + 4 + cornerR} ${y + 4}` +
    ` L ${x + w - 4 - cornerR} ${y + 4}` +
    ` Q ${x + w - 4} ${y + 4} ${x + w - 4} ${y + 4 + cornerR}` +
    ` L ${x + w - 4} ${y + 4 + headerH}` +
    ` L ${x + 4} ${y + 4 + headerH} Z`;

  const bodyTop = y + 4 + headerH + 8;
  const nameSize = 24;
  const nameY = bodyTop + 4 + nameSize - 6;
  const ruleY = nameY + 8;
  const deptY = ruleY + 18;
  const idY = y + h - 12;
  const barcodeMaxH = 56;
  const barcodeBottom = idY - 4;
  const barcodeTop = barcodeBottom - barcodeMaxH;
  const barcodeW = Math.min(w - 32, 250);
  const barcodeX = x + (w - barcodeW) / 2;

  return `
    <rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" rx="8" ry="8"
          fill="white" stroke="${BORDER}" stroke-width="0.75"/>
    <path d="${headerPath}" fill="${NAVY}"/>
    <image href="data:image/png;base64,${logoB64}" x="${logoX}" y="${logoY}" width="${logoW}" height="${logoH}"/>
    <text x="${x + w / 2}" y="${nameY}" text-anchor="middle"
          font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="${nameSize}" fill="${NAVY}">
      ${escapeXml(badge.displayName)}
    </text>
    <line x1="${x + w / 2 - 40}" y1="${ruleY}" x2="${x + w / 2 + 40}" y2="${ruleY}"
          stroke="${RED}" stroke-width="1.2"/>
    <text x="${x + w / 2}" y="${deptY}" text-anchor="middle"
          font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="11" fill="${RED}">
      ${escapeXml(badge.department.toUpperCase())}
    </text>
    <image href="data:image/png;base64,${barcodeB64}"
           x="${barcodeX}" y="${barcodeTop}" width="${barcodeW}" height="${barcodeMaxH}"
           preserveAspectRatio="none"/>
    <text x="${x + w / 2}" y="${idY}" text-anchor="middle"
          font-family="Helvetica, Arial, sans-serif" font-size="8" fill="${ID_COLOR}">
      ID ${escapeXml(badge.staffId)}
    </text>
  `;
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  })[c]);
}

async function main() {
  const xlsxPath = process.argv[2];
  const outPath = process.argv[3];
  const badges = readBadges(xlsxPath, 4);
  const logoB64 = fs.readFileSync(path.join('assets', 'logos', 'CTE LOGO WHITE.png')).toString('base64');

  const cells = [];
  for (let i = 0; i < badges.length; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = MARGIN + col * BADGE_W;
    const y = MARGIN + row * BADGE_H;
    const barcodeBuf = await makeBarcode(badges[i].staffId);
    const barcodeB64 = barcodeBuf.toString('base64');
    cells.push(renderBadgeSvg(badges[i], x, y, BADGE_W, BADGE_H, logoB64, barcodeB64));
  }

  const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">
  <rect width="${PAGE_W}" height="${PAGE_H}" fill="#F5F5F5"/>
  ${cells.join('\n')}
</svg>`;

  await sharp(Buffer.from(svg)).png({ quality: 90 }).toFile(outPath);
  console.log('wrote', outPath);
}

main().catch((e) => { console.error(e.stack || e.message || e); process.exit(1); });
