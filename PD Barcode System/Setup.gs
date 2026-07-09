const SHEET_SCAN_LOG = 'ScanLog';
const SHEET_STAFF = 'Staff';
const SHEET_STUDENTS_LEGACY = 'Students';
const SHEET_STATIONS = 'Stations';
const SHEET_SETTINGS = 'Settings';
const SHEET_SCAN_DIAGNOSTICS = 'ScanDiagnostics';
const SHEET_SESSIONS = 'Sessions';
const SHEET_TODAYS_EMAILS = "Today's PD Emails";
const SHEET_PD_EMAIL_LOG = 'PdEmailLog';
const SHEET_MAIL_MERGE_GUIDE = 'Mail Merge Guide';
const SHEET_ROOM_CONFIG = 'RoomConfig';
const SHEET_DAY2_DEVICE_URLS_LEGACY = 'Day 2 Device URLs';

const SCAN_LOG_HEADERS = ['Timestamp', 'ID', 'Status', 'Station', 'PD Day', 'Session', 'Notes'];

const ROOM_CONFIG_HEADERS = [
  'Campus',
  'Room',
  'Session Name',
  'PD Date',
  'Start Time',
  'End Time',
  'Active',
  'Station Name',
  'Notes'
];

const TODAYS_EMAILS_HEADERS = [
  'Email',
  'First Name',
  'Last Name',
  'PD Day',
  'Session',
  'Date',
  'Check-In Time',
  'Subject',
  'Body',
  'Status'
];

const PD_EMAIL_LOG_HEADERS = [
  'Date',
  'Session',
  'Email',
  'Recipient Name',
  'Generated At',
  'Sent At',
  'Status'
];

/**
 * One-click setup for the full scanner workbook.
 */
function initializePdScannerSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  setupScanLogSheet_(ss);
  setupStaffSheet_(ss);
  setupStationsSheet_(ss);
  setupSettingsSheet_(ss);
  setupSessionsSheet_(ss);
  setupRoomConfigSheet_(ss);
  setupScanDiagnosticsSheet_(ss);
  setupTodaysEmailsSheet_(ss);
  setupPdEmailLogSheet_(ss);
  setupMailMergeGuideSheet_(ss);
  applyValidationRules_(ss);
  cleanupLegacyDay2Sheets_(ss);

  SpreadsheetApp.getUi().alert('PD Scanner setup complete.');
}

/**
 * Removes leftover artifacts from the abandoned Day 2 web-app routing
 * approach (a separate session-scan page on a dedicated URL). The new
 * approach uses the existing scanner page + room-as-station setup, so
 * the auto-generated "Day 2 Device URLs" tab is no longer needed.
 *
 * Safe to re-run; if the sheet has already been deleted, this is a no-op.
 */
function cleanupLegacyDay2Sheets_(ss) {
  const legacy = ss.getSheetByName(SHEET_DAY2_DEVICE_URLS_LEGACY);
  if (legacy) ss.deleteSheet(legacy);
}

/**
 * Creates/repairs the scan diagnostics tab used for troubleshooting.
 */
function setupScanDiagnosticsSheet_(ss) {
  const headers = [
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
  ];
  const sheet = getOrCreateSheet_(ss, SHEET_SCAN_DIAGNOSTICS);

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow_(sheet, headers.length);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, headers.length, 160);
  sheet.setColumnWidth(12, 360);
}

/**
 * One-click staff PD defaults:
 * - Initializes/repairs all required tabs
 * - Ensures staff-focused settings
 * - Refreshes Staff and Staff Barcodes from Teacher Numbers
 */
function applyStaffPdDefaults() {
  initializePdScannerSystem();
  ensureStaffPdSettings_();
  syncStaffFromTeacherNumbers(true);
  buildStaffBarcodes(true);
  ensureStaffCacheTrigger_();
  warmStaffCache();
  SpreadsheetApp.getUi().alert('Staff PD defaults applied. Cache primed; refresh trigger installed.');
}

function ensureStaffCacheTrigger_() {
  const existing = ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === STAFF_CACHE_TRIGGER_HANDLER);
  if (existing.length > 0) return;
  ScriptApp.newTrigger(STAFF_CACHE_TRIGGER_HANDLER).timeBased().everyMinutes(5).create();
}

/**
 * Creates/repairs the ScanLog tab.
 *
 * Idempotently migrates legacy 5-column layouts to the 7-column layout that
 * includes PD Day and Session columns between Station and Notes. Existing
 * historical scans keep their data; the two new columns are simply blank
 * for any rows recorded before the migration.
 */
function setupScanLogSheet_(ss) {
  const sheet = getOrCreateSheet_(ss, SHEET_SCAN_LOG);

  migrateScanLogToSessionLayout_(sheet);

  sheet.getRange(1, 1, 1, SCAN_LOG_HEADERS.length).setValues([SCAN_LOG_HEADERS]);
  formatHeaderRow_(sheet, SCAN_LOG_HEADERS.length);
  sheet.setFrozenRows(1);

  sheet.setColumnWidths(1, SCAN_LOG_HEADERS.length, 160);
  sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');

  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  if (sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), SCAN_LOG_HEADERS.length).createFilter();
  }
}

