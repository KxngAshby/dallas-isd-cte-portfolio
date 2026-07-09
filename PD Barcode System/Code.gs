const SCAN_LOCK_TIMEOUT_MS = 30000;
const SHEET_TEST_SCAN_LOG = 'TestScanLog';

const STAFF_CACHE_PREFIX = 'staff:v1:';
const STAFF_CACHE_INDEX_KEY = 'staff:v1:_index';
const STAFF_CACHE_TTL_SECONDS = 21600;
const STAFF_CACHE_TRIGGER_HANDLER = 'warmStaffCache';

const SESSION_CACHE_PREFIX = 'session:v1:';
const SESSION_CACHE_TTL_SECONDS = 60;

/**
 * Adds a menu for setup and admin utilities.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('PD Scanner')
    .addItem('Apply Staff PD Defaults (One Click)', 'applyStaffPdDefaults')
    .addSeparator()
    .addItem('Initialize / Repair System', 'initializePdScannerSystem')
    .addItem('Sync Staff from Teacher Numbers', 'syncStaffFromTeacherNumbers')
    .addItem('Build Staff Barcodes', 'buildStaffBarcodes')
    .addItem('Build Staff Badges PDF', 'buildStaffBadgesPdf')
    .addItem('Build Station URLs', 'buildStationUrls')
    .addItem('Diagnose Web App URL', 'showWebAppUrlDiagnostics')
    .addItem('Apply Lunch Settings (12:00 / 12:30)', 'applyLunchSettingsMenu')
    .addSeparator()
    .addItem('Bootstrap Option A (Day 2 + Room Config + Stations)', 'bootstrapOptionA')
    .addItem('Sync Room Config from Summer PD Plan', 'syncRoomConfigFromSummerPdPlan')
    .addItem('Build Stations from Room Config', 'buildStationsFromRoomConfig')
    .addItem('Fix Campus Names (CI North / CI South)', 'renameCampusNamesToCiMenu')
    .addItem('Run System Check', 'runPdSystemCheck')
    .addItem("Show Today's PD Session", 'showTodaysSession')
    .addSeparator()
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('PD Emails')
        .addItem("Preview Today's Email Recipients", 'previewTodaysPdEmailRecipients')
        .addItem("Preview Today's Attendance Log", 'previewTodaysAttendanceLog')
        .addItem("Generate Today's PD Emails", 'generateTodaysPdEmails')
        .addItem('Generate Email for One Teacher', 'generateSingleTeacherEmail')
        .addItem('Mark All as Sent', 'markAllPdEmailsAsSent')
        .addSeparator()
        .addItem('Preview Summer PD Thank You Recipients', 'previewSummerPdThankYouEmailRecipients')
        .addItem('Generate Summer PD Thank You Emails', 'generateSummerPdThankYouEmails')
        .addSeparator()
        .addItem('Install Daily Email Trigger (5 PM)', 'installPdEmailTrigger')
        .addItem('Uninstall Daily Email Trigger', 'uninstallPdEmailTrigger')
    )
    .addSeparator()
    .addItem('Refresh Staff Cache Now', 'warmStaffCache')
    .addItem('Install 5-min Cache Refresh Trigger', 'installStaffCacheTrigger')
    .addSeparator()
    .addItem('Load Test: Reset TestScanLog', 'resetTestScanLog')
    .addItem('Load Test: Show Summary', 'showTestScanLogSummary')
    .addSeparator()
    .addItem('JESS Cleanup: Active Sheet', 'runJessCleanupOnActiveSheet')
    .addItem('JESS Cleanup: All Sheets', 'runJessCleanupOnAllSheets')
    .addToUi();
}

/**
 * Serves the frontend UI. Single-route web app: every GET serves the same
 * scanner page. The page itself supports both USB-scanner input (laptops) and
 * manual Staff ID entry (session rooms), so one URL handles every device type
 * and station configuration.
 */
