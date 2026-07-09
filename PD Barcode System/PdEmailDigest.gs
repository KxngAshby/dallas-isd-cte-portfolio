const PD_EMAIL_TRIGGER_HANDLER = 'generatePdEmailDigestForTrigger';
const PD_EMAIL_DEFAULT_TRIGGER_HOUR = 17;
/** Room scans this many minutes before session start still credit that class. */
const SESSION_EARLY_BUFFER_MINUTES = 5;

/**
 * Time-driven trigger entry point. Wraps generatePdEmailDigest_ in a try/catch
 * so a failed run doesn't get retried infinitely; errors are logged to the
 * server log for inspection.
 */
function generatePdEmailDigestForTrigger() {
  try {
    const result = generatePdEmailDigest_({ source: 'trigger' });
    console.log('[PdEmailDigest] trigger run: ' + JSON.stringify(result));
  } catch (err) {
    logServerError('generatePdEmailDigestForTrigger', err, {});
  }
}

/**
 * Menu entry point. Same as the trigger but surfaces a UI summary and
 * jumps to the "Today's PD Emails" sheet so the admin can review.
 */
function generateTodaysPdEmails() {
  const ui = SpreadsheetApp.getUi();
  const result = generatePdEmailDigest_({ source: 'menu' });

  if (!result.ok) {
    ui.alert("Today's PD Emails", result.message, ui.ButtonSet.OK);
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TODAYS_EMAILS);
  if (sheet) ss.setActiveSheet(sheet);

  const lines = [
    'Generated for: ' + result.session.sessionLabel + ' (' + result.dateLabel + ')',
    '',
    'Attendees scanned today: ' + result.uniqueAttendees,
    'New rows added (Pending): ' + result.added,
    'Existing rows refreshed with latest attendance log: ' + (result.refreshed || 0),
    'Skipped (already marked Sent earlier today): ' + result.alreadyProcessed,
    'Skipped (no email on Staff record): ' + result.missingEmail
  ];
  ui.alert("Today's PD Emails", lines.join('\n'), ui.ButtonSet.OK);
}

/**
 * Menu entry point: opens a popup listing today's would-be recipients
 * without writing anything to any sheet. Useful for sanity-checking
 * before generation.
 */
function previewTodaysPdEmailRecipients() {
  const ui = SpreadsheetApp.getUi();
  const session = getSessionForDate_(new Date());

  if (!session.pdDay && !session.sessionLabel) {
    ui.alert(
      "Preview Today's Recipients",
      'Today is not listed on the Sessions sheet. No emails would be generated.',
      ui.ButtonSet.OK
    );
    return;
  }

  const attendees = collectTodaysAttendees_();
  if (attendees.length === 0) {
    ui.alert(
      "Preview Today's Recipients",
      session.sessionLabel + '\n\nNo scans recorded for today yet. No emails would be generated.',
      ui.ButtonSet.OK
    );
    return;
  }

  const lines = [];
  let missingEmail = 0;
  for (let i = 0; i < attendees.length; i++) {
    const a = attendees[i];
    const staff = a.staff;
    if (!staff) {
      lines.push('  (unknown staff for ID ' + a.id + ')');
      continue;
    }
    if (!staff.email) {
      missingEmail++;
      lines.push('  ' + staff.displayName + '  \u2014 (no email on Staff record, will be skipped)');
      continue;
    }
    lines.push('  ' + staff.displayName + '  <' + staff.email + '>');
  }

  const summary = [
    "Today's PD Session: " + session.sessionLabel,
    'Unique attendees scanned today: ' + attendees.length,
    'Will be emailed: ' + (attendees.length - missingEmail),
    'Will be skipped (no email): ' + missingEmail,
    '',
    'Recipients:'
  ].join('\n') + '\n' + lines.join('\n');

  ui.alert("Preview Today's Recipients", summary, ui.ButtonSet.OK);
}

/**
 * Menu entry point: shows check-in/out times and room visits for one attendee
 * today (matches {{checkInTime}}, {{checkOutTime}}, {{roomVisitLog}}).
 */
function previewTodaysAttendanceLog() {
  const ui = SpreadsheetApp.getUi();
  const tz = Session.getScriptTimeZone();
  const session = getSessionForDate_(new Date());

  if (!session.pdDay && !session.sessionLabel) {
    ui.alert(
      "Preview Attendance Log",
      'Today is not on the Sessions sheet. No digest emails would run.',
      ui.ButtonSet.OK
    );
    return;
  }

  const attendees = collectTodaysAttendees_();
  if (attendees.length === 0) {
    ui.alert(
      "Preview Attendance Log",
      session.sessionLabel + '\n\nNo scans today yet â€” nothing to preview.',
      ui.ButtonSet.OK
    );
    return;
  }

  const dateKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const roomConfigIndex = getRoomConfigIndex_();
  const sample = attendees[0];
  const staff = sample.staff;
  const scans = getStaffScansForDate_(sample.id, dateKey, tz);
  const frontDesk = formatFrontDeskTimes_(scans, tz);
  const roomVisitLog = formatRoomVisitLog_(scans, tz, roomConfigIndex);
  const name = staff ? staff.displayName : ('ID ' + sample.id);

  const lines = [
    'PD day label ({{sessionName}} at top of email): ' + (session.sessionLabel || '(blank)'),
    '',
    'Sample teacher: ' + name,
    'Scans today: ' + scans.length,
    'RoomConfig rows loaded: ' + roomConfigIndex.length,
    '',
    'Attendance:',
    'Checked in: {{checkInTime}} â†’ ' + (frontDesk.checkInTime || '(blank)'),
    'Checked out: {{checkOutTime}} â†’ ' + (frontDesk.checkOutTime || '(blank)'),
    '',
    'Session room visits ({{roomVisitLog}}):',
    '',
    roomVisitLog
  ];

  ui.alert("Preview Attendance Log", lines.join('\n'), ui.ButtonSet.OK);
}

