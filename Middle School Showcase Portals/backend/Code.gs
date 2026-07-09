// â”€â”€â”€ CONFIGURATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Environment switch. Day-to-day this stays false (DEV). The deploy-live.ps1
// script flips it to true ONLY for the published LIVE snapshot, then reverts it.
const IS_LIVE = false;

// The real, production spreadsheet (used only when IS_LIVE is true).
const LIVE_SPREADSHEET_ID = 'YOUR_LIVE_GOOGLE_SHEET_ID';;

// On-screen build stamp so you can confirm which code/env is running.
const CODE_VERSION = '2026-06-25.1';

// Resolves the active spreadsheet. LIVE uses the production sheet; DEV uses its
// own separate sheet (auto-created on first use and remembered in Script
// Properties) so test data never touches live.
function resolveActiveSpreadsheetId_() {
  if (IS_LIVE) return LIVE_SPREADSHEET_ID;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DEV_SPREADSHEET_ID');
  if (!id) {
    var devSs = SpreadsheetApp.create('Middle School Showcase - DEV');
    id = devSs.getId();
    props.setProperty('DEV_SPREADSHEET_ID', id);
    // Seed all required sheets immediately so the DEV environment is ready to use.
    // We pass the ID directly because SPREADSHEET_ID const isn't assigned yet.
    setupSheets(id);
  }
  return id;
}

const SPREADSHEET_ID = resolveActiveSpreadsheetId_();

const SHEET = {
  VENDORS:          'Vendors',
  TEACHERS:         'Teachers',
  DOCUMENTS:        'Documents',
  EVENT_INFO:       'EventInfo',
  ADMIN_AUTH:       'AdminAuth',
  SITE_CONTENT:     'SiteContent',
  SETTINGS:         'Settings',
  EXHIBITOR_REG:      'ExhibitorRegistrations',
  ATTENDEE_REG:       'AttendeeRegistrations',
  CAMPUSES:           'Campuses',
  ATTENDEE_CHECKLIST: 'AttendeeChecklist',
  PORTAL_UPLOADS:     'PortalUploads',
  FAQS:               'FAQs',
  EMAIL_TEMPLATES:    'EmailTemplates',
  EMAIL_LOG:          'EmailLog',
};

// Hardcoded fallback â€” matches the current deployment URL.
const WEB_APP_URL = 'YOUR_DEPLOYED_WEB_APP_URL';;

// â”€â”€â”€ ROUTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page)
    ? String(e.parameter.page).toLowerCase()
    : 'home';

  if (page === 'checkin') {
    return HtmlService.createTemplateFromFile('CheckIn')
      .evaluate()
      .setTitle('Vendor Check-In â€” Middle School Showcase')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  const isAdmin = (page === 'admin');
  const template = HtmlService.createTemplateFromFile(isAdmin ? 'Admin' : 'Public');
  template.initialPage = page;

  return template
    .evaluate()
    .setTitle(isAdmin ? 'Admin Hub â€” Middle School Showcase' : 'Middle School Showcase')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Forces a return value to contain only JSON-safe primitives (strings, numbers,
// booleans, arrays, plain objects). Dates become ISO strings; undefined is dropped.
// This prevents google.script.run from silently returning null on non-cloneable data.
function jsonSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// â”€â”€â”€ DIAGNOSTIC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Lightweight connectivity check used by the Admin Hub on load.
function ping() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const names = ss.getSheets().map(function (s) { return s.getName(); });
    return {
      success: true,
      sheets: names,
      version: CODE_VERSION,
      env: IS_LIVE ? 'LIVE' : 'DEV',
      spreadsheetId: SPREADSHEET_ID
    };
  } catch (e) {
    return { success: false, message: String(e && e.message ? e.message : e) };
  }
}

// â”€â”€â”€ SPREADSHEET HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getSheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}

function sheetToObjects(sheetName) {
  const sheet = getSheet(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map(function (row, idx) {
    const obj = { _row: idx + 2 };
    headers.forEach(function (h, i) {
      let val = row[i];
      if (val instanceof Date) {
        // Convert date/time cells to plain readable strings so they serialize cleanly.
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'M/d/yyyy');
      }
      obj[h] = (val != null ? val : '');
    });
    return obj;
  });
}

function objectsToSheet(sheetName, rows) {
  const sheet = getSheet(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  if (!rows || rows.length === 0) return;
  const data = rows.map(function (row) {
    return headers.map(function (h) { return (row[h] != null ? row[h] : ''); });
  });
  sheet.getRange(2, 1, data.length, headers.length).setValues(data);
}

// â”€â”€â”€ PUBLIC API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getEventInfo() {
  const rows = sheetToObjects(SHEET.EVENT_INFO);
  const info = {};
  rows.forEach(function (r) {
    const k = String(r['Key'] || '').trim();
    if (k) info[k] = r['Value'] || '';
  });
  if (typeof info.schedule === 'string') {
    try { info.schedule = JSON.parse(info.schedule); } catch (e) { info.schedule = []; }
  }
  return jsonSafe({ success: true, data: info });
}

function getSiteContent() {
  const rows = sheetToObjects(SHEET.SITE_CONTENT);
  const c = {};
  rows.forEach(function (r) {
    const k = String(r['Key'] || '').trim();
    if (k) c[k] = r['Value'] || '';
  });
  return jsonSafe({ success: true, data: applySiteDefaults(c) });
}

function siteDefaults() {
  return {
    siteTitle:              'Middle School Showcase',
    orgLine:                'Dallas ISD Â· Career & Technical Education',
    introText:              'Connecting students, educators, and vendors to celebrate innovation and explore career pathways.',
    aboutText:              '',
    heroBackgroundImageUrl: '',
    heroVideoUrl:           '',
    logoUrl:                '',
    vendorCardTitle:        'Vendor Portal',
    vendorCardDesc:         'Registered vendors: access your booth details, documents, and event-day information.',
    teacherCardTitle:       'Attendee Portal',
    teacherCardDesc:        'Registered attendees: access volunteer schedules, procedures, and event documents.',
    showVendorPortal:       'Yes',
    showTeacherPortal:      'Yes',
    showRegistrationPortal: 'Yes',
    showSchedule:           'Yes',
    registrationOpen:       'No',
    registrationCode:       '',
    adminEmail:             '',
  };
}

function applySiteDefaults(c) {
  const d = siteDefaults();
  Object.keys(d).forEach(function (k) {
    if (!c[k] && c[k] !== false) c[k] = d[k];
  });
  return c;
}

function verifyVendor(vendorId) {
  if (!vendorId) return { success: false, message: 'Please enter your Vendor ID.' };
  const vendors = sheetToObjects(SHEET.VENDORS);
  const vendor = vendors.find(function (v) {
    return String(v['VendorID'] || '').trim() === String(vendorId).trim()
        && String(v['Status']   || '').trim() === 'Active';
  });
  if (!vendor) return { success: false, message: 'Vendor ID not found or not active. Please check your ID and try again.' };

  const docs = getDocumentsFiltered('vendor');
  // Include any extra doc links stored on the vendor row
  const rowLinks = String(vendor['DocumentLinks'] || '').trim();
  return jsonSafe({
    success: true,
    vendor: {
      vendorId:         vendor['VendorID'],
      companyName:      vendor['CompanyName'],
      contact:          vendor['Contact'],
      email:            vendor['Email'],
      status:           vendor['Status'],
      notes:            vendor['Notes'],
      documentLinks:    rowLinks,
      allergyMilk:      vendor['AllergyMilk']      || '',
      allergyEggs:      vendor['AllergyEggs']      || '',
      allergyFish:      vendor['AllergyFish']      || '',
      allergyShellfish: vendor['AllergyShellfish'] || '',
      allergyTreeNuts:  vendor['AllergyTreeNuts']  || '',
      allergyPeanuts:   vendor['AllergyPeanuts']   || '',
      allergyWheat:     vendor['AllergyWheat']     || '',
      allergySoy:       vendor['AllergySoy']       || '',
      allergySesame:    vendor['AllergySesame']    || '',
      isVegetarian:     vendor['IsVegetarian']     || '',
      isVegan:          vendor['IsVegan']          || '',
    },
    documents: docs,
  });
}

function verifyTeacher(eid) {
  if (!eid) return { success: false, message: 'Please enter your EID.' };
  const teachers = sheetToObjects(SHEET.TEACHERS);
  const teacher = teachers.find(function (t) {
    return String(t['EID']    || '').trim() === String(eid).trim()
        && String(t['Status'] || '').trim() === 'Active';
  });
  if (!teacher) return { success: false, message: 'EID not found or not active. Please check your ID and try again.' };

  const docs = getDocumentsFiltered('teacher');
  const rowLinks = String(teacher['DocumentLinks'] || '').trim();
  return jsonSafe({
    success: true,
    teacher: {
      eid:           teacher['EID'],
      teacherName:   teacher['TeacherName'],
      campus:        teacher['Campus'],
      status:        teacher['Status'],
      notes:         teacher['Notes'],
      documentLinks: rowLinks,
    },
    documents: docs,
  });
}

// â”€â”€â”€ REGISTRATION API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getSiteContentValue(key) {
  var rows = sheetToObjects(SHEET.SITE_CONTENT);
  var val = '';
  rows.forEach(function(r) {
    if (String(r['Key'] || '').trim() === key) val = String(r['Value'] || '').trim();
  });
  return val;
}

function verifyRegistrationCode(code) {
  if (!code) return { success: false, message: 'Please enter the registration code.' };
  var isOpen = getSiteContentValue('registrationOpen');
  if (String(isOpen).trim().toLowerCase() !== 'yes') {
    return { success: false, message: 'Registration is not currently open. Please check back later.' };
  }
  var stored = getSiteContentValue('registrationCode');
  if (!stored) return { success: false, message: 'Registration is not currently open. Please check back later.' };
  if (String(code).trim() !== stored) return { success: false, message: 'Invalid registration code. Please try again.' };
  return { success: true };
}

