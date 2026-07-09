const SHEET_CT_EXTRACT = 'CTExtract';
const SHEET_TEACHER_NUMBERS = 'Teacher Numbers';
const SHEET_STAFF_BARCODES = 'Staff Barcodes';

const STAFF_HEADERS = [
  'Staff ID',
  'Last Name',
  'First Name',
  'Department',
  'Active',
  'Teacher Number',
  'Barcode Value',
  'Campus',
  'Room',
  'Cluster',
  'Email'
];

const BARCODE_HEADERS = [
  'Staff ID',
  'Last Name',
  'First Name',
  'Department',
  'Barcode Value',
  'Barcode Text',
  'Barcode Image'
];

/**
 * Rebuilds Staff from the Teacher Numbers sheet.
 *
 * Teacher Number becomes the Staff ID because that is what the scanner
 * validates/logs and what barcode generation should encode.
 */
function syncStaffFromTeacherNumbers(silent) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const teacherNumbersSheet = getSheetByNameIgnoreCase_(ss, SHEET_TEACHER_NUMBERS);

  if (!teacherNumbersSheet) {
    SpreadsheetApp.getUi().alert('Teacher Numbers sheet not found.');
    return;
  }

  const teacherRows = readSheetObjects_(teacherNumbersSheet);
  const recordsByTeacherNumber = {};

  for (let i = 0; i < teacherRows.length; i++) {
    const teacherRecord = buildPersonRecord_(teacherRows[i]);
    const teacherNumber = teacherRecord.teacherNumber;
    if (!teacherNumber || recordsByTeacherNumber[teacherNumber]) continue;

    recordsByTeacherNumber[teacherNumber] = [
      teacherNumber,
      teacherRecord.lastName,
      teacherRecord.firstName,
      teacherRecord.department,
      true,
      teacherNumber,
      teacherNumber,
      teacherRecord.campus,
      teacherRecord.room,
      teacherRecord.cluster,
      teacherRecord.email
    ];
  }

  const staffRows = Object.keys(recordsByTeacherNumber)
    .sort()
    .map((teacherNumber) => recordsByTeacherNumber[teacherNumber]);

  writeStaffRows_(ss, staffRows);

  if (silent) return;

  SpreadsheetApp.getUi().alert(
    'Staff sync complete.\n\n' +
    'Staff rows written: ' + staffRows.length + '\n' +
    'Run "Build Staff Barcodes" next.'
  );
}

/**
 * Backward-compatible menu/function name from the earlier CTExtract workflow.
 */
function syncStaffFromCtExtractAndTeacherNumbers() {
  syncStaffFromTeacherNumbers();
}

/**
 * Creates a print-friendly barcode sheet from Staff.
 */