/**
 * Inserts PD Day and Session columns into a legacy 5-column ScanLog so that
 * historical scan data shifts from column E (Notes) to column G (Notes) and
 * the two new columns at E (PD Day) and F (Session) start blank.
 *
 * Detection rule: if column E header is already 'PD Day', the sheet is
 * already migrated and this is a no-op. Otherwise we insert two blank
 * columns after column 4 (Station) and let the caller rewrite headers.
 */
function migrateScanLogToSessionLayout_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 5) return;

  const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const colE = String(existingHeaders[4] || '').trim().toLowerCase();
  if (colE === 'pd day') return;

  sheet.insertColumnsAfter(4, 2);

  // insertColumnsAfter copies the data-validation rule from the column to
  // the left of the insertion point (Station, column D) into the new
  // columns. The new PD Day and Session columns are not stations, so
  // clear that inherited rule before applyValidationRules_ runs.
  sheet.getRange('E2:F').clearDataValidations();
}

/**
 * Creates/repairs the Staff tab.
 */
function setupStaffSheet_(ss) {
  const sheet = getOrCreateStaffSheet_(ss);

  ensureStaffHeaders_(sheet);
}

/**
 * Creates/repairs the Stations tab.
 *
 * Stations drive the dropdown shown in the scanner page's Admin overlay.
 * Day 1 stations are the standard check-in points (Cafeteria, Front Office,
 * Gym, etc.) with Entry Mode "Scan" (badge/USB). Day 2 session-room stations
 * use Entry Mode "ID" so teachers type their Staff ID at the room iPad.
 *
 * Day 2 station names use a consistent convention so the email digest can
 * join them back to RoomConfig and append the session name.
 *
 * Recommended Day 2 naming convention:
 *   "Room <ROOM> - <CAMPUS>"   e.g.  "Room 119B - CI North"
 *                                    "Large Conference Room - CI South"
 *
 * Any string that contains both the campus name and the room (as a
 * word-bounded match) from a RoomConfig row will be auto-linked when the
 * email digest renders the attendance log, so naming is forgiving as long
 * as both pieces appear somewhere in the station name.
 */
function setupStationsSheet_(ss) {
  const headers = ['Station Name', 'Enabled', 'Notes', 'Web App URL', 'Entry Mode'];
  const sheet = getOrCreateSheet_(ss, SHEET_STATIONS);

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow_(sheet, headers.length);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 4, 180);
  sheet.setColumnWidth(5, 100);

  ensureStationsEntryModeColumn_(sheet);

  if (sheet.getLastRow() === 1) {
    const starterStations = [
      ['FrontOffice', true, 'Day 1 main check-in â€” scan badge', '', 'Scan'],
      ['Cafeteria', true, 'Day 1 â€” scan badge', '', 'Scan'],
      ['Gym', true, 'Day 1 â€” scan badge', '', 'Scan']
    ];
    sheet.getRange(2, 1, starterStations.length, starterStations[0].length).setValues(starterStations);
  }

  applyStationsEntryModeValidation_(sheet);
}

/**
 * Adds Entry Mode column on older spreadsheets and defaults existing rows.
 */
function ensureStationsEntryModeColumn_(sheet) {
  if (!sheet) return;
  const header = String(sheet.getRange(1, 5).getValue() || '').trim();
  if (header !== 'Entry Mode') {
    sheet.getRange(1, 5).setValue('Entry Mode');
    sheet.getRange(1, 5).setFontWeight('bold').setBackground('#0B2340').setFontColor('#FFFFFF');
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const modes = sheet.getRange(2, 5, lastRow - 1, 1).getValues();
  let changed = false;
  for (let i = 0; i < modes.length; i++) {
    const name = String(sheet.getRange(i + 2, 1).getValue() || '').trim();
    if (!name) continue;
    const current = String(modes[i][0] || '').trim();
    if (current) continue;
    sheet.getRange(i + 2, 5).setValue(/^Room\s/i.test(name) ? 'ID' : 'Scan');
    changed = true;
  }
  if (changed) applyStationsEntryModeValidation_(sheet);
}

function applyStationsEntryModeValidation_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return;
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Scan', 'ID'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 5, Math.max(2, sheet.getLastRow() - 1), 1).setDataValidation(rule);
}

/**
 * Creates/repairs the Settings tab.
 */