function submitExhibitorRegistration(data) {
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET.EXHIBITOR_REG);
    if (!sheet) throw new Error('ExhibitorRegistrations sheet not found. Please run setupSheets.');
    var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d/yyyy HH:mm:ss');
    sheet.appendRow([
      ts, 'Pending',
      data.fullName        || '',
      data.email           || '',
      data.cellPhone       || '',
      data.secondaryName   || '',
      data.secondaryEmail  || '',
      data.secondaryPhone  || '',
      data.campusCompany         || '',
      data.returningExhibitor    || '',
      data.boothStaff            || '',
      data.studentAmbassadors    || '',
      data.careerCluster         || '',
      data.activityDescription   || '',
      data.electricityNeeded     || '',
      data.electricityType       || '',
      data.wifiNeeded            || '',
      data.tablesChairs          || '',
      data.specialAccommodations || '',
      data.studentGiveaways      || '',
      data.meetingAvailability   || '',
    ]);
    var adminEmail = getSiteContentValue('adminEmail');
    if (data.email) {
      var firstName = (data.fullName || 'Exhibitor').split(' ')[0];
      MailApp.sendEmail({
        to: data.email,
        subject: 'Registration Confirmation \u2014 2026\u20132027 Annual Dallas ISD CTE Career Exploration Showcase',
        body: [
          'Dear ' + firstName + ',',
          '',
          'Thank you for registering as an exhibitor for the 2026\u20132027 Annual Dallas ISD CTE Career Exploration Showcase.',
          '',
          'We are pleased to confirm that your registration has been received. Your participation helps provide Dallas ISD students with valuable opportunities to explore career pathways, connect with industry professionals, and learn about future educational and workforce opportunities.',
          '',
          'Registration Information',
          'Organization: ' + (data.campusCompany || ''),
          'Primary Contact: ' + (data.fullName || ''),
          'Email: ' + (data.email || ''),
          '',
          'Please retain this email for your records as it contains important information regarding your participation in the event.',
          '',
          'Required Next Steps (Action Required by September 14, 2026)',
          'To ensure your organization is fully prepared for the event, please complete the following no later than Monday, September 14, 2026:',
          '',
          '1. Register All Booth Attendees',
          'Please register every individual who will be attending and working your booth during the Showcase. All booth representatives must be registered by September 14, 2026, to assist with event planning, security, and meal counts.',
          'Important: Booth representatives who are not registered by September 14, 2026, are not guaranteed a meal.',
          '',
          '2. Complete the Food Allergy Form (If Applicable)',
          'If you or any registered booth attendee has a food allergy or dietary restriction, please complete the Food Allergy Form by September 14, 2026, so we can work with our caterer to accommodate dietary needs whenever possible.',
          '',
          'Meal Ticket Information',
          'The 2026\u20132027 Annual Dallas ISD CTE Career Exploration Showcase will use meal tickets. Meal tickets will be issued only to registered booth attendees. Individuals who are not registered by the September 14 deadline cannot be guaranteed a meal or a meal ticket.',
          '',
          'Event Schedule',
          'Monday, October 5, 2026 \u2014 Exhibitor setup (additional details will be provided in a future logistics email)',
          'Tuesday, October 6, 2026 \u2014 Exhibitor arrival begins at 7:00 a.m. | Student event hours: 9:00 a.m.\u20132:00 p.m. | Exhibitors may not depart before 2:30 p.m.',
          'Wednesday, October 7, 2026 \u2014 Exhibitor arrival begins at 7:00 a.m. | Student event hours: 9:00 a.m.\u20132:00 p.m. | Exhibitors may begin packing only after 3:00 p.m.',
          '',
          'All exhibitors must check out with event staff before departing.',
          '',
          'If any of your registration information changes before the event, please notify the Dallas ISD CTE team as soon as possible so we can update our records.',
          '',
          'Thank you for partnering with Dallas ISD Career & Technical Education. We look forward to welcoming you to the 2026\u20132027 Annual Dallas ISD CTE Career Exploration Showcase.',
          '',
          'Sincerely,',
          'Dallas ISD Career & Technical Education',
          '2026\u20132027 Annual Dallas ISD CTE Career Exploration Showcase',
        ].join('\n'),
      });
    }
    if (adminEmail) {
      MailApp.sendEmail({
        to: adminEmail,
        subject: 'New Exhibitor Registration: ' + (data.campusCompany || data.fullName),
        body: [
          'A new exhibitor registration has been submitted.',
          '',
          'Organization:  ' + (data.campusCompany || ''),
          'Contact:       ' + (data.fullName || ''),
          'Email:         ' + (data.email || ''),
          'Phone:         ' + (data.cellPhone || ''),
          'Returning:     ' + (data.returningExhibitor || ''),
          'Career Cluster:' + (data.careerCluster || ''),
          'Electricity:   ' + (data.electricityNeeded || '') + (data.electricityType ? ' \u2014 ' + data.electricityType : ''),
          'WiFi:          ' + (data.wifiNeeded || ''),
          '',
          'Review in the Admin Hub.',
        ].join('\n'),
      });
    }
    return jsonSafe({ success: true });
  } catch (e) {
    return { success: false, message: 'Submission failed: ' + (e.message || String(e)) };
  }
}

function submitAttendeeRegistration(data) {
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET.ATTENDEE_REG);
    if (!sheet) throw new Error('AttendeeRegistrations sheet not found. Please run setupSheets.');
    var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d/yyyy HH:mm:ss');

    // Look up campus record to fill in Region, PrincipalEmail, and PrincipalName for CC
    var campusRecord = null;
    if (data.campusOrgNumber) {
      var campusRows = sheetToObjects(SHEET.CAMPUSES);
      campusRecord = campusRows.find(function(c) {
        return String(c['OrgNumber'] || '').trim() === String(data.campusOrgNumber).trim();
      }) || null;
    }
    var campusRegion   = campusRecord ? (campusRecord['Region']         || '') : '';
    var principalEmail = campusRecord ? (campusRecord['PrincipalEmail'] || '') : '';
    var principalName  = campusRecord ? (campusRecord['PrincipalName']  || '') : '';

    var isSplitDays  = String(data.eventDate || '').toLowerCase().indexOf('split') >= 0;
    var splitReason  = isSplitDays ? (data.splitReason || '') : '';

    sheet.appendRow([
      ts, 'Pending',
      data.campusOrgNumber || '',
      data.teacherName     || '',
      data.cellPhone       || '',
      data.email           || '',
      data.campus          || '',
      data.wheelchairBus   || '',
      data.eventDate       || '',
      data.studentCount    || '',
      data.mainContact     || '',
      data.altContactName  || '',
      'Not Submitted',
      campusRegion,   // Region â€” populated from Campuses sheet
      principalEmail, // PrincipalEmail â€” populated from Campuses sheet
      splitReason,    // SplitReason â€” only populated when split days selected
    ]);

    // Seed default checklist items for this campus org number
    if (data.campusOrgNumber) {
      var clSheet = ss.getSheetByName(SHEET.ATTENDEE_CHECKLIST);
      if (clSheet) {
        var nowTs = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d/yyyy HH:mm:ss');
        clSheet.appendRow([data.campusOrgNumber, 'Field Trip Paperwork',       'Pending',  'No', '', 'System', nowTs]);
        clSheet.appendRow([data.campusOrgNumber, 'Lunch Confirmation',          'Pending',  'No', '', 'System', nowTs]);
        clSheet.appendRow([data.campusOrgNumber, 'Transportation Confirmation', 'Pending',  'No', '', 'System', nowTs]);
        clSheet.appendRow([data.campusOrgNumber, 'Student Materials Pickup',    'Upcoming', 'No', '', 'System', nowTs]);
      }
    }

    var adminEmail = getSiteContentValue('adminEmail');

    // CC the campus principal only (if found in Campuses sheet)
    var ccList = [];
    if (principalEmail) ccList.push(principalEmail);

    // Build registrant confirmation body using the finalized template
    var teacherFirst = (data.teacherName || 'Attendee').split(' ')[0];
    var registrantLines = [
      'Dear ' + teacherFirst + ',',
      '',
      'Thank you for registering your campus for the 2026\u20132027 Annual Dallas ISD CTE Career Exploration Showcase.',
      '',
      'We are pleased to confirm that your registration has been received.',
      '',
      'Registration Status',
      '\u2713 Registration Received',
      '\u25cb Field Trip Paperwork \u2014 Pending',
      '\u25cb Lunch Confirmation \u2014 Pending',
      '\u25cb Transportation Confirmation \u2014 Pending',
      '\u25cb Student Materials Pickup \u2014 Upcoming',
    ];
    if (isSplitDays) {
      registrantLines.push('\u25cb Split-Day Approval \u2014 Required (your campus requested split-day attendance)');
    }
    registrantLines = registrantLines.concat([
      '',
      'Please retain this email for your records as it contains important information regarding your participation in the event.',
      '',
      'Required Next Steps (Action Required by September 11, 2026)',
      'To secure your campus\u2019s participation and transportation for the Showcase, the following items must be completed no later than Friday, September 11, 2026.',
      '',
      '1. Upload Fully Approved Field Trip Paperwork',
      'Complete your campus field trip paperwork and obtain 100% approval through your campus approval process, including Laserfiche approval, school leadership approval, and any additional required campus approvals. Once fully approved, upload the final approved paperwork to your attendee portal.',
      '',
      'Important: Registration alone does not confirm your campus\u2019s attendance at the Showcase. Your campus will be considered fully confirmed only after the Dallas ISD CTE team has received and verified your fully approved field trip paperwork.',
      '',
      'If your approved field trip paperwork is not uploaded by September 11, 2026, Dallas ISD CTE will begin releasing reserved transportation the following week.',
      '',
      '2. Confirm Student Sack Lunches',
      'Coordinate with your campus cafeteria manager to arrange sack lunches for all participating students. Once confirmed, upload the required lunch confirmation documentation to your attendee portal.',
    ]);
    if (isSplitDays) {
      registrantLines = registrantLines.concat([
        '',
        '3. Split-Day Attendance Request \u2014 Meeting Required',
        'Because your campus selected split-day attendance, a meeting with the Dallas ISD CTE Middle School Coordinators and your campus administrative team is required before your registration can be fully approved.',
        '',
        'Please contact one of the Dallas ISD CTE Middle School Coordinators as soon as possible to schedule this meeting. Meetings may be conducted virtually or in person.',
        '',
        'Please note: your campus will not receive final approval for its event schedule until this meeting has taken place.',
      ]);
    }
    registrantLines = registrantLines.concat([
      '',
      'Student Materials Pickup',
      'Student event materials will be available for pickup during the week of September 21\u201325, 2026.',
      'Pickup Location: Cotton Building \u2014 Upper Portables, 3701 Botham Jean Boulevard, Dallas, Texas',
      'Each campus will receive: Student event bags, Student Showcase T-shirts, Event materials, Additional campus resources.',
      '',
      'Event Schedule',
      'Tuesday, October 6, 2026 \u2014 Campus buses will arrive for student pickup. Students will be transported to Ellis Davis Field House. Student event hours: 9:00 a.m.\u20132:00 p.m.',
      'Wednesday, October 7, 2026 \u2014 Same format as Tuesday. Buses will transport students to and from Ellis Davis Field House.',
      '',
      'Questions? Contact one of the Dallas ISD CTE Middle School Coordinators.',
      '',
      'Thank you for partnering with Dallas ISD Career & Technical Education. We look forward to welcoming your campus to the 2026\u20132027 Annual Dallas ISD CTE Career Exploration Showcase.',
      '',
      'Sincerely,',
      'Dallas ISD Career & Technical Education',
      '2026\u20132027 Annual Dallas ISD CTE Career Exploration Showcase',
    ]);

    if (data.email) {
      var emailOpts = {
        to:      data.email,
        subject: '2026\u20132027 CTE Showcase Attendee Registration Received \u2014 Dallas ISD',
        body:    registrantLines.join('\n'),
      };
      if (ccList.length) emailOpts.cc = ccList.join(',');
      MailApp.sendEmail(emailOpts);
    }

    // Build admin notification body
    var adminLines = [
      'A new attendee registration has been submitted.',
      '',
      'Campus:           ' + (data.campus || ''),
      'Org Number:       ' + (data.campusOrgNumber || ''),
      'Region:           ' + (campusRegion || 'Not on file'),
      'Teacher:          ' + (data.teacherName || ''),
      'Email:            ' + (data.email || ''),
      'Phone:            ' + (data.cellPhone || ''),
      'Event Date:       ' + (data.eventDate || ''),
      'Students:         ' + (data.studentCount || ''),
      'Wheelchair Bus:   ' + (data.wheelchairBus || ''),
      'Paperwork:        Not yet submitted',
      'Principal CC\'d:   ' + (principalEmail || 'None \u2014 campus not in roster'),
    ];
    if (isSplitDays) {
      adminLines = adminLines.concat([
        '',
        '\u2014 SPLIT DAYS REQUEST \u2014',
        'This campus has indicated they would like to split their visit across both event dates.',
        'Their reason is noted below. Please note: the campus is responsible for initiating',
        'scheduling contact with your team. Once they reach out, a planning meeting can be arranged.',
        '',
        'Reason provided:  ' + (splitReason || '(no reason entered)'),
      ]);
    }
    adminLines.push('');
    adminLines.push('Review in the Admin Hub.');

    if (adminEmail) {
      var adminSubject = isSplitDays
        ? '[SPLIT DAYS] New Attendee Registration: ' + (data.campus || data.teacherName)
        : 'New Attendee Registration: ' + (data.campus || data.teacherName);
      MailApp.sendEmail({
        to:      adminEmail,
        subject: adminSubject,
        body:    adminLines.join('\n'),
      });
    }
    return jsonSafe({ success: true });
  } catch (e) {
    return { success: false, message: 'Submission failed: ' + (e.message || String(e)) };
  }
}