function doGet(e) {
  try {
    const template = HtmlService.createTemplateFromFile('index');
    const station = String(e?.parameter?.station || 'Unknown').trim() || 'Unknown';
    template.station = station;
    template.entryMode = resolveStationEntryMode_(station, e?.parameter?.entry || '');

    return template.evaluate()
      .setTitle('Attendance Scanner')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch (err) {
    return ContentService
      .createTextOutput('Error loading app')
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

/**
 * Handles scan POST requests
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  const requestId = getRequestId_(e);
  let id = '';
  let station = '';
  try {
    lock.waitLock(SCAN_LOCK_TIMEOUT_MS);

    const action = String(e?.parameter?.action || 'scan').trim();
    station = getStationFromRequest(e);

    if (action === 'loadTest') {
      return handleLoadTestScan_(e, requestId, station);
    }

    if (action === 'clientLog') {
      logScanDiagnostic_({
        requestId: requestId,
        source: 'client',
        action: action,
        stage: e?.parameter?.stage || 'client',
        outcome: e?.parameter?.outcome || 'reported',
        id: e?.parameter?.id || '',
        station: station,
        message: e?.parameter?.message || '',
        userAgent: e?.parameter?.userAgent || '',
        details: e?.parameter?.details || ''
      });
      return createJsonResponse(true, null, 'Client log recorded', { requestId });
    }

    if (action === 'getStations') {
      const pin = e?.parameter?.pin || '';
      if (!isValidAdminPin(pin)) {
        logScanDiagnostic_({
          requestId: requestId,
          source: 'server',
          action: action,
          stage: 'admin_pin',
          outcome: 'rejected',
          station: station,
          message: 'Invalid admin PIN',
          userAgent: e?.parameter?.userAgent || ''
        });
        return createJsonResponse(false, null, 'Invalid admin PIN');
      }
      logScanDiagnostic_({
        requestId: requestId,
        source: 'server',
        action: action,
        stage: 'admin_stations',
        outcome: 'success',
        station: station,
        message: 'Stations loaded',
        userAgent: e?.parameter?.userAgent || ''
      });
      return createJsonResponse(true, null, 'Stations loaded', { stations: getEnabledStations() });
    }

    id = (e?.parameter?.id || '').trim();

    if (!id) {
      logScanDiagnostic_({
        requestId: requestId,
        source: 'server',
        action: action,
        stage: 'missing_id',
        outcome: 'rejected',
        id: id,
        station: station,
        message: 'Missing ID',
        userAgent: e?.parameter?.userAgent || ''
      });
      return createJsonResponse(false, null, 'Missing ID');
    }

    if (!isValidStaffId(id)) {
      logScanDiagnostic_({
        requestId: requestId,
        source: 'server',
        action: action,
        stage: 'id_format',
        outcome: 'rejected',
        id: id,
        station: station,
        message: 'Invalid ID format',
        userAgent: e?.parameter?.userAgent || ''
      });
      return createJsonResponse(false, null, 'Invalid ID format');
    }

    const staff = getActiveStaffById_(id);
    if (!staff) {
      logScanDiagnostic_({
        requestId: requestId,
        source: 'server',
        action: action,
        stage: 'staff_lookup',
        outcome: 'rejected',
        id: id,
        station: station,
        message: 'Barcode not found in Staff',
        userAgent: e?.parameter?.userAgent || ''
      });
      return createJsonResponse(false, null, 'Barcode not found in Staff');
    }

    const lastInfo = getLastScanInfo_(id);
    const dupWindowSec = Number(getSettingValue_('Duplicate Window Seconds', '5')) || 5;
    if (lastInfo && (Date.now() - lastInfo.timestamp.getTime()) / 1000 < dupWindowSec) {
      logScanDiagnostic_({
        requestId: requestId,
        source: 'server',
        action: action,
        stage: 'duplicate_check',
        outcome: 'rejected',
        id: id,
        station: station,
        message: 'Duplicate scan detected',
        staffName: staff.displayName,
        userAgent: e?.parameter?.userAgent || ''
      });
      return createJsonResponse(false, null, 'Duplicate scan detected');
    }

    const scanSource = String(e?.parameter?.scanSource || e?.parameter?.source || 'usb').trim();
    const lastFlowStatus = getLastFlowStatus_(id);
    const resolved = resolveScanStatus_(lastFlowStatus, station, new Date(), scanSource);
    if (!resolved.ok) {
      logScanDiagnostic_({
        requestId: requestId,
        source: 'server',
        action: action,
        stage: 'sequence_check',
        outcome: 'rejected',
        id: id,
        station: station,
        message: resolved.message || 'Scan not allowed at this time',
        staffName: staff.displayName,
        userAgent: e?.parameter?.userAgent || '',
        details: JSON.stringify({ lastFlowStatus: lastFlowStatus, station: station, scanSource: scanSource })
      });
      return createJsonResponse(false, lastFlowStatus, resolved.message || 'Scan not allowed at this time');
    }

    const nextStatus = resolved.status;
    const scanDate = new Date();
    const timing = getScanTimingMetadata(nextStatus, scanDate, station, scanSource, lastFlowStatus);

    if (!validateSequence(lastFlowStatus, nextStatus, station, scanSource, scanDate)) {
      logScanDiagnostic_({
        requestId: requestId,
        source: 'server',
        action: action,
        stage: 'sequence_check',
        outcome: 'rejected',
        id: id,
        station: station,
        message: 'Invalid scan sequence',
        staffName: staff.displayName,
        userAgent: e?.parameter?.userAgent || '',
        details: JSON.stringify({ lastFlowStatus: lastFlowStatus, nextStatus: nextStatus, scanSource: scanSource })
      });
      return createJsonResponse(false, lastFlowStatus, 'Invalid scan sequence');
    }

    logScan(id, nextStatus, station, buildScanNotes_(staff.displayName, timing));
    logScanDiagnostic_({
      requestId: requestId,
      source: 'server',
      action: action,
      stage: 'scan_log',
      outcome: 'success',
      id: id,
      station: station,
      message: 'Scan recorded',
      staffName: staff.displayName,
      userAgent: e?.parameter?.userAgent || '',
      details: JSON.stringify({ status: nextStatus, timing: timing, scanSource: scanSource })
    });

    return createJsonResponse(true, nextStatus, 'Scan recorded', { staff, requestId, timing });

  } catch (err) {
    logServerError('doPost', err, {
      requestId: requestId,
      id: id || e?.parameter?.id,
      station: station || e?.parameter?.station
    });
    logScanDiagnostic_({
      requestId: requestId,
      source: 'server',
      action: e?.parameter?.action || 'scan',
      stage: 'server_error',
      outcome: 'error',
      id: id || e?.parameter?.id || '',
      station: station || e?.parameter?.station || '',
      message: err && err.message ? err.message : String(err),
      userAgent: e?.parameter?.userAgent || '',
      details: err && err.stack ? err.stack : ''
    });
    return createJsonResponse(false, null, 'Server error');
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

/**
 * Apps Script HTMLService entry point for scanner page calls.
 * This avoids fetch/CORS/userCodeAppPanel issues from the embedded web app iframe.
 */
function scanFromClient(payload) {
  const lock = LockService.getScriptLock();
  const requestId = String(payload?.requestId || Utilities.getUuid()).trim();
  const id = String(payload?.id || '').trim();
  const station = String(payload?.station || 'Unknown').trim() || 'Unknown';

  let pendingReceipt = null;

  try {
    lock.waitLock(SCAN_LOCK_TIMEOUT_MS);

    if (!id) {
      logScanDiagnostic_({
        requestId: requestId,
        source: 'client-server',
        action: 'scanFromClient',
        stage: 'missing_id',
        outcome: 'rejected',
        id: id,
        station: station,
        message: 'Missing ID',
        userAgent: payload?.userAgent || ''
      });
      return createPlainResponse_(false, null, 'Missing ID', { requestId });
    }

    if (!isValidStaffId(id)) {
      logScanDiagnostic_({
        requestId: requestId,
        source: 'client-server',
        action: 'scanFromClient',
        stage: 'id_format',
        outcome: 'rejected',
        id: id,
        station: station,
        message: 'Invalid ID format',
        userAgent: payload?.userAgent || ''
      });
      return createPlainResponse_(false, null, 'Invalid ID format', { requestId });
    }

    const staff = getActiveStaffById_(id);
    if (!staff) {
      logScanDiagnostic_({
        requestId: requestId,
        source: 'client-server',
        action: 'scanFromClient',
        stage: 'staff_lookup',
        outcome: 'rejected',
        id: id,
        station: station,
        message: 'Barcode not found in Staff',
        userAgent: payload?.userAgent || ''
      });
      return createPlainResponse_(false, null, 'Barcode not found in Staff', { requestId });
    }

    const lastInfo = getLastScanInfo_(id);
    const dupWindowSec = Number(getSettingValue_('Duplicate Window Seconds', '5')) || 5;
    if (lastInfo && (Date.now() - lastInfo.timestamp.getTime()) / 1000 < dupWindowSec) {
      logScanDiagnostic_({
        requestId: requestId,
        source: 'client-server',
        action: 'scanFromClient',
        stage: 'duplicate_check',
        outcome: 'rejected',
        id: id,
        station: station,
        message: 'Duplicate scan detected',
        staffName: staff.displayName,
        userAgent: payload?.userAgent || ''
      });
      return createPlainResponse_(false, null, 'Duplicate scan detected', { requestId, staff });
    }

    const scanSource = String(payload?.scanSource || payload?.source || 'usb').trim();
    const lastFlowStatus = getLastFlowStatus_(id);
    const resolved = resolveScanStatus_(lastFlowStatus, station, new Date(), scanSource);
    if (!resolved.ok) {
      logScanDiagnostic_({
        requestId: requestId,
        source: 'client-server',
        action: 'scanFromClient',
        stage: 'sequence_check',
        outcome: 'rejected',
        id: id,
        station: station,
        message: resolved.message || 'Scan not allowed at this time',
        staffName: staff.displayName,
        userAgent: payload?.userAgent || '',
        details: JSON.stringify({ lastFlowStatus: lastFlowStatus, station: station, scanSource: scanSource })
      });
      return createPlainResponse_(false, lastFlowStatus, resolved.message || 'Scan not allowed at this time', { requestId, staff });
    }

    const nextStatus = resolved.status;
    const scanDate = new Date();
    const timing = getScanTimingMetadata(nextStatus, scanDate, station, scanSource, lastFlowStatus);

    if (!validateSequence(lastFlowStatus, nextStatus, station, scanSource, scanDate)) {
      logScanDiagnostic_({
        requestId: requestId,
        source: 'client-server',
        action: 'scanFromClient',
        stage: 'sequence_check',
        outcome: 'rejected',
        id: id,
        station: station,
        message: 'Invalid scan sequence',
        staffName: staff.displayName,
        userAgent: payload?.userAgent || '',
        details: JSON.stringify({ lastFlowStatus: lastFlowStatus, nextStatus: nextStatus, scanSource: scanSource })
      });
      return createPlainResponse_(false, lastFlowStatus, 'Invalid scan sequence', { requestId, staff });
    }

    logScan(id, nextStatus, station, buildScanNotes_(staff.displayName, timing));

    if (nextStatus === 'IN' && !resolved.repeat) {
      pendingReceipt = {
        staff: staff,
        id: id,
        status: nextStatus,
        station: station,
        requestId: requestId,
        userAgent: payload?.userAgent || ''
      };
    }

    logScanDiagnostic_({
      requestId: requestId,
      source: 'client-server',
      action: 'scanFromClient',
      stage: 'scan_log',
      outcome: 'success',
      id: id,
      station: station,
      message: 'Scan recorded',
      staffName: staff.displayName,
      userAgent: payload?.userAgent || '',
      details: JSON.stringify({ status: nextStatus, timing: timing })
    });

    if (lock.hasLock()) lock.releaseLock();

    if (pendingReceipt) {
      sendCheckInReceipt_(
        pendingReceipt.staff,
        pendingReceipt.id,
        pendingReceipt.status,
        pendingReceipt.station,
        pendingReceipt.requestId,
        pendingReceipt.userAgent
      );
    }

    return createPlainResponse_(true, nextStatus, 'Scan recorded', { requestId, staff, timing });

  } catch (err) {
    logServerError('scanFromClient', err, { requestId: requestId, id: id, station: station });
    logScanDiagnostic_({
      requestId: requestId,
      source: 'client-server',
      action: 'scanFromClient',
      stage: 'server_error',
      outcome: 'error',
      id: id,
      station: station,
      message: err && err.message ? err.message : String(err),
      userAgent: payload?.userAgent || '',
      details: err && err.stack ? err.stack : ''
    });
    return createPlainResponse_(false, null, 'Server error', { requestId });
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

function getStationsFromClient(payload) {
  const requestId = String(payload?.requestId || Utilities.getUuid()).trim();
  const station = String(payload?.station || 'Unknown').trim() || 'Unknown';
  const pin = String(payload?.pin || '').trim();

  if (!isValidAdminPin(pin)) {
    logScanDiagnostic_({
      requestId: requestId,
      source: 'client-server',
      action: 'getStationsFromClient',
      stage: 'admin_pin',
      outcome: 'rejected',
      station: station,
      message: 'Invalid admin PIN',
      userAgent: payload?.userAgent || ''
    });
    return createPlainResponse_(false, null, 'Invalid admin PIN', { requestId });
  }

  logScanDiagnostic_({
    requestId: requestId,
    source: 'client-server',
    action: 'getStationsFromClient',
    stage: 'admin_stations',
    outcome: 'success',
    station: station,
    message: 'Stations loaded',
    userAgent: payload?.userAgent || ''
  });

  return createPlainResponse_(true, null, 'Stations loaded', {
    requestId: requestId,
    stations: getStationsList_()
  });
}

/**
 * Returns scan vs id entry mode for the current station (no PIN required).
 */
function getStationEntryModeFromClient(payload) {
  const requestId = String(payload?.requestId || Utilities.getUuid()).trim();
  const station = String(payload?.station || 'Unknown').trim() || 'Unknown';
  const entryMode = resolveStationEntryMode_(station, payload?.entry || '');
  return createPlainResponse_(true, null, 'Entry mode loaded', {
    requestId: requestId,
    entryMode: entryMode
  });
}

function clientLogFromClient(payload) {
  const requestId = String(payload?.requestId || Utilities.getUuid()).trim();
  logScanDiagnostic_({
    requestId: requestId,
    source: 'client',
    action: 'clientLogFromClient',
    stage: payload?.stage || 'client',
    outcome: payload?.outcome || 'reported',
    id: payload?.id || '',
    station: payload?.station || '',
    message: payload?.message || '',
    userAgent: payload?.userAgent || '',
    details: payload?.details || ''
  });
  return createPlainResponse_(true, null, 'Client log recorded', { requestId });
}

function createPlainResponse_(success, status, message, data) {
  return {
    success: success,
    status: status,
    message: message,
    data: data || null
  };
}

/**
 * Logs scan to sheet.
 *
 * Stamps the row with the PD Day and Session Label that today's date maps to
 * via the Sessions sheet. If today's date isn't listed in Sessions, those
 * two cells stay blank and the scan is still recorded normally so off-day
 * scans never break the flow.
 *
 * After every scan on a PD day, also mirrors/refreshes the teacher's row in
 * Today's PD Emails so the attendance log inside the email body keeps
 * growing live throughout the day. Subsequent scans (LUNCH OUT / LUNCH IN /
 * OUT) re-render the body of the existing row instead of adding new ones.
 */
function logScan(id, status, station, notes = '') {
  const sheet = getSheet();
  const now = new Date();
  const timestamp = formatTimestamp(now);
  const session = getSessionForDate_(now);

  sheet.appendRow([
    timestamp,
    id,
    status,
    station,
    session.pdDay,
    session.sessionLabel,
    notes
  ]);

  if (session.pdDay || session.sessionLabel) {
    try {
      mirrorScanToDigest_(id, now, status, session);
    } catch (err) {
      logServerError('mirrorScanToDigest_', err, { id: id, status: status });
    }
  }
}

function buildScanNotes_(staffName, timing) {
  const notes = [];
  if (staffName) notes.push(staffName);
  if (timing?.severity === 'warning' && timing.message) {
    notes.push('Timing warning: ' + timing.message);
  }
  return notes.join(' | ');
}

/**
 * Returns ScanLog sheet
 */
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('ScanLog');

  if (!sheet) {
    throw new Error('ScanLog sheet not found');
  }

  return sheet;
}

/**
 * Finds an active Staff row by Staff ID, Teacher Number, or Barcode Value.
 *
 * Cached via CacheService. The cache is warmed by a 5-minute time-driven
 * trigger and invalidated by onEdit() when the Staff sheet is modified, so
 * a freshly-printed walk-in name badge becomes scannable as soon as you
 * save the row in the spreadsheet.
 */
function getActiveStaffById_(id) {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return null;

  const cache = CacheService.getScriptCache();
  const cached = cache.get(STAFF_CACHE_PREFIX + normalizedId);
  if (cached === '__MISS__') return null;
  if (cached) {
    try { return JSON.parse(cached); } catch (err) { /* fall through to rebuild */ }
  }

  const indexFlag = cache.get(STAFF_CACHE_INDEX_KEY);
  if (indexFlag === 'ready' && cached !== null) {
    cache.put(STAFF_CACHE_PREFIX + normalizedId, '__MISS__', 60);
    return null;
  }

  warmStaffCache();
  const refreshed = cache.get(STAFF_CACHE_PREFIX + normalizedId);
  if (refreshed && refreshed !== '__MISS__') {
    try { return JSON.parse(refreshed); } catch (err) { return null; }
  }

  cache.put(STAFF_CACHE_PREFIX + normalizedId, '__MISS__', 60);
  return null;
}

/**
 * Loads the Staff sheet into CacheService as one entry per Staff ID.
 *
 * Public so it can be called by:
 *   - the 5-minute time-driven trigger installed by installStaffCacheTrigger
 *   - the onEdit handler when the Staff sheet changes
 *   - manual menu invocation when a walk-in row is added mid-event
 */
function warmStaffCache() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Staff');
  const cache = CacheService.getScriptCache();

  if (!sheet || sheet.getLastRow() < 2) {
    cache.put(STAFF_CACHE_INDEX_KEY, 'ready', STAFF_CACHE_TTL_SECONDS);
    return { entries: 0 };
  }

  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headerMap = buildHeaderMap_(values[0]);
  const buffer = {};

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const staffId = normalizeScanId_(getValueByHeaders_(row, headerMap, ['staffid', 'teachernumber', 'barcodevalue']));
    if (!staffId) continue;

    const activeValue = getValueByHeaders_(row, headerMap, ['active']);
    const isActive = activeValue === true || String(activeValue || '').trim() === '' || ['true', 'yes', '1'].indexOf(String(activeValue).toLowerCase()) >= 0;
    if (!isActive) continue;

    const firstName = String(getValueByHeaders_(row, headerMap, ['firstname']) || '').trim();
    const lastName = String(getValueByHeaders_(row, headerMap, ['lastname']) || '').trim();
    const displayName = [firstName, lastName].filter(Boolean).join(' ') || staffId;

    buffer[STAFF_CACHE_PREFIX + staffId] = JSON.stringify({
      id: staffId,
      firstName: firstName,
      lastName: lastName,
      displayName: displayName,
      campus: String(getValueByHeaders_(row, headerMap, ['campus']) || '').trim(),
      department: String(getValueByHeaders_(row, headerMap, ['department', 'cluster']) || '').trim(),
      email: String(getValueByHeaders_(row, headerMap, ['email', 'emailaddress', 'workemail']) || '').trim()
    });
  }

  const keys = Object.keys(buffer);
  for (let i = 0; i < keys.length; i += 100) {
    const slice = keys.slice(i, i + 100);
    const chunk = {};
    for (let j = 0; j < slice.length; j++) chunk[slice[j]] = buffer[slice[j]];
    cache.putAll(chunk, STAFF_CACHE_TTL_SECONDS);
  }

  cache.put(STAFF_CACHE_INDEX_KEY, 'ready', STAFF_CACHE_TTL_SECONDS);
  return { entries: keys.length };
}

/**
 * Forces the cache to drop everything. Called by onEdit so the next scan
 * sees a fresh map.
 */
function clearStaffCache_() {
  const cache = CacheService.getScriptCache();
  cache.remove(STAFF_CACHE_INDEX_KEY);
}

/**
 * Looks up the PD Day and Session Label for a given calendar date by scanning
 * the Sessions sheet. Cached briefly so repeat scans on the same day don't
 * each hit the sheet.
 *
 * Returns blank pdDay and sessionLabel when the date isn't listed; callers
 * can pass the result straight into a row write without null-checks.
 */
function getSessionForDate_(date) {
  const dateKey = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const cache = CacheService.getScriptCache();
  const cacheKey = SESSION_CACHE_PREFIX + dateKey;

  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (err) { /* fall through and rebuild */ }
  }

  const result = readSessionFromSheet_(dateKey);
  cache.put(cacheKey, JSON.stringify(result), SESSION_CACHE_TTL_SECONDS);
  return result;
}

function readSessionFromSheet_(dateKey) {
  const empty = { pdDay: '', sessionLabel: '' };
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Sessions');
    if (!sheet || sheet.getLastRow() < 2) return empty;

    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    const tz = Session.getScriptTimeZone();
    for (let i = 0; i < values.length; i++) {
      const rowDate = values[i][0];
      if (!rowDate) continue;
      const rowKey = rowDate instanceof Date
        ? Utilities.formatDate(rowDate, tz, 'yyyy-MM-dd')
        : String(rowDate).trim();
      if (rowKey === dateKey) {
        return {
          pdDay: String(values[i][1] || '').trim(),
          sessionLabel: String(values[i][2] || '').trim()
        };
      }
    }
  } catch (err) {
    logServerError('readSessionFromSheet_', err, { dateKey });
  }
  return empty;
}

