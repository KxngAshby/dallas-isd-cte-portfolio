/**
 * Imports Day 2 session schedule from the Summer PD Plan into RoomConfig.
 *
 * Source: "Day 2 time slots" tab (from Data/Day 2 time slots.csv via DAY2_SEED_DATA_).
 * Each session cell becomes one RoomConfig row with campus, room, session,
 * date, and start/end times. Station names are auto-generated for the
 * Stations sheet (Room 187 - CI North).
 */

const SUMMER_PLAN_SETTING_ID = 'Summer PD Plan Spreadsheet ID';
/** Primary schedule tab (matches Data/Day 2 time slots.csv). */
const SHEET_DAY2_TIME_SLOTS = 'Day 2 time slots';
/** Legacy tab names still read if present. */
const SHEET_DAY2_LEGACY = 'Day 2';
const SHEET_CD_PD_DAY2_LEGACY = 'CD PD Day 2 Time Slots';
const SHEET_SUMMER_ROOM_ASSIGN = 'Room Assignements ';

/** Sessions that are not PD room offerings (skip on import). */
const SKIP_SESSION_RE = /^(check\s*in|lunch|closing\s*session)$/i;

/**
 * Option A one-click: replaces Day 2 tabs from DAY2_SEED_DATA_ (from npm run sync:day2),
 * rebuilds RoomConfig, and updates Stations (ID entry for rooms).
 */
function bootstrapOptionA() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    'Bootstrap Option A',
    'This will:\n' +
      '1. Load "Day 2 time slots" tab from bundled seed (Data/Day 2 time slots.csv, June 4/9/11)\n' +
      '2. Rebuild RoomConfig (all session slots)\n' +
      '3. Add room stations for ID check-in\n\n' +
      'Run only after today\'s PD is finished.\n\nContinue?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  try {
    seedDay2SheetFromBundledData_();
    const result = importRoomConfigFromSummerPdPlan_();
    const stationsAdded = upsertStationsFromRoomConfig_();
    const urlResult = buildStationUrlsCore_();
    let urlNote = '';
    if (urlResult && urlResult.baseUrl) {
      urlNote = '\n\niPad links: refreshed ' + urlResult.count + ' station URL(s).';
    } else {
      urlNote = '\n\niPad links: run "Build Station URLs" after Settings → Web App URL is set.';
    }
    ui.alert(
      'Option A complete',
      'Day 2 time slots schedule loaded.\n' +
        'RoomConfig: ' + result.rowCount + ' session slots (' + result.datesSummary + ').\n' +
        'Stations: ' + stationsAdded + ' new room station(s) added.' + urlNote,
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert('Bootstrap failed', err && err.message ? err.message : String(err), ui.ButtonSet.OK);
    throw err;
  }
}

function seedDay2SheetFromBundledData_() {
  if (typeof DAY2_SEED_DATA_ === 'undefined' || !DAY2_SEED_DATA_ || !DAY2_SEED_DATA_.length) {
    throw new Error('Day 2 seed data missing. Run npm run sync:day2 locally and clasp push.');
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rows = DAY2_SEED_DATA_.length;
  const cols = DAY2_SEED_DATA_[0].length;
  let sheet = ss.getSheetByName(SHEET_DAY2_TIME_SLOTS);
  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(SHEET_DAY2_TIME_SLOTS);
  }
  sheet.getRange(1, 1, rows, cols).setValues(DAY2_SEED_DATA_);
}

/**
 * Menu: PD Scanner → Sync Room Config from Summer PD Plan
 */
function syncRoomConfigFromSummerPdPlan() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    'Sync Room Config',
    'This replaces all rows on the RoomConfig sheet with sessions parsed from "Day 2 time slots".\n\nContinue?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  try {
    const result = importRoomConfigFromSummerPdPlan_();
    ui.alert(
      'Room Config synced',
      'Imported ' + result.rowCount + ' session slots from Day 2 time slots.\n' +
        'Campuses: ' + result.campusSummary + '\n' +
        'PD dates: ' + result.datesSummary + '\n\n' +
        'Next: run "Build Stations from Room Config" if you need station URLs.',
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert('Sync failed', err && err.message ? err.message : String(err), ui.ButtonSet.OK);
    throw err;
  }
}

/**
 * Menu: PD Scanner → Build Stations from Room Config
 */
function buildStationsFromRoomConfig() {
  const ui = SpreadsheetApp.getUi();
  const count = upsertStationsFromRoomConfig_();
  ui.alert(
    'Stations updated',
    'Added or updated ' + count + ' room stations from RoomConfig (Entry Mode = ID for typing Staff ID).\n\nRun "Build Station URLs" to refresh web app links.',
    ui.ButtonSet.OK
  );
}