function checkRegistrationStatus(email) {
  if (!email) return { success: false, message: 'Please enter your email address.' };
  var needle = String(email).trim().toLowerCase();
  var results = [];
  try {
    sheetToObjects(SHEET.EXHIBITOR_REG).forEach(function(r) {
      if (String(r['Email'] || '').trim().toLowerCase() === needle) {
        results.push({ type: 'Exhibitor', name: r['FullName'] || '', organization: r['CampusCompany'] || '', status: r['Status'] || 'Pending', timestamp: r['Timestamp'] || '' });
      }
    });
  } catch (e) {}
  try {
    sheetToObjects(SHEET.ATTENDEE_REG).forEach(function(r) {
      if (String(r['Email'] || '').trim().toLowerCase() === needle) {
        results.push({ type: 'Attendee', name: r['TeacherName'] || '', organization: r['Campus'] || '', status: r['Status'] || 'Pending', timestamp: r['Timestamp'] || '' });
      }
    });
  } catch (e) {}
  if (!results.length) return { success: false, message: 'No registration found for this email address.' };
  return jsonSafe({ success: true, results: results });
}

// â”€â”€â”€ ALLERGY DISCLOSURE API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function submitAllergyDisclosure(vendorId, data) {
  try {
    if (!vendorId) return { success: false, message: 'Vendor ID is required.' };
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET.VENDORS);
    if (!sheet) return { success: false, message: 'Vendors sheet not found.' };

    var allData = sheet.getDataRange().getValues();
    var headers = allData[0];

    // Ensure all allergy columns exist; add any that are missing
    var allergyColumns = [
      'AllergyMilk','AllergyEggs','AllergyFish','AllergyShellfish',
      'AllergyTreeNuts','AllergyPeanuts','AllergyWheat','AllergySoy',
      'AllergySesame','IsVegetarian','IsVegan',
    ];
    allergyColumns.forEach(function (col) {
      if (headers.indexOf(col) === -1) {
        sheet.getRange(1, headers.length + 1).setValue(col);
        headers.push(col);
      }
    });

    // Find vendor row by VendorID
    var vidIdx = headers.indexOf('VendorID');
    var rowIdx = -1;
    for (var i = 1; i < allData.length; i++) {
      if (String(allData[i][vidIdx] || '').trim() === String(vendorId).trim()) {
        rowIdx = i;
        break;
      }
    }
    if (rowIdx === -1) return { success: false, message: 'Vendor not found.' };

    var fieldMap = {
      AllergyMilk:      data.milk        || 'No',
      AllergyEggs:      data.eggs        || 'No',
      AllergyFish:      data.fish        || 'No',
      AllergyShellfish: data.shellfish   || 'No',
      AllergyTreeNuts:  data.treeNuts    || 'No',
      AllergyPeanuts:   data.peanuts     || 'No',
      AllergyWheat:     data.wheat       || 'No',
      AllergySoy:       data.soy         || 'No',
      AllergySesame:    data.sesame      || 'No',
      IsVegetarian:     data.vegetarian  || 'No',
      IsVegan:          data.vegan       || 'No',
    };

    allergyColumns.forEach(function (col) {
      var colIdx = headers.indexOf(col);
      if (colIdx !== -1) {
        sheet.getRange(rowIdx + 1, colIdx + 1).setValue(fieldMap[col]);
      }
    });

    return jsonSafe({ success: true });
  } catch (e) {
    return { success: false, message: 'Error saving disclosure: ' + (e.message || String(e)) };
  }
}

// â”€â”€â”€ ATTENDEE CHECKLIST API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function verifyAttendeeByOrgNumber(orgNumber) {
  if (!orgNumber) return { success: false, message: 'Please enter your campus org number.' };

  var rows = sheetToObjects(SHEET.ATTENDEE_REG);
  var reg = rows.find(function (r) {
    return String(r['CampusOrgNumber'] || '').trim() === String(orgNumber).trim();
  });
  if (!reg) return { success: false, message: 'Org number not found. Please verify your number or complete campus registration first.' };

  var checklist = getAttendeeChecklist(orgNumber);
  var docs      = getDocumentsFiltered('teacher');
  return jsonSafe({
    success: true,
    attendee: {
      orgNumber:   reg['CampusOrgNumber'] || '',
      teacherName: reg['TeacherName']     || '',
      campus:      reg['Campus']          || '',
      email:       reg['Email']           || '',
      status:      reg['Status']          || 'Pending',
      region:      reg['Region']          || '',
    },
    checklist: checklist,
    documents: docs,
  });
}

function getAttendeeChecklist(orgNumber) {
  try {
    var items = sheetToObjects(SHEET.ATTENDEE_CHECKLIST);
    return items
      .filter(function (r) { return String(r['OrgNumber'] || '').trim() === String(orgNumber).trim(); })
      .map(function (r) {
        return {
          _row:        r._row,
          itemName:    r['ItemName']    || '',
          status:      r['Status']      || 'Pending',
          autoManaged: r['AutoManaged'] || 'No',
          notes:       r['Notes']       || '',
          updatedAt:   r['UpdatedAt']   || '',
        };
      });
  } catch (e) {
    return [];
  }
}

// â”€â”€â”€ ADMIN AUTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function verifyAdmin(password) {
  const sheet = getSheet(SHEET.ADMIN_AUTH);
  if (!sheet) return { success: false, message: 'AdminAuth sheet not found. Please run setupSheets first.' };
  const stored = String(sheet.getRange(2, 1).getValue() || '').trim();
  if (!stored) return { success: false, message: 'No admin password set. Check the AdminAuth tab in your spreadsheet.' };
  if (stored !== String(password).trim()) return { success: false, message: 'Incorrect password.' };
  return { success: true };
}

function getDocumentsFiltered(level) {
  const docs = sheetToObjects(SHEET.DOCUMENTS);
  return docs
    .filter(function (d) {
      const a = String(d['AccessLevel'] || '').trim().toLowerCase();
      return !level || a === level || a === 'both';
    })
    .map(function (d) {
      return {
        docName:     d['DocName']     || '',
        url:         d['URL']         || '',
        accessLevel: d['AccessLevel'] || '',
        category:    d['Category']    || 'General',
      };
    });
}

// â”€â”€â”€ FAQ API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getFaqs() {
  try {
    return jsonSafe({ success: true, data: sheetToObjects(SHEET.FAQS).map(function(r) {
      return { question: r['Question'] || '', answer: r['Answer'] || '' };
    })});
  } catch(e) { return { success: false, message: e.message }; }
}

function saveFaqs(rows) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ss.getSheetByName(SHEET.FAQS);
    if (!sh) sh = ss.insertSheet(SHEET.FAQS);
    sh.clearContents();
    sh.getRange(1,1,1,2).setValues([['Question','Answer']]);
    if (rows && rows.length) {
      sh.getRange(2,1,rows.length,2).setValues(
        rows.map(function(r){ return [r.question||'', r.answer||'']; })
      );
    }
    return { success: true };
  } catch(e) { return { success: false, message: e.message }; }
}

// â”€â”€â”€ EMAIL BROADCAST API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getEmailTemplates() {
  try {
    return jsonSafe({ success: true, templates: sheetToObjects(SHEET.EMAIL_TEMPLATES) });
  } catch(e) { return { success: false, message: e.message }; }
}

function getEmailLog() {
  try {
    return jsonSafe({ success: true, log: sheetToObjects(SHEET.EMAIL_LOG) });
  } catch(e) { return { success: false, message: e.message }; }
}