function clearSessionCache_() {
  const cache = CacheService.getScriptCache();
  const tz = Session.getScriptTimeZone();
  const today = new Date();
  const keys = [];
  for (let offset = -1; offset <= 30; offset++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    keys.push(SESSION_CACHE_PREFIX + Utilities.formatDate(d, tz, 'yyyy-MM-dd'));
  }
  cache.removeAll(keys);
}

/**
 * Idempotently installs a time-driven trigger that calls warmStaffCache
 * every 5 minutes. Safe to run repeatedly.
 */
function installStaffCacheTrigger() {
  const ui = SpreadsheetApp.getUi();
  const existing = ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === STAFF_CACHE_TRIGGER_HANDLER);
  if (existing.length > 0) {
    ui.alert('Staff cache trigger is already installed.');
    return;
  }
  ScriptApp.newTrigger(STAFF_CACHE_TRIGGER_HANDLER).timeBased().everyMinutes(5).create();
  warmStaffCache();
  ui.alert('Staff cache trigger installed. Cache will refresh every 5 minutes.');
}

/**
 * Simple onEdit trigger: invalidates the staff cache whenever the Staff
 * sheet is changed so newly-added walk-in teachers become scannable on
 * their next scan attempt instead of waiting for the 5-minute refresh.
 */