function buildStaffBarcodes(silent) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const staffSheet = getOrCreateStaffSheet_(ss);
  ensureStaffHeaders_(staffSheet);

  if (staffSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('No staff rows found. Run Sync Staff first.');
    return;
  }

  const staffValues = staffSheet.getRange(1, 1, staffSheet.getLastRow(), staffSheet.getLastColumn()).getValues();
  const headerMap = getHeaderMap_(staffValues[0]);
  const barcodeRows = [];

  for (let i = 1; i < staffValues.length; i++) {
    const row = staffValues[i];
    const activeValue = getRowValue_(row, headerMap, ['active']);
    const isActive = activeValue === '' || activeValue === true || String(activeValue).toLowerCase() === 'true' || String(activeValue) === '1' || String(activeValue).toLowerCase() === 'yes';

    if (!isActive) continue;

    const staffId = normalizeId_(getRowValue_(row, headerMap, ['staffid', 'teachernumber', 'barcodevalue']));
    if (!staffId) continue;

    const lastName = String(getRowValue_(row, headerMap, ['lastname']) || '').trim();
    const firstName = String(getRowValue_(row, headerMap, ['firstname']) || '').trim();
    const department = String(getRowValue_(row, headerMap, ['department']) || '').trim();

    barcodeRows.push([
      staffId,
      lastName,
      firstName,
      department,
      staffId,
      '*' + staffId + '*',
      ''
    ]);
  }

  const barcodeSheet = getOrCreateSheet_(ss, SHEET_STAFF_BARCODES);
  barcodeSheet.clear();
  barcodeSheet.getRange(1, 1, 1, BARCODE_HEADERS.length).setValues([BARCODE_HEADERS]);
  formatHeaderRow_(barcodeSheet, BARCODE_HEADERS.length);
  barcodeSheet.setFrozenRows(1);

  if (barcodeRows.length > 0) {
    barcodeSheet.getRange(2, 1, barcodeRows.length, BARCODE_HEADERS.length).setValues(barcodeRows);

    const imageFormulas = [];
    for (let i = 0; i < barcodeRows.length; i++) {
      const rowNumber = i + 2;
      imageFormulas.push(['=IMAGE("https://bwipjs-api.metafloor.com/?bcid=code128&text=" & ENCODEURL(E' + rowNumber + ') & "&scale=3&height=12&includetext")']);
    }
    barcodeSheet.getRange(2, 7, imageFormulas.length, 1).setFormulas(imageFormulas);
    barcodeSheet.getRange(2, 6, barcodeRows.length, 1).setFontFamily('Libre Barcode 39').setFontSize(36);
    barcodeSheet.setRowHeights(2, barcodeRows.length, 70);
  }

  barcodeSheet.setColumnWidths(1, 5, 140);
  barcodeSheet.setColumnWidth(6, 220);
  barcodeSheet.setColumnWidth(7, 320);

  if (!silent) {
    SpreadsheetApp.getUi().alert('Staff barcodes built: ' + barcodeRows.length);
  }
}

function writeStaffRows_(ss, staffRows) {
  const staffSheet = getOrCreateStaffSheet_(ss);
  ensureStaffHeaders_(staffSheet);

  const lastRow = staffSheet.getLastRow();
  if (lastRow > 1) {
    staffSheet.getRange(2, 1, lastRow - 1, STAFF_HEADERS.length).clearContent();
  }

  if (staffRows.length > 0) {
    staffSheet.getRange(2, 1, staffRows.length, STAFF_HEADERS.length).setValues(staffRows);
  }
}

function ensureStaffHeaders_(sheet) {
  sheet.getRange(1, 1, 1, STAFF_HEADERS.length).setValues([STAFF_HEADERS]);
  formatHeaderRow_(sheet, STAFF_HEADERS.length);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, STAFF_HEADERS.length, 140);
}

function readSheetObjects_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = values[0].map((header, index) => {
    const headerText = String(header || '').trim();
    if (headerText) return headerText;
    return index === 0 ? 'Teacher Number' : '';
  });
  const rows = [];

  for (let i = 1; i < values.length; i++) {
    if (values[i].every((cell) => String(cell || '').trim() === '')) continue;

    const record = {};
    for (let j = 0; j < headers.length; j++) {
      if (!headers[j]) continue;
      record[headers[j]] = values[i][j];
    }
    rows.push(record);
  }

  return rows;
}

function buildTeacherNumberLookup_(teacherRows) {
  const lookup = {};

  for (let i = 0; i < teacherRows.length; i++) {
    const record = buildPersonRecord_(teacherRows[i]);
    if (!record.teacherNumber) continue;

    const keys = buildPersonKeys_(record);
    for (let j = 0; j < keys.length; j++) {
      lookup[keys[j]] = record.teacherNumber;
    }
  }

  return lookup;
}

function lookupTeacherNumber_(lookup, record) {
  const keys = buildPersonKeys_(record);
  for (let i = 0; i < keys.length; i++) {
    if (lookup[keys[i]]) return lookup[keys[i]];
  }
  return '';
}