function saveEmailTemplate(row) {
  try {
    if (!row || !row.TemplateID) return { success: false, message: 'TemplateID required.' };
    var ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh   = ss.getSheetByName(SHEET.EMAIL_TEMPLATES);
    if (!sh) return { success: false, message: 'EmailTemplates sheet not found. Run setupSheets.' };
    var data    = sh.getDataRange().getValues();
    var headers = data[0];
    var idIdx   = headers.indexOf('TemplateID');
    var now     = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d/yyyy h:mm a');

    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIdx] || '').trim() === String(row.TemplateID).trim()) { rowIndex = i; break; }
    }
    var values = headers.map(function(h) {
      if (h === 'LastModified') return now;
      return row[h] !== undefined ? row[h] : (rowIndex >= 0 ? data[rowIndex][headers.indexOf(h)] : '');
    });
    if (rowIndex >= 0) {
      sh.getRange(rowIndex + 1, 1, 1, headers.length).setValues([values]);
    } else {
      sh.appendRow(values);
    }
    return { success: true };
  } catch(e) { return { success: false, message: e.message }; }
}

// Returns unique audience groups derived from live sheet data (for UI dropdowns).
function getAudienceGroups() {
  try {
    var groups = [
      { key: 'all_registered_campuses', label: 'All Registered Campuses (Attendees)' },
      { key: 'unregistered_campuses',   label: 'Unregistered Campuses (In Roster, Not Registered)' },
      { key: 'all_exhibitors',          label: 'All Registered Exhibitors' },
      { key: 'all_vendors',             label: 'All Active Vendors' },
    ];
    // Add one group per unique region
    var campuses = sheetToObjects(SHEET.CAMPUSES);
    var regions = {};
    campuses.forEach(function(c) {
      var r = String(c['Region'] || '').trim();
      if (r && !regions[r]) { regions[r] = true; groups.push({ key: 'region_' + r, label: 'Campuses in Region: ' + r }); }
    });
    return jsonSafe({ success: true, groups: groups });
  } catch(e) { return { success: false, message: e.message }; }
}

// Resolves an audience key to an array of {name, email} objects.
function resolveAudience_(audienceKey) {
  var results = [];
  var seen    = {};
  function add(name, email) {
    email = String(email || '').trim().toLowerCase();
    if (!email || seen[email]) return;
    seen[email] = true;
    results.push({ name: String(name || '').trim(), email: email });
  }

  if (audienceKey === 'all_registered_campuses') {
    sheetToObjects(SHEET.ATTENDEE_REG).forEach(function(r) { add(r['TeacherName'] + ' (' + r['Campus'] + ')', r['Email']); });
  } else if (audienceKey === 'all_exhibitors') {
    sheetToObjects(SHEET.EXHIBITOR_REG).forEach(function(r) { add(r['FullName'], r['Email']); });
  } else if (audienceKey === 'all_vendors') {
    sheetToObjects(SHEET.VENDORS).filter(function(v){ return String(v['Status']||'').trim() === 'Active'; })
      .forEach(function(v) { add(v['CompanyName'], v['Email']); });
  } else if (audienceKey === 'unregistered_campuses') {
    var regOrgs = {};
    sheetToObjects(SHEET.ATTENDEE_REG).forEach(function(r) { regOrgs[String(r['CampusOrgNumber']||'').trim()] = true; });
    sheetToObjects(SHEET.CAMPUSES).forEach(function(c) {
      var org = String(c['OrgNumber'] || '').trim();
      if (!regOrgs[org]) add(c['PrincipalName'] || c['CampusName'], c['PrincipalEmail']);
    });
  } else if (audienceKey && audienceKey.indexOf('region_') === 0) {
    var region = audienceKey.replace('region_', '');
    sheetToObjects(SHEET.CAMPUSES).filter(function(c){ return String(c['Region']||'').trim() === region; })
      .forEach(function(c) { add(c['PrincipalName'] || c['CampusName'], c['PrincipalEmail']); });
  }
  return results;
}

// Preview: returns recipient count + sample names without sending anything.
function previewAudience(audienceKey) {
  try {
    var list = resolveAudience_(audienceKey);
    var sample = list.slice(0, 5).map(function(r) { return r.name || r.email; });
    return jsonSafe({ success: true, count: list.length, sample: sample });
  } catch(e) { return { success: false, message: e.message }; }
}

// Main broadcast send. payload: { templateId, audienceKey, subject, body }
function sendBroadcastEmail(payload) {
  try {
    if (!payload || !payload.audienceKey) return { success: false, message: 'Audience required.' };
    if (!payload.subject)                 return { success: false, message: 'Subject required.' };
    if (!payload.body)                    return { success: false, message: 'Body required.' };

    var recipients = resolveAudience_(payload.audienceKey);
    if (!recipients.length) return { success: false, message: 'No recipients found for selected audience.' };

    var adminEmail = getSiteContentValue('adminEmail') || '';
    var sent = 0;
    recipients.forEach(function(r) {
      try {
        MailApp.sendEmail({
          to:      r.email,
          subject: payload.subject,
          body:    payload.body,
          replyTo: adminEmail || undefined,
        });
        sent++;
      } catch(mailErr) { /* skip bad address, keep sending */ }
    });

    // Log the send
    var ss  = SpreadsheetApp.openById(SPREADSHEET_ID);
    var log = ss.getSheetByName(SHEET.EMAIL_LOG);
    if (log) {
      var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d/yyyy h:mm a');
      log.appendRow([ts, payload.templateName || payload.templateId || '', payload.audienceKey, sent, payload.subject, adminEmail || 'Admin']);
    }

    return jsonSafe({ success: true, recipientCount: sent });
  } catch(e) { return { success: false, message: 'Send failed: ' + (e.message || String(e)) }; }
}

// â”€â”€â”€ VENDOR CHECK-IN API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Ensures CheckedIn and CheckInTime columns exist on the Vendors sheet.
// Non-destructive â€” only appends if missing.
function ensureVendorCheckInColumns() {
  var ss  = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh  = ss.getSheetByName(SHEET.VENDORS);
  if (!sh) return;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var needed = ['CheckedIn', 'CheckInTime'];
  needed.forEach(function(col) {
    if (headers.indexOf(col) === -1) {
      var nextCol = sh.getLastColumn() + 1;
      sh.getRange(1, nextCol).setValue(col);
    }
  });
}

function checkInVendor(vendorId) {
  try {
    if (!vendorId) return { success: false, message: 'Please enter a Vendor ID.' };
    vendorId = String(vendorId).trim().toUpperCase();

    ensureVendorCheckInColumns();

    var ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh     = ss.getSheetByName(SHEET.VENDORS);
    if (!sh)   return { success: false, message: 'Vendor data unavailable.' };

    var data    = sh.getDataRange().getValues();
    var headers = data[0];
    var idIdx   = headers.indexOf('VendorID');
    var statusIdx = headers.indexOf('Status');
    var nameIdx = headers.indexOf('CompanyName');
    var ciIdx   = headers.indexOf('CheckedIn');
    var ctIdx   = headers.indexOf('CheckInTime');

    if (idIdx < 0) return { success: false, message: 'Sheet configuration error.' };

    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIdx] || '').trim().toUpperCase() === vendorId) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) return { success: false, message: 'Vendor ID not found. Please check and try again.' };

    var row = data[rowIndex];
    var status = String(row[statusIdx] || '').trim();
    if (status !== 'Active') {
      return { success: false, message: 'This Vendor ID is not active. Please see a staff member.' };
    }

    var companyName = String(row[nameIdx] || vendorId);
    var alreadyCheckedIn = String(row[ciIdx] || '').trim().toLowerCase() === 'yes';
    var existingTime = String(row[ctIdx] || '').trim();

    if (alreadyCheckedIn) {
      return jsonSafe({
        success: true,
        alreadyCheckedIn: true,
        companyName: companyName,
        vendorId: vendorId,
        checkInTime: existingTime,
      });
    }

    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d/yyyy h:mm a');
    var sheetRow = rowIndex + 1;
    if (ciIdx >= 0) sh.getRange(sheetRow, ciIdx + 1).setValue('Yes');
    if (ctIdx >= 0) sh.getRange(sheetRow, ctIdx + 1).setValue(now);

    return jsonSafe({
      success: true,
      alreadyCheckedIn: false,
      companyName: companyName,
      vendorId: vendorId,
      checkInTime: now,
    });
  } catch(e) {
    return { success: false, message: 'Check-in error: ' + (e.message || String(e)) };
  }
}

// Returns full check-in summary (for Admin Hub panel refresh).
function getCheckInStatus() {
  try {
    ensureVendorCheckInColumns();
    var rows = sheetToObjects(SHEET.VENDORS);
    return jsonSafe({
      success: true,
      vendors: rows.map(function(v) {
        return {
          vendorId:     v['VendorID']     || '',
          companyName:  v['CompanyName']  || '',
          contact:      v['Contact']      || '',
          status:       v['Status']       || '',
          checkedIn:    v['CheckedIn']    || '',
          checkInTime:  v['CheckInTime']  || '',
        };
      }),
    });
  } catch(e) {
    return { success: false, message: e.message };
  }
}

// â”€â”€â”€ ADMIN API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function adminGetAll() {
  try {
    return jsonSafe(adminGetAllInner());
  } catch (err) {
    return { success: false, message: 'Server error: ' + (err && err.message ? err.message : err) };
  }
}