function setupSettingsSheet_(ss) {
  const headers = ['Setting', 'Value', 'Notes'];
  const sheet = getOrCreateSheet_(ss, SHEET_SETTINGS);

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow_(sheet, headers.length);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 3, 260);

  const settings = [
    ['Duplicate Window Seconds', 5, 'Reject scans for same ID within this time'],
    ['ID Regex', '^[0-9]{5,12}$', 'Used by isValidStaffId()'],
    ['Admin PIN', '2468', 'Used for station switching on scanner page'],
    ['Default Station', 'Unknown', 'Used when station is missing from request'],
    ['Check-In Start', '8:00 AM', 'Start of the expected morning check-in window'],
    ['Check-In Cutoff', '9:00 AM', 'Check-ins after this time are recorded with a timing warning'],
    ['Lunch Out Start', '12:00 PM', 'Start of lunch window â€” clock out for lunch (front desk)'],
    ['Lunch In', '12:30 PM', 'End of lunch window â€” clock back in by this time'],
    ['Send Check-In Receipt Emails', 'TRUE', 'Send a receipt email on successful IN scans'],
    ['Check-In Receipt Email Subject', 'PD Check-In Receipt', 'Subject line for teacher check-in receipt emails'],
    ['Daily Email Subject', 'DISD CTE Professional Development Attendance Receipt', 'Subject line for the end-of-day PD attendance digest emails'],
    ['Daily Email Body Template', getDefaultDailyEmailBodyTemplate_(), 'Body of the end-of-day PD email. Supports placeholders: {{teacherName}} {{firstName}} {{lastName}} {{fullName}} {{teacherId}} {{pdDay}} {{session}} {{sessionName}} {{sessionDate}} {{date}} {{checkInTime}} {{checkOutTime}} {{roomVisitLog}} {{attendanceSummary}} {{attendanceLog}}'],
    ['Daily Email Trigger Hour', 17, 'Hour of day (24h, script time zone) when the daily email digest is generated. 17 = 5 PM.'],
    ['Summer PD Plan Spreadsheet ID', '', 'Optional. Google Sheet ID for Summer PD Plan. Leave blank when "Day 2 time slots" is in this spreadsheet.'],
    [
      'Web App URL',
      '',
      'Paste the working scanner /exec URL from Deploy â†’ Manage deployments (ends with /exec). Build Station URLs uses this instead of the automatic URL, which often fails with "unable to open the file".'
    ]
  ];
  upsertSettings_(sheet, settings);
  applyDefaultLunchSettings_(sheet, false);
  removeRetiredSettingsRows_(sheet, ['Lunch Out End', 'Lunch In Start', 'Lunch In End']);
  reseedStaleEmailTemplate_(sheet);
}

/**
 * Writes lunch window values on Settings (12:00 PM out, back in by 12:30 PM).
 * @param {boolean} showAlert When true, shows a confirmation (menu use).
 */
function applyDefaultLunchSettings_(sheet, showAlert) {
  const target = sheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS);
  if (!target) {
    if (showAlert) {
      SpreadsheetApp.getUi().alert('Settings sheet not found. Run Initialize / Repair System first.');
    }
    return;
  }

  const lunchRows = [
    ['Lunch Out Start', '12:00 PM', 'Start of lunch window â€” clock out for lunch (front desk)'],
    ['Lunch In', '12:30 PM', 'End of lunch window â€” clock back in by this time']
  ];
  forceUpsertSettings_(target, lunchRows);
  removeRetiredSettingsRows_(target, ['Lunch Out End', 'Lunch In Start', 'Lunch In End']);

  if (showAlert) {
    SpreadsheetApp.getUi().alert(
      'Lunch settings updated',
      'Lunch window: 12:00 PM â€“ 12:30 PM\n\n' +
        'Lunch Out Start: 12:00 PM\n' +
        'Lunch In: 12:30 PM\n\n' +
        'Lunch out and lunch in scans both work anytime in that window (e.g. out at 12:00, back at 12:15).',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

function forceUpsertSettings_(sheet, settings) {
  const lastRow = sheet.getLastRow();
  const existingValues = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 3).getValues() : [];
  const existingRowsByName = {};

  for (let i = 0; i < existingValues.length; i++) {
    const settingName = String(existingValues[i][0] || '').trim();
    if (settingName) existingRowsByName[settingName] = i + 2;
  }

  for (let i = 0; i < settings.length; i++) {
    const setting = settings[i];
    const rowNumber = existingRowsByName[setting[0]];
    if (rowNumber) {
      sheet.getRange(rowNumber, 2, 1, 2).setValues([[setting[1], setting[2]]]);
    } else {
      sheet.appendRow(setting);
    }
  }
}

/**
 * Drops setting rows that the system no longer recognizes. Keeps the
 * Settings tab tidy after an old setting is retired (e.g. the Day 2
 * web-app override that's been removed in favor of room-as-station).
 *
 * Safe to re-run; if the row is already gone, this is a no-op.
 */
function removeRetiredSettingsRows_(sheet, namesToRemove) {
  if (!sheet || sheet.getLastRow() < 2) return;
  if (!namesToRemove || namesToRemove.length === 0) return;

  const targets = {};
  for (let i = 0; i < namesToRemove.length; i++) targets[namesToRemove[i]] = true;

  for (let row = sheet.getLastRow(); row >= 2; row--) {
    const name = String(sheet.getRange(row, 1).getValue() || '').trim();
    if (targets[name]) sheet.deleteRow(row);
  }
}

/**
 * If the Daily Email Body Template is still the old placeholder seed
 * (which contained the literal "[PLACEHOLDER" marker), overwrite it with
 * the current default template. Lets us roll out wording improvements
 * without making admins delete the cell first.
 *
 * Customized templates are detected by the absence of the marker string
 * and are left untouched.
 */
function reseedStaleEmailTemplate_(settingsSheet) {
  const lastRow = settingsSheet.getLastRow();
  if (lastRow < 2) return;

  const values = settingsSheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() !== 'Daily Email Body Template') continue;
    const current = String(values[i][1] || '');
    const isStalePlaceholder = current.indexOf('[PLACEHOLDER') >= 0 || current.trim() === '';
    const isOldDefaultTemplate = current.indexOf('Attendance Log (each line includes room station') >= 0;
    if (isStalePlaceholder || isOldDefaultTemplate) {
      settingsSheet.getRange(i + 2, 2).setValue(getDefaultDailyEmailBodyTemplate_());
    }
    return;
  }
}