function importRoomConfigFromSummerPdPlan_() {
  let records = [];
  // Prefer bundled seed (matches Data/Day 2 time slots.csv) — avoids Sheets mangling times on read-back.
  if (typeof DAY2_SEED_DATA_ !== 'undefined' && DAY2_SEED_DATA_ && DAY2_SEED_DATA_.length) {
    records = parseDay2GridData_(DAY2_SEED_DATA_);
  }
  if (records.length === 0) {
    const day2Sheet = getDay2ScheduleSheet_();
    if (day2Sheet) {
      records = parseDay2ScheduleSheet_(day2Sheet);
    }
  }
  if (records.length === 0) {
    throw new Error(
      'No session rows found. On your computer run: npm run sync:day2 then clasp push, then Bootstrap again.'
    );
  }

  assignEndTimes_(records);
  writeRoomConfigRows_(records);

  const campuses = {};
  const dates = {};
  for (let i = 0; i < records.length; i++) {
    campuses[records[i].campus] = true;
    dates[records[i].pdDateKey] = true;
  }

  return {
    rowCount: records.length,
    campusSummary: Object.keys(campuses).sort().join(', '),
    datesSummary: Object.keys(dates).sort().join(', ')
  };
}

function getDay2ScheduleSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const local = ss.getSheetByName(SHEET_DAY2_TIME_SLOTS) ||
    ss.getSheetByName(SHEET_DAY2_LEGACY) ||
    ss.getSheetByName(SHEET_CD_PD_DAY2_LEGACY);
  if (local) return local;

  const planId = String(getSettingValue_(SUMMER_PLAN_SETTING_ID, '') || '').trim();
  if (planId) {
    try {
      const planSs = SpreadsheetApp.openById(planId);
      const named = planSs.getSheetByName(SHEET_DAY2_TIME_SLOTS) ||
        planSs.getSheetByName(SHEET_DAY2_LEGACY) ||
        planSs.getSheetByName(SHEET_CD_PD_DAY2_LEGACY);
      if (named) return named;
    } catch (err) {
      throw new Error('Cannot open Summer PD Plan spreadsheet (check Settings → "' +
        SUMMER_PLAN_SETTING_ID + '"). ' + (err.message || err));
    }
  }

  return null;
}

function getSummerPdPlanSheet_(sheetName) {
  const planId = String(getSettingValue_(SUMMER_PLAN_SETTING_ID, '') || '').trim();
  if (planId) {
    try {
      const planSs = SpreadsheetApp.openById(planId);
      const named = planSs.getSheetByName(sheetName) ||
        planSs.getSheetByName(sheetName.trim());
      if (named) return named;
    } catch (err) {
      throw new Error('Cannot open Summer PD Plan spreadsheet (check Settings → "' +
        SUMMER_PLAN_SETTING_ID + '"). ' + (err.message || err));
    }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(sheetName) || ss.getSheetByName(sheetName.trim());
}

function parseDay2ScheduleSheet_(sheet) {
  return parseDay2GridData_(sheet.getDataRange().getValues());
}

/**
 * Parses the Day 2 grid (sheet or DAY2_SEED_DATA_) into flat session records.
 */
function parseDay2GridData_(data) {
  const records = [];
  let currentDate = null;
  let colRooms = {};
  let currentCampus = CAMPUS_NORTH_LABEL;

  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    const a = row[0];

    const parsedDate = parseScheduleDateCell_(a);
    if (parsedDate) {
      currentDate = parsedDate;
      colRooms = {};
      continue;
    }

    if (String(a).trim().toLowerCase() === 'time') {
      colRooms = {};
      const rooms = [];
      for (let c = 1; c < row.length; c++) {
        const room = parseRoomFromHeaderCell_(row[c]);
        if (room) {
          colRooms[c] = room;
          rooms.push(room);
        }
      }
      currentCampus = inferCampusFromRoomList_(rooms);
      continue;
    }

    const startTime = parseScheduleTimeCell_(a);
    if (!startTime || !currentDate) continue;

    for (let c = 1; c < row.length; c++) {
      const sessionName = String(row[c] || '').trim();
      if (!sessionName || SKIP_SESSION_RE.test(sessionName)) continue;
      const room = colRooms[c];
      if (!room) continue;

      records.push({
        campus: currentCampus,
        room: room,
        sessionName: sessionName,
        pdDate: currentDate,
        pdDateKey: formatDateKey_(currentDate),
        startTime: startTime,
        endTime: '',
        active: true,
        stationName: buildStationName_(room, currentCampus),
        notes: 'Imported from Day 2 time slots'
      });
    }
  }

  return records;
}

function assignEndTimes_(records) {
  const groups = {};
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const key = rec.pdDateKey + '|' + rec.campus + '|' + rec.room;
    if (!groups[key]) groups[key] = [];
    groups[key].push(rec);
  }

  const keys = Object.keys(groups);
  for (let k = 0; k < keys.length; k++) {
    const list = groups[keys[k]];
    list.sort(function (a, b) { return timeToMinutes_(a.startTime) - timeToMinutes_(b.startTime); });
    for (let i = 0; i < list.length; i++) {
      if (i < list.length - 1) {
        list[i].endTime = list[i + 1].startTime;
      } else {
        list[i].endTime = addMinutesToTime_(list[i].startTime, 30);
      }
    }
  }
}