function adminGetAllInner() {
  const eiRows = sheetToObjects(SHEET.EVENT_INFO);
  const ei = {};
  eiRows.forEach(function (r) { if (r['Key']) ei[r['Key']] = r['Value']; });
  if (typeof ei.schedule === 'string') {
    try { ei.schedule = JSON.parse(ei.schedule); } catch (e) { ei.schedule = []; }
  }

  const scRows = sheetToObjects(SHEET.SITE_CONTENT);
  const sc = {};
  scRows.forEach(function (r) { if (r['Key']) sc[r['Key']] = r['Value']; });

  return {
    success: true,
    data: {
      eventInfo:   ei,
      siteContent: applySiteDefaults(sc),
      vendors: sheetToObjects(SHEET.VENDORS).map(function (v) {
        return {
          _row: v._row,
          vendorId:         v['VendorID'],
          companyName:      v['CompanyName'],
          contact:          v['Contact'],
          email:            v['Email'],
          status:           v['Status'],
          notes:            v['Notes'],
          documentLinks:    v['DocumentLinks'],
          allergyMilk:      v['AllergyMilk']      || '',
          allergyEggs:      v['AllergyEggs']      || '',
          allergyFish:      v['AllergyFish']      || '',
          allergyShellfish: v['AllergyShellfish'] || '',
          allergyTreeNuts:  v['AllergyTreeNuts']  || '',
          allergyPeanuts:   v['AllergyPeanuts']   || '',
          allergyWheat:     v['AllergyWheat']     || '',
          allergySoy:       v['AllergySoy']       || '',
          allergySesame:    v['AllergySesame']    || '',
          isVegetarian:     v['IsVegetarian']     || '',
          isVegan:          v['IsVegan']          || '',
          checkedIn:        v['CheckedIn']        || '',
          checkInTime:      v['CheckInTime']      || '',
        };
      }),
      teachers: sheetToObjects(SHEET.TEACHERS).map(function (t) {
        return {
          _row: t._row,
        eid:           t['EID'],
        teacherName:   t['TeacherName'],
        campus:        t['Campus'],
        status:        t['Status'],
        notes:         t['Notes'],
        documentLinks: t['DocumentLinks'],
          orgNumber:     t['OrgNumber'] || '',
        };
      }),
      checklist: sheetToObjects(SHEET.ATTENDEE_CHECKLIST).map(function (c) {
        return {
          _row:        c._row,
          orgNumber:   c['OrgNumber']   || '',
          itemName:    c['ItemName']    || '',
          status:      c['Status']      || 'Pending',
          autoManaged: c['AutoManaged'] || 'No',
          notes:       c['Notes']       || '',
          updatedBy:   c['UpdatedBy']   || '',
          updatedAt:   c['UpdatedAt']   || '',
        };
      }),
      documents: sheetToObjects(SHEET.DOCUMENTS).map(function (d) {
        return {
          _row: d._row,
          docName:     d['DocName'],
          url:         d['URL'],
          accessLevel: d['AccessLevel'],
          category:    d['Category'],
        };
      }),
      campuses: sheetToObjects(SHEET.CAMPUSES).map(function (c) {
        return {
          _row:               c._row,
          campusName:         c['CampusName']         || '',
          orgNumber:          c['OrgNumber']           || '',
          region:             c['Region']              || '',
          principalName:      c['PrincipalName']       || '',
          principalEmail:     c['PrincipalEmail']      || '',
          officeManagerName:  c['OfficeManagerName']   || '',
          officeManagerEmail: c['OfficeManagerEmail']  || '',
          campusPhone:        c['CampusPhone']         || '',
          regionalDirector:   c['RegionalDirector']    || '',
          executiveDirector:  c['ExecutiveDirector']   || '',
          trustee:            c['Trustee']             || '',
          disDRegion:         c['DisDRegion']          || '',
        };
      }),
      exhibitorReg: sheetToObjects(SHEET.EXHIBITOR_REG).map(function (r) {
        return {
          _row:                 r._row,
          timestamp:            r['Timestamp']            || '',
          status:               r['Status']               || 'Pending',
          fullName:             r['FullName']             || '',
          email:                r['Email']                || '',
          cellPhone:            r['CellPhone']            || '',
          secondaryName:        r['SecondaryName']        || '',
          secondaryEmail:       r['SecondaryEmail']       || '',
          secondaryPhone:       r['SecondaryPhone']       || '',
          campusCompany:        r['CampusCompany']        || '',
          returningExhibitor:   r['ReturningExhibitor']   || '',
          boothStaff:           r['BoothStaff']           || '',
          studentAmbassadors:   r['StudentAmbassadors']   || '',
          careerCluster:        r['CareerCluster']        || '',
          activityDescription:  r['ActivityDescription']  || '',
          electricityNeeded:    r['ElectricityNeeded']    || '',
          electricityType:      r['ElectricityType']      || '',
          wifiNeeded:           r['WifiNeeded']           || '',
          tablesChairs:         r['TablesChairs']         || '',
          specialAccommodations:r['SpecialAccommodations']|| '',
          studentGiveaways:     r['StudentGiveaways']     || '',
          meetingAvailability:  r['MeetingAvailability']  || '',
        };
      }),
      attendeeReg: sheetToObjects(SHEET.ATTENDEE_REG).map(function (r) {
        return {
          _row:            r._row,
          timestamp:       r['Timestamp']       || '',
          status:          r['Status']          || 'Pending',
          campusOrgNumber: r['CampusOrgNumber'] || '',
          teacherName:     r['TeacherName']     || '',
          cellPhone:       r['CellPhone']       || '',
          email:           r['Email']           || '',
          campus:          r['Campus']          || '',
          wheelchairBus:   r['WheelchairBus']   || '',
          eventDate:       r['EventDate']       || '',
          studentCount:    r['StudentCount']    || '',
          mainContact:     r['MainContact']     || '',
          altContactName:  r['AltContactName']  || '',
          paperworkStatus: r['PaperworkStatus'] || '',
          region:          r['Region']          || '',
          principalEmail:  r['PrincipalEmail']  || '',
        };
      }),
      faqs: sheetToObjects(SHEET.FAQS).map(function(r) {
        return { question: r['Question'] || '', answer: r['Answer'] || '' };
      }),
      emailTemplates: sheetToObjects(SHEET.EMAIL_TEMPLATES),
      emailLog: sheetToObjects(SHEET.EMAIL_LOG).slice(-50).reverse(), // last 50 sends, newest first
    },
  };
}

function approveVendor(payload) {
  try {
    var regRow      = parseInt(payload.regRow, 10);
    var vendorId    = String(payload.vendorId    || '').trim();
    var email       = String(payload.email       || '').trim();
    var fullName    = String(payload.fullName    || '').trim();
    var campusCompany = String(payload.campusCompany || '').trim();

    if (!regRow || !vendorId || !email) {
      return { success: false, message: 'Missing required fields (row, vendorId, email).' };
    }

    // 1. Mark ExhibitorRegistrations row as Approved
    var regSheet = getSheet(SHEET.EXHIBITOR_REG);
    if (regSheet) {
      var regHeaders = regSheet.getRange(1, 1, 1, regSheet.getLastColumn()).getValues()[0];
      var regStatusCol = regHeaders.indexOf('Status') + 1;
      if (regStatusCol > 0) regSheet.getRange(regRow, regStatusCol).setValue('Approved');
    }

    // 2. Add vendor to Vendors roster (so they can log in to Vendor Portal)
    var vendorSheet = getSheet(SHEET.VENDORS);
    if (vendorSheet) {
      var vendorHeaders = vendorSheet.getRange(1, 1, 1, vendorSheet.getLastColumn()).getValues()[0];
      // Check if this vendor ID already exists
      var existingIds = vendorSheet.getLastRow() > 1
        ? vendorSheet.getRange(2, 1, vendorSheet.getLastRow() - 1, 1).getValues().map(function(r){ return String(r[0]).trim(); })
        : [];
      if (existingIds.indexOf(vendorId) === -1) {
        var newRow = vendorHeaders.map(function(h) {
          if (h === 'VendorID')     return vendorId;
          if (h === 'CompanyName')  return campusCompany;
          if (h === 'Contact')      return fullName;
          if (h === 'Email')        return email;
          if (h === 'Status')       return 'Active';
          return '';
        });
        vendorSheet.appendRow(newRow);
      }
    }

    // 3. Send approval email to exhibitor
    var eiRows = sheetToObjects(SHEET.EVENT_INFO);
    var ei = {};
    eiRows.forEach(function(r) { if (r['Key']) ei[r['Key']] = r['Value']; });
    var adminEmail = getSiteContentValue('adminEmail') || '';

    var subject = 'Exhibitor Approval â€” Your Booth Has Been Assigned';
    var body =
      'Dear ' + (campusCompany || fullName) + ',\n\n' +
      'We are pleased to inform you that your exhibitor registration has been approved!\n\n' +
      'Your assigned booth / vendor number is: ' + vendorId + '\n\n' +
      (ei.eventName ? 'Event: '    + ei.eventName + '\n' : '') +
      (ei.date      ? 'Date: '     + ei.date      + '\n' : '') +
      (ei.time      ? 'Time: '     + ei.time      + '\n' : '') +
      (ei.location  ? 'Location: ' + ei.location  + '\n' : '') +
      '\nPlease save this email â€” your booth number (' + vendorId + ') is your login ID for the Exhibitor Portal, ' +
      'where you will find required paperwork and event resources.\n\n' +
      'Further details and next steps will follow as the event date approaches. ' +
      'If you have any questions in the meantime, please reply to this email.\n\n' +
      'Thank you,\nEvent Team';

    MailApp.sendEmail({ to: email, cc: adminEmail, subject: subject, body: body });

    return { success: true, message: 'Vendor approved, added to roster, and notified by email.' };
  } catch (err) {
    return { success: false, message: err.message || String(err) };
  }
}

function updateAttendeeStatus(payload) {
  try {
    var regRow      = parseInt(payload.regRow, 10);
    var status      = String(payload.status      || '').trim();
    var teacherName = String(payload.teacherName || '').trim();
    var campus      = String(payload.campus      || '').trim();
    var email       = String(payload.email       || '').trim();
    var orgNumber   = String(payload.orgNumber   || '').trim();

    if (!regRow || !status || !email) {
      return { success: false, message: 'Missing required fields.' };
    }

    // 1. Write new status to AttendeeRegistrations sheet
    var sheet = getSheet(SHEET.ATTENDEE_REG);
    if (!sheet) return { success: false, message: 'AttendeeRegistrations sheet not found.' };
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var statusCol = headers.indexOf('Status') + 1;
    if (statusCol < 1) return { success: false, message: 'Status column not found.' };
    sheet.getRange(regRow, statusCol).setValue(status);

    // 2. Send notification email
    var adminEmail = getSiteContentValue('adminEmail') || '';
    var eiRows = sheetToObjects(SHEET.EVENT_INFO);
    var ei = {};
    eiRows.forEach(function(r) { if (r['Key']) ei[r['Key']] = r['Value']; });

    var eventLine = (ei.eventName ? ei.eventName : 'the upcoming event');
    var greeting  = 'Dear ' + (teacherName || campus || 'Campus Representative') + ',\n\n';
    var eventInfo = (ei.date     ? 'Event Date: '  + ei.date     + '\n' : '') +
                    (ei.time     ? 'Time: '         + ei.time     + '\n' : '') +
                    (ei.location ? 'Location: '     + ei.location + '\n' : '');

    var subject, body;

    if (status === 'Approved') {
      subject = 'Campus Registration Approved â€” ' + eventLine;
      body = greeting +
        'Great news! Your campus registration for ' + eventLine + ' has been approved.\n\n' +
        (eventInfo ? eventInfo + '\n' : '') +
        'You may now log in to your Campus Portal at any time using your campus org number (' + orgNumber + ') to complete required paperwork and access event resources.\n\n' +
        'If you have any questions, please reply to this email.\n\nThank you,\nEvent Team';

    } else if (status === 'Waitlist') {
      subject = 'Campus Registration â€” Waitlist Notification â€” ' + eventLine;
      body = greeting +
        'Thank you for registering for ' + eventLine + '. Your campus has been placed on the waitlist.\n\n' +
        'A brief meeting will be required before your visit can be fully confirmed. Our team will reach out to schedule that conversation.\n\n' +
        'In the meantime, you are welcome to log in to your Campus Portal using your org number (' + orgNumber + ') to get a head start on any required paperwork.\n\n' +
        'If you have questions, please reply to this email.\n\nThank you,\nEvent Team';

    } else if (status === 'Deny') {
      subject = 'Campus Registration Update â€” ' + eventLine;
      body = greeting +
        'Thank you for your interest in ' + eventLine + '. After careful review, we are unable to accommodate your campus at this time.\n\n' +
        'We understand this is disappointing and appreciate your enthusiasm. If you believe this decision was made in error or would like to discuss further, please reply to this email and we will be happy to assist.\n\n' +
        'Thank you for your understanding,\nEvent Team';
    } else {
      // Pending or unknown â€” no email, just saved
      return { success: true };
    }

    MailApp.sendEmail({ to: email, cc: adminEmail, subject: subject, body: body });
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message || String(err) };
  }
}