function getDefaultDailyEmailBodyTemplate_() {
  return [
    'Dear {{teacherName}} (ID: {{teacherId}}),',
    '',
    'The Dallas ISD Career and Technical Education (CTE) Department would like to sincerely thank you for attending our Professional Development session. We appreciate your time, engagement, and dedication to expanding opportunities for our students.',
    '',
    'This email serves as an official confirmation of your attendance. Please retain this message for your records.',
    '',
    'Below is a detailed receipt of your check-in and check-out activity for this PD day:',
    '',
    'Session Details:',
    '',
    'PD Day: {{sessionName}}',
    '',
    'Date: {{sessionDate}}',
    '',
    'Attendance:',
    'Checked in: {{checkInTime}}',
    'Checked out: {{checkOutTime}}',
    '',
    'Session room visits:',
    '{{roomVisitLog}}',
    '',
    'If you notice any discrepancies in your recorded times, or if you have any questions or comments, please do not hesitate to reach out to the CTE Department.',
    '',
    'Thank you again for your hard work and participation!',
    '',
    'Sincerely,',
    '',
    'The Dallas ISD CTE Department',
    'Dallas Independent School District'
  ].join('\n');
}

/**
 * Creates/repairs the Sessions tab that maps calendar dates to PD Day labels.
 *
 * Seeds the eight scheduled June 2026 sessions on first run but never
 * overwrites existing rows so that admins can edit dates without losing
 * their work. The Date column is formatted as a date so dropdown filters
 * group correctly.
 */
function setupSessionsSheet_(ss) {
  const headers = ['Date', 'PD Day', 'Session Label', 'Notes'];
  const sheet = getOrCreateSheet_(ss, SHEET_SESSIONS);

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow_(sheet, headers.length);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, headers.length, 200);
  sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd');

  if (sheet.getLastRow() <= 1) {
    const seed = [
      [new Date(2026, 5, 1), 'Day 1', 'Day 1 \u2013 June 1', ''],
      [new Date(2026, 5, 2), 'Day 2', 'Day 2 \u2013 June 2', ''],
      [new Date(2026, 5, 3), 'Day 1', 'Day 1 \u2013 June 3', ''],
      [new Date(2026, 5, 4), 'Day 2', 'Day 2 \u2013 June 4', ''],
      [new Date(2026, 5, 8), 'Day 1', 'Day 1 \u2013 June 8', ''],
      [new Date(2026, 5, 9), 'Day 2', 'Day 2 \u2013 June 9', ''],
      [new Date(2026, 5, 10), 'Day 1', 'Day 1 \u2013 June 10', ''],
      [new Date(2026, 5, 11), 'Day 2', 'Day 2 \u2013 June 11', '']
    ];
    sheet.getRange(2, 1, seed.length, seed[0].length).setValues(seed);
  }

  const pdDayRange = sheet.getRange('B2:B');
  const pdDayRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Day 1', 'Day 2'], true)
    .setAllowInvalid(true)
    .build();
  pdDayRange.setDataValidation(pdDayRule);
}

/**
 * Creates/repairs the RoomConfig tab.
 *
 * One row per Day-2 session slot (campus + room + session + date + times).
 * Populated via PD Scanner â†’ Sync Room Config from Summer PD Plan.
 * Station Name is used on the Stations sheet for iPad check-in URLs.
 */
function setupRoomConfigSheet_(ss) {
  const sheet = getOrCreateSheet_(ss, SHEET_ROOM_CONFIG);
  ensureRoomConfigHeaders_(sheet);
  applyRoomConfigCampusValidation_(sheet);

  const activeRange = sheet.getRange('G2:G');
  const activeRule = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .build();
  activeRange.setDataValidation(activeRule);
}