function onEdit(e) {
  try {
    const sheetName = e && e.range ? e.range.getSheet().getName() : '';
    if (sheetName === 'Staff') {
      clearStaffCache_();
    }
    if (sheetName === 'Sessions') {
      clearSessionCache_();
    }
  } catch (err) {
    // simple triggers can't write to most services on failure; swallow.
  }
}

/**
 * Returns last-scan metadata for a staff ID with a single ScanLog read.
 * Used to combine the duplicate-scan check and the last-status check
 * that previously each issued their own read.
 */
function getLastScanInfo_(id) {
  const sheet = getSheet();
  const row = getLastRowForId(sheet, id);
  if (!row) return null;
  const values = sheet.getRange(row, 1, 1, 3).getValues()[0];
  const timestamp = values[0] instanceof Date ? values[0] : new Date(values[0]);
  return {
    rowNumber: row,
    timestamp: timestamp,
    status: values[2] || null
  };
}

function buildHeaderMap_(headers) {
  const map = {};
  for (let i = 0; i < headers.length; i++) {
    map[normalizeHeaderName_(headers[i])] = i;
  }
  return map;
}

function getValueByHeaders_(row, headerMap, headerCandidates) {
  for (let i = 0; i < headerCandidates.length; i++) {
    const index = headerMap[headerCandidates[i]];
    if (index !== undefined) return row[index];
  }
  return '';
}