function updateCampusRow(payload) {
  try {
    var rowIndex = parseInt(payload._row, 10);
    if (!rowIndex) return { success: false, message: 'Invalid row index.' };

    var sheet = getSheet(SHEET.CAMPUSES);
    if (!sheet) return { success: false, message: 'Campuses sheet not found.' };

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var rowData = headers.map(function(h) {
      var fieldMap = {
        'CampusName':        payload.campusName        || '',
        'OrgNumber':         payload.orgNumber          || '',
        'Region':            payload.region             || '',
        'PrincipalName':     payload.principalName      || '',
        'PrincipalEmail':    payload.principalEmail     || '',
        'OfficeManagerName': payload.officeManagerName  || '',
        'OfficeManagerEmail':payload.officeManagerEmail || '',
        'CampusPhone':       payload.campusPhone        || '',
        'RegionalDirector':  payload.regionalDirector   || '',
        'ExecutiveDirector': payload.executiveDirector  || '',
        'Trustee':           payload.trustee            || '',
        'DisDRegion':        payload.disDRegion         || '',
      };
      return fieldMap.hasOwnProperty(h) ? fieldMap[h] : '';
    });

    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowData]);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message || String(err) };
  }
}

function upsertCampuses(rows) {
  try {
    if (!rows || !rows.length) return { success: false, message: 'No rows provided.' };

    var sheet = getSheet(SHEET.CAMPUSES);
    if (!sheet) return { success: false, message: 'Campuses sheet not found.' };

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var orgCol = headers.indexOf('OrgNumber');
    if (orgCol < 0) return { success: false, message: 'OrgNumber column not found in Campuses sheet.' };

    // Read all existing data rows
    var lastRow = sheet.getLastRow();
    var existingData = lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
      : [];

    // Build a map of existing OrgNumber â†’ sheet row index (1-based)
    var orgToSheetRow = {};
    existingData.forEach(function(row, i) {
      var org = String(row[orgCol] || '').trim();
      if (org) orgToSheetRow[org] = i + 2; // +2 for header row + 0-index
    });

    var fieldMap = function(payload) {
      return headers.map(function(h) {
        var map = {
          'CampusName':        payload.campusName        || '',
          'OrgNumber':         payload.orgNumber          || '',
          'Region':            payload.region             || '',
          'PrincipalName':     payload.principalName      || '',
          'PrincipalEmail':    payload.principalEmail     || '',
          'OfficeManagerName': payload.officeManagerName  || '',
          'OfficeManagerEmail':payload.officeManagerEmail || '',
          'CampusPhone':       payload.campusPhone        || '',
          'RegionalDirector':  payload.regionalDirector   || '',
          'ExecutiveDirector': payload.executiveDirector  || '',
          'Trustee':           payload.trustee            || '',
          'DisDRegion':        payload.disDRegion         || '',
        };
        return map.hasOwnProperty(h) ? map[h] : '';
      });
    };

    var appended = 0, updated = 0;
    rows.forEach(function(payload) {
      var org = String(payload.orgNumber || '').trim();
      if (!org) return;
      var rowData = fieldMap(payload);
      if (orgToSheetRow[org]) {
        // Update existing row in place
        sheet.getRange(orgToSheetRow[org], 1, 1, headers.length).setValues([rowData]);
        updated++;
  } else {
        // Append as new row
        sheet.appendRow(rowData);
        orgToSheetRow[org] = sheet.getLastRow();
        appended++;
      }
    });

    return { success: true, message: 'Done. ' + updated + ' updated, ' + appended + ' added.' };
  } catch (err) {
    return { success: false, message: err.message || String(err) };
  }
}

function updateRegistrationStatus(payload) {
  try {
    var type     = payload.type;      // 'exhibitor' or 'attendee'
    var rowIndex = parseInt(payload.rowIndex, 10);
    var status   = payload.status;

    if (!type || !rowIndex || !status) {
      return { success: false, message: 'Missing required fields.' };
    }

    var sheetName = (type === 'exhibitor') ? SHEET.EXHIBITOR_REG : SHEET.ATTENDEE_REG;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, message: 'Sheet not found: ' + sheetName };

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var statusCol = headers.indexOf('Status') + 1;
    if (statusCol < 1) return { success: false, message: 'Status column not found.' };

    sheet.getRange(rowIndex, statusCol).setValue(status);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message || String(err) };
  }
}

function adminUpdate(sheetKey, payload) {
  const map = {
    vendors:     { sheet: SHEET.VENDORS,            remap: remapVendor    },
    teachers:    { sheet: SHEET.TEACHERS,           remap: remapTeacher   },
    documents:   { sheet: SHEET.DOCUMENTS,          remap: remapDocument  },
    checklist:   { sheet: SHEET.ATTENDEE_CHECKLIST, remap: remapChecklist },
    campuses:    { sheet: SHEET.CAMPUSES,           remap: remapCampus    },
    eventInfo:   { sheet: SHEET.EVENT_INFO,         remap: null           },
    siteContent: { sheet: SHEET.SITE_CONTENT,       remap: null           },
  };
  const cfg = map[sheetKey];
  if (!cfg) return { success: false, message: 'Unknown section: ' + sheetKey };

  if (sheetKey === 'eventInfo' || sheetKey === 'siteContent') {
    // Payload is a flat key/value object â€” write as Key/Value rows
    const rows = Object.keys(payload).map(function (k) {
      return { Key: k, Value: typeof payload[k] === 'object' ? JSON.stringify(payload[k]) : payload[k] };
    });
    objectsToSheet(cfg.sheet, rows);
  } else {
    const rows = (Array.isArray(payload) ? payload : []).map(cfg.remap);
    objectsToSheet(cfg.sheet, rows);
  }
  return { success: true, message: 'Saved successfully.' };
}

function remapVendor(r) {
  return {
    VendorID: r.vendorId, CompanyName: r.companyName, Contact: r.contact,
    Email: r.email, Status: r.status, Notes: r.notes, DocumentLinks: r.documentLinks,
    AllergyMilk: r.allergyMilk || '', AllergyEggs: r.allergyEggs || '',
    AllergyFish: r.allergyFish || '', AllergyShellfish: r.allergyShellfish || '',
    AllergyTreeNuts: r.allergyTreeNuts || '', AllergyPeanuts: r.allergyPeanuts || '',
    AllergyWheat: r.allergyWheat || '', AllergySoy: r.allergySoy || '',
    AllergySesame: r.allergySesame || '', IsVegetarian: r.isVegetarian || '',
    IsVegan: r.isVegan || '',
  };
}
function remapTeacher(r) {
  return { EID: r.eid, TeacherName: r.teacherName, Campus: r.campus, Status: r.status, Notes: r.notes, DocumentLinks: r.documentLinks, OrgNumber: r.orgNumber || '' };
}
function remapDocument(r) {
  return { DocName: r.docName, URL: r.url, AccessLevel: r.accessLevel, Category: r.category };
}
function remapChecklist(r) {
  return { OrgNumber: r.orgNumber, ItemName: r.itemName, Status: r.status, AutoManaged: r.autoManaged, Notes: r.notes, UpdatedBy: r.updatedBy, UpdatedAt: r.updatedAt };
}
function remapCampus(r) {
  return {
    CampusName:         r.campusName         || '',
    OrgNumber:          r.orgNumber          || '',
    Region:             r.region             || '',
    PrincipalName:      r.principalName      || '',
    PrincipalEmail:     r.principalEmail     || '',
    OfficeManagerName:  r.officeManagerName  || '',
    OfficeManagerEmail: r.officeManagerEmail || '',
    CampusPhone:        r.campusPhone        || '',
    RegionalDirector:   r.regionalDirector   || '',
    ExecutiveDirector:  r.executiveDirector  || '',
    Trustee:            r.trustee            || '',
    DisDRegion:         r.disDRegion         || '',
  };
}

// â”€â”€â”€ CAMPUS UPLOAD API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getCampusList() {
  try {
    var rows = sheetToObjects(SHEET.CAMPUSES);
    return rows.map(function(c) {
      return {
        orgNumber:  String(c['OrgNumber']  || '').trim(),
        campusName: String(c['CampusName'] || '').trim(),
      };
    }).filter(function(c) { return c.orgNumber || c.campusName; });
  } catch(e) {
    return [];
  }
}

function uploadCampuses(rows) {
  try {
    if (!Array.isArray(rows) || !rows.length) return { success: false, message: 'No rows provided.' };
    objectsToSheet(SHEET.CAMPUSES, rows.map(remapCampus));
    return jsonSafe({ success: true, message: rows.length + ' campus record' + (rows.length === 1 ? '' : 's') + ' saved.' });
  } catch (e) {
    return { success: false, message: 'Upload failed: ' + (e.message || String(e)) };
  }
}

