/**
 * Summer PD "Thank You / Survey" email campaign.
 *
 * Kept completely separate from the daily attendance-receipt workflow:
 *   - Its own sheet ("Summer PD Thank You Emails")
 *   - Its own subject + body (does NOT touch Daily Email Subject / Template)
 *   - Its own generator menu item
 *
 * Same human-in-the-loop pattern as the daily emails: this only builds a
 * review sheet. Nothing is sent from Apps Script â€” you send via Form Mule
 * (Form Mule) after reviewing the rows.
 *
 * Recipients are every unique teacher with at least one scan anywhere in
 * ScanLog (all PD days), joined to the Staff record for name + email.
 */

const SHEET_THANK_YOU_EMAILS = 'Summer PD Thank You Emails';

const THANK_YOU_EMAILS_HEADERS = [
  'Email', 'First Name', 'Last Name', 'Subject', 'Body', 'Status', 'Generated At'
];

const THANK_YOU_EMAIL_SUBJECT = 'A Huge Thank You To Our Incredible CTE Family!';

/**
 * The thank-you / survey body. Generic greeting ("Hello CTE Family") so the
 * same text goes to everyone â€” no per-teacher merge fields required.
 */
function getThankYouEmailBody_() {
  return [
    'Hello CTE Family,',
    '',
    'We wanted to take a moment to send a heartfelt thank you to everyone who registered for and attended our recent summer Professional Development sessions. We know how precious your summer break is, and we are incredibly grateful for the amazing energy, collaboration, and dedication you brought to each session. You all are truly what makes Dallas ISD CTE so special!',
    '',
    'As we wrap up our summer PD sessions and look ahead to an amazing new school year, we have two quick favors to ask to help us keep supporting you and our students.',
    '',
    '1. Let Us Know How We Did (PD Feedback Survey)',
    'Your voice matters to us! If you haven\'t had a chance yet, please share your thoughts on the sessions you attended. We use your feedback to make sure our future trainings are as valuable, relevant, and engaging as possible.  [YOUR_PD_FEEDBACK_SURVEY_URL]',
    '',
    '2. Help Us Shape Next Year (Annual CTE Teacher Survey)',
    'If you haven\'t completed the annual teacher survey yet, please take a few minutes to fill it out. This survey is a strict Perkins requirement that we must submit every year, but more importantly, it serves as our benchmark to make meaningful program improvements and secure essential funding for your classrooms.  [YOUR_ANNUAL_TEACHER_SURVEY_URL]',
    '',
    'Thank you again for everything you do to create incredible pathways for our students. We appreciate you more than words can say! Enjoy the rest of your well-deserved summer break.',
    '',
    'Warmly,',
    'The Dallas ISD CTE Department',
    'Dallas Independent School District'
  ].join('\n');
}

/**
 * Menu entry point. Shows a popup listing who would receive the thank-you
 * email (without writing any rows), then navigates to the sheet so the
 * admin can review it. Creates the sheet with headers if it doesn't exist yet.
 */
function previewSummerPdThankYouEmailRecipients() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  setupThankYouEmailsSheet_(ss);

  const attendees = collectAllPdAttendees_();

  if (attendees.length === 0) {
    ui.alert(
      'Preview: Summer PD Thank You Emails',
      'No attendees found in ScanLog yet. No emails would be generated.',
      ui.ButtonSet.OK
    );
    return;
  }

  const seenEmails = {};
  const lines = [];
  let missingEmail = 0;
  let willEmail = 0;

  for (let i = 0; i < attendees.length; i++) {
    const staff = attendees[i].staff;
    if (!staff || !staff.email) {
      missingEmail++;
      lines.push('  ' + (staff ? staff.displayName : '(unknown ID ' + attendees[i].id + ')') +
                 '  \u2014 (no email on Staff record, will be skipped)');
      continue;
    }
    const emailKey = staff.email.toLowerCase();
    if (seenEmails[emailKey]) continue;
    seenEmails[emailKey] = true;
    willEmail++;
    lines.push('  ' + staff.displayName + '  <' + staff.email + '>');
  }

  const summary = [
    'Subject: ' + THANK_YOU_EMAIL_SUBJECT,
    '',
    'Unique teachers with scans (all PD days): ' + attendees.length,
    'Will be emailed: ' + willEmail,
    'Will be skipped (no email on Staff record): ' + missingEmail,
    '',
    'Recipients:'
  ].join('\n') + '\n' + lines.join('\n');

  // Navigate to the sheet so the admin can see it
  const sheet = ss.getSheetByName(SHEET_THANK_YOU_EMAILS);
  if (sheet) ss.setActiveSheet(sheet);

  ui.alert('Preview: Summer PD Thank You Emails', summary, ui.ButtonSet.OK);
}