function applyRoomConfigCampusValidation_(sheet) {
  if (!sheet) return;
  const campusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(getCampusOptions_(), true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange('A2:A').setDataValidation(campusRule);
}

/**
 * Updates RoomConfig + Stations: CTE North/South â†’ CI North/South on campus
 * and station name columns. Run after correcting campus spelling on the sheet.
 */
function renameCampusNamesToCiMenu() {
  const result = renameCampusNamesToCi_();
  SpreadsheetApp.getUi().alert(
    'Campus names updated',
    'RoomConfig rows touched: ' + result.roomRows + '\n' +
      'Stations renamed: ' + result.stationsRenamed + '\n\n' +
      'Use Admin on iPads to match station names (e.g. Room 187 - CI North).\n' +
      'Re-run Build Stations from Room Config if any room stations are missing.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function renameCampusNamesToCi_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const replacements = [
    ['CTE North', CAMPUS_NORTH_LABEL],
    ['CTE South', CAMPUS_SOUTH_LABEL]
  ];
  let roomRows = 0;
  let stationsRenamed = 0;

  const roomSheet = ss.getSheetByName(SHEET_ROOM_CONFIG);
  if (roomSheet && roomSheet.getLastRow() >= 2) {
    const lastRow = roomSheet.getLastRow();
    const width = Math.max(ROOM_CONFIG_HEADERS.length, roomSheet.getLastColumn());
    const values = roomSheet.getRange(2, 1, lastRow - 1, width).getValues();
    for (let i = 0; i < values.length; i++) {
      let changed = false;
      for (let r = 0; r < replacements.length; r++) {
        const from = replacements[r][0];
        const to = replacements[r][1];
        if (String(values[i][0] || '').trim() === from) {
          values[i][0] = to;
          changed = true;
        }
        const stationCol = 7;
        if (values[i][stationCol]) {
          const before = String(values[i][stationCol]);
          const after = before.split(from).join(to);
          if (after !== before) {
            values[i][stationCol] = after;
            changed = true;
          }
        }
      }
      if (changed) roomRows++;
    }
    roomSheet.getRange(2, 1, values.length, width).setValues(values);
    applyRoomConfigCampusValidation_(roomSheet);
  }

  const stationsSheet = ss.getSheetByName(SHEET_STATIONS);
  if (stationsSheet && stationsSheet.getLastRow() >= 2) {
    const lastRow = stationsSheet.getLastRow();
    const names = stationsSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < names.length; i++) {
      let name = String(names[i][0] || '');
      for (let r = 0; r < replacements.length; r++) {
        name = name.split(replacements[r][0]).join(replacements[r][1]);
      }
      if (name !== String(names[i][0] || '')) {
        names[i][0] = name;
        stationsRenamed++;
      }
    }
    stationsSheet.getRange(2, 1, names.length, 1).setValues(names);
  }

  return { roomRows: roomRows, stationsRenamed: stationsRenamed };
}

function ensureRoomConfigHeaders_(sheet) {
  sheet.getRange(1, 1, 1, ROOM_CONFIG_HEADERS.length).setValues([ROOM_CONFIG_HEADERS]);
  formatHeaderRow_(sheet, ROOM_CONFIG_HEADERS.length);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 72);
  sheet.setColumnWidth(3, 280);
  sheet.setColumnWidth(4, 92);
  sheet.setColumnWidth(5, 88);
  sheet.setColumnWidth(6, 88);
  sheet.setColumnWidth(7, 56);
  sheet.setColumnWidth(8, 200);
  sheet.setColumnWidth(9, 240);
}

/**
 * Creates/repairs the daily PD email digest tab.
 *
 * This is the working set the script regenerates each time it gathers
 * end-of-day attendees. Status starts as 'Pending'; the user marks rows
 * 'Sent' after sending via Form Mule so the dedup logic knows to skip them
 * on later runs of the same session.
 */
function setupTodaysEmailsSheet_(ss) {
  const sheet = getOrCreateSheet_(ss, SHEET_TODAYS_EMAILS);

  sheet.getRange(1, 1, 1, TODAYS_EMAILS_HEADERS.length).setValues([TODAYS_EMAILS_HEADERS]);
  formatHeaderRow_(sheet, TODAYS_EMAILS_HEADERS.length);
  sheet.setFrozenRows(1);

  sheet.setColumnWidth(1, 220); // Email
  sheet.setColumnWidth(2, 140); // First Name
  sheet.setColumnWidth(3, 140); // Last Name
  sheet.setColumnWidth(4, 90);  // PD Day
  sheet.setColumnWidth(5, 200); // Session
  sheet.setColumnWidth(6, 120); // Date
  sheet.setColumnWidth(7, 120); // Check-In Time
  sheet.setColumnWidth(8, 320); // Subject
  sheet.setColumnWidth(9, 480); // Body
  sheet.setColumnWidth(10, 110); // Status

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pending', 'Sent', 'Already Sent', 'Skipped'], true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, 10, sheet.getMaxRows() - 1, 1).setDataValidation(statusRule);

  sheet.getRange('I2:I').setWrap(true);
  sheet.getRange('F:F').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('G:G').setNumberFormat('h:mm AM/PM');
}

