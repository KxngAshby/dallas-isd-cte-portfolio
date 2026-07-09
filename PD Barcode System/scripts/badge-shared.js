const path = require('path');
const xlsx = require('xlsx');
const bwipjs = require('bwip-js');

const LOGO_WHITE_LOCKUP = path.join('assets', 'logos', 'CTE LOGO WHITE.png');

const NAVY = '#0B2340';
const RED = '#B22234';
const NAME_COLOR = '#0B2340';
const DEPT_COLOR = '#B22234';
const ID_COLOR = '#4B5563';
const LOGO_ASPECT = 1933 / 423;

const SC700_LAYOUT = {
  badgeW: 243,
  badgeH: 153,
  headerH: 50,
  sidePad: 8,
  nameTopGap: 6,
  nameFontMax: 16,
  nameFontMin: 9,
  ruleLen: 60,
  ruleGap: 4,
  deptFontMax: 8,
  deptFontMin: 5,
  barcodeMaxH: 50,
  barcodeMaxW: 200,
  barcodeGapTop: 4,
  idGapTop: 3,
  idFont: 6,
  bottomPad: 5
};

const AVERY74461_BADGE_LAYOUT = {
  badgeW: 252,
  badgeH: 162,
  headerH: 52,
  sidePad: 8,
  nameTopGap: 6,
  nameFontMax: 16,
  nameFontMin: 9,
  ruleLen: 62,
  ruleGap: 4,
  deptFontMax: 8,
  deptFontMin: 5,
  barcodeMaxH: 52,
  barcodeMaxW: 208,
  barcodeGapTop: 4,
  idGapTop: 3,
  idFont: 6,
  bottomPad: 5
};

/** @deprecated use AVERY74461_BADGE_LAYOUT — same dimensions (compatible templates) */
const AVERY5390_BADGE_LAYOUT = AVERY74461_BADGE_LAYOUT;

function titleCase(s) {
  return s.toLowerCase().replace(/\b([a-z])/g, (_m, c) => c.toUpperCase());
}

function parseTeacherDisplayName(raw) {
  const s = String(raw || '').trim();
  if (!s) return { first: '', last: '' };
  if (s.includes(',')) {
    const parts = s.split(',');
    return { last: parts[0].trim(), first: parts.slice(1).join(',').trim() };
  }
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

function sortBadges_(badges) {
  badges.sort((a, b) => {
    const byLast = a.lastName.localeCompare(b.lastName, undefined, { sensitivity: 'base' });
    if (byLast !== 0) return byLast;
    const byFirst = a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' });
    if (byFirst !== 0) return byFirst;
    return a.staffId.localeCompare(b.staffId);
  });
  return badges;
}

/**
 * Teacher Numbers TSV export: ID, Name, Campus, Room, Cluster, Email.
 * First row per ID wins if duplicated.
 */
function readBadgesFromTeacherNumbersTsv(tsvPath, staffIds) {
  const fs = require('fs');
  const raw = fs.readFileSync(tsvPath, 'utf8');
  const lines = raw.split(/\r\n|\n|\r/).filter((l) => l.trim());
  const wanted = staffIds ? new Set(staffIds.map(String)) : null;
  const byId = new Map();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const staffId = String(cols[0] || '').trim();
    if (!staffId || !/^[0-9]+$/.test(staffId)) continue;
    if (wanted && !wanted.has(staffId)) continue;
    if (byId.has(staffId)) continue;

    const nameRaw = String(cols[1] || '').trim();
    const { first, last } = parseTeacherDisplayName(nameRaw);
    if (!first && !last) continue;
    const dept = String(cols[4] || '').trim() || 'Career and Technical Education';
    byId.set(staffId, {
      staffId,
      firstName: titleCase(first),
      lastName: titleCase(last),
      displayName: titleCase([first, last].filter(Boolean).join(' ')),
      department: dept
    });
  }

  if (wanted) {
    const missing = [...wanted].filter((id) => !byId.has(id));
    if (missing.length) {
      throw new Error('Staff ID(s) not found in Teacher Numbers TSV: ' + missing.join(', '));
    }
  }

  return sortBadges_(Array.from(byId.values()));
}

/** Staff Barcodes first, then Teacher Numbers TSV for any IDs not on the sheet. */
function resolveBadgesForIds(xlsxPath, tsvPath, staffIds, preserveOrder) {
  const fromSheet = readBadges(xlsxPath);
  const byId = new Map(fromSheet.map((b) => [b.staffId, b]));
  const missing = staffIds.filter((id) => !byId.has(String(id).trim()));
  if (missing.length && tsvPath) {
    readBadgesFromTeacherNumbersTsv(tsvPath, missing).forEach((b) => byId.set(b.staffId, b));
  }
  const stillMissing = staffIds.filter((id) => !byId.has(String(id).trim()));
  if (stillMissing.length) {
    throw new Error('Staff ID(s) not found on Staff Barcodes or Teacher Numbers TSV: ' + stillMissing.join(', '));
  }
  if (preserveOrder) {
    return staffIds.map((id) => byId.get(String(id).trim()));
  }
  return sortBadges_(staffIds.map((id) => byId.get(String(id).trim())));
}

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

async function makeBarcode(text) {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text: String(text),
    scale: 4,
    height: 14,
    includetext: false,
    backgroundcolor: 'FFFFFF'
  });
}

async function buildBarcodeMap(badges) {
  const barcodes = {};
  for (const b of badges) {
    if (!barcodes[b.staffId]) {
      barcodes[b.staffId] = await makeBarcode(b.staffId);
    }
  }
  return barcodes;
}