function writeRoomConfigRows_(records) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_ROOM_CONFIG);
  if (!sheet) {
    setupRoomConfigSheet_(ss);
    sheet = ss.getSheetByName(SHEET_ROOM_CONFIG);
  } else {
    ensureRoomConfigHeaders_(sheet);
  }

  const headers = getRoomConfigHeaders_();
  const rows = records.map(function (rec) {
    return [
      rec.campus,
      rec.room,
      rec.sessionName,
      rec.pdDate,
      rec.startTime,
      rec.endTime,
      rec.active,
      rec.stationName,
      rec.notes
    ];
  });

  const lastRow = Math.max(sheet.getLastRow(), 1);
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    const activeRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    sheet.getRange(2, 7, rows.length, 1).setDataValidation(activeRule);
  }
}

function upsertStationsFromRoomConfig_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const roomSheet = ss.getSheetByName(SHEET_ROOM_CONFIG);
  const stationsSheet = ss.getSheetByName(SHEET_STATIONS);
  if (!roomSheet || !stationsSheet) {
    throw new Error('RoomConfig or Stations sheet missing. Run Initialize / Repair System first.');
  }

  const index = getRoomConfigIndex_();
  const stationNames = {};
  for (let i = 0; i < index.length; i++) {
    const row = index[i];
    if (!row.active || !row.stationName) continue;
    stationNames[row.stationName] = 'id';
  }

  const existing = stationsSheet.getRange(2, 1, Math.max(stationsSheet.getLastRow() - 1, 1), 5).getValues();
  const nameToRow = {};
  for (let i = 0; i < existing.length; i++) {
    const name = String(existing[i][0] || '').trim();
    if (name) nameToRow[name] = i + 2;
  }

  let added = 0;
  const names = Object.keys(stationNames).sort();
  for (let n = 0; n < names.length; n++) {
    const name = names[n];
    if (nameToRow[name]) {
      stationsSheet.getRange(nameToRow[name], 5).setValue('ID');
      continue;
    }
    stationsSheet.appendRow([name, true, 'Day 2 session room (from RoomConfig)', '', 'ID']);
    added++;
  }
  ensureStationsEntryModeColumn_(stationsSheet);
  return added;
}

function buildStationName_(room, campus) {
  return 'Room ' + room + ' - ' + campus;
}

function parseRoomFromHeaderCell_(cell) {
  const s = String(cell || '').trim();
  if (!s) return '';
  const m = s.match(/^Room\s+(.+)$/i);
  if (!m) return '';
  return normalizeRoomToken_(m[1]);
}

function normalizeRoomToken_(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/^([0-9]+)([A-Za-z])$/, '$1$2')
    .toUpperCase()
    .replace(/([0-9]+)([A-Z])$/, function (_m, num, letter) { return num + letter; });
}

function inferCampusFromRoomList_(rooms) {
  if (!rooms || rooms.length === 0) return CAMPUS_NORTH_LABEL;
  let south = 0;
  for (let i = 0; i < rooms.length; i++) {
    if (/^3\d{2}/.test(rooms[i])) south++;
  }
  return south >= Math.ceil(rooms.length / 2) ? CAMPUS_SOUTH_LABEL : CAMPUS_NORTH_LABEL;
}

function parseScheduleDateCell_(value) {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const h = value.getHours();
    const min = value.getMinutes();
    // Column A time cells come back as Date on Sheets epoch (1899) or with a time component.
    if (y < 1980 || h !== 0 || min !== 0) return null;
    return new Date(y, value.getMonth(), value.getDate());
  }
  if (isExcelDateSerial_(value)) {
    return excelSerialToDate_(value);
  }
  const s = String(value || '').trim();
  let m = s.match(/^([A-Za-z]+)\s+(\d{1,2})\s*,\s*(\d{4})$/i);
  if (m) {
    const months = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
    };
    const month = months[m[1].toLowerCase()];
    if (month === undefined) return null;
    return new Date(parseInt(m[3], 10), month, parseInt(m[2], 10));
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return new Date(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
  }
  return null;
}

function isExcelDateSerial_(value) {
  return typeof value === 'number' && value > 40000 && value < 60000;
}

function excelSerialToDate_(serial) {
  const utc = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return new Date(utc.getFullYear(), utc.getMonth(), utc.getDate());
}

function formatDateKey_(date) {
  if (!date) return '';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function parseScheduleTimeCell_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'h:mm a');
  }
  if (typeof value === 'number' && value >= 1) {
    return '';
  }
  if (typeof value === 'number' && value > 0 && value < 1) {
    const totalMin = Math.round(value * 24 * 60);
    const h24 = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const ap = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }
  const s = String(value || '').trim();
  if (/^\d{1,2}:\d{2}\s*[AP]M$/i.test(s)) return s.toUpperCase().replace(/\s*(AM|PM)$/i, ' $1');
  return '';
}

function timeToMinutes_(timeStr) {
  const m = String(timeStr || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function addMinutesToTime_(timeStr, minutes) {
  const total = timeToMinutes_(timeStr) + minutes;
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const ap = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
}

function getRoomConfigHeaders_() {
  return ROOM_CONFIG_HEADERS;
}