/**
 * Menu entry point: generates (or refreshes) a single teacher's attendance
 * email for a specific PD date without touching any other rows.
 *
 * Prompts for Staff ID and PD date, validates both, builds the email using
 * the same Daily Email Body Template and subject from Settings, then appends
 * or refreshes the row on Today's PD Emails â€” ready for Form Mule.
 */
function generateSingleTeacherEmail() {
  const ui = SpreadsheetApp.getUi();
  const tz = Session.getScriptTimeZone();

  // --- Step 1: Staff ID ---
  const idResponse = ui.prompt(
    'Generate Email for One Teacher',
    'Enter the Staff ID (the number printed under the barcode):',
    ui.ButtonSet.OK_CANCEL
  );
  if (idResponse.getSelectedButton() !== ui.Button.OK) return;
  const rawId = String(idResponse.getResponseText() || '').trim().replace(/\D/g, '');
  if (!rawId) {
    ui.alert('Generate Email for One Teacher', 'No Staff ID entered. Cancelled.', ui.ButtonSet.OK);
    return;
  }

  const staff = getActiveStaffById_(rawId);
  if (!staff) {
    ui.alert(
      'Generate Email for One Teacher',
      'Staff ID ' + rawId + ' was not found in the Staff sheet.\n\nCheck the ID and try again, or run Sync Staff from Teacher Numbers if the record is missing.',
      ui.ButtonSet.OK
    );
    return;
  }
  if (!staff.email) {
    ui.alert(
      'Generate Email for One Teacher',
      staff.displayName + ' (ID ' + rawId + ') has no email address on their Staff record.\n\nAdd an email to the Staff sheet and try again.',
      ui.ButtonSet.OK
    );
    return;
  }

  // --- Step 2: PD Date ---
  const dateResponse = ui.prompt(
    'Generate Email for One Teacher',
    'Enter the PD date for ' + staff.displayName + '\n(format: YYYY-MM-DD or MM/DD/YYYY):',
    ui.ButtonSet.OK_CANCEL
  );
  if (dateResponse.getSelectedButton() !== ui.Button.OK) return;
  const rawDate = String(dateResponse.getResponseText() || '').trim();

  // Parse YYYY-MM-DD or MM/DD/YYYY
  let parsedDate = null;
  const isoMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const mdyMatch = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (isoMatch) {
    parsedDate = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  } else if (mdyMatch) {
    parsedDate = new Date(Number(mdyMatch[3]), Number(mdyMatch[1]) - 1, Number(mdyMatch[2]));
  }
  if (!parsedDate || isNaN(parsedDate.getTime())) {
    ui.alert(
      'Generate Email for One Teacher',
      '"' + rawDate + '" is not a valid date. Use YYYY-MM-DD (e.g. 2026-06-11) or MM/DD/YYYY (e.g. 06/11/2026).',
      ui.ButtonSet.OK
    );
    return;
  }

  const dateKey = Utilities.formatDate(parsedDate, tz, 'yyyy-MM-dd');
  const dateLabel = Utilities.formatDate(parsedDate, tz, 'MMMM d, yyyy');
  const session = getSessionForDate_(parsedDate);

  if (!session.pdDay && !session.sessionLabel) {
    const proceed = ui.alert(
      'Generate Email for One Teacher',
      dateLabel + ' is not listed on the Sessions sheet as a PD day.\n\nThe email will still be generated but the PD Day and Session fields will be blank.\n\nContinue anyway?',
      ui.ButtonSet.YES_NO
    );
    if (proceed !== ui.Button.YES) return;
  }

  // --- Step 3: Check if already sent ---
  const emailKey = staff.email.toLowerCase();
  const alreadySent = readSentEmailsForDate_(dateKey);
  if (alreadySent[emailKey]) {
    const resend = ui.alert(
      'Generate Email for One Teacher',
      staff.displayName + ' already has a Sent email in PdEmailLog for ' + dateLabel + '.\n\nRegenerate and add a new Pending row anyway?',
      ui.ButtonSet.YES_NO
    );
    if (resend !== ui.Button.YES) return;
  }

  // --- Step 4: Build and append ---
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const digest = ss.getSheetByName(SHEET_TODAYS_EMAILS);
  if (!digest) {
    ui.alert(
      'Generate Email for One Teacher',
      "The 'Today's PD Emails' sheet does not exist. Run Initialize / Repair System first.",
      ui.ButtonSet.OK
    );
    return;
  }

  const scans = getStaffScansForDate_(rawId, dateKey, tz);
  const roomConfigIndex = getRoomConfigIndex_();
  const fields = buildAttendeeEmailFields_(staff, scans, session, dateLabel, tz, roomConfigIndex);
  const now = new Date();

  // Refresh the row if one already exists for this email + date; otherwise append.
  const existing = findDigestRowForToday_(digest, dateKey, tz, emailKey);
  if (existing) {
    existing.values[7] = fields.subject;
    existing.values[8] = fields.body;
    existing.values[9] = 'Pending';
    digest.getRange(existing.rowNumber, 1, 1, TODAYS_EMAILS_HEADERS.length).setValues([existing.values]);
  } else {
    digest.appendRow([
      staff.email,
      staff.firstName || '',
      staff.lastName || '',
      session.pdDay || '',
      session.sessionLabel || '',
      parsedDate,
      fields.firstScanIn || '',
      fields.subject,
      fields.body,
      'Pending'
    ]);
  }

  appendPdEmailLogRow_({
    dateKey: dateKey,
    session: session.sessionLabel || '',
    email: staff.email,
    recipientName: staff.displayName,
    generatedAt: now,
    status: 'Pending'
  });

  ss.setActiveSheet(digest);

  const checkInLabel = fields.firstScanIn
    ? Utilities.formatDate(fields.firstScanIn, tz, 'h:mm a')
    : '(no check-in scan found)';

  ui.alert(
    'Generate Email for One Teacher',
    'Row added to Today\'s PD Emails:\n\n' +
    'Name: ' + staff.displayName + '\n' +
    'Email: ' + staff.email + '\n' +
    'PD Date: ' + dateLabel + '\n' +
    'Session: ' + (session.sessionLabel || '(not on Sessions sheet)') + '\n' +
    'Check-in: ' + checkInLabel + '\n\n' +
    'Status: Pending â€” send via Form Mule / Form Mule as usual.',
    ui.ButtonSet.OK
  );
}

