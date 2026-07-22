// ── SCHEMA ─────────────────────────────────────────────────────────────────
// Single source of truth for all tab names and column headers.
// Add a column here + re-run ensureSchema() — existing data is never deleted.

const SCHEMA = {
  KitTemplates:    ['template_id','name','career','notes','active'],
  TemplateItems:   ['template_id','type_id','qty','reorder_threshold'],
  Campuses:        ['campus_id','name','region','principal_name','principal_email','active'],
  Kits:            ['kit_id','name','kit_barcode','template_id','tipweb_tag','location','loan_status','notes','active'],
  ItemTypes:       ['type_id','name','reorder_threshold','is_consumable','notes'],
  KitItems:        ['barcode','kit_id','type_id','status','last_updated','updated_by','notes'],
  AuditLog:        ['timestamp','barcode','kit_id','action','old_status','new_status','user','notes'],
  Audits:          ['audit_id','kit_id','started','completed','scanned_count','missing_count'],
  Loans:           ['loan_id','kit_id','campus_id','campus_name','region','tipweb_tag','teacher_name','counselor_eid','counselor_email',
                    'checked_out_at','checked_out_by','due_date',
                    'checked_in_at','checked_in_by','return_type','notes','status'],
  CheckoutItems:   ['loan_id','barcode','type_id','status_at_checkout','confirmed'],
  CheckinIssues:   ['loan_id','barcode','issue_type','notes','reported_at','reported_by'],
  Counselors:      ['eid','name','email','campus_id','campus_name','first_seen','last_seen','active'],
  EmailTemplates:  ['template_id','name','subject','body','active'],
  Settings:        ['key','value'],
};

// Dallas ISD Director Regions (stable list — used for campus assignment dropdowns)
const REGIONS = ['Region I','Region II','Region III','Region IV',
                 'Region V','Region VI','Magnets & Montessori','Transformation'];

// Allowed values — reference these constants everywhere, never raw strings
const STATUS      = { AVAILABLE: 'Available', NEEDS_REPLACEMENT: 'Needs Replacement', DEAD: 'Dead' };
const ISSUE_TYPES = ['Needs Replacement', 'Does Not Work', 'Needs Batteries', 'Missing', 'Other'];
const LOAN_ST     = { OPEN: 'open', CLOSED: 'closed' };
const KIT_LOAN_ST = { AVAILABLE: 'available', CHECKED_OUT: 'checked_out' };

const SS_ID = '1YiIh5XNyjlSAB6bRxJmL6ArDtWYS77p0z4xxw9s9GZ4';

// ── SPREADSHEET ─────────────────────────────────────────────────────────────

function ss_() { return SpreadsheetApp.openById(SS_ID); }

// Creates missing tabs and appends missing columns. Safe to re-run at any time.
function ensureSchema() {
  const ss = ss_();
  Object.entries(SCHEMA).forEach(([name, headers]) => {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
      return;
    }
    const existing = sh.getLastColumn() > 0
      ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    headers.forEach(h => {
      if (!existing.includes(h)) {
        sh.getRange(1, sh.getLastColumn() + 1).setValue(h).setFontWeight('bold');
      }
    });
  });

  // Seed / refresh web app URLs (React is the primary UI)
  const stSh = ss.getSheetByName('Settings');
  // Hub deployment (counselors) and Admin deployment (staff) — same script, two web apps
  const HUB_URL   = 'https://script.google.com/a/macros/dallasisd.org/s/AKfycbwPVRPsFVAzczPOXVQ4zvcta-n5PI2epnzkoJSqC3216M5qhCO14VXb3ucV4A7Q6QXtjw/exec';
  const ADMIN_URL = 'https://script.google.com/a/macros/dallasisd.org/s/AKfycbw21YOF02b0p6wOumTh4-UugS0svYiCeoQYRauLqz0WtNsjeKylG3QQtra172rtQlO7KA/exec?view=admin';
  if (stSh.getLastRow() <= 1) {
    stSh.getRange(2, 1, 6, 2).setValues([
      ['barcode_prefix',  'ESCA'],
      ['next_seq',        '1'],
      ['schema_version',  '2'],
      ['allowlist',       ''],
      ['url_counselor',   HUB_URL],
      ['url_admin',       ADMIN_URL],
    ]);
  } else {
    // Always point bookmarks / email links at React (retire classic as default)
    setSetting('url_counselor', HUB_URL);
    setSetting('url_admin', ADMIN_URL);
  }
}