function buildPersonRecord_(rowObject) {
  const headerMap = getObjectHeaderMap_(rowObject);
  const fullName = String(getObjectValue_(rowObject, headerMap, ['name', 'teachername', 'employeename', 'staffname']) || '').trim();
  const splitName = splitFullName_(fullName);
  const campus = String(getObjectValue_(rowObject, headerMap, ['campus', 'site', 'school']) || '').trim();
  const cluster = String(getObjectValue_(rowObject, headerMap, ['cluster', 'department', 'dept', 'program']) || '').trim();

  return {
    teacherNumber: normalizeId_(getObjectValue_(rowObject, headerMap, ['teachernumber', 'teacherno', 'teacherid', 'staffid', 'employeeid', 'id', 'badgeid', 'badgenumber', 'barcode', 'barcodevalue'])),
    firstName: String(getObjectValue_(rowObject, headerMap, ['firstname', 'givenname', 'teacherfirstname']) || splitName.firstName || '').trim(),
    lastName: String(getObjectValue_(rowObject, headerMap, ['lastname', 'surname', 'teacherlastname']) || splitName.lastName || '').trim(),
    email: String(getObjectValue_(rowObject, headerMap, ['email', 'emailaddress', 'workemail']) || '').trim().toLowerCase(),
    department: cluster || campus,
    campus: campus,
    room: normalizeRoom_(getObjectValue_(rowObject, headerMap, ['room', 'roomnumber', 'classroom'])),
    cluster: cluster
  };
}

function buildPersonKeys_(record) {
  const keys = [];
  if (record.email) keys.push('email:' + record.email);

  const firstName = normalizeNamePart_(record.firstName);
  const lastName = normalizeNamePart_(record.lastName);
  if (firstName && lastName) {
    keys.push('name:' + lastName + '|' + firstName);
    keys.push('name:' + firstName + '|' + lastName);
  }

  return keys;
}

function getObjectHeaderMap_(rowObject) {
  const map = {};
  const headers = Object.keys(rowObject);
  for (let i = 0; i < headers.length; i++) {
    map[normalizeHeader_(headers[i])] = headers[i];
  }
  return map;
}

function getObjectValue_(rowObject, headerMap, normalizedCandidates) {
  for (let i = 0; i < normalizedCandidates.length; i++) {
    const actualHeader = headerMap[normalizedCandidates[i]];
    if (actualHeader && rowObject[actualHeader] !== undefined && rowObject[actualHeader] !== null) {
      return rowObject[actualHeader];
    }
  }
  return '';
}

function getHeaderMap_(headers) {
  const map = {};
  for (let i = 0; i < headers.length; i++) {
    map[normalizeHeader_(headers[i])] = i;
  }
  return map;
}

function getRowValue_(row, headerMap, normalizedCandidates) {
  for (let i = 0; i < normalizedCandidates.length; i++) {
    const index = headerMap[normalizedCandidates[i]];
    if (index !== undefined) return row[index];
  }
  return '';
}

function splitFullName_(fullName) {
  if (!fullName) return { firstName: '', lastName: '' };

  if (fullName.indexOf(',') >= 0) {
    const parts = fullName.split(',');
    return {
      firstName: String(parts[1] || '').trim(),
      lastName: String(parts[0] || '').trim()
    };
  }

  const parts = fullName.split(/\s+/);
  return {
    firstName: parts.length > 0 ? parts[0] : '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : ''
  };
}

function normalizeHeader_(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeNamePart_(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
}

function normalizeId_(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9-]/g, '');
}

function normalizeRoom_(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return text.replace(/\.0$/, '');
}

function getSheetByNameIgnoreCase_(ss, sheetName) {
  const normalizedSheetName = String(sheetName || '').trim().toLowerCase();
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().trim().toLowerCase() === normalizedSheetName) {
      return sheets[i];
    }
  }
  return null;
}