/**
 * Menu entry point: flips every Pending row on Today's PD Emails to Sent
 * and stamps the matching PdEmailLog rows so future generation calls
 * skip those recipients.
 */
function markAllPdEmailsAsSent() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TODAYS_EMAILS);
  if (!sheet || sheet.getLastRow() < 2) {
    ui.alert('Mark All as Sent', "There are no rows on the Today's PD Emails sheet.", ui.ButtonSet.OK);
    return;
  }

  const lastRow = sheet.getLastRow();
  const range = sheet.getRange(2, 1, lastRow - 1, TODAYS_EMAILS_HEADERS.length);
  const values = range.getValues();
  const statusCol = TODAYS_EMAILS_HEADERS.indexOf('Status');
  const emailCol = TODAYS_EMAILS_HEADERS.indexOf('Email');
  const dateCol = TODAYS_EMAILS_HEADERS.indexOf('Date');
  const sessionCol = TODAYS_EMAILS_HEADERS.indexOf('Session');

  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const sentEntries = [];

  let flipped = 0;
  for (let i = 0; i < values.length; i++) {
    const status = String(values[i][statusCol] || '').trim();
    if (status !== 'Pending') continue;

    values[i][statusCol] = 'Sent';
    flipped++;

    const dateValue = values[i][dateCol];
    const dateKey = dateValue instanceof Date
      ? Utilities.formatDate(dateValue, tz, 'yyyy-MM-dd')
      : String(dateValue || '').trim();

    sentEntries.push({
      dateKey: dateKey,
      session: String(values[i][sessionCol] || '').trim(),
      email: String(values[i][emailCol] || '').trim().toLowerCase()
    });
  }

  if (flipped === 0) {
    ui.alert('Mark All as Sent', 'No Pending rows found. Nothing to mark.', ui.ButtonSet.OK);
    return;
  }

  range.setValues(values);
  stampPdEmailLogAsSent_(sentEntries, now);

  ui.alert('Mark All as Sent', flipped + ' row(s) flipped to Sent.', ui.ButtonSet.OK);
}

/**
 * Installs the daily 5 PM (or whatever hour Settings says) trigger that
 * regenerates the email digest. Idempotent: removing any existing trigger
 * for the same handler before installing a fresh one.
 */
function installPdEmailTrigger() {
  const ui = SpreadsheetApp.getUi();
  uninstallPdEmailTriggers_();

  const hour = readDailyEmailTriggerHour_();
  ScriptApp.newTrigger(PD_EMAIL_TRIGGER_HANDLER)
    .timeBased()
    .atHour(hour)
    .everyDays(1)
    .create();

  ui.alert(
    'Daily Email Trigger',
    'Installed. The PD email digest will regenerate every day at hour ' + hour + ' (script time zone).\n\n' +
      'On non-PD days the run will silently skip.\n\n' +
      'To change the hour, edit "Daily Email Trigger Hour" in Settings, then click this menu item again.',
    ui.ButtonSet.OK
  );
}

/**
 * Removes any installed PD email triggers. Lets admins pause the daily
 * generation without disabling the menu items.
 */
function uninstallPdEmailTrigger() {
  const ui = SpreadsheetApp.getUi();
  const removed = uninstallPdEmailTriggers_();
  ui.alert(
    'Daily Email Trigger',
    removed > 0
      ? 'Uninstalled ' + removed + ' trigger(s). The daily 5 PM generation will no longer run automatically.'
      : 'No PD email trigger was installed. Nothing to uninstall.',
    ui.ButtonSet.OK
  );
}

function uninstallPdEmailTriggers_() {
  const triggers = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === PD_EMAIL_TRIGGER_HANDLER;
  });
  for (let i = 0; i < triggers.length; i++) ScriptApp.deleteTrigger(triggers[i]);
  return triggers.length;
}

function readDailyEmailTriggerHour_() {
  const raw = getSettingValue_('Daily Email Trigger Hour', String(PD_EMAIL_DEFAULT_TRIGGER_HOUR));
  const hour = Number(raw);
  if (!isFinite(hour) || hour < 0 || hour > 23) return PD_EMAIL_DEFAULT_TRIGGER_HOUR;
  return Math.floor(hour);
}

