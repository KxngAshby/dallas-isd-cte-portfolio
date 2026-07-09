/**
 * CTE Survey Dashboard — Apps Script server.
 * Serves the dashboard and persists manual issue-resolution marks to a Google Sheet
 * so they are shared across everyone who opens the link.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('CTE Survey Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

var RES_HEADER = ['Timestamp', 'TeacherId', 'IssueKey', 'IssueLabel', 'Campus', 'Notes', 'ResolvedBy'];

/** Returns the Resolutions sheet, creating the backing spreadsheet on first use. */
function getResSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('RES_SHEET_ID');
  var ss;
  if (id) {
    try {
      ss = SpreadsheetApp.openById(id);
    } catch (e) {
      ss = null;
    }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('CTE Dashboard — Issue Resolutions');
    props.setProperty('RES_SHEET_ID', ss.getId());
  }
  var sheet = ss.getSheetByName('Resolutions');
  if (!sheet) {
    sheet = ss.getActiveSheet();
    sheet.setName('Resolutions');
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(RES_HEADER);
  }
  return sheet;
}

/** Returns all resolutions as an array of plain objects. */
function getResolutions() {
  var sheet = getResSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, RES_HEADER.length).getValues();
  var out = [];
  values.forEach(function (row) {
    if (row[1] === '' && row[2] === '') return;
    out.push({
      timestamp: row[0],
      teacherId: String(row[1]),
      issueKey: String(row[2]),
      issueLabel: row[3],
      campus: row[4],
      notes: row[5],
      resolvedBy: row[6]
    });
  });
  return out;
}

/** Finds the 1-based row index of a teacherId+issueKey pair, or -1. */
function findResRow_(sheet, teacherId, issueKey) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var values = sheet.getRange(2, 2, last - 1, 2).getValues(); // TeacherId, IssueKey
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(teacherId) && String(values[i][1]) === String(issueKey)) {
      return i + 2;
    }
  }
  return -1;
}

/** Adds or updates a resolution. `record` = {teacherId, issueKey, issueLabel, campus, notes, resolvedBy, timestamp} */
function markResolved(record) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = getResSheet_();
    var row = [
      record.timestamp || new Date().toISOString(),
      String(record.teacherId),
      String(record.issueKey),
      record.issueLabel || '',
      record.campus || '',
      record.notes || '',
      record.resolvedBy || ''
    ];
    var existing = findResRow_(sheet, record.teacherId, record.issueKey);
    if (existing > 0) {
      sheet.getRange(existing, 1, 1, RES_HEADER.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
    return true;
  } finally {
    lock.releaseLock();
  }
}

/** Removes a resolution for a teacherId+issueKey pair. */
function unmarkResolved(teacherId, issueKey) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = getResSheet_();
    var row = findResRow_(sheet, teacherId, issueKey);
    if (row > 0) sheet.deleteRow(row);
    return true;
  } finally {
    lock.releaseLock();
  }
}
