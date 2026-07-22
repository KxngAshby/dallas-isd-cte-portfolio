// ── AUTH ────────────────────────────────────────────────────────────────────

function getUser_() { return Session.getActiveUser().getEmail(); }

function isAllowed_(email) {
  const list = getSetting('allowlist') || '';
  if (!list.trim()) return true; // empty allowlist = any domain user is allowed
  return list.split(',').map(s => s.trim().toLowerCase()).includes(email.toLowerCase());
}

function checkAuth_() {
  const u = getUser_();
  if (!isAllowed_(u)) throw new Error('Access denied for: ' + u);
  return u;
}

// Strips the internal _row field before sending data to the client
function strip_(obj) {
  if (!obj) return null;
  const o = Object.assign({}, obj);
  delete o._row;
  return o;
}

function isConsumable_(type) {
  if (!type) return false;
  const v = type.is_consumable;
  return v === true || v === 'TRUE' || v === 'true';
}

/** Parse due dates from Sheets (Date), MM/DD/YYYY, or YYYY-MM-DD → local midnight Date. */
function parseDueDate_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const s = String(value).trim();
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    return new Date(parseInt(mdy[3], 10), parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10));
  }
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDueDateStr_(d) {
  if (!d || isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return mm + '/' + dd + '/' + d.getFullYear();
}

function startOfToday_() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/** Shared semester return date from Settings (MM/DD/YYYY). Falls back to +90 days if unset. */
function resolveDefaultDueDateStr_() {
  const parsed = parseDueDate_(getSetting('default_due_date'));
  if (parsed) return formatDueDateStr_(parsed);
  const fallback = startOfToday_();
  fallback.setDate(fallback.getDate() + 90);
  return formatDueDateStr_(fallback);
}

function isLoanOverdue_(loan) {
  const due = parseDueDate_(loan && loan.due_date);
  if (!due) return false;
  return due < startOfToday_();
}

/** Persist semester due date and stamp it onto every open loan. */
function applyDefaultDueDate_(value) {
  const d = parseDueDate_(value);
  if (!d) throw new Error('Invalid due date.');
  const str = formatDueDateStr_(d);
  setSetting('default_due_date', str);
  const open = getRows('Loans').filter(isOpenLoan_);
  open.forEach(function(l) {
    updateRow('Loans', l._row, { due_date: str });
  });
  return { due_date: str, updated: open.length };
}

function getTemplate_(templateId) {
  if (!templateId) return null;
  return findBy('KitTemplates', 'template_id', templateId);
}

function enrichKit_(kit) {
  if (!kit) return null;
  const k = strip_(kit);
  const tpl = getTemplate_(k.template_id);
  if (tpl) { k.template_name = tpl.name; k.career = tpl.career; }
  return k;
}

// ── SCAN ROUTER ─────────────────────────────────────────────────────────────
// Called on every scan. Returns the correct panel type + data for the client.

function isKitCheckedOut_(kit) {
  var s = String(kit && kit.loan_status != null ? kit.loan_status : '').trim().toLowerCase().replace(/\s+/g, '_');
  return s === KIT_LOAN_ST.CHECKED_OUT;
}

// Match a scanned code against the kit case sticker OR the TipWeb asset tag.
function findKitByScan_(barcode) {
  const b = String(barcode).trim();
  if (!b) return null;
  const byBarcode = findBy('Kits', 'kit_barcode', b);
  if (byBarcode) return byBarcode;
  return getRows('Kits').find(function(k) { return String(k.tipweb_tag || '').trim() === b; }) || null;
}

function scanBarcode(barcode) {
  try {
    checkAuth_();
    barcode = String(barcode).trim();
    if (!barcode) return { success: false, error: 'No barcode scanned. Try again.' };

    // Is this a kit-level barcode (case sticker or TipWeb tag)?
    const kit = findKitByScan_(barcode);
    if (kit) {
      const types = getRows('ItemTypes');
      const items = findAllBy('KitItems', 'kit_id', kit.kit_id).map(i => {
        const t = types.find(t => t.type_id === i.type_id);
        return Object.assign(strip_(i), { type_name: t ? t.name : i.type_id, is_consumable: isConsumable_(t) });
      });
      // Open loan is the source of truth for check-in (loan_status can lag)
      const openLoan = getRows('Loans').find(l => l.kit_id === kit.kit_id && isOpenLoan_(l)) || null;
      if (openLoan || isKitCheckedOut_(kit)) {
        if (!openLoan) {
          return { success: false, error: 'This kit is marked checked out but has no open loan on record. Fix it in Admin → Kits.' };
        }
        return { success: true, panel: 'checkin', kit: enrichKit_(kit), loan: strip_(openLoan), items };
      }
      const ready = items.length > 0 && items.every(i => i.status === STATUS.AVAILABLE);
      return { success: true, panel: 'checkout', kit: enrichKit_(kit), items, ready };
    }

    // Is this an item-level barcode (inside a kit)?
    const item = findBy('KitItems', 'barcode', barcode);
    if (item) {
      const kit2 = findBy('Kits', 'kit_id', item.kit_id);
      const type = findBy('ItemTypes', 'type_id', item.type_id);
      return { success: true, panel: 'item', item: strip_(item), kit: enrichKit_(kit2), type: strip_(type) };
    }

    return { success: false, error: 'Barcode not found. Use Admin → Labels to generate item barcodes.' };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── ITEM STATUS UPDATE ───────────────────────────────────────────────────────

function updateItemStatus(barcode, status, notes) {
  try {
    const user = checkAuth_();
    const item = findBy('KitItems', 'barcode', barcode);
    if (!item) return { success: false, error: 'Item not found.' };
    const old = item.status;
    updateRow('KitItems', item._row, { status, last_updated: new Date().toISOString(), updated_by: user, notes: notes || item.notes || '' });
    logAudit(barcode, item.kit_id, 'status_update', old, status, user, notes || '');
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── CHECKOUT ─────────────────────────────────────────────────────────────────

function checkoutKit(kitId, tipwebTag, teacherName, confirmedBarcodes, campusId, counselorEid, counselorEmail, forceCheckout) {
  try {
    const user = checkAuth_();
    const kit  = findBy('Kits', 'kit_id', kitId);
    if (!kit) return { success: false, error: 'Kit not found.' };
    if (kit.loan_status === KIT_LOAN_ST.CHECKED_OUT) return { success: false, error: 'Kit is already checked out.' };

    const kitItems = findAllBy('KitItems', 'kit_id', kitId);
    const notReady = kitItems.filter(function(i) {
      return i.status === STATUS.NEEDS_REPLACEMENT || i.status === STATUS.DEAD || i.status === 'Missing';
    });
    if (notReady.length && !forceCheckout) {
      return {
        success: false,
        error: 'Kit is not ready — ' + notReady.length + ' item(s) need attention. Acknowledge override to continue.',
      };
    }

    let campusName = '', region = '';
    if (campusId) {
      const campus = findBy('Campuses', 'campus_id', campusId);
      if (campus) { campusName = campus.name; region = campus.region; }
    }

    const now = new Date();
    const dueDateStr = resolveDefaultDueDateStr_();

    const loanId = nextId('LOAN');
    appendRow('Loans', {
      loan_id: loanId, kit_id: kitId,
      campus_id: campusId || '', campus_name: campusName, region: region,
      tipweb_tag: tipwebTag || '',
      teacher_name: teacherName || '', checked_out_at: now.toISOString(),
      checked_out_by: user, checked_in_at: '', checked_in_by: '',
      counselor_eid: counselorEid || '', counselor_email: counselorEmail || '',
      due_date: dueDateStr,
      return_type: '', notes: forceCheckout ? 'Checkout override: kit not fully ready' : '', status: LOAN_ST.OPEN,
    });

    let itemsConfirmed = 0;
    (confirmedBarcodes || []).forEach(b => {
      const it = findBy('KitItems', 'barcode', b);
      if (it) {
        appendRow('CheckoutItems', { loan_id: loanId, barcode: b, type_id: it.type_id, status_at_checkout: it.status, confirmed: 'Y' });
        itemsConfirmed++;
      }
    });

    // Re-find the kit row so loan_status is never written to a stale row index.
    const kitRow = findBy('Kits', 'kit_id', kitId) || kit;
    updateRow('Kits', kitRow._row, { loan_status: KIT_LOAN_ST.CHECKED_OUT });
    const auditNote = (forceCheckout
      ? `Loan:${loanId} TipWeb:${tipwebTag || 'N/A'} OVERRIDE not-ready:${notReady.length}`
      : `Loan:${loanId} TipWeb:${tipwebTag || 'N/A'}`) + ` items:${itemsConfirmed}`;
    logAudit(kit.kit_barcode, kitId, 'checkout', '', '', user, auditNote);
    try { sendCheckoutEmail(loanId); } catch (_) {}
    return { success: true, loanId: loanId, itemsConfirmed: itemsConfirmed };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── CHECK-IN ──────────────────────────────────────────────────────────────────

function checkinKit(loanId, returnType, issues) {
  try {
    const user = checkAuth_();
    const loan = findBy('Loans', 'loan_id', loanId);
    if (!loan) return { success: false, error: 'Loan not found.' };
    if (loan.status === LOAN_ST.CLOSED) return { success: false, error: 'This loan is already closed.' };

    updateRow('Loans', loan._row, {
      checked_in_at: new Date().toISOString(), checked_in_by: user,
      return_type: returnType, status: LOAN_ST.CLOSED,
    });

    (issues || []).forEach(iss => {
      appendRow('CheckinIssues', {
        loan_id: loanId, barcode: iss.barcode, issue_type: iss.issue_type,
        notes: iss.notes || '', reported_at: new Date().toISOString(), reported_by: user,
      });
      const it = findBy('KitItems', 'barcode', iss.barcode);
      if (it) {
        const newSt = iss.issue_type === 'Does Not Work' ? STATUS.DEAD : STATUS.NEEDS_REPLACEMENT;
        updateRow('KitItems', it._row, { status: newSt, last_updated: new Date().toISOString(), updated_by: user });
        logAudit(iss.barcode, it.kit_id, 'checkin_issue', it.status, newSt, user, iss.issue_type);
      }
    });

    const kit = findBy('Kits', 'kit_id', loan.kit_id);
    if (kit) updateRow('Kits', kit._row, { loan_status: KIT_LOAN_ST.AVAILABLE });
    logAudit('', loan.kit_id, 'checkin', '', '', user, `Return:${returnType} Issues:${(issues || []).length}`);
    try { sendCheckinEmail(loanId); } catch (_) {}
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── ADMIN: CAREER KIT TEMPLATES ───────────────────────────────────────────────

function getKitTemplates() {
  try {
    checkAuth_();
    const types = getRows('ItemTypes');
    const templates = getRows('KitTemplates').filter(t => t.active !== 'FALSE').map(strip_);
    const tItems = getRows('TemplateItems');
    const kits   = getRows('Kits').filter(k => k.active !== 'FALSE');
    templates.forEach(t => {
      // Only count real links — a blank template_id must not match blank-id kits.
      t.kit_count = t.template_id
        ? kits.filter(k => k.template_id && k.template_id === t.template_id).length
        : 0;
      t.contents  = tItems.filter(i => i.template_id === t.template_id).map(i => {
        const type = types.find(x => x.type_id === i.type_id);
        return Object.assign(strip_(i), { type_name: type ? type.name : i.type_id });
      });
    });
    return { success: true, templates };
  } catch (e) { return { success: false, error: e.message }; }
}

function saveKitTemplate(data) {
  try {
    checkAuth_();
    if (data.template_id) {
      const t = findBy('KitTemplates', 'template_id', data.template_id);
      if (t) { updateRow('KitTemplates', t._row, data); return { success: true, template_id: data.template_id }; }
    }
    const templateId = nextId('TPL');
    appendRow('KitTemplates', Object.assign({}, data, { template_id: templateId, active: 'TRUE' }));
    return { success: true, template_id: templateId };
  } catch (e) { return { success: false, error: e.message }; }
}

function deleteKitTemplate(templateId) {
  try {
    checkAuth_();
    const id = String(templateId == null ? '' : templateId).trim();

    // Junk / unlabeled rows: no real id, or blank career+name. Hard-delete them
    // so they disappear from Career Templates entirely.
    if (!id) {
      const tplSh = ss_().getSheetByName('KitTemplates');
      const junk = getRows('KitTemplates').filter(function(r){
        return !String(r.template_id || '').trim()
          || (!String(r.career || '').trim() && !String(r.name || '').trim());
      });
      if (!junk.length) return { success: false, error: 'Nothing to remove — no unlabeled template rows found.' };
      junk.slice().sort(function(a, b){ return b._row - a._row; }).forEach(function(r){ tplSh.deleteRow(r._row); });
      return { success: true, removed: junk.length };
    }

    const t = findBy('KitTemplates', 'template_id', id);
    if (!t) return { success: false, error: 'Template not found.' };

    // Unlink any kits that point at this template (do not delete the kits).
    getRows('Kits').filter(function(k){ return k.template_id === id; })
      .forEach(function(k){ updateRow('Kits', k._row, { template_id: '' }); });

    // Soft-delete the template and clear its expected-contents rows.
    updateRow('KitTemplates', t._row, { active: 'FALSE' });
    const sh = ss_().getSheetByName('TemplateItems');
    getRows('TemplateItems').filter(function(r){ return r.template_id === id; })
      .slice().reverse().forEach(function(r){ sh.deleteRow(r._row); });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

function saveTemplateItems(templateId, items) {
  try {
    checkAuth_();
    const sh = ss_().getSheetByName('TemplateItems');
    const rows = getRows('TemplateItems');
    rows.filter(r => r.template_id === templateId).slice().reverse().forEach(r => sh.deleteRow(r._row));
    (items || []).forEach(i => {
      if (!i.type_id || !parseInt(i.qty, 10)) return;
      appendRow('TemplateItems', {
        template_id: templateId, type_id: i.type_id,
        qty: parseInt(i.qty, 10), reorder_threshold: i.reorder_threshold || '',
      });
    });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

function getTemplateItemsForKit(kitId) {
  try {
    checkAuth_();
    const kit = findBy('Kits', 'kit_id', kitId);
    if (!kit || !kit.template_id) return { success: false, error: 'Kit has no career template assigned.' };
    const types = getRows('ItemTypes');
    const items = findAllBy('TemplateItems', 'template_id', kit.template_id).map(i => {
      const type = types.find(t => t.type_id === i.type_id);
      return { type_id: i.type_id, type_name: type ? type.name : i.type_id, qty: parseInt(i.qty, 10) || 1 };
    });
    return { success: true, items, template: strip_(getTemplate_(kit.template_id)) };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── ADMIN: USER INFO ──────────────────────────────────────────────────────────

function getUserInfo() {
  try {
    const email = getUser_();
    let name = '';
    try { name = Session.getActiveUser().getName(); } catch (_) {}
    const display = name || email || '';
    return { success: true, email: email, name: display, initial: (display || 'A').charAt(0).toUpperCase() };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── ADMIN: CAMPUSES & REGIONS ─────────────────────────────────────────────────

function getRegions() {
  try { checkAuth_(); return { success: true, regions: REGIONS }; }
  catch (e) { return { success: false, error: e.message }; }
}

function getCampuses() {
  try {
    checkAuth_();
    return { success: true, campuses: getRows('Campuses').filter(c => c.active !== 'FALSE').map(strip_) };
  } catch (e) { return { success: false, error: e.message }; }
}

function saveCampus(data) {
  try {
    checkAuth_();
    if (!data.campus_id || !String(data.campus_id).trim()) {
      return { success: false, error: 'Org Number (campus_id) is required.' };
    }
    const campusId = String(data.campus_id).trim();
    const c = findBy('Campuses', 'campus_id', campusId);
    if (c) {
      updateRow('Campuses', c._row, Object.assign({}, data, { campus_id: campusId }));
      return { success: true, campus_id: campusId };
    }
    appendRow('Campuses', Object.assign({}, data, { campus_id: campusId, active: 'TRUE' }));
    return { success: true, campus_id: campusId };
  } catch (e) { return { success: false, error: e.message }; }
}

function importCampuses(rows) {
  try {
    checkAuth_();
    let inserted = 0, updated = 0;
    (rows || []).forEach(r => {
      if (!r.campus_id || !String(r.campus_id).trim()) return;
      const campusId = String(r.campus_id).trim();
      const c = findBy('Campuses', 'campus_id', campusId);
      if (c) {
        updateRow('Campuses', c._row, Object.assign({}, r, { campus_id: campusId }));
        updated++;
      } else {
        appendRow('Campuses', Object.assign({}, r, { campus_id: campusId, active: 'TRUE' }));
        inserted++;
      }
    });
    return { success: true, inserted, updated };
  } catch (e) { return { success: false, error: e.message }; }
}

function deleteCampus(campusId) {
  try {
    checkAuth_();
    const c = findBy('Campuses', 'campus_id', campusId);
    if (c) updateRow('Campuses', c._row, { active: 'FALSE' });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── ADMIN: COUNSELORS ─────────────────────────────────────────────────────────

function getCounselors() {
  try {
    checkAuth_();
    return { success: true, counselors: getRows('Counselors').filter(c => c.active !== 'FALSE').map(strip_) };
  } catch (e) { return { success: false, error: e.message }; }
}

function saveCounselor(data) {
  try {
    checkAuth_();
    if (!data.eid || !String(data.eid).trim()) return { success: false, error: 'EID is required.' };
    const eid = String(data.eid).trim();
    const campusName = _resolveCampusName_(data.campus_id);
    const existing = findBy('Counselors', 'eid', eid);
    if (existing) {
      updateRow('Counselors', existing._row, Object.assign({}, data, { eid, campus_name: campusName, last_seen: new Date().toISOString(), active: 'TRUE' }));
    } else {
      const now = new Date().toISOString();
      appendRow('Counselors', Object.assign({}, data, { eid, campus_name: campusName, first_seen: now, last_seen: now, active: 'TRUE' }));
    }
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

function deleteCounselor(eid) {
  try {
    checkAuth_();
    if (!eid || !String(eid).trim()) return { success: false, error: 'EID is required.' };
    const c = findBy('Counselors', 'eid', String(eid).trim());
    if (!c) return { success: false, error: 'Counselor not found.' };
    updateRow('Counselors', c._row, { active: 'FALSE' });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

function importCounselors(rows) {
  try {
    checkAuth_();
    let inserted = 0, updated = 0;
    (rows || []).forEach(r => {
      if (!r.eid || !String(r.eid).trim()) return;
      const eid = String(r.eid).trim();
      let campusName = r.campus_name ? String(r.campus_name).trim() : '';
      if (!campusName && r.campus_id && String(r.campus_id).trim()) {
        campusName = _resolveCampusName_(r.campus_id);
      }
      const now = new Date().toISOString();
      const existing = findBy('Counselors', 'eid', eid);
      if (existing) {
        const patch = { eid, last_seen: now, active: 'TRUE' };
        if (r.name && String(r.name).trim())            patch.name = String(r.name).trim();
        if (r.email && String(r.email).trim())          patch.email = String(r.email).trim();
        if (r.campus_id && String(r.campus_id).trim())  patch.campus_id = String(r.campus_id).trim();
        if (campusName)                                 patch.campus_name = campusName;
        updateRow('Counselors', existing._row, patch);
        updated++;
      } else {
        appendRow('Counselors', {
          eid,
          name: r.name ? String(r.name).trim() : '',
          email: r.email ? String(r.email).trim() : '',
          campus_id: r.campus_id ? String(r.campus_id).trim() : '',
          campus_name: campusName,
          first_seen: now,
          last_seen: now,
          active: 'TRUE',
        });
        inserted++;
      }
    });
    return { success: true, inserted, updated };
  } catch (e) { return { success: false, error: e.message }; }
}

// Called by the Hub sign-in screen — no admin auth check required.
// Returns existing counselor data so the sign-in form can auto-fill.
function getCounselorByEid(eid) {
  try {
    if (!eid || !String(eid).trim()) return { success: false, error: 'EID required.' };
    const c = findBy('Counselors', 'eid', String(eid).trim());
    if (!c || c.active === 'FALSE') return { success: true, found: false };
    return { success: true, found: true, counselor: strip_(c) };
  } catch (e) { return { success: false, error: e.message }; }
}

// Called by the Hub sign-in screen — no admin auth check required.
// Inserts a new counselor on first visit; updates name/email/campus + last_seen on return.
function upsertCounselorFromHub(eid, name, campusId, email) {
  try {
    if (!eid || !String(eid).trim()) return { success: false, error: 'EID is required.' };
    const eidStr = String(eid).trim();
    const campusName = _resolveCampusName_(campusId);
    const existing = findBy('Counselors', 'eid', eidStr);
    const now = new Date().toISOString();
    if (existing) {
      updateRow('Counselors', existing._row, {
        name: name || existing.name || '',
        email: email || existing.email || '',
        campus_id: campusId || existing.campus_id || '',
        campus_name: campusName || existing.campus_name || '',
        last_seen: now,
      });
      return { success: true, counselor: { eid: eidStr, name: name || existing.name || '', email: email || existing.email || '', campus_id: campusId, campus_name: campusName } };
    }
    appendRow('Counselors', { eid: eidStr, name: name || '', email: email || '', campus_id: campusId || '', campus_name: campusName, first_seen: now, last_seen: now, active: 'TRUE' });
    return { success: true, counselor: { eid: eidStr, name: name || '', email: email || '', campus_id: campusId, campus_name: campusName } };
  } catch (e) { return { success: false, error: e.message }; }
}

function _resolveCampusName_(campusId) {
  if (!campusId) return '';
  const c = findBy('Campuses', 'campus_id', String(campusId).trim());
  return c ? (c.name || '') : '';
}

// ── ADMIN: KITS ───────────────────────────────────────────────────────────────

function getKits() {
  try {
    checkAuth_();
    return { success: true, kits: getRows('Kits').filter(k => k.active !== 'FALSE').map(enrichKit_) };
  } catch (e) { return { success: false, error: e.message }; }
}

function saveKit(data) {
  try {
    checkAuth_();
    if (data.kit_id) {
      const k = findBy('Kits', 'kit_id', data.kit_id);
      if (k) { updateRow('Kits', k._row, data); return { success: true }; }
    }
    const kitId      = nextId('KIT');
    const short      = kitId.split('-')[1];
    // If a TipWeb tag is provided, use it as the kit barcode (one-sticker workflow).
    // Otherwise fall back to the auto-generated ESCA barcode.
    const kitBarcode = (data.tipweb_tag && data.tipweb_tag.trim())
      ? data.tipweb_tag.trim()
      : `${getSetting('barcode_prefix') || 'ESCA'}-KIT-${short}`;
    appendRow('Kits', Object.assign({}, data, { kit_id: kitId, kit_barcode: kitBarcode, loan_status: KIT_LOAN_ST.AVAILABLE, active: 'TRUE' }));
    return { success: true, kit_id: kitId, kit_barcode: kitBarcode };
  } catch (e) { return { success: false, error: e.message }; }
}

function deleteKit(kitId) {
  try {
    checkAuth_();
    const k = findBy('Kits', 'kit_id', kitId);
    if (!k) return { success: false, error: 'Kit not found.' };
    const openLoan = getRows('Loans').find(function(l){ return l.kit_id === kitId && isOpenLoan_(l); });
    if (openLoan || isKitCheckedOut_(k)) {
      return { success: false, error: 'Cannot remove — this kit is checked out. Check it in first.' };
    }
    updateRow('Kits', k._row, { active: 'FALSE' });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── ADMIN: ITEM TYPES ─────────────────────────────────────────────────────────

function getItemTypes() {
  try {
    checkAuth_();
    return { success: true, types: getRows('ItemTypes').map(strip_) };
  } catch (e) { return { success: false, error: e.message }; }
}

function saveItemType(data) {
  try {
    checkAuth_();
    if (data.type_id) {
      const t = findBy('ItemTypes', 'type_id', data.type_id);
      if (t) { updateRow('ItemTypes', t._row, data); return { success: true }; }
    }
    const typeId = nextId('TYPE');
    appendRow('ItemTypes', Object.assign({}, data, { type_id: typeId }));
    return { success: true, type_id: typeId };
  } catch (e) { return { success: false, error: e.message }; }
}

function deleteItemType(typeId) {
  try {
    checkAuth_();
    if (!typeId) return { success: false, error: 'Type ID required.' };
    const inTemplates = findAllBy('TemplateItems', 'type_id', typeId);
    if (inTemplates.length) {
      return { success: false, error: 'Cannot remove — this type is used on one or more career templates.' };
    }
    const inKits = findAllBy('KitItems', 'type_id', typeId);
    if (inKits.length) {
      return { success: false, error: 'Cannot remove — this type is used on one or more kit items.' };
    }
    const t = findBy('ItemTypes', 'type_id', typeId);
    if (!t) return { success: false, error: 'Item type not found.' };
    ss_().getSheetByName('ItemTypes').deleteRow(t._row);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── ADMIN: LABELS / BARCODE GENERATION ────────────────────────────────────────

function generateBarcodes(kitId, items) {
  try {
    const user = checkAuth_();
    const kit  = findBy('Kits', 'kit_id', kitId);
    if (!kit) return { success: false, error: 'Kit not found.' };
    const short   = kitId.split('-')[1];
    const created = [];
    (items || []).forEach(({ type_id, qty }) => {
      for (let i = 0; i < parseInt(qty, 10); i++) {
        const barcode = nextBarcode(short);
        appendRow('KitItems', { barcode, kit_id: kitId, type_id, status: STATUS.AVAILABLE, last_updated: new Date().toISOString(), updated_by: user, notes: '' });
        logAudit(barcode, kitId, 'created', '', STATUS.AVAILABLE, user, '');
        created.push({ barcode, type_id });
      }
    });
    return { success: true, created, kit: strip_(kit) };
  } catch (e) { return { success: false, error: e.message }; }
}

function getKitItems(kitId) {
  try {
    checkAuth_();
    const types = getRows('ItemTypes');
    const items = findAllBy('KitItems', 'kit_id', kitId).map(i => {
      const t = types.find(t => t.type_id === i.type_id);
      return Object.assign(strip_(i), { type_name: t ? t.name : i.type_id });
    });
    return { success: true, items };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── ADMIN: REGIONAL DATA ──────────────────────────────────────────────────────

function getRegionalData() {
  try {
    checkAuth_();
    const loans = getRows('Loans');
    const byRegion = {};
    loans.forEach(l => {
      const region = l.region || 'No Region Assigned';
      if (!byRegion[region]) byRegion[region] = { region, checkouts: 0, open_loans: 0, campuses: {} };
      byRegion[region].checkouts++;
      if (isOpenLoan_(l)) byRegion[region].open_loans++;
      if (l.campus_name) byRegion[region].campuses[l.campus_name] = true;
    });
    const regions = Object.keys(byRegion).map(k => {
      const r = byRegion[k];
      return { region: r.region, checkouts: r.checkouts, open_loans: r.open_loans, campuses_served: Object.keys(r.campuses).length };
    }).sort((a, b) => b.checkouts - a.checkouts);

    const totalCampuses = getRows('Campuses').filter(c => c.active !== 'FALSE').length;
    const mostActive = regions.length ? regions[0].region : '—';
    return {
      success: true, regions,
      regions_active: regions.length,
      campuses_total: totalCampuses,
      most_active: mostActive,
    };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── ADMIN: DASHBOARD ──────────────────────────────────────────────────────────

function getDashboardData() {
  try {
    checkAuth_();
    const items     = getRows('KitItems');
    const kits      = getRows('Kits').filter(k => k.active !== 'FALSE');
    const types     = getRows('ItemTypes');
    const templates = getRows('KitTemplates').filter(t => t.active !== 'FALSE');
    const tItems    = getRows('TemplateItems');

    const counts = { available: 0, needs_replacement: 0, dead: 0 };
    items.forEach(i => {
      if      (i.status === STATUS.AVAILABLE)         counts.available++;
      else if (i.status === STATUS.NEEDS_REPLACEMENT) counts.needs_replacement++;
      else if (i.status === STATUS.DEAD)              counts.dead++;
    });

    const alerts = types.filter(t => t.reorder_threshold).reduce((acc, t) => {
      const avail = items.filter(i => i.type_id === t.type_id && i.status === STATUS.AVAILABLE).length;
      if (avail < parseInt(t.reorder_threshold, 10))
        acc.push({ type_name: t.name, available: avail, threshold: t.reorder_threshold, scope: 'All kits' });
      return acc;
    }, []);

    const careerAlerts = [];
    templates.forEach(tpl => {
      const kitIds = kits.filter(k => k.template_id === tpl.template_id).map(k => k.kit_id);
      tItems.filter(ti => ti.template_id === tpl.template_id).forEach(ti => {
        const thresh = parseInt(ti.reorder_threshold || 0, 10);
        if (!thresh) return;
        const type = types.find(x => x.type_id === ti.type_id);
        const avail = items.filter(i => kitIds.includes(i.kit_id) && i.type_id === ti.type_id && i.status === STATUS.AVAILABLE).length;
        if (avail < thresh) {
          careerAlerts.push({
            career: tpl.career || tpl.name, type_name: type ? type.name : ti.type_id,
            available: avail, threshold: thresh, kit_count: kitIds.length,
          });
        }
      });
    });

    const careerSummary = templates.map(tpl => {
      const kitIds = kits.filter(k => k.template_id === tpl.template_id).map(k => k.kit_id);
      const kitItems = items.filter(i => kitIds.includes(i.kit_id));
      return {
        template_id: tpl.template_id, name: tpl.name, career: tpl.career || tpl.name,
        kit_count: kitIds.length,
        available: kitItems.filter(i => i.status === STATUS.AVAILABLE).length,
        needs_replacement: kitItems.filter(i => i.status === STATUS.NEEDS_REPLACEMENT).length,
        dead: kitItems.filter(i => i.status === STATUS.DEAD).length,
      };
    });

    const openLoans = getRows('Loans').filter(isOpenLoan_).map(function(l) {
      const kit = kits.find(function(k){ return k.kit_id === l.kit_id; }) || null;
      const row = strip_(l);
      row.kit_name = kit ? (kit.name || '') : '';
      return row;
    });
    return {
      success: true, counts, alerts, careerAlerts, careerSummary,
      kits_total: kits.length,
      kits_checked_out: kits.filter(k => k.loan_status === KIT_LOAN_ST.CHECKED_OUT).length,
      open_loans: openLoans,
    };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── ADMIN: AUDIT ──────────────────────────────────────────────────────────────

function runAudit(kitId, scannedBarcodes) {
  try {
    const user     = checkAuth_();
    const expected = findAllBy('KitItems', 'kit_id', kitId);
    const found    = scannedBarcodes || [];
    const missing  = expected.filter(i => !found.includes(i.barcode)).map(strip_);
    const unexpected = found.filter(b => !expected.find(i => i.barcode === b));
    const auditId  = nextId('AUDIT');
    appendRow('Audits', { audit_id: auditId, kit_id: kitId, started: new Date().toISOString(), completed: new Date().toISOString(), scanned_count: found.length, missing_count: missing.length });
    logAudit('', kitId, 'audit', '', '', user, `Found:${found.length} Missing:${missing.length}`);
    return { success: true, expected: expected.length, found: found.length, missing, unexpected };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── SETTINGS / SETUP ──────────────────────────────────────────────────────────

function getSettings() {
  try {
    checkAuth_();
    // Keep Settings sheet URLs on React (retire classic as the bookmark target)
    const HUB_URL   = 'https://script.google.com/a/macros/dallasisd.org/s/AKfycbwPVRPsFVAzczPOXVQ4zvcta-n5PI2epnzkoJSqC3216M5qhCO14VXb3ucV4A7Q6QXtjw/exec';
    const ADMIN_URL = 'https://script.google.com/a/macros/dallasisd.org/s/AKfycbw21YOF02b0p6wOumTh4-UugS0svYiCeoQYRauLqz0WtNsjeKylG3QQtra172rtQlO7KA/exec?view=admin';
    if (getSetting('url_counselor') !== HUB_URL) setSetting('url_counselor', HUB_URL);
    if (getSetting('url_admin') !== ADMIN_URL) setSetting('url_admin', ADMIN_URL);
    // Migrate installs that still only have the old day-threshold setting
    if (!getSetting('default_due_date')) {
      const seedDue = startOfToday_();
      seedDue.setDate(seedDue.getDate() + 90);
      setSetting('default_due_date', formatDueDateStr_(seedDue));
    }
    return { success: true, settings: getRows('Settings').map(strip_) };
  }
  catch (e) { return { success: false, error: e.message }; }
}

function saveSetting(key, value) {
  try {
    checkAuth_();
    if (key === 'default_due_date') {
      const result = applyDefaultDueDate_(value);
      return { success: true, due_date: result.due_date, updated: result.updated };
    }
    setSetting(key, value);
    return { success: true };
  }
  catch (e) { return { success: false, error: e.message }; }
}

// Run this once after deploying to bootstrap the blank spreadsheet
function runSetup() {
  ensureSchema();

  // Seed default EmailTemplates rows if the tab is empty
  const etSh = ss_().getSheetByName('EmailTemplates');
  if (etSh && etSh.getLastRow() <= 1) {
    const CHECKOUT_BODY =
'Dear {{counselorName}},\n\n' +
'This email serves as official confirmation that the {{kitName}} ({{career}} Career Kit) has been successfully processed and checked out on behalf of {{campusName}}.\n\n' +
'Please review the instructions and timeline below regarding your checkout:\n\n' +
'Key Operational Guidelines\n\n' +
'Asset Accountability & Care: Following the verification checklist completed at the time of checkout, the borrowing campus assumes full responsibility for the security and maintenance of all kit components, materials, and lesson guides during the rotation period.\n\n' +
'Share Your Success: We highly encourage you to share your classroom experiences! If you would like to share photos of your students engaging with the materials, success stories, or highlights from your campus, you are more than welcome to do so by replying directly to this thread.\n\n' +
'Support & Assistance: If you need any help, encounter any issues with the materials, or have any questions during your usage period, please just reply back to this thread and our team will assist you.\n\n' +
'Rotation Timeline\n' +
'Scheduled Return Deadline: {{returnDate}}\n' +
'Operational Department Hours: {{deptHours}}\n\n' +
'Thank you for your partnership and your commitment to bringing hands-on career awareness opportunities to your students.\n\n' +
'Sincerely,\n{{deptSignature}}';

    const RETURN_REMINDER_BODY =
'Good afternoon {{counselorName}},\n\n' +
'I hope you\'re all having a great week! As we approach the end of the school year, I wanted to send out a friendly reminder regarding the return of the Spring Elementary School Career Awareness (ESCA) kits.\n\n' +
'To ensure everything is accounted for, please have all kits delivered to the W.H. Cotton Building Portables by {{returnDeadline}}.\n\n' +
'Location & Drop-off Instructions:\n' +
'Address: 3701 Botham Jean, Dallas, TX 75215\n' +
'Arrival: When you arrive, please ring the doorbell at the portables to alert the team that you are waiting.\n' +
'Check-in: Someone will then meet you to take the ESCA kit and put it back in its designated location.\n\n' +
'Share Your Success & Highlights!\n' +
'Whether you have already packed your kits or are just about to, we would love to see them in action! Please feel free to share any photos of your students engaging with the materials or any highlights and positive experiences from this semester.\n\n' +
'Thank you all for your help in making this a smooth process as we wrap up the spring semester!\n\n' +
'Best regards,\n{{deptSignature}}';

    const OVERDUE_BODY =
'Greetings Counselor {{lastName}},\n\n' +
'This is a formal notification regarding the overdue Elementary School Career Awareness Kit you checked out in the fall. Our records indicate the {{career}} kit was checked out for your campus in {{checkoutMonth}}.\n\n' +
'This kit was due before the winter break in December and has not yet been returned to the CTE department at 9400 NCX on the 11th Floor.\n\n' +
'The extended overdue status of this kit is now impacting our ability to provide resources to other schools. We require its immediate return.\n\n' +
'Please return the kit to the 11th floor of 9400 North Central Expressway no later than {{returnDeadline}} by 3:00 pm.\n\n' +
'If the kit is not returned by this deadline, we will be forced to consider replacement charges and other appropriate measures to recover the cost of the materials.\n\n' +
'Sincerely,\n{{deptSignature}}';

    appendRow('EmailTemplates', { template_id: 'checkout', name: 'Checkout Confirmation', subject: 'Official ESCA Kit Checkout Confirmation — {{campusName}}', body: CHECKOUT_BODY, active: 'TRUE' });
    appendRow('EmailTemplates', { template_id: 'return_reminder', name: 'Return Reminder', subject: 'Reminder: Return of Spring ESCA Kits', body: RETURN_REMINDER_BODY, active: 'TRUE' });
    appendRow('EmailTemplates', { template_id: 'overdue', name: 'Overdue Notice', subject: 'URGENT: Return of Overdue Elementary School Career Awareness Kit', body: OVERDUE_BODY, active: 'TRUE' });
  }

  // Seed email-related settings if not already present
  if (!getSetting('default_due_date')) {
    const seedDue = startOfToday_();
    seedDue.setDate(seedDue.getDate() + 90);
    setSetting('default_due_date', formatDueDateStr_(seedDue));
  }
  if (!getSetting('dept_hours'))             setSetting('dept_hours',             '8:00 AM – 4:30 PM, Monday–Friday');
  if (!getSetting('dept_signature'))         setSetting('dept_signature',         'CTE Department, Dallas ISD');
  if (!getSetting('dept_reply_to'))          setSetting('dept_reply_to',          '');

  return { success: true, message: 'Schema bootstrapped. All tabs and headers are ready.' };
}

// ── EMAIL TEST SEND ───────────────────────────────────────────────────────────

function sendTestEmailServer(toEmail, subject, body) {
  try {
    checkAuth_();
    if (!toEmail) return { success: false, error: 'No recipient email configured.' };
    const sig     = getSetting('dept_signature') || 'CTE Department, Dallas ISD';
    const replyTo = getSetting('dept_reply_to') || '';
    const opts    = { name: sig };
    if (replyTo) opts.replyTo = replyTo;
    MailApp.sendEmail(toEmail, '[TEST] ' + subject, body, opts);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── EMAIL TEMPLATES ───────────────────────────────────────────────────────────

function getEmailTemplates() {
  try {
    checkAuth_();
    return { success: true, templates: getRows('EmailTemplates').map(strip_) };
  } catch (e) { return { success: false, error: e.message }; }
}

function saveEmailTemplate(data) {
  try {
    checkAuth_();
    if (!data || !data.template_id) return { success: false, error: 'template_id is required.' };
    const existing = findBy('EmailTemplates', 'template_id', data.template_id);
    if (existing) {
      updateRow('EmailTemplates', existing._row, data);
    } else {
      appendRow('EmailTemplates', Object.assign({}, data, { active: 'TRUE' }));
    }
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── LOAN QUERIES FOR EMAIL CENTER ─────────────────────────────────────────────

function getOpenLoans() {
  try {
    checkAuth_();
    const kits = getRows('Kits');
    const loans = getRows('Loans').filter(isOpenLoan_);
    const result = loans.map(function(l) {
      const counselor = _findCounselorForLoan_(l);
      const kit = kits.find(function(k){ return k.kit_id === l.kit_id; }) || null;
      return {
        loan_id:         l.loan_id,
        kit_id:          l.kit_id,
        kit_name:        kit ? (kit.name || '') : '',
        campus_name:     l.campus_name || '',
        teacher_name:    l.teacher_name || '',
        checked_out_at:  l.checked_out_at || '',
        due_date:        l.due_date || '',
        counselor_eid:   l.counselor_eid || '',
        counselor_email: counselor ? (counselor.email || '') : (l.counselor_email || ''),
        counselor_name:  counselor ? (counselor.name  || l.teacher_name || '') : (l.teacher_name || ''),
      };
    });
    return { success: true, loans: result };
  } catch (e) { return { success: false, error: e.message }; }
}

/** Hub-safe: open loans for a counselor EID (no admin allowlist check). */
function getOpenLoansForCounselor(eid) {
  try {
    if (!eid || !String(eid).trim()) return { success: false, error: 'EID required.' };
    const eidStr = String(eid).trim();
    const kits = getRows('Kits');
    const loans = getRows('Loans').filter(function(l) {
      if (!isOpenLoan_(l)) return false;
      return String(l.counselor_eid || '').trim() === eidStr;
    }).map(function(l) {
      const kit = kits.find(function(k){ return k.kit_id === l.kit_id; }) || null;
      return {
        loan_id: l.loan_id,
        kit_id: l.kit_id,
        kit_name: kit ? (kit.name || '') : '',
        kit_barcode: kit ? (kit.kit_barcode || '') : '',
        campus_name: l.campus_name || '',
        due_date: l.due_date || '',
        checked_out_at: l.checked_out_at || '',
      };
    });
    return { success: true, loans: loans };
  } catch (e) { return { success: false, error: e.message }; }
}

function getLoanHistory(query) {
  try {
    checkAuth_();
    const q = String(query || '').trim().toLowerCase();
    const kits = getRows('Kits');
    const coItems = getRows('CheckoutItems');
    const loans = getRows('Loans')
      .map(function(l) {
        const kit = kits.find(function(k){ return k.kit_id === l.kit_id; }) || null;
        const tpl = kit ? getTemplate_(kit.template_id) : null;
        return {
          loan_id: l.loan_id,
          kit_id: l.kit_id,
          kit_name: kit ? (kit.name || '') : '',
          career: tpl ? (tpl.career || '') : '',
          campus_id: l.campus_id || '',
          campus_name: l.campus_name || '',
          teacher_name: l.teacher_name || '',
          counselor_eid: l.counselor_eid || '',
          counselor_email: l.counselor_email || '',
          checked_out_at: l.checked_out_at || '',
          checked_in_at: l.checked_in_at || '',
          due_date: l.due_date || '',
          return_type: l.return_type || '',
          status: l.status || '',
          items_count: coItems.filter(function(c){ return c.loan_id === l.loan_id; }).length,
        };
      })
      .sort(function(a, b) {
        return String(b.checked_out_at).localeCompare(String(a.checked_out_at));
      });
    const filtered = q
      ? loans.filter(function(l) {
          return [l.teacher_name, l.counselor_eid, l.counselor_email, l.campus_name, l.kit_name, l.loan_id]
            .join(' ')
            .toLowerCase()
            .indexOf(q) !== -1;
        })
      : loans;
    return { success: true, loans: filtered.slice(0, 250) };
  } catch (e) { return { success: false, error: e.message }; }
}

function getStatusBoard() {
  try {
    checkAuth_();
    const kits = getRows('Kits').filter(function(k){ return k.active !== 'FALSE'; });
    const templates = getRows('KitTemplates').filter(function(t){ return t.active !== 'FALSE'; });
    const openLoans = getRows('Loans').filter(isOpenLoan_);
    const overdue = openLoans.filter(isLoanOverdue_);

    const byCareer = templates.map(function(tpl) {
      const kitList = kits.filter(function(k){ return k.template_id === tpl.template_id; });
      const out = kitList.filter(function(k){ return k.loan_status === KIT_LOAN_ST.CHECKED_OUT; }).length;
      return {
        career: tpl.career || tpl.name || tpl.template_id,
        total: kitList.length,
        out: out,
        ready: kitList.length - out,
      };
    }).filter(function(c){ return c.total > 0; });

    const byRegion = {};
    openLoans.forEach(function(l) {
      const region = l.region || 'Unassigned';
      if (!byRegion[region]) byRegion[region] = { region: region, open: 0 };
      byRegion[region].open++;
    });

    return {
      success: true,
      kits_total: kits.length,
      kits_out: kits.filter(function(k){ return k.loan_status === KIT_LOAN_ST.CHECKED_OUT; }).length,
      kits_ready: kits.filter(function(k){ return k.loan_status !== KIT_LOAN_ST.CHECKED_OUT; }).length,
      open_loans: openLoans.length,
      overdue: overdue.length,
      careers: byCareer,
      regions: Object.keys(byRegion).map(function(k){ return byRegion[k]; }),
      updated_at: new Date().toISOString(),
    };
  } catch (e) { return { success: false, error: e.message }; }
}

function getOverdueLoans() {
  try {
    checkAuth_();
    const kits = getRows('Kits');
    const loans = getRows('Loans').filter(function(l) {
      return isOpenLoan_(l) && isLoanOverdue_(l);
    });

    const result = loans.map(function(l) {
      const counselor = _findCounselorForLoan_(l);
      const kit       = kits.find(function(k){ return k.kit_id === l.kit_id; }) || null;
      const tpl       = kit ? getTemplate_(kit.template_id) : null;
      const coDate    = l.checked_out_at ? new Date(l.checked_out_at) : null;
      const monthName = coDate ? coDate.toLocaleString('en-US', { month: 'long', timeZone: 'America/Chicago' }) : '';
      const dueParsed = parseDueDate_(l.due_date);
      return {
        loan_id:         l.loan_id,
        kit_id:          l.kit_id,
        kit_name:        kit ? (kit.name || '') : '',
        career:          tpl ? (tpl.career || '') : '',
        campus_name:     l.campus_name || '',
        teacher_name:    l.teacher_name || '',
        checked_out_at:  l.checked_out_at || '',
        due_date:        dueParsed ? formatDueDateStr_(dueParsed) : (l.due_date || ''),
        checkout_month:  monthName,
        counselor_email: counselor ? (counselor.email || '') : '',
        counselor_name:  counselor ? (counselor.name  || l.teacher_name || '') : (l.teacher_name || ''),
      };
    });
    return { success: true, loans: result };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── EMAIL SEND FUNCTIONS ───────────────────────────────────────────────────────

function sendCheckoutEmail(loanId) {
  try {
    const data = _getLoanEmailData_(loanId);
    if (!data.counselorEmail) return; // no email on record — silently skip

    const tplRow = findBy('EmailTemplates', 'template_id', 'checkout');
    if (!tplRow || tplRow.active === 'FALSE') return;

    const subject = _mergeTemplate_(tplRow.subject, data);
    const body    = _mergeTemplate_(tplRow.body,    data);
    const opts    = _buildEmailOpts_(data);

    MailApp.sendEmail(data.counselorEmail, subject, body, opts);
  } catch (e) {
    Logger.log('sendCheckoutEmail error: ' + e.message);
  }
}

function sendCheckinEmail(loanId) {
  try {
    const data = _getLoanEmailData_(loanId);
    if (!data.counselorEmail) return;

    const subject = 'ESCA Kit Check-In Confirmation — ' + (data.kitName || data.kitId || '');
    const body    =
      'Dear ' + (data.counselorName || 'Counselor') + ',\n\n' +
      'This confirms the ' + (data.kitName || 'kit') + ' (' + (data.career || '') + ' Career Kit) has been successfully checked in and returned. ' +
      'Thank you for your participation this semester!\n\n' +
      'Sincerely,\n' + (getSetting('dept_signature') || 'CTE Department, Dallas ISD');
    const opts    = _buildEmailOpts_(data);

    MailApp.sendEmail(data.counselorEmail, subject, body, opts);
  } catch (e) {
    Logger.log('sendCheckinEmail error: ' + e.message);
  }
}

function sendReturnReminder(loanIds, returnDeadline) {
  try {
    checkAuth_();
    const tplRow = findBy('EmailTemplates', 'template_id', 'return_reminder');
    if (!tplRow || tplRow.active === 'FALSE') return { success: false, error: 'Return Reminder template not found or inactive.' };

    let sent = 0;
    const errors = [];

    (loanIds || []).forEach(function(loanId) {
      try {
        const data = _getLoanEmailData_(loanId);
        if (!data.counselorEmail) { errors.push(loanId + ': no email'); return; }
        data.returnDeadline = returnDeadline || '';
        const subject = _mergeTemplate_(tplRow.subject, data);
        const body    = _mergeTemplate_(tplRow.body,    data);
        const opts    = _buildEmailOpts_(data);
        MailApp.sendEmail(data.counselorEmail, subject, body, opts);
        sent++;
      } catch (err) { errors.push(loanId + ': ' + err.message); }
    });

    return { success: true, sent: sent, errors: errors };
  } catch (e) { return { success: false, error: e.message }; }
}

function sendOverdueNotices(loanIds, returnDeadline) {
  try {
    checkAuth_();
    const tplRow = findBy('EmailTemplates', 'template_id', 'overdue');
    if (!tplRow || tplRow.active === 'FALSE') return { success: false, error: 'Overdue Notice template not found or inactive.' };

    let sent = 0;
    const errors = [];

    (loanIds || []).forEach(function(loanId) {
      try {
        const data = _getLoanEmailData_(loanId);
        if (!data.counselorEmail) { errors.push(loanId + ': no email'); return; }
        data.returnDeadline = returnDeadline || '';
        const subject = _mergeTemplate_(tplRow.subject, data);
        const body    = _mergeTemplate_(tplRow.body,    data);
        const opts    = _buildEmailOpts_(data);
        MailApp.sendEmail(data.counselorEmail, subject, body, opts);
        sent++;
      } catch (err) { errors.push(loanId + ': ' + err.message); }
    });

    return { success: true, sent: sent, errors: errors };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── EMAIL HELPERS ─────────────────────────────────────────────────────────────

function _buildEmailOpts_(data, extraOverrides) {
  var ccPrincipal = getSetting('cc_principal');
  if (ccPrincipal === null || ccPrincipal === '') ccPrincipal = 'true';
  var extraCcRaw  = getSetting('extra_cc')  || '';
  var extraBccRaw = getSetting('extra_bcc') || '';
  var extraCcList  = extraCcRaw.split(',').map(function(s){ return s.trim(); }).filter(function(s){ return s; });
  var extraBccList = extraBccRaw.split(',').map(function(s){ return s.trim(); }).filter(function(s){ return s; });

  var ccList = [];
  if (ccPrincipal === 'true' && data.principalEmail) ccList.push(data.principalEmail);
  ccList = ccList.concat(extraCcList);

  var opts = { name: getSetting('dept_signature') || 'CTE Department, Dallas ISD' };
  var replyTo = getSetting('dept_reply_to') || '';
  if (replyTo)        opts.replyTo = replyTo;
  if (ccList.length)  opts.cc      = ccList.join(', ');
  if (extraBccList.length) opts.bcc = extraBccList.join(', ');

  if (extraOverrides) Object.assign(opts, extraOverrides);
  return opts;
}

function _mergeTemplate_(body, data) {
  if (!body) return '';
  var result = body;
  Object.keys(data).forEach(function(key) {
    var val = data[key] !== undefined && data[key] !== null ? String(data[key]) : '';
    // Replace {{key}} occurrences — case-sensitive match
    result = result.replace(new RegExp('\\{\\{' + key + '\\}\\}', 'g'), val);
  });
  return result;
}

function _findCounselorForLoan_(loan) {
  if (!loan) return null;
  // Try to match counselor by name stored on the loan (teacher_name)
  const name = (loan.teacher_name || '').trim().toLowerCase();
  if (!name) return null;
  return getRows('Counselors').find(function(c) {
    return (c.name || '').trim().toLowerCase() === name;
  }) || null;
}

function _getLoanEmailData_(loanId) {
  const loan = findBy('Loans', 'loan_id', loanId);
  if (!loan) throw new Error('Loan not found: ' + loanId);

  const kit = loan.kit_id ? findBy('Kits', 'kit_id', loan.kit_id) : null;
  const tpl = kit && kit.template_id ? getTemplate_(kit.template_id) : null;

  // Campus principal email
  let principalEmail = '';
  if (loan.campus_id) {
    const campus = findBy('Campuses', 'campus_id', String(loan.campus_id).trim());
    if (campus) principalEmail = campus.principal_email || '';
  }

  // Resolve counselor: direct email → EID lookup → name match
  let counselorEmail = '';
  let counselor = null;
  if (loan.counselor_email) {
    counselorEmail = loan.counselor_email;
    counselor = _findCounselorForLoan_(loan);
  } else if (loan.counselor_eid) {
    const eidStr = String(loan.counselor_eid).trim();
    counselor = getRows('Counselors').find(function(c) {
      return (c.eid || '').trim() === eidStr;
    }) || null;
    if (counselor) counselorEmail = counselor.email || '';
  } else {
    counselor = _findCounselorForLoan_(loan);
    if (counselor) counselorEmail = counselor.email || '';
  }

  // Counselor name parts
  const fullName  = counselor ? (counselor.name || loan.teacher_name || '') : (loan.teacher_name || '');
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ') || '';

  // Date formatter
  const fmtDate = function(d) {
    if (!d) return '';
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var yy = d.getFullYear();
    return mm + '/' + dd + '/' + yy;
  };

  // Checkout date formatting
  const coDate    = loan.checked_out_at ? new Date(loan.checked_out_at) : null;
  const monthName = coDate ? coDate.toLocaleString('en-US', { month: 'long', timeZone: 'America/Chicago' }) : '';

  // Return date from due_date column
  let returnDate = '';
  if (loan.due_date) {
    const rd = (loan.due_date instanceof Date) ? loan.due_date : new Date(loan.due_date);
    returnDate = isNaN(rd.getTime()) ? String(loan.due_date) : fmtDate(rd);
  }

  return {
    counselorName:   fullName,
    firstName:       firstName,
    lastName:        lastName,
    campusName:      loan.campus_name || '',
    kitName:         kit  ? (kit.name   || '') : '',
    kitId:           loan.kit_id || '',
    career:          tpl  ? (tpl.career || '') : '',
    checkoutDate:    fmtDate(coDate),
    checkoutMonth:   monthName,
    returnDate:      returnDate,
    returnDeadline:  '',
    deptHours:       getSetting('dept_hours')     || '8:00 AM – 4:30 PM, Monday–Friday',
    deptSignature:   getSetting('dept_signature') || 'CTE Department, Dallas ISD',
    counselorEmail:  counselorEmail,
    principalEmail:  principalEmail,
  };
}
