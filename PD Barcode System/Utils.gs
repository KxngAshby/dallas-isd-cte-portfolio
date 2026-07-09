/** Career Institute campuses (RoomConfig + station names). */
const CAMPUS_NORTH_LABEL = 'CI North';
const CAMPUS_SOUTH_LABEL = 'CI South';

/** Front desk station that supports lost-badge lunch return (typed Staff ID). */
const MAIN_CHECK_IN_STATION = 'Main Check In';

/** scanSource value from the lunch-return Staff ID form (Main Check In only). */
const SCAN_SOURCE_LUNCH_ID = 'lunch-id';

function isMainCheckInStation_(station) {
  return String(station || '').trim().toLowerCase() === MAIN_CHECK_IN_STATION.toLowerCase();
}

function isLostBadgeLunchInEntry_(station, scanSource) {
  const src = String(scanSource || '').trim().toLowerCase();
  return isMainCheckInStation_(station) && src === SCAN_SOURCE_LUNCH_ID;
}

function getCampusOptions_() {
  return [CAMPUS_NORTH_LABEL, CAMPUS_SOUTH_LABEL];
}

/**
 * Finds last row for ID (optimized bottom-up)
 */
function getLastRowForId(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const scanWindow = 100;
  const windowStart = Math.max(2, lastRow - scanWindow + 1);
  const recentValues = sheet.getRange(windowStart, 2, lastRow - windowStart + 1, 1).getValues();

  for (let i = recentValues.length - 1; i >= 0; i--) {
    if (String(recentValues[i][0]) === String(id)) {
      return windowStart + i;
    }
  }

  if (windowStart > 2) {
    const olderValues = sheet.getRange(2, 2, windowStart - 2, 1).getValues();
    for (let i = olderValues.length - 1; i >= 0; i--) {
      if (String(olderValues[i][0]) === String(id)) {
        return 2 + i;
      }
    }
  }

  return null;
}

/**
 * Formats timestamp
 */
function formatTimestamp(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Standard JSON response
 */
function createJsonResponse(success, status, message, data = null) {
  return ContentService
    .createTextOutput(JSON.stringify({ success, status, message, data }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Extracts station safely
 */
function getStationFromRequest(e) {
  return e?.parameter?.station || 'Unknown';
}

/**
 * Validate scanned ID format using Settings tab regex.
 * Falls back to numeric 5-12 digits if setting is missing/invalid.
 */
function isValidStaffId(id) {
  const regex = getIdRegexPattern_();
  return regex.test(String(id).trim());
}

/**
 * Backward-compatible alias.
 */
function isValidStudentId(id) {
  return isValidStaffId(id);
}

function getIdRegexPattern_() {
  const fallbackPattern = '^[0-9]{5,12}$';
  const settingValue = getSettingValue_('ID Regex', fallbackPattern);

  try {
    return new RegExp(settingValue);
  } catch (err) {
    logServerError('getIdRegexPattern_', err, { settingValue });
    return new RegExp(fallbackPattern);
  }
}

function getSettingValue_(settingName, fallbackValue) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const settingsSheet = ss.getSheetByName('Settings');
    if (!settingsSheet || settingsSheet.getLastRow() < 2) return fallbackValue;

    const rows = settingsSheet.getRange(2, 1, settingsSheet.getLastRow() - 1, 2).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === settingName) {
        const value = String(rows[i][1]).trim();
        return value || fallbackValue;
      }
    }
  } catch (err) {
    logServerError('getSettingValue_', err, { settingName });
  }
  return fallbackValue;
}

/**
 * Validates admin PIN from Settings tab.
 */
function isValidAdminPin(pin) {
  const expected = getSettingValue_('Admin PIN', '2468');
  return String(pin || '').trim() === String(expected).trim();
}

/**
 * Returns enabled stations with entry mode from the Stations sheet.
 * entryMode is "scan" (barcode/USB at front desk) or "id" (type Staff ID at sessions).
 */