/**
 * Core generator. Used by both the menu and the trigger.
 *
 * Returns { ok, message, ... } so callers can present a summary or
 * skip silently when there's nothing to do.
 */
function generatePdEmailDigest_(options) {
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const dateKey = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const dateLabel = Utilities.formatDate(now, tz, 'MMMM d, yyyy');
  const session = getSessionForDate_(now);

  if (!session.pdDay && !session.sessionLabel) {
    return {
      ok: false,
      reason: 'not_pd_day',
      message: 'Today (' + dateLabel + ') is not listed on the Sessions sheet. No emails generated.'
    };
  }

  const attendees = collectTodaysAttendees_();
  if (attendees.length === 0) {
    return {
      ok: false,
      reason: 'no_attendees',
      message: 'No scans recorded for today yet. No emails generated.'
    };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const digest = ss.getSheetByName(SHEET_TODAYS_EMAILS);
  if (!digest) {
    return {
      ok: false,
      reason: 'missing_sheet',
      message: "The 'Today's PD Emails' sheet does not exist. Run Initialize / Repair System first."
    };
  }

  // Wipe yesterday's data only if the existing rows are for a different date.
  pruneStaleDigestRows_(digest, dateKey, tz);

  const alreadySent = readSentEmailsForDate_(dateKey);
  const roomConfigIndex = getRoomConfigIndex_();

  const newRows = [];
  let alreadyProcessed = 0;
  let refreshed = 0;
  let missingEmail = 0;
  let added = 0;

  for (let i = 0; i < attendees.length; i++) {
    const a = attendees[i];
    const staff = a.staff;
    if (!staff) continue;
    if (!staff.email) {
      missingEmail++;
      continue;
    }

    const emailKey = staff.email.toLowerCase();
    if (alreadySent[emailKey]) {
      alreadyProcessed++;
      continue;
    }

    const scans = getStaffScansForDate_(a.id, dateKey, tz);
    const fields = buildAttendeeEmailFields_(staff, scans, session, dateLabel, tz, roomConfigIndex);

    const existing = findDigestRowForToday_(digest, dateKey, tz, emailKey);
    if (existing) {
      existing.values[7] = fields.subject;
      existing.values[8] = fields.body;
      digest.getRange(existing.rowNumber, 1, 1, TODAYS_EMAILS_HEADERS.length).setValues([existing.values]);
      refreshed++;
      continue;
    }

    newRows.push([
      staff.email,
      staff.firstName || '',
      staff.lastName || '',
      session.pdDay || '',
      session.sessionLabel || '',
      now,
      fields.firstScanIn || a.firstScanIn || '',
      fields.subject,
      fields.body,
      'Pending'
    ]);

    appendPdEmailLogRow_({
      dateKey: dateKey,
      session: session.sessionLabel,
      email: staff.email,
      recipientName: staff.displayName,
      generatedAt: now,
      status: 'Pending'
    });

    added++;
  }

  if (newRows.length > 0) {
    const startRow = digest.getLastRow() + 1;
    digest.getRange(startRow, 1, newRows.length, TODAYS_EMAILS_HEADERS.length).setValues(newRows);
  }

  return {
    ok: true,
    session: session,
    dateKey: dateKey,
    dateLabel: dateLabel,
    uniqueAttendees: attendees.length,
    added: added,
    refreshed: refreshed,
    alreadyProcessed: alreadyProcessed,
    missingEmail: missingEmail
  };
}

/**
 * Removes rows on the digest sheet whose Date column doesn't match today.
 * Keeps Sent or Pending rows for today untouched so admins don't lose
 * partial work when regenerating.
 */
function pruneStaleDigestRows_(sheet, todayKey, tz) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const dateColIndex = TODAYS_EMAILS_HEADERS.indexOf('Date') + 1;
  const range = sheet.getRange(2, 1, lastRow - 1, TODAYS_EMAILS_HEADERS.length);
  const values = range.getValues();
  const kept = [];
  for (let i = 0; i < values.length; i++) {
    const dateValue = values[i][dateColIndex - 1];
    const rowKey = dateValue instanceof Date
      ? Utilities.formatDate(dateValue, tz, 'yyyy-MM-dd')
      : String(dateValue || '').trim();
    if (rowKey === todayKey) kept.push(values[i]);
  }

  range.clearContent();
  if (kept.length > 0) {
    sheet.getRange(2, 1, kept.length, TODAYS_EMAILS_HEADERS.length).setValues(kept);
  }
}

/**
 * Returns the unique staff IDs that have at least one scan recorded today,
 * along with the earliest IN-scan timestamp and the staff record from the
 * staff cache. Skips IDs whose staff record is missing.
 */
function collectTodaysAttendees_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scanLog = ss.getSheetByName(SHEET_SCAN_LOG);
  if (!scanLog || scanLog.getLastRow() < 2) return [];

  const tz = Session.getScriptTimeZone();
  const todayKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  const lastRow = scanLog.getLastRow();
  const values = scanLog.getRange(2, 1, lastRow - 1, 4).getValues();
  const byId = {};

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const timestamp = row[0];
    const id = String(row[1] || '').trim();
    const status = String(row[2] || '').trim();
    if (!id) continue;

    const dateValue = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(dateValue.getTime())) continue;
    const rowKey = Utilities.formatDate(dateValue, tz, 'yyyy-MM-dd');
    if (rowKey !== todayKey) continue;

    if (!byId[id]) byId[id] = { id: id, firstScanIn: null };
    if (status === 'IN') {
      if (!byId[id].firstScanIn || dateValue < byId[id].firstScanIn) {
        byId[id].firstScanIn = dateValue;
      }
    }
  }

  const ids = Object.keys(byId);
  const attendees = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const staff = getActiveStaffById_(id);
    attendees.push({
      id: id,
      firstScanIn: byId[id].firstScanIn,
      staff: staff
    });
  }
  return attendees;
}