function normalizeHeaderName_(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeScanId_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && value % 1 === 0) return String(value);
  return String(value).trim().replace(/[^a-zA-Z0-9-]/g, '');
}

function getRequestId_(e) {
  const provided = e?.parameter?.requestId;
  if (provided) return String(provided).trim();
  return Utilities.getUuid();
}

function logScanDiagnostic_(entry) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('ScanDiagnostics') || ss.insertSheet('ScanDiagnostics');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Timestamp',
        'Request ID',
        'Source',
        'Action',
        'Stage',
        'Outcome',
        'ID',
        'Station',
        'Message',
        'Staff Name',
        'User Agent',
        'Details'
      ]);
    }

    sheet.appendRow([
      formatTimestamp(new Date()),
      entry.requestId || '',
      entry.source || '',
      entry.action || '',
      entry.stage || '',
      entry.outcome || '',
      entry.id || '',
      entry.station || '',
      entry.message || '',
      entry.staffName || '',
      entry.userAgent || '',
      entry.details || ''
    ]);
  } catch (logErr) {
    console.error('Failed to write ScanDiagnostics: ' + (logErr && logErr.message ? logErr.message : String(logErr)));
  }
}

function buildRequestDetails_(e) {
  try {
    const parameter = e?.parameter || {};
    return JSON.stringify({
      hasPostData: !!e?.postData,
      contentLength: e?.postData?.length || '',
      parameters: Object.keys(parameter).sort()
    });
  } catch (err) {
    return '';
  }
}

