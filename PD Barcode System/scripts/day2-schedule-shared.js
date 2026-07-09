/**

 * Shared Day 2 grid parser (local scripts). Mirrors SummerPdPlanSync.gs.

 */

const path = require('path');

const fs = require('fs');

const xlsx = require('xlsx');



const DAY2_CSV_PATH = path.join('Data', 'Day 2 time slots.csv');



// Pull the Day 2 grid straight from an uploaded Summer PD Plan workbook
// (the "Day 2" tab). Newest upload name first, then prior fallbacks.
const CD_PD_SOURCE_CANDIDATES = [

  path.join('Data', 'Copy of Summer PD Plan.xlsx'),

  path.join('Data', 'Summer PD Plan.xlsx'),

  'Summer PD Plan.xlsx',

  DAY2_CSV_PATH,

  path.join('Data', 'CD PD Day 2 Time Slots.xlsx'),

  path.join('Data', 'CTE PD Day 2 Time Slots.xlsx')

];



const DAY2_SHEET_NAME = 'Day 2 time slots';



const ROOM_CONFIG_HEADERS = [

  'Campus', 'Room', 'Session Name', 'PD Date', 'Start Time', 'End Time',

  'Active', 'Station Name', 'Notes'

];



const IMPORT_NOTES = 'Imported from Day 2 time slots';



const SKIP_SESSION_RE = /^(check\s*in|lunch|closing\s*session)$/i;



const MONTH_INDEX = {

  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,

  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11

};



function resolveCdPdSourcePath() {

  for (const candidate of CD_PD_SOURCE_CANDIDATES) {

    if (fs.existsSync(candidate)) return candidate;

  }

  throw new Error(

    'Day 2 source not found. Add one of:\n  ' + CD_PD_SOURCE_CANDIDATES.join('\n  ')

  );

}



function readCsvRows(filePath) {

  const text = fs.readFileSync(filePath, 'utf8');

  return text.split(/\r?\n/).filter((line) => line.length).map((line) => {

    const out = [];

    let cur = '';

    let inQ = false;

    for (let i = 0; i < line.length; i++) {

      const ch = line[i];

      if (ch === '"') {

        inQ = !inQ;

        continue;

      }

      if (ch === ',' && !inQ) {

        out.push(cur);

        cur = '';

        continue;

      }

      cur += ch;

    }

    out.push(cur);

    return out;

  });

}



function resolveDay2SheetName(workbook) {
  if (workbook.Sheets[DAY2_SHEET_NAME]) return DAY2_SHEET_NAME;
  if (workbook.Sheets['Day 2']) return 'Day 2';
  if (workbook.Sheets['CD PD Day 2 Time Slots']) return 'CD PD Day 2 Time Slots';
  return workbook.SheetNames[0];
}



function readDay2GridRows(sourcePath) {

  if (String(sourcePath).toLowerCase().endsWith('.csv')) {

    return { day2Rows: readCsvRows(sourcePath), sheetName: 'CSV', sourcePath };

  }

  const planWb = xlsx.readFile(sourcePath);

  const sheetName = resolveDay2SheetName(planWb);

  const day2Rows = xlsx.utils.sheet_to_json(planWb.Sheets[sheetName], { header: 1, defval: '' });

  return { day2Rows, sheetName, sourcePath };

}



function dateToExcelSerial(date) {

  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

  return Math.round(utc / 86400000) + 25569;

}



function parseScheduleDateCell(value) {

  if (value instanceof Date && !isNaN(value.getTime())) {

    return dateToExcelSerial(value);

  }

  if (isExcelDate(value)) return value;

  const s = String(value || '').trim();

  if (!s) return null;

  const m = s.match(/^([A-Za-z]+)\s+(\d{1,2})\s*,\s*(\d{4})$/);

  if (!m) return null;

  const month = MONTH_INDEX[m[1].toLowerCase()];

  if (month === undefined) return null;

  const day = parseInt(m[2], 10);

  const year = parseInt(m[3], 10);

  return dateToExcelSerial(new Date(year, month, day));

}



function pdDateKey(pdDate) {

  if (pdDate == null || pdDate === '') return '';

  if (isExcelDate(pdDate)) return excelDateKey(pdDate);

  return String(pdDate);

}



function normalizeDay2GridDates(day2Rows) {

  return day2Rows.map((row) => {

    if (!row || !row.length) return row;

    const serial = parseScheduleDateCell(row[0]);

    if (serial == null) return row;

    const out = row.slice();

    out[0] = serial;

    return out;

  });

}



function parseRoomFromHeaderCell(cell) {

  const s = String(cell || '').trim();

  const m = s.match(/^Room\s+(.+)$/i);

  if (!m) return '';

  return String(m[1]).trim().replace(/\s+/g, '').toUpperCase();

}



function inferCampus(rooms) {

  if (!rooms.length) return 'CI North';

  const south = rooms.filter((r) => /^3\d{2}/.test(r)).length;

  return south >= Math.ceil(rooms.length / 2) ? 'CI South' : 'CI North';

}



function isExcelDate(v) {

  return typeof v === 'number' && v > 40000 && v < 60000;

}