function appendPdEmailLogRow_(entry) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PD_EMAIL_LOG);
  if (!sheet) return;

  sheet.appendRow([
    entry.dateKey,
    entry.session || '',
    entry.email || '',
    entry.recipientName || '',
    entry.generatedAt || new Date(),
    '',
    entry.status || 'Pending'
  ]);
}

/**
 * Updates the PdEmailLog rows for the given (dateKey, email) pairs to
 * Status='Sent' with a Sent At timestamp. Loops once over the log per call
 * and writes everything back in one setValues() to keep this fast even on
 * larger logs.
 */
function stampPdEmailLogAsSent_(entries, sentAt) {
  if (!entries || entries.length === 0) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PD_EMAIL_LOG);
  if (!sheet || sheet.getLastRow() < 2) return;

  const tz = Session.getScriptTimeZone();
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, PD_EMAIL_LOG_HEADERS.length);
  const values = range.getValues();

  const targets = {};
  for (let i = 0; i < entries.length; i++) {
    const k = entries[i].dateKey + '|' + entries[i].email;
    targets[k] = true;
  }

  let updated = 0;
  for (let i = 0; i < values.length; i++) {
    const rowDate = values[i][0];
    const rowKey = rowDate instanceof Date
      ? Utilities.formatDate(rowDate, tz, 'yyyy-MM-dd')
      : String(rowDate || '').trim();
    const email = String(values[i][2] || '').trim().toLowerCase();
    const k = rowKey + '|' + email;
    if (!targets[k]) continue;
    if (String(values[i][6] || '').trim().toLowerCase() === 'sent') continue;

    values[i][5] = sentAt;
    values[i][6] = 'Sent';
    updated++;
  }

  if (updated > 0) {
    range.setValues(values);
  }
}

/**
 * Live-update sibling of generatePdEmailDigest_. Called from logScan() after
 * every scan on a PD day so the Today's PD Emails sheet stays current as
 * people move through the day:
 *
 *   First IN scan       -> appends a new digest row + PdEmailLog row.
 *   Subsequent scans    -> re-renders the body of the existing digest row
 *                          so {{attendanceLog}} now includes the new scan.
 *
 * Idempotent: if PdEmailLog already has a 'Sent' row for today's date and
 * this email, this is a no-op (we don't reopen something the admin has
 * already pushed through Form Mule). Errors are caught by the caller so a
 * failure here never breaks the underlying scan.
 */
function mirrorScanToDigest_(staffId, scanTimestamp, status, session) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const digest = ss.getSheetByName(SHEET_TODAYS_EMAILS);
  if (!digest) return { skipped: 'digest_missing' };

  const staff = getActiveStaffById_(staffId);
  if (!staff) return { skipped: 'no_staff' };
  if (!staff.email) return { skipped: 'no_email' };

  const tz = Session.getScriptTimeZone();
  const dateKey = Utilities.formatDate(scanTimestamp, tz, 'yyyy-MM-dd');
  const dateLabel = Utilities.formatDate(scanTimestamp, tz, 'MMMM d, yyyy');
  const emailKey = staff.email.toLowerCase();

  const alreadySent = readSentEmailsForDate_(dateKey);
  if (alreadySent[emailKey]) return { skipped: 'already_sent' };

  const scans = getStaffScansForDate_(staffId, dateKey, tz);
  const fields = buildAttendeeEmailFields_(staff, scans, session, dateLabel, tz, getRoomConfigIndex_());

  const existing = findDigestRowForToday_(digest, dateKey, tz, emailKey);
  if (existing) {
    existing.values[7] = fields.subject;
    existing.values[8] = fields.body;
    digest.getRange(existing.rowNumber, 1, 1, TODAYS_EMAILS_HEADERS.length).setValues([existing.values]);
    return { updated: true };
  }

  digest.appendRow([
    staff.email,
    staff.firstName || '',
    staff.lastName || '',
    session.pdDay || '',
    session.sessionLabel || '',
    scanTimestamp,
    fields.firstScanIn || scanTimestamp,
    fields.subject,
    fields.body,
    'Pending'
  ]);

  appendPdEmailLogRow_({
    dateKey: dateKey,
    session: session.sessionLabel,
    email: staff.email,
    recipientName: staff.displayName,
    generatedAt: new Date(),
    status: 'Pending'
  });

  return { added: true };
}

/**
 * Returns every ScanLog row for the given staff ID on the given date,
 * sorted chronologically. Empty array if there are none.
 *
 * Each entry includes the station so the attendance-log renderer can
 * cross-reference RoomConfig and append the human-readable session name
 * for Day 2 room scans.
 */