// â”€â”€â”€ PORTAL ACCESS & UPLOADS API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Registration fail-safe: verify the user has actually registered before
// granting portal access. Vendors are checked against the Vendors sheet
// (VendorID assigned by admin after approval). Attendees are checked against
// the AttendeeRegistrations sheet (org number submitted at registration time).
function checkPortalAccess(type, id) {
  if (!type || !id) return { success: false, message: 'Invalid request.' };
  id = String(id).trim();
  if (type === 'vendor') {
    var vendors = sheetToObjects(SHEET.VENDORS);
    var found = vendors.some(function(v) {
      return String(v['VendorID'] || '').trim() === id;
    });
    if (!found) {
      return {
        success: false,
        notRegistered: true,
        message: 'Vendor ID not found. If you have not completed your exhibitor registration, please register first.',
      };
    }
    return { success: true };
  }
  if (type === 'attendee') {
    var rows = sheetToObjects(SHEET.ATTENDEE_REG);
    var reg = rows.find(function(r) {
      return String(r['CampusOrgNumber'] || '').trim() === id;
    });
    if (!reg) {
      return {
        success: false,
        notRegistered: true,
        message: 'No campus registration found for this org number. Please complete campus registration before accessing the portal.',
      };
    }
    var status = String(reg['Status'] || 'Pending').trim();
    if (status === 'Deny') {
      return {
        success: false,
        message: 'Your campus registration was not approved for this event. Please contact the event team if you have any questions.',
      };
    }
    if (status === 'Pending') {
      return {
        success: false,
        message: 'Your campus registration is still under review. You will receive an email notification once a decision has been made.',
      };
    }
    // Approved or Waitlist â€” allow access, flag waitlist for banner
    return { success: true, waitlisted: status === 'Waitlist' };
  }
  return { success: false, message: 'Unknown portal type.' };
}

// Returns or creates a sheet with the given name and headers.
function getOrCreateSheet(name, headers) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold').setBackground('#0a1628').setFontColor('#c9a84c');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Uploads a file to Google Drive and records the link in the PortalUploads sheet.
// payload: { type, id, fileName, mimeType, base64 }
function uploadPortalDocument(payload) {
  try {
    if (!payload || !payload.base64) return { success: false, message: 'No file data received.' };
    if (!payload.id || !payload.type) return { success: false, message: 'Missing portal type or ID.' };

    // Decode and create the file blob
    var decoded = Utilities.base64Decode(payload.base64);
    var blob = Utilities.newBlob(decoded, payload.mimeType || 'application/octet-stream', payload.fileName || 'upload');

    // Get or create the upload folder
    var folderId = getSiteContentValue('portalUploadsFolderId');
    var folder;
    if (folderId) {
      try { folder = DriveApp.getFolderById(folderId); } catch (e) { folder = null; }
    }
    if (!folder) {
      folder = DriveApp.createFolder('Showcase Portal Uploads');
      // Save folder ID back to SiteContent for reuse
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      var scSheet = ss.getSheetByName(SHEET.SITE_CONTENT);
      if (scSheet) {
        var scData = scSheet.getDataRange().getValues();
        var keyIdx = scData[0].indexOf('Key');
        var valIdx = scData[0].indexOf('Value');
        var foundRow = -1;
        for (var i = 1; i < scData.length; i++) {
          if (String(scData[i][keyIdx] || '') === 'portalUploadsFolderId') { foundRow = i + 1; break; }
        }
        if (foundRow > 0) {
          scSheet.getRange(foundRow, valIdx + 1).setValue(folder.getId());
        } else {
          scSheet.appendRow(['portalUploadsFolderId', folder.getId()]);
        }
      }
    }

    // Create a subfolder per type/id to keep files organized
    var subFolderName = String(payload.type) + '_' + String(payload.id);
    var subFolderIter = folder.getFoldersByName(subFolderName);
    var subFolder = subFolderIter.hasNext() ? subFolderIter.next() : folder.createFolder(subFolderName);

    var file = subFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var link = file.getUrl();

    var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d/yyyy HH:mm');
    var sheet = getOrCreateSheet(SHEET.PORTAL_UPLOADS, ['Timestamp', 'Type', 'ID', 'FileName', 'MimeType', 'DriveLink', 'Status']);
    sheet.appendRow([ts, payload.type, payload.id, payload.fileName || 'upload', payload.mimeType || '', link, 'Pending']);

    return jsonSafe({ success: true, link: link });
  } catch (e) {
    return { success: false, message: 'Upload failed: ' + (e.message || String(e)) };
  }
}

// Writes (or appends) a single Key/Value pair in the SiteContent sheet.
function setSiteContentValue(key, value) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var scSheet = ss.getSheetByName(SHEET.SITE_CONTENT);
  if (!scSheet) return;
  var scData = scSheet.getDataRange().getValues();
  var keyIdx = scData[0].indexOf('Key');
  var valIdx = scData[0].indexOf('Value');
  if (keyIdx < 0 || valIdx < 0) return;
  for (var i = 1; i < scData.length; i++) {
    if (String(scData[i][keyIdx] || '') === key) {
      scSheet.getRange(i + 1, valIdx + 1).setValue(value);
      return;
    }
  }
  scSheet.appendRow([key, value]);
}

// Uploads a branding asset (background image or logo) to Drive and saves a
// reliable display URL back into SiteContent. payload: { kind, fileName, mimeType, base64 }
// kind: 'background' -> heroBackgroundImageUrl, 'logo' -> logoUrl
function uploadBrandingMedia(payload) {
  try {
    if (!payload || !payload.base64) return { success: false, message: 'No file data received.' };
    var kind = String(payload.kind || '').trim();
    if (kind !== 'background' && kind !== 'logo') {
      return { success: false, message: 'Invalid branding asset type.' };
    }

    var decoded = Utilities.base64Decode(payload.base64);
    var blob = Utilities.newBlob(decoded, payload.mimeType || 'application/octet-stream', payload.fileName || 'upload');

    // Get or create a dedicated branding folder
    var folderId = getSiteContentValue('brandingFolderId');
    var folder;
    if (folderId) {
      try { folder = DriveApp.getFolderById(folderId); } catch (e) { folder = null; }
    }
    if (!folder) {
      folder = DriveApp.createFolder('Showcase Branding');
      setSiteContentValue('brandingFolderId', folder.getId());
    }

    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var fileId = file.getId();

    // Reliable display URL for embedding as <img> / CSS background
    var url = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1920';

    var key = (kind === 'logo') ? 'logoUrl' : 'heroBackgroundImageUrl';
    setSiteContentValue(key, url);

    return jsonSafe({ success: true, fileId: fileId, url: url });
  } catch (e) {
    return { success: false, message: 'Upload failed: ' + (e.message || String(e)) };
  }
}

// Clears a branding asset URL from SiteContent. kind: 'background' | 'logo'
function clearBrandingMedia(kind) {
  try {
    kind = String(kind || '').trim();
    if (kind !== 'background' && kind !== 'logo') {
      return { success: false, message: 'Invalid branding asset type.' };
    }
    var key = (kind === 'logo') ? 'logoUrl' : 'heroBackgroundImageUrl';
    setSiteContentValue(key, '');
    return { success: true };
  } catch (e) {
    return { success: false, message: 'Remove failed: ' + (e.message || String(e)) };
  }
}

// Returns all uploaded files for a given portal type and ID.
function getPortalUploads(type, id) {
  try {
    var rows = sheetToObjects(SHEET.PORTAL_UPLOADS);
    var filtered = rows.filter(function(r) {
      return String(r['Type'] || '').trim() === String(type).trim()
          && String(r['ID']   || '').trim() === String(id).trim();
    }).map(function(r) {
      return {
        timestamp: r['Timestamp'] || '',
        type:      r['Type']      || '',
        id:        r['ID']        || '',
        fileName:  r['FileName']  || '',
        mimeType:  r['MimeType']  || '',
        driveLink: r['DriveLink'] || '',
      };
    });
    return jsonSafe({ success: true, uploads: filtered });
  } catch (e) {
    return jsonSafe({ success: true, uploads: [] });
  }
}

// Returns ALL portal uploads (used by Admin Hub Portal Uploads panel).
function getAllPortalUploads() {
  try {
    var rows = sheetToObjects(SHEET.PORTAL_UPLOADS);
    return jsonSafe({
      success: true,
      uploads: rows.map(function(r) {
        return {
          _row:      r._row,
          timestamp: r['Timestamp'] || '',
          type:      r['Type']      || '',
          id:        r['ID']        || '',
          fileName:  r['FileName']  || '',
          mimeType:  r['MimeType']  || '',
          driveLink: r['DriveLink'] || '',
          status:    r['Status']    || 'Pending',
        };
      }),
    });
  } catch (e) {
    return jsonSafe({ success: true, uploads: [] });
  }
}