/**
 * Creates/repairs the permanent audit log of who has been emailed for which
 * PD session. Used by the digest generator to skip recipients that already
 * have a 'Sent' row for today's session.
 */
function setupPdEmailLogSheet_(ss) {
  const sheet = getOrCreateSheet_(ss, SHEET_PD_EMAIL_LOG);

  sheet.getRange(1, 1, 1, PD_EMAIL_LOG_HEADERS.length).setValues([PD_EMAIL_LOG_HEADERS]);
  formatHeaderRow_(sheet, PD_EMAIL_LOG_HEADERS.length);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, PD_EMAIL_LOG_HEADERS.length, 160);
  sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('E:E').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange('F:F').setNumberFormat('yyyy-mm-dd hh:mm:ss');

  if (!sheet.getFilter() && sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), PD_EMAIL_LOG_HEADERS.length).createFilter();
  }
}

/**
 * Creates/repairs a static instructions tab explaining how to use the
 * Today's PD Emails sheet as a Word + Form Mule data source.
 *
 * Re-running rewrites the contents so corrections to the steps roll out
 * with a single Initialize / Repair System click.
 */
function setupMailMergeGuideSheet_(ss) {
  const sheet = getOrCreateSheet_(ss, SHEET_MAIL_MERGE_GUIDE);
  sheet.clear();
  sheet.clearFormats();

  const lines = [
    ['How to send the daily PD emails through Form Mule'],
    [''],
    ['Quick path (small group, just a few attendees):'],
    ['1. Open the "Today\u2019s PD Emails" sheet.'],
    ['2. For each Pending row, copy the Body cell and Email cell.'],
    ['3. Use Form Mule to send personalized emails from your account.'],
    ['4. Back in the spreadsheet, click PD Scanner \u2192 PD Emails \u2192 Mark All as Sent.'],
    [''],
    ['Power-user path (Word + Form Mule for larger groups):'],
    ['One-time setup of the Word template:'],
    ['1. Click PD Scanner \u2192 PD Emails \u2192 Generate Today\u2019s PD Emails (so the data sheet has rows).'],
    ['2. In the spreadsheet, click File \u2192 Download \u2192 Comma-separated values (.csv) and download the "Today\u2019s PD Emails" tab.'],
    ['3. Open Microsoft Word and create a new blank document.'],
    ['4. Mailings tab \u2192 Start Mail Merge \u2192 E-mail Messages.'],
    ['5. Mailings tab \u2192 Select Recipients \u2192 Use an Existing List \u2192 pick the CSV you downloaded.'],
    ['6. Type the email body in the Word document. Where you want personalization, click Insert Merge Field and pick the column (e.g., First Name, PD Day, Session, Check-In Time).'],
    ['7. (Optional) Click Preview Results to see what each recipient will get.'],
    ['8. Save the Word document somewhere safe (e.g., OneDrive). You will reuse it for every PD day.'],
    [''],
    ['Daily send (after one-time setup):'],
    ['1. Click PD Scanner \u2192 PD Emails \u2192 Generate Today\u2019s PD Emails (or wait for the 5 PM trigger if installed).'],
    ['2. Review the "Today\u2019s PD Emails" sheet \u2014 names, emails, body all correct?'],
    ['3. File \u2192 Download \u2192 .csv on the "Today\u2019s PD Emails" tab.'],
    ['4. Open the saved Word template. When prompted, point Word at the new CSV (or Mailings \u2192 Select Recipients \u2192 Use an Existing List \u2192 the new CSV).'],
    ['5. Mailings tab \u2192 Finish & Merge \u2192 Send E-mail Messages.'],
    ['6. In the dialog, set To: Email, Subject line: Subject (or your literal subject text), Mail format: Plain Text. Click OK.'],
    ['7. Form Mule sends the personalized emails from your account.'],
    ['8. Back in the spreadsheet, click PD Scanner \u2192 PD Emails \u2192 Mark All as Sent.'],
    [''],
    ['Notes:'],
    ['\u2022 Subject line is the same for every recipient. Either type it directly in the Word merge dialog or merge from the Subject column \u2014 either works.'],
    ['\u2022 The Body column already contains the full personalized text, so if you do not want to maintain a Word template at all, you can simply send each row\u2019s body manually.'],
    ['\u2022 If a recipient\u2019s email is missing in the Staff sheet, that row is skipped during generation \u2014 fix the Staff row, then click Generate Today\u2019s PD Emails again.']
  ];

  sheet.getRange(1, 1, lines.length, 1).setValues(lines);
  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  sheet.setColumnWidth(1, 720);
  sheet.getRange(1, 1, lines.length, 1).setWrap(true);
  sheet.setFrozenRows(1);
}