function getStaffScansForDate_(staffId, dateKey, tz) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scanLog = ss.getSheetByName(SHEET_SCAN_LOG);
  if (!scanLog || scanLog.getLastRow() < 2) return [];

  const lastRow = scanLog.getLastRow();
  const values = scanLog.getRange(2, 1, lastRow - 1, 4).getValues();
  const targetId = String(staffId).trim();
  const scans = [];

  for (let i = 0; i < values.length; i++) {
    const id = String(values[i][1] || '').trim();
    if (id !== targetId) continue;

    const timestamp = values[i][0];
    const dateValue = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(dateValue.getTime())) continue;
    const rowKey = Utilities.formatDate(dateValue, tz, 'yyyy-MM-dd');
    if (rowKey !== dateKey) continue;

    scans.push({
      time: dateValue,
      status: String(values[i][2] || '').trim(),
      station: String(values[i][3] || '').trim()
    });
  }

  scans.sort(function (a, b) { return a.time - b.time; });
  return scans;
}

/**
 * Reads RoomConfig once and returns it as a flat array of
 * { campus, room, sessionName, active, notes } objects, suitable for
 * passing into findRoomConfigForStation_ many times during one render.
 *
 * Returns [] if the sheet doesn't exist or has no data rows. Callers do
 * not need to special-case the empty array; matching short-circuits.
 */
/**
 * RoomConfig stores PD Date and times as serials, Date objects, or text.
 * Normalize so session matching works for email class titles.
 */
function normalizeRoomConfigPdDate_(value) {
  if (value == null || value === '') return null;
  if (typeof parseScheduleDateCell_ === 'function') {
    const parsed = parseScheduleDateCell_(value);
    if (parsed) return parsed;
  }
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  return null;
}

function normalizeRoomConfigTimeLabel_(value) {
  if (value == null || value === '') return '';
  if (typeof parseScheduleTimeCell_ === 'function') {
    const parsed = parseScheduleTimeCell_(value);
    if (parsed) return parsed;
  }
  return String(value).trim();
}

function getRoomConfigIndex_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_ROOM_CONFIG);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const colCount = Math.max(ROOM_CONFIG_HEADERS.length, sheet.getLastColumn());
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, colCount).getValues();
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const campus = String(values[i][0] || '').trim();
    const room = String(values[i][1] || '').trim();
    if (!campus || !room) continue;
    out.push({
      campus: campus,
      room: room,
      sessionName: String(values[i][2] || '').trim(),
      pdDate: normalizeRoomConfigPdDate_(values[i][3]),
      startTime: normalizeRoomConfigTimeLabel_(values[i][4]),
      endTime: normalizeRoomConfigTimeLabel_(values[i][5]),
      active: values[i][6] !== false,
      stationName: String(values[i][7] || '').trim(),
      notes: String(values[i][8] || '').trim()
    });
  }
  return out;
}

/**
 * Returns the RoomConfig row for a scan station and time.
 *
 * 1. Exact match on RoomConfig "Station Name" (e.g. "Room 187 - CI North").
 * 2. Campus + room substring match (word-bounded room token).
 *
 * When several rows share a station, PD Date and Start/End Time pick the
 * session slot (e.g. "Google Gemini" vs "Eduthings" in the same room).
 */
function findRoomConfigForStation_(stationName, roomConfigIndex, scanTime) {
  const target = String(stationName || '').trim().toLowerCase();
  if (!target) return null;
  if (!roomConfigIndex || roomConfigIndex.length === 0) return null;

  const byStationName = [];
  for (let i = 0; i < roomConfigIndex.length; i++) {
    const row = roomConfigIndex[i];
    if (!row.active || !row.stationName) continue;
    if (String(row.stationName).trim().toLowerCase() !== target) continue;
    byStationName.push(row);
  }
  if (byStationName.length > 0) {
    return resolveRoomConfigMatch_(byStationName, scanTime);
  }

  const matches = [];
  for (let i = 0; i < roomConfigIndex.length; i++) {
    const row = roomConfigIndex[i];
    if (!row.active) continue;
    const campus = row.campus.toLowerCase();
    if (target.indexOf(campus) < 0) continue;
    if (!stationNameMatchesRoom_(target, row.room)) continue;
    matches.push(row);
  }

  return resolveRoomConfigMatch_(matches, scanTime);
}

function stationNameMatchesRoom_(targetLower, room) {
  const roomNorm = String(room || '').toLowerCase().replace(/\s+/g, '');
  if (!roomNorm) return false;
  const escapedRoom = roomNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(^|[^a-z0-9])' + escapedRoom + '($|[^a-z0-9])', 'i');
  if (re.test(targetLower)) return true;
  return re.test(targetLower.replace(/\s+/g, ''));
}

function rowMatchesScanDate_(row, scanTime) {
  if (!scanTime || !row.pdDate) return true;
  const tz = Session.getScriptTimeZone();
  let pd = row.pdDate;
  if (!(pd instanceof Date)) {
    const parsed = new Date(pd);
    if (isNaN(parsed.getTime())) return true;
    pd = parsed;
  }
  const scanKey = Utilities.formatDate(scanTime, tz, 'yyyy-MM-dd');
  const rowKey = Utilities.formatDate(pd, tz, 'yyyy-MM-dd');
  return scanKey === rowKey;
}

function resolveRoomConfigMatch_(matches, scanTime) {
  if (!matches || matches.length === 0) return null;

  let candidates = matches;
  if (scanTime) {
    const dated = matches.filter(function (row) { return rowMatchesScanDate_(row, scanTime); });
    if (dated.length > 0) candidates = dated;
  }

  if (candidates.length === 1) return candidates[0];

  if (scanTime) {
    const timed = pickRoomConfigByScanTime_(candidates, scanTime);
    if (timed) return timed;
    // Do not attach a random session when the scan time is outside every slot.
    if (candidates.length > 1) return null;
  }

  if (candidates.length === 1) return candidates[0];

  let best = candidates[0];
  let bestSpecificity = -1;
  for (let j = 0; j < candidates.length; j++) {
    const row = candidates[j];
    const specificity = row.campus.length + String(row.room).length;
    if (specificity > bestSpecificity) {
      best = row;
      bestSpecificity = specificity;
    }
  }
  return best;
}