// ── GENERIC SHEET HELPERS ───────────────────────────────────────────────────

function hdrs_(sh) {
  return sh.getLastColumn() > 0
    ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
}

// Returns all data rows as objects keyed by header name.
// Each object also has _row (1-based sheet row index) for updates.
function getRows(tab) {
  const sh = ss_().getSheetByName(tab);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last <= 1) return [];
  const h = hdrs_(sh);
  const tz = Session.getScriptTimeZone();
  // Rows 2..last inclusive → numRows = last - 1 (row 1 is the header).
  // IMPORTANT: convert Date cell values to strings. google.script.run silently
  // delivers `null` to the client for objects that contain Date values (e.g. a
  // date-formatted due_date), which breaks check-in, open-loan lists, and the
  // dashboard. Strings serialize cleanly and still parse for overdue math.
  return sh.getRange(2, 1, last - 1, h.length).getValues()
    .map((row, i) => {
      const o = {};
      h.forEach((k, j) => {
        const v = row[j];
        o[k] = (v instanceof Date) ? Utilities.formatDate(v, tz, 'MM/dd/yyyy') : v;
      });
      o._row = i + 2;
      return o;
    });
}

function isOpenLoan_(l) {
  return String(l && l.status != null ? l.status : '').trim().toLowerCase() === LOAN_ST.OPEN;
}

function findBy(tab, field, val) {
  return getRows(tab).find(r => String(r[field]) === String(val)) || null;
}

function findAllBy(tab, field, val) {
  return getRows(tab).filter(r => String(r[field]) === String(val));
}

function appendRow(tab, obj) {
  const sh = ss_().getSheetByName(tab);
  const h  = hdrs_(sh);
  sh.appendRow(h.map(k => obj[k] !== undefined ? obj[k] : ''));
}

function updateRow(tab, rowIdx, obj) {
  const sh = ss_().getSheetByName(tab);
  const h  = hdrs_(sh);
  h.forEach((k, i) => { if (obj[k] !== undefined) sh.getRange(rowIdx, i + 1).setValue(obj[k]); });
}

// ── SETTINGS ────────────────────────────────────────────────────────────────

function getSetting(key) {
  const r = findBy('Settings', 'key', key);
  return r ? String(r.value) : null;
}

function setSetting(key, val) {
  const r = findBy('Settings', 'key', key);
  r ? updateRow('Settings', r._row, { key, value: String(val) })
    : appendRow('Settings', { key, value: String(val) });
}

// ── ID GENERATION ────────────────────────────────────────────────────────────

function nextId(pfx) {
  const key = 'seq_' + pfx;
  const n   = parseInt(getSetting(key) || '1', 10);
  setSetting(key, n + 1);
  return `${pfx}-${String(n).padStart(4, '0')}`;
}

// Item barcode: ESCA-{kitShortId}-{seq}   e.g. ESCA-0001-001
function nextBarcode(kitShortId) {
  const prefix = getSetting('barcode_prefix') || 'ESCA';
  const seq    = parseInt(getSetting('next_seq') || '1', 10);
  setSetting('next_seq', seq + 1);
  return `${prefix}-${kitShortId}-${String(seq).padStart(3, '0')}`;
}

// ── AUDIT LOG ────────────────────────────────────────────────────────────────

function logAudit(barcode, kitId, action, oldSt, newSt, user, notes) {
  appendRow('AuditLog', {
    timestamp:  new Date().toISOString(),
    barcode:    barcode   || '',
    kit_id:     kitId     || '',
    action,
    old_status: oldSt     || '',
    new_status: newSt     || '',
    user,
    notes:      notes     || '',
  });
}