function sendCheckInReceipt_(staff, id, status, station, requestId, userAgent) {
  if (!isCheckInReceiptEmailEnabled_()) {
    logScanDiagnostic_({
      requestId: requestId,
      source: 'server',
      action: 'sendCheckInReceipt',
      stage: 'email_skipped',
      outcome: 'skipped',
      id: id,
      station: station,
      message: 'Check-in receipt emails disabled in Settings',
      staffName: staff.displayName,
      userAgent: userAgent || ''
    });
    return;
  }

  if (!staff.email) {
    logScanDiagnostic_({
      requestId: requestId,
      source: 'server',
      action: 'sendCheckInReceipt',
      stage: 'email_missing',
      outcome: 'skipped',
      id: id,
      station: station,
      message: 'No email found for staff row',
      staffName: staff.displayName,
      userAgent: userAgent || ''
    });
    return;
  }

  const timestamp = formatTimestamp(new Date());
  const subject = getSettingValue_('Check-In Receipt Email Subject', 'PD Check-In Receipt');
  const body = [
    'Hello ' + (staff.firstName || staff.displayName) + ',',
    '',
    'Thank you for checking in for professional development.',
    '',
    'Please keep this email for your records.',
    '',
    'Check-in details:',
    'Name: ' + staff.displayName,
    'Status: ' + status,
    'Date/Time: ' + timestamp,
    'Station: ' + station,
    'Receipt ID: ' + requestId,
    '',
    'Thank you.'
  ].join('\n');

  try {
    MailApp.sendEmail({
      to: staff.email,
      subject: subject,
      body: body,
      name: 'PD System'
    });

    logScanDiagnostic_({
      requestId: requestId,
      source: 'server',
      action: 'sendCheckInReceipt',
      stage: 'email_sent',
      outcome: 'success',
      id: id,
      station: station,
      message: 'Check-in receipt email sent',
      staffName: staff.displayName,
      userAgent: userAgent || '',
      details: JSON.stringify({ to: staff.email })
    });
  } catch (err) {
    logScanDiagnostic_({
      requestId: requestId,
      source: 'server',
      action: 'sendCheckInReceipt',
      stage: 'email_error',
      outcome: 'error',
      id: id,
      station: station,
      message: err && err.message ? err.message : String(err),
      staffName: staff.displayName,
      userAgent: userAgent || '',
      details: err && err.stack ? err.stack : ''
    });
  }
}

