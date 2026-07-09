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

function scanBarcode(barcode) {
  try {
    checkAuth_();
    barcode = String(barcode).trim();

    // Is this a kit-level barcode (on the case)?
    const kit = findBy('Kits', 'kit_barcode', barcode);
    if (kit) {
      const types = getRows('ItemTypes');
      const items = findAllBy('KitItems', 'kit_id', kit.kit_id).map(i => {
        const t = types.find(t => t.type_id === i.type_id);
        return Object.assign(strip_(i), { type_name: t ? t.name : i.type_id, is_consumable: isConsumable_(t) });
      });
      if (kit.loan_status === KIT_LOAN_ST.CHECKED_OUT) {
        const loan = getRows('Loans').find(l => l.kit_id === kit.kit_id && l.status === LOAN_ST.OPEN) || null;
        return { success: true, panel: 'checkin', kit: enrichKit_(kit), loan: loan ? strip_(loan) : null, items };
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

function checkoutKit(kitId, tipwebTag, teacherName, confirmedBarcodes, campusId) {
  try {
    const user = checkAuth_();
    const kit  = findBy('Kits', 'kit_id', kitId);
    if (!kit) return { success: false, error: 'Kit not found.' };
    if (kit.loan_status === KIT_LOAN_ST.CHECKED_OUT) return { success: false, error: 'Kit is already checked out.' };

    let campusName = '', region = '';
    if (campusId) {
      const campus = findBy('Campuses', 'campus_id', campusId);
      if (campus) { campusName = campus.name; region = campus.region; }
    }

    const loanId = nextId('LOAN');
    appendRow('Loans', {
      loan_id: loanId, kit_id: kitId,
      campus_id: campusId || '', campus_name: campusName, region: region,
      tipweb_tag: tipwebTag || '',
      teacher_name: teacherName || '', checked_out_at: new Date().toISOString(),
      checked_out_by: user, checked_in_at: '', checked_in_by: '',
      return_type: '', notes: '', status: LOAN_ST.OPEN,
    });

    (confirmedBarcodes || []).forEach(b => {
      const it = findBy('KitItems', 'barcode', b);
      if (it) appendRow('CheckoutItems', { loan_id: loanId, barcode: b, type_id: it.type_id, status_at_checkout: it.status, confirmed: 'Y' });
    });

    updateRow('Kits', kit._row, { loan_status: KIT_LOAN_ST.CHECKED_OUT });
    logAudit(kit.kit_barcode, kitId, 'checkout', '', '', user, `Loan:${loanId} TipWeb:${tipwebTag || 'N/A'}`);
    return { success: true, loanId };
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
      t.kit_count = kits.filter(k => k.template_id === t.template_id).length;
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
    return { success: true, email: email, initial: (email || 'A').charAt(0).toUpperCase() };
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
    if (data.campus_id) {
      const c = findBy('Campuses', 'campus_id', data.campus_id);
      if (c) { updateRow('Campuses', c._row, data); return { success: true, campus_id: data.campus_id }; }
    }
    const campusId = nextId('CAMP');
    appendRow('Campuses', Object.assign({}, data, { campus_id: campusId, active: 'TRUE' }));
    return { success: true, campus_id: campusId };
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
    if (k) updateRow('Kits', k._row, { active: 'FALSE' });
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
      if (l.status === LOAN_ST.OPEN) byRegion[region].open_loans++;
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

    const openLoans = getRows('Loans').filter(l => l.status === LOAN_ST.OPEN).map(strip_);
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
  try { checkAuth_(); return { success: true, settings: getRows('Settings').map(strip_) }; }
  catch (e) { return { success: false, error: e.message }; }
}

function saveSetting(key, value) {
  try { checkAuth_(); setSetting(key, value); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
}

// Run this once after deploying to bootstrap the blank spreadsheet
function runSetup() {
  ensureSchema();
  return { success: true, message: 'Schema bootstrapped. All tabs and headers are ready.' };
}