function pickRoomConfigByScanTime_(matches, scanTime) {
  const scanMin = scanTimeToMinutes_(scanTime);
  if (scanMin < 0) return null;

  const buffer = SESSION_EARLY_BUFFER_MINUTES;
  const hits = [];
  for (let i = 0; i < matches.length; i++) {
    const row = matches[i];
    if (!row.startTime) continue;
    const start = timeStringToMinutes_(row.startTime);
    const end = row.endTime ? timeStringToMinutes_(row.endTime) : start + 30;
    if (start < 0) continue;
    const effectiveStart = Math.max(0, start - buffer);
    if (scanMin >= effectiveStart && scanMin < end) {
      hits.push({ row: row, start: start });
    }
  }
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0].row;

  // Boundary overlap (e.g. 10:55 for 9â€“11 and 11â€“1 in the same room): prefer the
  // upcoming session â€” latest official start among matches.
  hits.sort(function (a, b) { return b.start - a.start; });
  return hits[0].row;
}

function scanTimeToMinutes_(date) {
  if (!(date instanceof Date)) return -1;
  const tz = Session.getScriptTimeZone();
  const h = parseInt(Utilities.formatDate(date, tz, 'H'), 10);
  const m = parseInt(Utilities.formatDate(date, tz, 'm'), 10);
  return h * 60 + m;
}