function isCheckInReceiptEmailEnabled_() {
  const value = getSettingValue_('Send Check-In Receipt Emails', 'TRUE');
  return ['true', 'yes', '1', 'enabled', 'on'].indexOf(String(value).trim().toLowerCase()) >= 0;
}

/**
 * Load-test entry point. Routes a synthetic scan to TestScanLog and
 * deliberately skips the duplicate-scan window, sequence validation,
 * and email send so that we can hammer the deployment without
 * polluting production data.
 *
 * Caller must have already acquired the script lock in doPost.
 */
function handleLoadTestScan_(e, requestId, station) {
  const receivedAt = Date.now();
  const id = String(e?.parameter?.id || '').trim();
  const skipStaff = String(e?.parameter?.skipStaff || '').toLowerCase() === 'true';
  const userAgent = e?.parameter?.userAgent || '';
  const clientSentAt = Number(e?.parameter?.clientSentAt) || 0;

  if (!id) {
    return createJsonResponse(false, null, 'Missing ID', { requestId, mode: 'loadTest' });
  }

  if (!isValidStaffId(id)) {
    return createJsonResponse(false, null, 'Invalid ID format', { requestId, mode: 'loadTest' });
  }

  let staffName = '';
  if (!skipStaff) {
    const staff = getActiveStaffById_(id);
    if (staff) staffName = staff.displayName;
  }

  const completedAt = Date.now();
  const serverProcessingMs = completedAt - receivedAt;
  const transitMs = clientSentAt > 0 ? Math.max(0, receivedAt - clientSentAt) : '';

  logTestScan_({
    requestId: requestId,
    id: id,
    station: station,
    staffName: staffName,
    serverProcessingMs: serverProcessingMs,
    transitMs: transitMs,
    userAgent: userAgent
  });

  return createJsonResponse(true, 'TEST', 'Test scan recorded', {
    requestId: requestId,
    mode: 'loadTest',
    serverProcessingMs: serverProcessingMs,
    transitMs: transitMs
  });
}

