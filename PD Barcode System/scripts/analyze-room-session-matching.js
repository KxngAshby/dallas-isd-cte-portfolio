/**
 * Dry-run: compare Day 2 schedule vs email session matching (strict GS parser).
 * Run: node scripts/analyze-room-session-matching.js [dateKey e.g. 2026-06-04]
 */
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const {
  resolveCdPdSourcePath,
  readDay2GridRows,
  normalizeDay2GridDates,
  parseDay2Records,
  formatTimeFrac,
  excelDateKey
} = require('./day2-schedule-shared');

const SYSTEM_PATH = path.join('Data', 'PD System (2).xlsx');
const dateFilter = process.argv[2] || '';

/** Mirrors PdEmailDigest.gs timeStringToMinutes_ exactly */
function timeStringToMinutesGs(timeStr) {
  const m = String(timeStr || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

/** After fix: normalize fraction / Date → "h:mm AM" */
function normalizeRoomConfigTimeLabel(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number' && raw > 0 && raw < 1) return formatTimeFrac(raw);
  if (raw instanceof Date) {
    const h = raw.getHours();
    const m = raw.getMinutes();
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return h12 + ':' + String(m).padStart(2, '0') + ' ' + ap;
  }
  return String(raw).trim();
}

function normalizeRoomConfigPdDate(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && raw > 40000 && raw < 60000) {
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return null;
}

function readRoomConfigLikeEmailDigest() {
  if (!fs.existsSync(SYSTEM_PATH)) return [];
  const wb = xlsx.readFile(SYSTEM_PATH);
  const sheet = wb.Sheets.RoomConfig;
  if (!sheet) return [];
  const values = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    rows.push({
      sessionName: String(r[2] || '').trim(),
      pdDate: r[3],
      startTimeRaw: r[4],
      endTimeRaw: r[5],
      pdDateKey: normalizeRoomConfigPdDate(r[3]),
      startTime: normalizeRoomConfigTimeLabel(r[4]),
      endTime: normalizeRoomConfigTimeLabel(r[5]),
      stationName: String(r[7] || '').trim()
    });
  }
  return rows;
}

const SESSION_EARLY_BUFFER_MINUTES = 5;

function pickSessionGs(stationName, roomRows, scanMin, dateKey) {
  const target = stationName.toLowerCase();
  let matches = roomRows.filter((row) => row.stationName.toLowerCase() === target);
  if (dateKey) {
    const dated = matches.filter((row) => !row.pdDateKey || row.pdDateKey === dateKey);
    if (dated.length) matches = dated;
  }
  const hits = [];
  for (const row of matches) {
    const start = timeStringToMinutesGs(row.startTime);
    const end = row.endTime ? timeStringToMinutesGs(row.endTime) : start + 30;
    if (start < 0) continue;
    const effectiveStart = Math.max(0, start - SESSION_EARLY_BUFFER_MINUTES);
    if (scanMin >= effectiveStart && scanMin < end) hits.push({ row, start });
  }
  if (hits.length === 0) return null;
  if (hits.length === 1) return { row: hits[0].row, timed: true };
  hits.sort((a, b) => b.start - a.start);
  return { row: hits[0].row, timed: true, boundary: true };
}

function expectedSessionForScan(stationSessions, scanMin, dateKey) {
  const hits = [];
  for (const s of stationSessions) {
    if (s.date !== dateKey) continue;
    const sm = timeStringToMinutesGs(s.start);
    const em = timeStringToMinutesGs(s.end);
    if (sm < 0) continue;
    const effectiveStart = Math.max(0, sm - SESSION_EARLY_BUFFER_MINUTES);
    if (scanMin >= effectiveStart && scanMin < em) hits.push({ session: s.session, start: sm });
  }
  if (!hits.length) return null;
  if (hits.length === 1) return hits[0].session;
  hits.sort((a, b) => b.start - a.start);
  return hits[0].session;
}

const { day2Rows } = readDay2GridRows(resolveCdPdSourcePath());
const records = parseDay2Records(normalizeDay2GridDates(day2Rows));
const rcRows = readRoomConfigLikeEmailDigest();

const gsParseFails = rcRows.filter((r) => timeStringToMinutesGs(r.startTime) < 0).length;
console.log('=== RoomConfig time parsing (AFTER fix) ===');
console.log('Rows where Start Time cannot parse:', gsParseFails, 'of', rcRows.length);
if (rcRows[0]) {
  console.log('Example: raw', rcRows[0].startTimeRaw, '→', rcRows[0].startTime, '→', timeStringToMinutesGs(rcRows[0].startTime), 'min');
}

console.log('\n=== Schedule windows (Day 2 time slots.csv) ===');
const byStation = {};
for (const rec of records) {
  const dk = excelDateKey(rec.pdDate);
  if (dateFilter && dk !== dateFilter) continue;
  if (!byStation[rec.stationName]) byStation[rec.stationName] = [];
  byStation[rec.stationName].push({
    date: dk,
    start: formatTimeFrac(rec.startTime),
    end: formatTimeFrac(rec.endTime),
    session: rec.sessionName
  });
}

const testStation = 'Room 302 - CI South';
const testDate = dateFilter || '2026-06-04';
const stationRc = rcRows.filter((r) => r.stationName === testStation);
const testTimes = ['8:55 AM', '9:05 AM', '10:15 AM', '10:55 AM', '11:05 AM', '1:05 PM'];

console.log('\n=== Simulated room iPad scan → class on email (strict GS parser) ===');
console.log('Station:', testStation);
for (const t of testTimes) {
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  const scanMin = h * 60 + min;
  const result = pickSessionGs(testStation, stationRc, scanMin, testDate);
  const schedule = (byStation[testStation] || []).find((s) => {
    const sm = timeStringToMinutesGs(s.start);
    const em = timeStringToMinutesGs(s.end);
    return s.date === testDate && scanMin >= sm && scanMin < em;
  });
  console.log(
    ' ', t,
    '| iPad time (ScanLog)',
    '| email class:', result ? result.row.sessionName : '?',
    result && result.boundary ? '(boundary: upcoming session)' : '',
    '| schedule:', schedule ? schedule.session : '(gap)'
  );
}

console.log('\n=== checkInTime vs room visits (email fields) ===');
console.log('{{checkInTime}} / {{checkOutTime}} = first IN / last OUT at "Main Check In" only.');
console.log('{{roomVisitLog}} = IN scans at "Room …" stations with class from RoomConfig time match.');
console.log('Room iPad times in email use the ScanLog timestamp, not the schedule grid row.');