/**
 * Menu entry point. Rebuilds the "Summer PD Thank You Emails" sheet with one
 * row per unique attended teacher, ready for Form Mule. Safe to re-run â€” it
 * regenerates the rows from the current ScanLog + Staff each time.
 */
function generateSummerPdThankYouEmails() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheet = setupThankYouEmailsSheet_(ss);
  const attendees = collectAllPdAttendees_();

  if (attendees.length === 0) {
    ui.alert(
      'Summer PD Thank You Emails',
      'No attendees found in ScanLog yet. Nothing to generate.',
      ui.ButtonSet.OK
    );
    return;
  }

  const subject = THANK_YOU_EMAIL_SUBJECT;
  const body = getThankYouEmailBody_();
  const now = new Date();

  const seenEmails = {};
  const rows = [];
  let missingEmail = 0;
  let duplicates = 0;

  for (let i = 0; i < attendees.length; i++) {
    const staff = attendees[i].staff;
    if (!staff || !staff.email) {
      missingEmail++;
      continue;
    }
    const emailKey = staff.email.toLowerCase();
    if (seenEmails[emailKey]) {
      duplicates++;
      continue;
    }
    seenEmails[emailKey] = true;

    rows.push([
      staff.email,
      staff.firstName || '',
      staff.lastName || '',
      subject,
      body,
      'Pending',
      now
    ]);
  }

  // Clear any prior data rows, then write the fresh list.
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, THANK_YOU_EMAILS_HEADERS.length).clearContent();
  }
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, THANK_YOU_EMAILS_HEADERS.length).setValues(rows);
  }

  ss.setActiveSheet(sheet);

  const lines = [
    'Sheet: ' + SHEET_THANK_YOU_EMAILS,
    '',
    'Unique teachers with scans: ' + attendees.length,
    'Rows ready to email (Pending): ' + rows.length,
    'Skipped (no email on Staff record): ' + missingEmail,
    'Skipped (duplicate email): ' + duplicates,
    '',
    'Review the rows, then send with Form Mule against this tab.'
  ];
  ui.alert('Summer PD Thank You Emails', lines.join('\n'), ui.ButtonSet.OK);
}

/**
 * Every unique staff ID with at least one scan anywhere in ScanLog (all
 * dates), resolved to its Staff record. IDs with no Staff record are skipped.
 */
function collectAllPdAttendees_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scanLog = ss.getSheetByName(SHEET_SCAN_LOG);
  if (!scanLog || scanLog.getLastRow() < 2) return [];

  const lastRow = scanLog.getLastRow();
  const values = scanLog.getRange(2, 1, lastRow - 1, 2).getValues();
  const seenIds = {};

  for (let i = 0; i < values.length; i++) {
    const id = String(values[i][1] || '').trim();
    if (id) seenIds[id] = true;
  }

  const ids = Object.keys(seenIds);
  const attendees = [];
  for (let i = 0; i < ids.length; i++) {
    const staff = getActiveStaffById_(ids[i]);
    if (!staff) continue;
    attendees.push({ id: ids[i], staff: staff });
  }
  return attendees;
}

/**
 * Creates/repairs the "Summer PD Thank You Emails" tab (headers, formatting,
 * Status dropdown). Returns the sheet.
 */
function setupThankYouEmailsSheet_(ss) {
  const sheet = getOrCreateSheet_(ss, SHEET_THANK_YOU_EMAILS);

  sheet.getRange(1, 1, 1, THANK_YOU_EMAILS_HEADERS.length).setValues([THANK_YOU_EMAILS_HEADERS]);
  formatHeaderRow_(sheet, THANK_YOU_EMAILS_HEADERS.length);
  sheet.setFrozenRows(1);

  sheet.setColumnWidth(1, 240); // Email
  sheet.setColumnWidth(2, 130); // First Name
  sheet.setColumnWidth(3, 130); // Last Name
  sheet.setColumnWidth(4, 300); // Subject
  sheet.setColumnWidth(5, 520); // Body
  sheet.setColumnWidth(6, 90);  // Status
  sheet.setColumnWidth(7, 170); // Generated At

  sheet.getRange('E2:E').setWrap(true);
  sheet.getRange('G:G').setNumberFormat('yyyy-mm-dd hh:mm:ss');

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pending', 'Sent', 'Skipped'], true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, 6, sheet.getMaxRows() - 1, 1).setDataValidation(statusRule);

  return sheet;
}