function upsertSettings_(sheet, settings) {
  const lastRow = sheet.getLastRow();
  const existingValues = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 3).getValues() : [];
  const existingRowsByName = {};

  for (let i = 0; i < existingValues.length; i++) {
    const settingName = String(existingValues[i][0] || '').trim();
    if (settingName) existingRowsByName[settingName] = i + 2;
  }

  for (let i = 0; i < settings.length; i++) {
    const setting = settings[i];
    const rowNumber = existingRowsByName[setting[0]];

    if (rowNumber) {
      const currentValue = sheet.getRange(rowNumber, 2).getValue();
      if (String(currentValue || '').trim() === '') {
        sheet.getRange(rowNumber, 2).setValue(setting[1]);
      }
      sheet.getRange(rowNumber, 3).setValue(setting[2]);
    } else {
      sheet.appendRow(setting);
    }
  }
}

function ensureStaffPdSettings_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = getOrCreateSheet_(ss, SHEET_SETTINGS);
  const lastRow = Math.max(2, settingsSheet.getLastRow());
  const values = settingsSheet.getRange(2, 1, lastRow - 1, 3).getValues();

  let foundRegex = false;
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === 'ID Regex') {
      foundRegex = true;
      if (!String(values[i][1]).trim()) {
        settingsSheet.getRange(i + 2, 2).setValue('^[0-9]{5,12}$');
      }
      settingsSheet.getRange(i + 2, 3).setValue('Staff ID pattern used by isValidStaffId()');
      break;
    }
  }

  if (!foundRegex) {
    settingsSheet.appendRow(['ID Regex', '^[0-9]{5,12}$', 'Staff ID pattern used by isValidStaffId()']);
  }

  const hasAdminPin = values.some((row) => String(row[0]).trim() === 'Admin PIN');
  if (!hasAdminPin) {
    settingsSheet.appendRow(['Admin PIN', '2468', 'Used for station switching on scanner page']);
  }
}

/**
 * Adds data validation for ScanLog columns:
 *   C: Status        -> dropdown of STATUS_FLOW values
 *   D: Station       -> dropdown sourced from the Stations sheet
 *   E: PD Day        -> dropdown of Day 1 / Day 2 (blanks allowed since
 *                       off-day scans intentionally leave this empty)
 *   F: Session       -> validation cleared (label is auto-populated and
 *                       has many distinct values across the schedule)
 *   G: Notes         -> free text, no validation
 *
 * Re-running this is also how we recover sheets where the 5-to-7 column
 * migration accidentally inherited the Station dropdown into columns E
 * and F.
 */
function applyValidationRules_(ss) {
  const scanLog = ss.getSheetByName(SHEET_SCAN_LOG);
  const stations = ss.getSheetByName(SHEET_STATIONS);
  if (!scanLog || !stations) return;

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_FLOW, true)
    .setAllowInvalid(false)
    .build();
  scanLog.getRange('C2:C').setDataValidation(statusRule);

  const stationLastRow = Math.max(2, stations.getLastRow());
  const stationRange = stations.getRange(2, 1, stationLastRow - 1, 1);
  const stationRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(stationRange, true)
    .setAllowInvalid(false)
    .build();
  scanLog.getRange('D2:D').setDataValidation(stationRule);

  const pdDayRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Day 1', 'Day 2'], true)
    .setAllowInvalid(true)
    .build();
  scanLog.getRange('E2:E').setDataValidation(pdDayRule);

  scanLog.getRange('F2:F').clearDataValidations();
}

/**
 * Seeds sample staff records for quick testing.
 */
function seedSampleStaff() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateStaffSheet_(ss);
  ensureStaffHeaders_(sheet);

  const sample = [
    ['100001', 'Test', 'Staff1', 'CTE', true, '100001', '100001'],
    ['100002', 'Test', 'Staff2', 'Counseling', true, '100002', '100002'],
    ['100003', 'Test', 'Staff3', 'Admin', true, '100003', '100003']
  ];
  sheet.getRange(2, 1, sample.length, sample[0].length).setValues(sample);
  SpreadsheetApp.getUi().alert('Sample staff added.');
}

/**
 * Backward-compatible alias.
 */
function seedSampleStudents() {
  seedSampleStaff();
}

/**
 * Refreshes Web App URL column on Stations. Returns { count, baseUrl } or null if no base URL.
 */
function buildStationUrlsCore_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stations = ss.getSheetByName(SHEET_STATIONS);
  if (!stations || stations.getLastRow() < 2) return { count: 0, baseUrl: '' };

  const webAppUrl = getWebAppBaseUrl_();
  if (!webAppUrl) return null;

  const lastRow = stations.getLastRow();
  const rows = stations.getRange(2, 1, lastRow - 1, 5).getValues();
  const urls = rows.map((row) => {
    const stationName = String(row[0] || '').trim();
    if (!stationName) return [''];
    return [buildStationUrl_(stationName, row[4] || '')];
  });

  stations.getRange(2, 4, urls.length, 1).setValues(urls);
  return { count: urls.length, baseUrl: webAppUrl };
}

/**
 * Writes station URLs using the current web app URL.
 */