function logTestScan_(entry) {
  try {
    const sheet = getOrCreateTestScanLogSheet_();
    sheet.appendRow([
      formatTimestamp(new Date()),
      entry.requestId || '',
      entry.id || '',
      entry.station || '',
      entry.staffName || '',
      entry.serverProcessingMs === '' ? '' : Number(entry.serverProcessingMs || 0),
      entry.transitMs === '' ? '' : Number(entry.transitMs || 0),
      entry.userAgent || ''
    ]);
  } catch (err) {
    logServerError('logTestScan_', err, { requestId: entry.requestId, id: entry.id });
  }
}

function getOrCreateTestScanLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_TEST_SCAN_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TEST_SCAN_LOG);
    const headers = [
      'Timestamp',
      'Request ID',
      'ID',
      'Station',
      'Staff Name',
      'Server Processing ms',
      'Transit ms',
      'User Agent'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#0B2340')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, headers.length, 160);
  }
  return sheet;
}

/**
 * Menu helper: shows the PD Day and Session Label that today's calendar date
 * maps to via the Sessions sheet. Useful for verifying session config the
 * morning of an event before scans start.
 */
function showTodaysSession() {
  const ui = SpreadsheetApp.getUi();
  const now = new Date();
  const todayPretty = Utilities.formatDate(now, Session.getScriptTimeZone(), 'EEEE, MMMM d, yyyy');
  const session = getSessionForDate_(now);

  if (!session.pdDay && !session.sessionLabel) {
    ui.alert(
      "Today's PD Session",
      todayPretty + '\n\nNot listed on the Sessions sheet.\n\n' +
        'Scans recorded today will leave the PD Day and Session columns blank. ' +
        'If today is meant to be a PD day, add a row on the Sessions sheet.',
      ui.ButtonSet.OK
    );
    return;
  }

  const lines = [
    todayPretty,
    '',
    'PD Day: ' + (session.pdDay || '(blank)'),
    'Session: ' + (session.sessionLabel || '(blank)')
  ];
  ui.alert("Today's PD Session", lines.join('\n'), ui.ButtonSet.OK);
}

/**
 * Menu helper: clears the TestScanLog sheet so the next test starts clean.
 */
function resetTestScanLog() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TEST_SCAN_LOG);
  if (!sheet) {
    ui.alert('TestScanLog does not exist yet. Nothing to clear.');
    return;
  }
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  ui.alert('TestScanLog cleared. Run your load test now.');
}

/**
 * Menu helper: prints a quick summary of the most recent test run.
 */
function showTestScanLogSummary() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TEST_SCAN_LOG);
  if (!sheet || sheet.getLastRow() < 2) {
    ui.alert('TestScanLog is empty. Run a load test first.');
    return;
  }

  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const latencies = values.map((r) => Number(r[5] || 0)).filter((n) => n > 0).sort((a, b) => a - b);

  const total = values.length;
  const stations = {};
  for (let i = 0; i < values.length; i++) {
    const station = String(values[i][3] || '').trim() || 'Unknown';
    stations[station] = (stations[station] || 0) + 1;
  }

  function pct(arr, p) {
    if (!arr.length) return 0;
    const idx = Math.min(arr.length - 1, Math.floor(arr.length * p));
    return arr[idx];
  }

  const stationLines = Object.keys(stations).sort().map((s) => '  ' + s + ': ' + stations[s]);
  const summary = [
    'TestScanLog Summary',
    '',
    'Total scans recorded: ' + total,
    'Server processing latency (ms):',
    '  p50: ' + pct(latencies, 0.5),
    '  p95: ' + pct(latencies, 0.95),
    '  p99: ' + pct(latencies, 0.99),
    '  max: ' + (latencies.length ? latencies[latencies.length - 1] : 0),
    '',
    'Scans by station:',
    stationLines.join('\n')
  ].join('\n');

  ui.alert(summary);
}

/**
 * Shows deployment URLs so you can paste the working one into Settings.
 */
function applyLunchSettingsMenu() {
  applyDefaultLunchSettings_(null, true);
}

function showWebAppUrlDiagnostics() {
  const serviceUrl = ScriptApp.getService().getUrl() || '(not deployed)';
  const effective = getWebAppBaseUrl_() || '(none)';
  const override = String(getSettingValue_(WEB_APP_URL_SETTING, '') || '').trim() || '(not set)';
  const testUrl = effective !== '(none)' ? buildStationUrl_('FrontOffice', 'Scan') : '';

  SpreadsheetApp.getUi().alert(
    'Web App URL diagnostics',
    'Automatic URL (ScriptApp.getService):\n' + serviceUrl + '\n\n' +
      'Settings → Web App URL:\n' + override + '\n\n' +
      'URL used for station links:\n' + effective + '\n\n' +
      (testUrl ? 'Sample link:\n' + testUrl + '\n\n' : '') +
      'If automatic links fail in the browser:\n' +
      '1. Open Deploy → Manage deployments → copy the Web app URL that works.\n' +
      '2. Paste it into Settings → Web App URL (must end with /exec).\n' +
      '3. Run Build Station URLs again.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}