function drawCompactBadge(doc, badge, barcodePng, logoImage, originX, originY, layout) {
  const {
    badgeW,
    badgeH,
    headerH,
    sidePad,
    nameTopGap,
    nameFontMax,
    nameFontMin,
    ruleLen,
    ruleGap,
    deptFontMax,
    deptFontMin,
    barcodeMaxH,
    barcodeMaxW,
    barcodeGapTop,
    idGapTop,
    idFont,
    bottomPad
  } = layout;

  const x0 = originX;
  const y0 = originY;

  doc.save();
  doc.rect(x0, y0, badgeW, headerH).fill(NAVY);
  doc.restore();

  const logoMaxW = badgeW - 24;
  const logoMaxH = headerH - 12;
  let logoW = logoMaxW;
  let logoH = logoW / LOGO_ASPECT;
  if (logoH > logoMaxH) {
    logoH = logoMaxH;
    logoW = logoH * LOGO_ASPECT;
  }
  const logoX = x0 + (badgeW - logoW) / 2;
  const logoY = y0 + (headerH - logoH) / 2;
  doc.image(logoImage, logoX, logoY, { width: logoW, height: logoH });

  const bodyX = x0 + sidePad;
  const bodyW = badgeW - sidePad * 2;
  const bodyTop = y0 + headerH + nameTopGap;

  doc.fillColor(NAME_COLOR).font('Helvetica-Bold');
  let nameSize = nameFontMax;
  doc.fontSize(nameSize);
  while (doc.widthOfString(badge.displayName) > bodyW - 4 && nameSize > nameFontMin) {
    nameSize -= 0.5;
    doc.fontSize(nameSize);
  }
  const nameY = bodyTop;
  doc.text(badge.displayName, bodyX, nameY, { width: bodyW, align: 'center', lineBreak: false });

  const ruleY = nameY + nameSize + 1;
  const centerX = x0 + badgeW / 2;
  doc.lineWidth(0.8).strokeColor(RED)
    .moveTo(centerX - ruleLen / 2, ruleY)
    .lineTo(centerX + ruleLen / 2, ruleY)
    .stroke();

  const deptText = badge.department.toUpperCase();
  doc.fillColor(DEPT_COLOR).font('Helvetica-Bold');
  let deptSize = deptFontMax;
  doc.fontSize(deptSize);
  while (doc.widthOfString(deptText) > bodyW - 4 && deptSize > deptFontMin) {
    deptSize -= 0.5;
    doc.fontSize(deptSize);
  }
  const deptY = ruleY + ruleGap;
  doc.text(deptText, bodyX, deptY, { width: bodyW, align: 'center', lineBreak: false });

  const idH = idFont + 2;
  const idY = y0 + badgeH - bottomPad - idH;
  const barcodeBottom = idY - idGapTop;
  const barcodeTop = Math.max(deptY + deptSize + barcodeGapTop, barcodeBottom - barcodeMaxH);
  const barcodeH = barcodeBottom - barcodeTop;
  const barcodeW = Math.min(bodyW, barcodeMaxW);
  const barcodeX = x0 + (badgeW - barcodeW) / 2;
  doc.image(barcodePng, barcodeX, barcodeTop, { width: barcodeW, height: barcodeH });

  doc.fillColor(ID_COLOR).font('Helvetica').fontSize(idFont)
    .text('ID ' + badge.staffId, bodyX, idY, { width: bodyW, align: 'center', lineBreak: false });
}

function scaleBadgeLayout(baseLayout, badgeW, badgeH) {
  const scaleY = badgeH / baseLayout.badgeH;
  const scaleX = badgeW / baseLayout.badgeW;
  const scale = Math.min(scaleX, scaleY);
  const round = (n) => Math.max(1, Math.round(n));
  return {
    badgeW,
    badgeH,
    headerH: round(baseLayout.headerH * scaleY),
    sidePad: round(baseLayout.sidePad * scale),
    nameTopGap: round(baseLayout.nameTopGap * scaleY),
    nameFontMax: round(baseLayout.nameFontMax * scale),
    nameFontMin: round(baseLayout.nameFontMin * scale),
    ruleLen: round(baseLayout.ruleLen * scaleX),
    ruleGap: round(baseLayout.ruleGap * scaleY),
    deptFontMax: round(baseLayout.deptFontMax * scale),
    deptFontMin: round(baseLayout.deptFontMin * scale),
    barcodeMaxH: round(baseLayout.barcodeMaxH * scaleY),
    barcodeMaxW: round(baseLayout.barcodeMaxW * scaleX),
    barcodeGapTop: round(baseLayout.barcodeGapTop * scaleY),
    idGapTop: round(baseLayout.idGapTop * scaleY),
    idFont: Math.max(5, round(baseLayout.idFont * scale)),
    bottomPad: round(baseLayout.bottomPad * scaleY)
  };
}

module.exports = {
  LOGO_WHITE_LOCKUP,
  NAVY,
  RED,
  SC700_LAYOUT,
  AVERY74461_BADGE_LAYOUT,
  AVERY5390_BADGE_LAYOUT,
  titleCase,
  parseTeacherDisplayName,
  readBadges,
  readBadgesFromTeacherNumbersTsv,
  resolveBadgesForIds,
  makeBarcode,
  buildBarcodeMap,
  drawCompactBadge,
  scaleBadgeLayout
};