function buildStationUrls() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stations = ss.getSheetByName(SHEET_STATIONS);
  if (!stations) {
    SpreadsheetApp.getUi().alert('Stations sheet not found. Run Initialize first.');
    return;
  }

  const result = buildStationUrlsCore_();
  if (!result) {
    SpreadsheetApp.getUi().alert(
      'Web app URL not set',
      'Deploy the scanner web app, then either:\n\n' +
        '1. Paste the working /exec URL into Settings â†’ "Web App URL", or\n' +
        '2. Run PD Scanner â†’ Diagnose Web App URL for instructions.\n\n' +
        'Then run Build Station URLs again.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  const usingOverride = String(getSettingValue_(WEB_APP_URL_SETTING, '') || '').trim();
  SpreadsheetApp.getUi().alert(
    'Station URLs generated',
    'Base URL used:\n' + result.baseUrl + '\n\n' +
      (usingOverride
        ? 'Using your Settings â†’ Web App URL override.'
        : 'Using automatic deployment URL. If links show "unable to open the file", paste your working /exec URL into Settings â†’ Web App URL and run this again.'),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Quick deployment readiness check for the live PD System spreadsheet.
 */
function runPdSystemCheck() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const checks = [];

  checks.push(buildCheckResult_('ScanLog sheet', !!ss.getSheetByName(SHEET_SCAN_LOG), 'Run Initialize / Repair System.'));
  checks.push(buildCheckResult_('Teacher Numbers sheet', !!getSheetByNameIgnoreCase_(ss, 'Teacher Numbers'), 'Add or import Teacher Numbers.'));
  checks.push(buildCheckResult_('Staff sheet has staff rows', hasDataRows_(ss.getSheetByName(SHEET_STAFF)), 'Run Sync Staff from Teacher Numbers.'));
  checks.push(buildCheckResult_('Staff Barcodes has rows', hasDataRows_(ss.getSheetByName('Staff Barcodes')), 'Run Build Staff Barcodes.'));
  checks.push(buildCheckResult_('Stations sheet has stations', hasDataRows_(ss.getSheetByName(SHEET_STATIONS)), 'Add station names and run Build Station URLs.'));
  checks.push(buildCheckResult_('Settings sheet', !!ss.getSheetByName(SHEET_SETTINGS), 'Run Initialize / Repair System.'));
  checks.push(buildCheckResult_('Sessions sheet has dates', hasDataRows_(ss.getSheetByName(SHEET_SESSIONS)), 'Run Initialize / Repair System and add PD session dates.'));
  checks.push(buildCheckResult_('RoomConfig sheet has rooms', hasDataRows_(ss.getSheetByName(SHEET_ROOM_CONFIG)), 'Run Initialize / Repair System; verify Day 2 rooms are listed.'));
  checks.push(buildCheckResult_("Today's PD Emails sheet", !!ss.getSheetByName(SHEET_TODAYS_EMAILS), 'Run Initialize / Repair System.'));
  checks.push(buildCheckResult_('PdEmailLog sheet', !!ss.getSheetByName(SHEET_PD_EMAIL_LOG), 'Run Initialize / Repair System.'));
  checks.push(buildCheckResult_('Mail Merge Guide sheet', !!ss.getSheetByName(SHEET_MAIL_MERGE_GUIDE), 'Run Initialize / Repair System.'));
  checks.push(buildCheckResult_('ScanDiagnostics sheet', !!ss.getSheetByName(SHEET_SCAN_DIAGNOSTICS), 'Run Initialize / Repair System.'));

  const webAppUrl = getWebAppBaseUrl_();
  const hasOverride = !!String(getSettingValue_(WEB_APP_URL_SETTING, '') || '').trim();
  checks.push(buildCheckResult_(
    'Web app URL available',
    !!webAppUrl,
    'Deploy the web app and set Settings â†’ Web App URL to your working /exec link.'
  ));
  checks.push(buildCheckResult_(
    'Web App URL override set (recommended)',
    hasOverride,
    'If station links fail, paste the working /exec URL into Settings â†’ Web App URL.'
  ));

  const message = checks.map((check) => {
    return (check.ok ? 'OK: ' : 'NEEDS ATTENTION: ') + check.label + (check.ok ? '' : '\n  ' + check.fix);
  }).join('\n\n');

  SpreadsheetApp.getUi().alert('PD System Check\n\n' + message);
}

function buildCheckResult_(label, ok, fix) {
  return {
    label: label,
    ok: ok,
    fix: fix
  };
}

function hasDataRows_(sheet) {
  return !!sheet && sheet.getLastRow() > 1;
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function getOrCreateStaffSheet_(ss) {
  const staffSheet = ss.getSheetByName(SHEET_STAFF);
  if (staffSheet) return staffSheet;

  const legacyStudents = ss.getSheetByName(SHEET_STUDENTS_LEGACY);
  if (legacyStudents) {
    legacyStudents.setName(SHEET_STAFF);
    return legacyStudents;
  }

  return ss.insertSheet(SHEET_STAFF);
}

function formatHeaderRow_(sheet, width) {
  sheet.getRange(1, 1, 1, width)
    .setFontWeight('bold')
    .setBackground('#1F4E78')
    .setFontColor('#FFFFFF');
}