// Updates the status of a single portal upload row.
function updatePortalUploadStatus(payload) {
  try {
    var row    = parseInt(payload.row, 10);
    var status = String(payload.status || '').trim();
    if (!row || !status) return { success: false, message: 'Missing row or status.' };

    var sheet = getSheet(SHEET.PORTAL_UPLOADS);
    if (!sheet) return { success: false, message: 'PortalUploads sheet not found.' };

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var statusCol = headers.indexOf('Status') + 1;
    if (statusCol < 1) return { success: false, message: 'Status column not found.' };

    sheet.getRange(row, statusCol).setValue(status);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// â”€â”€â”€ ONE-TIME SETUP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Shows (and, in DEV, auto-creates) the spreadsheet used by the current
// environment. Run from the editor to grab the DEV sheet id or open it.
function setupDevSpreadsheet() {
  var id = resolveActiveSpreadsheetId_();
  Logger.log((IS_LIVE ? 'LIVE' : 'DEV') + ' spreadsheet id: ' + id);
  Logger.log('Open it: https://docs.google.com/spreadsheets/d/' + id + '/edit');
  return id;
}

// Run this ONCE per environment from the Apps Script editor after deploying.
// Select "setupSheets" from the function dropdown â†’ Run â†’ Allow permissions.
// Safe to re-run: it only creates missing tabs and never erases existing data.
// Accepts an optional targetId so it can be called before SPREADSHEET_ID is set
// (e.g. when bootstrapping a brand-new DEV spreadsheet).
function setupSheets(targetId) {
  var resolvedId = targetId || SPREADSHEET_ID;
  const ss = SpreadsheetApp.openById(resolvedId);

  function ensureSheet(name, headers, sampleRows) {
    var existing = ss.getSheetByName(name);
    if (existing) {
      // Sheet already exists: never clear it. Only add a header row if the
      // sheet is completely empty (protects all existing live data).
      if (existing.getLastRow() === 0) {
        existing.getRange(1, 1, 1, headers.length).setValues([headers]);
        existing.getRange(1, 1, 1, headers.length)
          .setFontWeight('bold').setBackground('#0a1628').setFontColor('#c9a84c');
        existing.setFrozenRows(1);
      }
      return;
    }
    // Brand-new sheet: create, header, seed sample rows, format.
    var sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (sampleRows && sampleRows.length) {
      sheet.getRange(2, 1, sampleRows.length, headers.length).setValues(sampleRows);
    }
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold').setBackground('#0a1628').setFontColor('#c9a84c');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160);
  }

  ensureSheet('EventInfo', ['Key', 'Value'], [
      ['eventName',   'Middle School Showcase 2026'],
      ['date',        'Thursday, October 15, 2026'],
    ['time',        '5:00 PM - 8:00 PM'],
    ['location',    'Main Gymnasium - Lincoln Middle School'],
    ['address',     '1234 School Drive, Dallas, TX 75001'],
    ['description', 'Join us for our annual Middle School Showcase! Students explore career pathways, clubs display their work, and vendors showcase opportunities for students and families.'],
      ['schedule',    JSON.stringify([
      { time: '5:00 PM', item: 'Doors Open / Vendor Setup Complete' },
        { time: '5:30 PM', item: 'Welcome Remarks' },
        { time: '6:00 PM', item: 'Student Presentations Begin' },
      { time: '7:00 PM', item: 'Open Floor - Explore Booths' },
        { time: '7:45 PM', item: 'Closing Remarks' },
        { time: '8:00 PM', item: 'Event Ends' },
      ])],
  ]);

  ensureSheet('Vendors',
    ['VendorID','CompanyName','Contact','Email','Status','Notes','DocumentLinks',
     'AllergyMilk','AllergyEggs','AllergyFish','AllergyShellfish','AllergyTreeNuts',
     'AllergyPeanuts','AllergyWheat','AllergySoy','AllergySesame','IsVegetarian','IsVegan'],
    [
      ['V001', 'STEM Explorers',  'Jane Smith',  'jane@stemexplorers.com',  'Active',   'Booth A1', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['V002', 'Art & Design Co', 'Bob Lee',     'bob@artdesign.com',       'Active',   'Booth B2', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['V003', 'Sports Academy',  'Maria Reyes', 'maria@sportsacademy.com', 'Inactive', 'TBD',      '', '', '', '', '', '', '', '', '', '', '', ''],
    ]
  );

  ensureSheet('Teachers',
    ['EID', 'TeacherName', 'Campus', 'Status', 'Notes', 'DocumentLinks', 'OrgNumber'],
    [
      ['T12345', 'Mrs. Johnson', 'Lincoln Middle', 'Active', 'Math Dept',    '', ''],
      ['T67890', 'Mr. Davis',    'Lincoln Middle', 'Active', 'Science Dept', '', ''],
    ]
  );

  ensureSheet('Documents',
    ['DocName', 'URL', 'AccessLevel', 'Category'],
    [
      ['Vendor Setup Guide',          '', 'vendor',  'Setup'],
      ['Booth Layout Map',            '', 'vendor',  'Setup'],
      ['Vendor Contract 2026',        '', 'vendor',  'Forms'],
      ['Teacher Volunteer Schedule',  '', 'teacher', 'Schedules'],
      ['Student Check-In Procedures', '', 'teacher', 'Procedures'],
      ['Emergency Contact Protocol',  '', 'both',    'Safety'],
    ]
  );

  ensureSheet('ExhibitorRegistrations',
    ['Timestamp','Status','FullName','Email','CellPhone','SecondaryName','SecondaryEmail','SecondaryPhone',
     'CampusCompany','ReturningExhibitor','BoothStaff','StudentAmbassadors','CareerCluster',
     'ActivityDescription','ElectricityNeeded','ElectricityType','WifiNeeded','TablesChairs',
     'SpecialAccommodations','StudentGiveaways','MeetingAvailability'],
    []
  );

  ensureSheet('AttendeeRegistrations',
    ['Timestamp','Status','CampusOrgNumber','TeacherName','CellPhone','Email','Campus',
     'WheelchairBus','EventDate','StudentCount','MainContact','AltContactName',
     'PaperworkStatus','Region','PrincipalEmail'],
    []
  );

  // Campuses: populate from your existing spreadsheet when ready to enable regional tracking and principal CC emails.
  ensureSheet('Campuses',
    ['CampusName','OrgNumber','Region','PrincipalName','PrincipalEmail',
     'OfficeManagerName','OfficeManagerEmail','CampusPhone','RegionalDirector','ExecutiveDirector',
     'Trustee','DisDRegion'],
    []
  );

  ensureSheet('AttendeeChecklist',
    ['OrgNumber','ItemName','Status','AutoManaged','Notes','UpdatedBy','UpdatedAt'],
    []
  );

  ensureSheet('PortalUploads',
    ['Timestamp','Type','ID','FileName','MimeType','DriveLink','Status'],
    []
  );

  ensureSheet('AdminAuth', ['Password'], [['admin2026']]);

  ensureSheet('SiteContent', ['Key', 'Value'], [
    ['siteTitle',         'Middle School Showcase'],
    ['orgLine',           'Dallas ISD Â· Career & Technical Education'],
    ['heroEmoji',         'ðŸ«'],
    ['introText',         'Connecting students, educators, and vendors to celebrate innovation and explore career pathways.'],
    ['aboutText',               ''],
    ['heroBackgroundImageUrl',  ''],
    ['heroVideoUrl',            ''],
    ['logoUrl',                 ''],
    ['vendorCardTitle',   'Vendor Portal'],
    ['vendorCardDesc',    'Registered vendors: access your booth details, documents, and event-day information.'],
    ['teacherCardTitle',        'Attendee Portal'],
    ['teacherCardDesc',         'Registered attendees: access volunteer schedules, procedures, and event documents.'],
    ['showVendorPortal',        'Yes'],
    ['showTeacherPortal',       'Yes'],
    ['showRegistrationPortal',  'Yes'],
    ['showSchedule',            'Yes'],
    ['registrationOpen',        'No'],
    ['registrationCode',        ''],
    ['adminEmail',              ''],
  ]);

  ensureSheet('FAQs', ['Question','Answer'], [
    ['When and where does the Middle School Showcase take place?', 'Date, time, and location details are published in the event information section on the home page.'],
    ['How do vendors register to participate?', 'Vendor registration is managed by the Dallas ISD CTE team. Once approved, vendors receive a Vendor ID to access the Vendor Portal.'],
    ['How do teachers and staff access their event resources?', 'Attendees use their org number to log into the Attendee Portal for schedules, procedures, and documents.'],
    ['Who can attend the Middle School Showcase?', 'The showcase is designed for Dallas ISD middle school students and registered attendees. Vendors are approved industry partners.'],
    ['Who do I contact with questions not listed here?', 'Contact the Dallas ISD Career & Technical Education department. Contact info is listed in your portal once you log in.'],
  ]);

  ensureSheet('EmailTemplates',
    ['TemplateID','TemplateName','Category','Subject','Body','DefaultAudience','LastModified'],
    [
      ['registration-reminder',  'Registration Reminder',     'Outreach',   '2026\u20132027 CTE Middle School Showcase \u2014 Registration Now Open',    '', 'unregistered_campuses', ''],
      ['paperwork-followup',     'Trip Paperwork Follow-Up',  'Compliance', '2026\u20132027 CTE Showcase \u2014 Field Trip Paperwork Reminder',           '', 'all_registered_campuses', ''],
      ['event-day-logistics',    'Event Day Logistics',       'Event Info', '2026\u20132027 CTE Showcase \u2014 Event Day Information & Logistics',        '', 'all_registered_campuses', ''],
      ['post-event-thank-you',   'Post-Event Thank You',      'Follow-Up',  '2026\u20132027 CTE Middle School Showcase \u2014 Thank You!',                '', 'all_registered_campuses', ''],
    ]
  );

  ensureSheet('EmailLog',
    ['Timestamp','TemplateName','Audience','RecipientCount','Subject','SentBy'],
    []
  );

  let base = '';
  try { base = ScriptApp.getService().getUrl() || ''; } catch (e) { base = WEB_APP_URL; }
  if (!base) base = WEB_APP_URL;

  ensureSheet('Settings', ['Setting', 'Value'], [
    ['Public Site URL', base],
    ['Admin Hub URL',   base + '?page=admin'],
    ['Admin Password',  'See AdminAuth tab'],
    ['Script ID',       'YOUR_APPS_SCRIPT_SCRIPT_ID'],
    ['Spreadsheet ID',  resolvedId],
  ]);
  // widen URL column
  const settingsSheet = ss.getSheetByName('Settings');
  if (settingsSheet) settingsSheet.setColumnWidth(2, 580);

  try { SpreadsheetApp.getUi().alert('All sheets created successfully! Your system is ready.'); } catch (e) {}
  return 'Setup complete.';
}

// DANGER: erases ALL data in the CURRENT environment's spreadsheet and reseeds
// sample rows. Intended ONLY for a brand-new copy. Never run this on live data.
function DANGER_resetAllSheets() {
  var ss2 = SpreadsheetApp.openById(SPREADSHEET_ID);
  ['EventInfo','Vendors','Teachers','Documents','ExhibitorRegistrations',
   'AttendeeRegistrations','Campuses','AttendeeChecklist','PortalUploads',
   'SiteContent','FAQs','EmailTemplates','EmailLog'].forEach(function (n) {
    var s = ss2.getSheetByName(n);
    if (s) s.clearContents();
  });
  setupSheets();
  return 'All sheets reset for ' + (IS_LIVE ? 'LIVE' : 'DEV') + '.';
}

// Run this from the Apps Script editor any time the LIVE spreadsheet needs
// new sheets â€” works regardless of IS_LIVE flag. Safe: never wipes existing data.
function setupLiveSheets() {
  return setupSheets(LIVE_SPREADSHEET_ID);
}

// Run to refresh only the Settings tab links (safe, non-destructive).
function recordDeploymentLinks() {
  let base = '';
  try { base = ScriptApp.getService().getUrl() || ''; } catch (e) { base = WEB_APP_URL; }
  if (!base) base = WEB_APP_URL;

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET.SETTINGS);
  if (!sheet) sheet = ss.insertSheet(SHEET.SETTINGS);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 2).setValues([['Setting', 'Value']]);
  sheet.getRange(2, 1, 5, 2).setValues([
    ['Public Site URL', base],
    ['Admin Hub URL',   base + '?page=admin'],
    ['Admin Password',  'See AdminAuth tab'],
    ['Script ID',       'YOUR_APPS_SCRIPT_SCRIPT_ID'],
    ['Spreadsheet ID',  SPREADSHEET_ID],
  ]);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#0a1628').setFontColor('#c9a84c');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(2, 580);
  try { SpreadsheetApp.getUi().alert('Settings tab updated.'); } catch (e) {}
}

// Authorization helper â€” run once after first deploy to grant permissions.
function authorize() {
  Logger.log('Authorization complete. Web app is ready.');
}