function timeStringToMinutes_(timeStr) {
  const normalized = normalizeRoomConfigTimeLabel_(timeStr);
  const m = String(normalized || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

/**
 * Main Check In scans only (front desk flow â€” not session rooms).
 */
function getMainCheckInScans_(scans) {
  const out = [];
  if (!scans) return out;
  for (let i = 0; i < scans.length; i++) {
    if (isMainCheckInStation_(scans[i].station)) out.push(scans[i]);
  }
  return out;
}

/**
 * Friendly check-in / check-out times for the email body (Main Check In only).
 * Checkout fallback: last desk scan after lunch window when no OUT row exists
 * (e.g. end-of-day scan mis-recorded as LUNCH IN).
 */
function formatFrontDeskTimes_(scans, tz) {
  const desk = getMainCheckInScans_(scans);
  let checkIn = null;
  let checkOut = null;

  for (let i = 0; i < desk.length; i++) {
    if (String(desk[i].status || '').trim() === 'IN') {
      checkIn = desk[i].time;
      break;
    }
  }

  for (let i = desk.length - 1; i >= 0; i--) {
    if (String(desk[i].status || '').trim() === 'OUT') {
      checkOut = desk[i].time;
      break;
    }
  }

  if (!checkOut && desk.length > 0) {
    const lastDesk = desk[desk.length - 1];
    const lastStatus = String(lastDesk.status || '').trim();
    const bounds = getLunchPeriodBounds_();
    const lastMin = scanTimeToMinutes_(lastDesk.time);
    if (bounds.endMinutes !== null && lastMin > bounds.endMinutes &&
        (lastStatus === 'LUNCH IN' || lastStatus === 'IN')) {
      checkOut = lastDesk.time;
    }
  }

  return {
    checkInTime: checkIn ? Utilities.formatDate(checkIn, tz, 'h:mm a') : '',
    checkOutTime: checkOut ? Utilities.formatDate(checkOut, tz, 'h:mm a') : ''
  };
}

/**
 * Day 2 session room visits only â€” time, station, and PD class title.
 */
function formatRoomVisitLog_(scans, tz, roomConfigIndex) {
  if (!scans || scans.length === 0) return '(none)';
  const index = roomConfigIndex || getRoomConfigIndex_();
  const lines = [];
  for (let i = 0; i < scans.length; i++) {
    const s = scans[i];
    if (!isRoomStation_(s.station)) continue;
    if (String(s.status || '').trim() !== 'IN') continue;
    const time = Utilities.formatDate(s.time, tz, 'h:mm a');
    let line = '- ' + time + ' \u2014 ' + s.station;
    const match = findRoomConfigForStation_(s.station, index, s.time);
    if (match && match.sessionName) {
      line += ' \u00b7 ' + match.sessionName;
    }
    lines.push(line);
  }
  if (lines.length === 0) return '(none)';
  return lines.join('\n');
}

/**
 * Renders the chronological scan list as a multi-line plain-text block
 * suitable for pasting into the {{attendanceLog}} placeholder.
 *
 * Legacy placeholder â€” prefer {{checkInTime}}, {{checkOutTime}}, {{roomVisitLog}}.
 * Each line:
 *   - <STATUS> at <h:mm a> [\u2014 <station> [\u00b7 <PD session from RoomConfig>]]
 *
 * Room PD titles (e.g. "Google Gemini & NotebookLM") come from RoomConfig
 * when the scan station matches a Day 2 room and the scan time falls in
 * that slot's Start/End window. Front-desk stations (Cafeteria, etc.)
 * show station only.
 */
function formatAttendanceLog_(scans, tz, roomConfigIndex) {
  if (!scans || scans.length === 0) return '(no scans recorded yet)';
  const index = roomConfigIndex || getRoomConfigIndex_();
  const lines = [];
  for (let i = 0; i < scans.length; i++) {
    const s = scans[i];
    const status = String(s.status || '').trim();
    if (status === 'LUNCH OUT' || status === 'LUNCH IN') continue;
    const time = Utilities.formatDate(s.time, tz, 'h:mm a');
    let line = '- ' + status + ' at ' + time;
    if (s.station) {
      line += ' \u2014 ' + s.station;
      const match = findRoomConfigForStation_(s.station, index, s.time);
      if (match && match.sessionName) {
        line += ' \u00b7 ' + match.sessionName;
      }
    }
    lines.push(line);
  }
  if (lines.length === 0) return '(no scans recorded yet)';
  return lines.join('\n');
}

/**
 * Looks for an existing row on the Today's PD Emails sheet whose Email
 * matches and whose Date matches today's key. Returns rowNumber + values
 * snapshot so callers can edit fields and write back in one setValues().
 */
function findDigestRowForToday_(sheet, todayKey, tz, emailKey) {
  if (sheet.getLastRow() < 2) return null;
  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, 1, lastRow - 1, TODAYS_EMAILS_HEADERS.length).getValues();
  const dateColIndex = TODAYS_EMAILS_HEADERS.indexOf('Date');
  const emailColIndex = TODAYS_EMAILS_HEADERS.indexOf('Email');

  for (let i = 0; i < values.length; i++) {
    const email = String(values[i][emailColIndex] || '').trim().toLowerCase();
    if (email !== emailKey) continue;

    const dateValue = values[i][dateColIndex];
    const rowKey = dateValue instanceof Date
      ? Utilities.formatDate(dateValue, tz, 'yyyy-MM-dd')
      : String(dateValue || '').trim();
    if (rowKey === todayKey) {
      return {
        rowNumber: i + 2,
        values: values[i].slice()
      };
    }
  }
  return null;
}

/**
 * Pulls the current Daily Email Subject and Daily Email Body Template from
 * Settings, builds the placeholder map for one attendee, and renders both.
 *
 * Used by both the live mirror and the 5 PM batch generator so the two
 * paths produce byte-identical output for the same input. Pass an existing
 * roomConfigIndex (built once with getRoomConfigIndex_) when calling this
 * many times in a row -- the live mirror passes null and we'll fetch on
 * demand.
 */
function buildAttendeeEmailFields_(staff, scans, session, dateLabel, tz, roomConfigIndex) {
  const subjectTemplate = getSettingValue_('Daily Email Subject', 'DISD CTE Professional Development Attendance Receipt');
  const bodyTemplate = getSettingValue_('Daily Email Body Template', getDefaultDailyEmailBodyTemplate_());

  const index = roomConfigIndex || getRoomConfigIndex_();
  const frontDesk = formatFrontDeskTimes_(scans, tz);
  const roomVisitLog = formatRoomVisitLog_(scans, tz, index);
  const attendanceLog = formatAttendanceLog_(scans, tz, index);

  let firstScanIn = null;
  const desk = getMainCheckInScans_(scans);
  for (let i = 0; i < desk.length; i++) {
    if (String(desk[i].status || '').trim() === 'IN') {
      firstScanIn = desk[i].time;
      break;
    }
  }

  const placeholderValues = {
    firstName: staff.firstName || '',
    lastName: staff.lastName || '',
    fullName: staff.displayName || '',
    teacherName: staff.displayName || '',
    teacherId: staff.id || '',
    pdDay: session.pdDay || '',
    session: session.sessionLabel || '',
    sessionName: session.sessionLabel || '',
    sessionDate: dateLabel,
    date: dateLabel,
    checkInTime: frontDesk.checkInTime,
    checkOutTime: frontDesk.checkOutTime,
    roomVisitLog: roomVisitLog,
    attendanceLog: attendanceLog,
    attendanceSummary: [
      'Checked in: ' + frontDesk.checkInTime,
      'Checked out: ' + frontDesk.checkOutTime
    ].join('\n')
  };

  return {
    subject: renderTemplate_(subjectTemplate, placeholderValues),
    body: renderTemplate_(bodyTemplate, placeholderValues),
    firstScanIn: firstScanIn
  };
}

/**
 * Returns a lookup of {emailLower: true} for every recipient already
 * marked Sent in PdEmailLog for the given date. Live mirror skips these
 * so we don't reopen something the admin has already pushed through
 * Form Mule.
 */
function readSentEmailsForDate_(dateKey) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PD_EMAIL_LOG);
  const result = {};
  if (!sheet || sheet.getLastRow() < 2) return result;

  const tz = Session.getScriptTimeZone();
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, PD_EMAIL_LOG_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const rowDate = values[i][0];
    const rowKey = rowDate instanceof Date
      ? Utilities.formatDate(rowDate, tz, 'yyyy-MM-dd')
      : String(rowDate || '').trim();
    if (rowKey !== dateKey) continue;

    const status = String(values[i][6] || '').trim().toLowerCase();
    if (status !== 'sent') continue;

    const email = String(values[i][2] || '').trim().toLowerCase();
    if (email) result[email] = true;
  }
  return result;
}

function renderTemplate_(template, values) {
  let output = String(template == null ? '' : template);
  const keys = Object.keys(values);
  for (let i = 0; i < keys.length; i++) {
    const safe = keys[i].replace(/[^a-zA-Z0-9_]/g, '');
    const re = new RegExp('\\{\\{\\s*' + safe + '\\s*\\}\\}', 'g');
    output = output.replace(re, values[keys[i]] == null ? '' : String(values[keys[i]]));
  }
  return output;
}