function getStationsList_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stationsSheet = ss.getSheetByName('Stations');
  if (!stationsSheet || stationsSheet.getLastRow() < 2) return [];

  const lastRow = stationsSheet.getLastRow();
  const lastCol = Math.max(2, stationsSheet.getLastColumn());
  const colCount = Math.max(5, lastCol);
  const rows = stationsSheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  const stations = [];

  for (let i = 0; i < rows.length; i++) {
    const name = String(rows[i][0] || '').trim();
    const enabled = rows[i][1];
    const isEnabled = enabled === true || String(enabled).toLowerCase() === 'true' || String(enabled) === '1' || String(enabled).toLowerCase() === 'yes';
    if (!name || !isEnabled) continue;
    const entryMode = normalizeEntryMode_(rows[i][4], name);
    stations.push({ name: name, entryMode: entryMode });
  }

  return stations;
}

/** Backward-compatible: names only. */
function getEnabledStations() {
  return getStationsList_().map(function (s) { return s.name; });
}

/**
 * Resolves how a station accepts check-ins: scan (barcode) or id (typed Staff ID).
 * URL ?entry=id|scan wins, then Stations sheet column, then Room* heuristic.
 */
function resolveStationEntryMode_(stationName, urlEntryParam) {
  const urlRaw = String(urlEntryParam || '').trim().toLowerCase();
  if (urlRaw === 'id' || urlRaw === 'manual') return 'id';
  if (urlRaw === 'scan' || urlRaw === 'barcode') return 'scan';

  const name = String(stationName || '').trim();
  const list = getStationsList_();
  for (let i = 0; i < list.length; i++) {
    if (list[i].name === name) return list[i].entryMode;
  }
  if (/^Room\s/i.test(name)) return 'id';
  return 'scan';
}

function normalizeEntryMode_(value, stationName) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'id' || raw === 'manual' || raw === 'type' || raw === 'typed') return 'id';
  if (raw === 'scan' || raw === 'barcode' || raw === 'usb' || raw === 'camera') return 'scan';
  if (stationName && /^Room\s/i.test(String(stationName))) return 'id';
  return 'scan';
}

/**
 * Log server errors with context for easier troubleshooting.
 */
const WEB_APP_URL_SETTING = 'Web App URL';

/**
 * Base URL for station links. Uses Settings → "Web App URL" when set
 * (paste the /exec link that works in your browser), otherwise
 * ScriptApp.getService().getUrl() which may be a stale or district URL.
 */
function getWebAppBaseUrl_() {
  const override = String(getSettingValue_(WEB_APP_URL_SETTING, '') || '').trim();
  if (override) return normalizeWebAppBaseUrl_(override);
  const fromService = ScriptApp.getService().getUrl();
  return normalizeWebAppBaseUrl_(fromService || '');
}

function normalizeWebAppBaseUrl_(url) {
  let u = String(url || '').trim();
  if (!u) return '';
  const q = u.indexOf('?');
  if (q >= 0) u = u.substring(0, q);
  u = u.replace(/\/dev\/?$/i, '/exec');
  if (u.endsWith('/')) u = u.slice(0, -1);
  if (u.indexOf('/macros/s/') >= 0 && !/\/exec$/i.test(u)) {
    u = u + '/exec';
  }
  return u;
}

function buildStationUrl_(stationName, entryModeOrSetting) {
  const base = getWebAppBaseUrl_();
  if (!base) return '';
  const mode = resolveStationEntryMode_(stationName, entryModeOrSetting || '');
  const entryParam = mode === 'id' ? '&entry=id' : '';
  return base + '?station=' + encodeURIComponent(String(stationName).trim()) + entryParam;
}

function logServerError(source, err, context = {}) {
  const payload = {
    source,
    message: err && err.message ? err.message : String(err),
    stack: err && err.stack ? err.stack : '',
    context
  };
  console.error(JSON.stringify(payload));
}