function excelDateKey(v) {

  const d = new Date(Math.round((v - 25569) * 86400 * 1000));

  return d.toISOString().slice(0, 10);

}



function parseTimeFrac(value) {

  if (typeof value === 'number' && value > 0 && value < 1) return value;

  const m = String(value || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!m) return null;

  let h = parseInt(m[1], 10);

  const min = parseInt(m[2], 10);

  const ap = m[3].toUpperCase();

  if (ap === 'PM' && h !== 12) h += 12;

  if (ap === 'AM' && h === 12) h = 0;

  return (h * 60 + min) / (24 * 60);

}



function formatTimeFrac(frac) {

  if (typeof frac !== 'number') return '';

  const totalMin = Math.round(frac * 24 * 60);

  const h24 = Math.floor(totalMin / 60);

  const m = totalMin % 60;

  const ap = h24 >= 12 ? 'PM' : 'AM';

  const h12 = h24 % 12 || 12;

  return h12 + ':' + String(m).padStart(2, '0') + ' ' + ap;

}



function timeToMinutes_(frac) {

  if (typeof frac !== 'number') return 0;

  return Math.round(frac * 24 * 60);

}



function addMinutesFrac_(frac, mins) {

  return (timeToMinutes_(frac) + mins) / (24 * 60);

}



function buildStationName(room, campus) {

  return 'Room ' + room + ' - ' + campus;

}



function parseDay2Records(day2Rows) {

  const records = [];

  let colRooms = {};

  let campus = 'CI North';

  let currentDate = null;



  for (let r = 0; r < day2Rows.length; r++) {

    const row = day2Rows[r];

    const a = row[0];

    const parsedDate = parseScheduleDateCell(a);

    if (parsedDate != null) {

      currentDate = parsedDate;

      colRooms = {};

      continue;

    }

    if (String(a).trim().toLowerCase() === 'time') {

      colRooms = {};

      const rooms = [];

      for (let c = 1; c < row.length; c++) {

        const room = parseRoomFromHeaderCell(row[c]);

        if (room) {

          colRooms[c] = room;

          rooms.push(room);

        }

      }

      campus = inferCampus(rooms);

      continue;

    }

    const start = parseTimeFrac(a);

    if (start === null) continue;

    if (currentDate == null) continue;

    for (let c = 1; c < row.length; c++) {

      const session = String(row[c] || '').trim();

      if (!session || SKIP_SESSION_RE.test(session)) continue;

      const room = colRooms[c];

      if (!room) continue;

      records.push({

        campus,

        room,

        sessionName: session,

        pdDate: currentDate,

        startTime: start,

        endTime: null,

        active: true,

        stationName: buildStationName(room, campus),

        notes: IMPORT_NOTES

      });

    }

  }



  const groups = {};

  for (const rec of records) {

    const key = pdDateKey(rec.pdDate) + '|' + rec.campus + '|' + rec.room;

    if (!groups[key]) groups[key] = [];

    groups[key].push(rec);

  }

  for (const list of Object.values(groups)) {

    list.sort((a, b) => timeToMinutes_(a.startTime) - timeToMinutes_(b.startTime));

    for (let i = 0; i < list.length; i++) {

      list[i].endTime = i < list.length - 1

        ? list[i + 1].startTime

        : addMinutesFrac_(list[i].startTime, 30);

    }

  }

  return records;

}



function uniqueRoomStations(records) {

  const names = {};

  for (const rec of records) {

    if (rec.active && rec.stationName) names[rec.stationName] = true;

  }

  return Object.keys(names).sort();

}



function readExistingStationNames(systemPath) {

  if (!fs.existsSync(systemPath)) return [];

  const wb = xlsx.readFile(systemPath);

  const sheet = wb.Sheets.Stations;

  if (!sheet) return [];

  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const names = [];

  for (let i = 1; i < rows.length; i++) {

    const name = String(rows[i][0] || '').trim();

    if (name) names.push(name);

  }

  return names.sort();

}



function compareStationLists(before, after) {

  const beforeSet = new Set(before);

  const afterSet = new Set(after);

  return {

    added: after.filter((n) => !beforeSet.has(n)),

    removed: before.filter((n) => !afterSet.has(n))

  };

}



function summarizeRecords(records) {

  const byDate = {};

  const campuses = {};

  for (const rec of records) {

    const dateKey = pdDateKey(rec.pdDate);

    byDate[dateKey] = (byDate[dateKey] || 0) + 1;

    campuses[rec.campus] = true;

  }

  return {

    sessionSlots: records.length,

    roomStations: uniqueRoomStations(records).length,

    byDate,

    campuses: Object.keys(campuses).sort()

  };

}



module.exports = {

  DAY2_CSV_PATH,

  CD_PD_SOURCE_CANDIDATES,

  DAY2_SHEET_NAME,

  ROOM_CONFIG_HEADERS,

  IMPORT_NOTES,

  resolveCdPdSourcePath,

  readDay2GridRows,

  normalizeDay2GridDates,

  parseDay2Records,

  uniqueRoomStations,

  readExistingStationNames,

  compareStationLists,

  summarizeRecords,

  formatTimeFrac,

  excelDateKey,

  parseScheduleDateCell

};

