import { Router } from 'express';
import {
  appendRow,
  findAllBy,
  findBy,
  getRows,
  getSetting,
  logAudit,
  nextId,
  updateRow,
} from '../sheets/client.js';
import { KIT_LOAN_ST, LOAN_ST, STATUS } from '../sheets/schema.js';
import {
  errMsg,
  formatDueDateStr_,
  getApiUser,
  getTemplate_,
  isLoanOverdue_,
  parseDueDate_,
  startOfToday_,
  strip_,
} from '../lib/helpers.js';
import {
  resolveCounselorForLoan,
  sendCheckinEmail,
  sendCheckoutEmail,
} from '../email/send.js';

const router = Router();

/** POST /checkout */
router.post('/checkout', async (req, res) => {
  try {
    const user = getApiUser(req);
    const {
      kitId,
      tipwebTag,
      teacherName,
      confirmedBarcodes,
      campusId,
      counselorEid,
      counselorEmail,
      forceCheckout,
    } = req.body || {};

    const kit = await findBy('Kits', 'kit_id', kitId);
    if (!kit) {
      res.json({ success: false, error: 'Kit not found.' });
      return;
    }
    if (kit.loan_status === KIT_LOAN_ST.CHECKED_OUT) {
      res.json({ success: false, error: 'Kit is already checked out.' });
      return;
    }

    const kitItems = await findAllBy('KitItems', 'kit_id', kitId);
    const notReady = kitItems.filter(
      (i) =>
        i.status === STATUS.NEEDS_REPLACEMENT ||
        i.status === STATUS.DEAD ||
        i.status === 'Missing',
    );
    if (notReady.length && !forceCheckout) {
      res.json({
        success: false,
        error: `Kit is not ready — ${notReady.length} item(s) need attention. Acknowledge override to continue.`,
      });
      return;
    }

    let campusName = '';
    let region = '';
    if (campusId) {
      const campus = await findBy('Campuses', 'campus_id', campusId);
      if (campus) {
        campusName = String(campus.name || '');
        region = String(campus.region || '');
      }
    }

    const now = new Date();
    const parsedDefault = parseDueDate_(await getSetting('default_due_date'));
    let dueDateStr = formatDueDateStr_(parsedDefault);
    if (!dueDateStr) {
      const fallback = startOfToday_();
      fallback.setDate(fallback.getDate() + 90);
      dueDateStr = formatDueDateStr_(fallback);
    }

    const loanId = await nextId('LOAN');
    await appendRow('Loans', {
      loan_id: loanId,
      kit_id: kitId,
      campus_id: campusId || '',
      campus_name: campusName,
      region,
      tipweb_tag: tipwebTag || '',
      teacher_name: teacherName || '',
      checked_out_at: now.toISOString(),
      checked_out_by: user,
      checked_in_at: '',
      checked_in_by: '',
      counselor_eid: counselorEid || '',
      counselor_email: counselorEmail || '',
      due_date: dueDateStr,
      return_type: '',
      notes: forceCheckout ? 'Checkout override: kit not fully ready' : '',
      status: LOAN_ST.OPEN,
    });

    let itemsConfirmed = 0;
    for (const b of confirmedBarcodes || []) {
      const it = await findBy('KitItems', 'barcode', b);
      if (it) {
        await appendRow('CheckoutItems', {
          loan_id: loanId,
          barcode: b,
          type_id: it.type_id,
          status_at_checkout: it.status,
          confirmed: 'Y',
        });
        itemsConfirmed++;
      }
    }

    // Re-find the kit row so loan_status is never written to a stale row index.
    const kitRow = (await findBy('Kits', 'kit_id', kitId)) || kit;
    await updateRow('Kits', kitRow._row, { loan_status: KIT_LOAN_ST.CHECKED_OUT });
    const auditNote =
      (forceCheckout
        ? `Loan:${loanId} TipWeb:${tipwebTag || 'N/A'} OVERRIDE not-ready:${notReady.length}`
        : `Loan:${loanId} TipWeb:${tipwebTag || 'N/A'}`) + ` items:${itemsConfirmed}`;
    await logAudit(String(kit.kit_barcode || ''), String(kitId), 'checkout', '', '', user, auditNote);
    try {
      await sendCheckoutEmail(loanId);
    } catch {
      /* ignore */
    }
    res.json({ success: true, loanId, itemsConfirmed });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** POST /checkin */
router.post('/checkin', async (req, res) => {
  try {
    const user = getApiUser(req);
    const { loanId, returnType, issues } = req.body || {};

    const loan = await findBy('Loans', 'loan_id', loanId);
    if (!loan) {
      res.json({ success: false, error: 'Loan not found.' });
      return;
    }
    if (loan.status === LOAN_ST.CLOSED) {
      res.json({ success: false, error: 'This loan is already closed.' });
      return;
    }

    await updateRow('Loans', loan._row, {
      checked_in_at: new Date().toISOString(),
      checked_in_by: user,
      return_type: returnType,
      status: LOAN_ST.CLOSED,
    });

    for (const iss of issues || []) {
      await appendRow('CheckinIssues', {
        loan_id: loanId,
        barcode: iss.barcode,
        issue_type: iss.issue_type,
        notes: iss.notes || '',
        reported_at: new Date().toISOString(),
        reported_by: user,
      });
      const it = await findBy('KitItems', 'barcode', iss.barcode);
      if (it) {
        const newSt =
          iss.issue_type === 'Does Not Work' ? STATUS.DEAD : STATUS.NEEDS_REPLACEMENT;
        await updateRow('KitItems', it._row, {
          status: newSt,
          last_updated: new Date().toISOString(),
          updated_by: user,
        });
        await logAudit(
          String(iss.barcode),
          String(it.kit_id),
          'checkin_issue',
          String(it.status || ''),
          newSt,
          user,
          String(iss.issue_type || ''),
        );
      }
    }

    const kit = await findBy('Kits', 'kit_id', loan.kit_id);
    if (kit) await updateRow('Kits', kit._row, { loan_status: KIT_LOAN_ST.AVAILABLE });
    await logAudit(
      '',
      String(loan.kit_id || ''),
      'checkin',
      '',
      '',
      user,
      `Return:${returnType} Issues:${(issues || []).length}`,
    );
    try {
      await sendCheckinEmail(String(loanId));
    } catch {
      /* ignore */
    }
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** GET /open */
router.get('/open', async (_req, res) => {
  try {
    const kits = await getRows('Kits');
    const loans = (await getRows('Loans')).filter((l) => l.status === LOAN_ST.OPEN);
    const result = [];
    for (const l of loans) {
      const counselor = await resolveCounselorForLoan(l);
      const kit = kits.find((k) => k.kit_id === l.kit_id) || null;
      result.push({
        loan_id: l.loan_id,
        kit_id: l.kit_id,
        kit_name: kit ? kit.name || '' : '',
        campus_name: l.campus_name || '',
        teacher_name: l.teacher_name || '',
        checked_out_at: l.checked_out_at || '',
        due_date: l.due_date || '',
        counselor_eid: l.counselor_eid || '',
        counselor_email: counselor ? counselor.email || '' : l.counselor_email || '',
        counselor_name: counselor
          ? counselor.name || l.teacher_name || ''
          : l.teacher_name || '',
      });
    }
    res.json({ success: true, loans: result });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** GET /open-by-eid/:eid — Hub-safe counselor loans */
router.get('/open-by-eid/:eid', async (req, res) => {
  try {
    const eidStr = String(req.params.eid || '').trim();
    if (!eidStr) {
      res.json({ success: false, error: 'EID required.' });
      return;
    }
    const kits = await getRows('Kits');
    const loans = (await getRows('Loans'))
      .filter(
        (l) => l.status === LOAN_ST.OPEN && String(l.counselor_eid || '').trim() === eidStr,
      )
      .map((l) => {
        const kit = kits.find((k) => k.kit_id === l.kit_id) || null;
        return {
          loan_id: l.loan_id,
          kit_id: l.kit_id,
          kit_name: kit ? kit.name || '' : '',
          kit_barcode: kit ? kit.kit_barcode || '' : '',
          campus_name: l.campus_name || '',
          due_date: l.due_date || '',
          checked_out_at: l.checked_out_at || '',
        };
      });
    res.json({ success: true, loans });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** GET /overdue */
router.get('/overdue', async (_req, res) => {
  try {
    const kits = await getRows('Kits');
    const loans = (await getRows('Loans')).filter(
      (l) => l.status === LOAN_ST.OPEN && isLoanOverdue_(l),
    );

    const result = [];
    for (const l of loans) {
      const counselor = await resolveCounselorForLoan(l);
      const kit = kits.find((k) => k.kit_id === l.kit_id) || null;
      const tpl = kit ? await getTemplate_(kit.template_id) : null;
      const coDate = l.checked_out_at ? new Date(String(l.checked_out_at)) : null;
      const monthName = coDate
        ? coDate.toLocaleString('en-US', { month: 'long', timeZone: 'America/Chicago' })
        : '';
      const dueParsed = parseDueDate_(l.due_date);
      result.push({
        loan_id: l.loan_id,
        kit_id: l.kit_id,
        kit_name: kit ? kit.name || '' : '',
        career: tpl ? tpl.career || '' : '',
        campus_name: l.campus_name || '',
        teacher_name: l.teacher_name || '',
        checked_out_at: l.checked_out_at || '',
        due_date: dueParsed ? formatDueDateStr_(dueParsed) : l.due_date || '',
        checkout_month: monthName,
        counselor_email: counselor ? counselor.email || '' : '',
        counselor_name: counselor
          ? counselor.name || l.teacher_name || ''
          : l.teacher_name || '',
      });
    }
    res.json({ success: true, loans: result });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** GET /history?q= */
router.get('/history', async (req, res) => {
  try {
    const q = String(req.query.q || '')
      .trim()
      .toLowerCase();
    const kits = await getRows('Kits');
    const coItems = await getRows('CheckoutItems');
    const loans = (await getRows('Loans'))
      .map((l) => {
        const kit = kits.find((k) => k.kit_id === l.kit_id) || null;
        return {
          loan_id: l.loan_id,
          kit_id: l.kit_id,
          kit_name: kit ? String(kit.name || '') : '',
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
          items_count: coItems.filter((c) => c.loan_id === l.loan_id).length,
        };
      })
      .sort((a, b) => String(b.checked_out_at).localeCompare(String(a.checked_out_at)));

    const filtered = q
      ? loans.filter((l) =>
          [l.teacher_name, l.counselor_eid, l.counselor_email, l.campus_name, l.kit_name, l.loan_id]
            .join(' ')
            .toLowerCase()
            .includes(q),
        )
      : loans;
    res.json({ success: true, loans: filtered.slice(0, 250) });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** GET /status-board */
router.get('/status-board', async (_req, res) => {
  try {
    const kits = (await getRows('Kits')).filter((k) => k.active !== 'FALSE');
    const templates = (await getRows('KitTemplates')).filter((t) => t.active !== 'FALSE');
    const openLoans = (await getRows('Loans')).filter((l) => l.status === LOAN_ST.OPEN);
    const overdue = openLoans.filter((l) => isLoanOverdue_(l));

    const careers = templates
      .map((tpl) => {
        const kitList = kits.filter((k) => k.template_id === tpl.template_id);
        const out = kitList.filter((k) => k.loan_status === KIT_LOAN_ST.CHECKED_OUT).length;
        return {
          career: String(tpl.career || tpl.name || tpl.template_id),
          total: kitList.length,
          out,
          ready: kitList.length - out,
        };
      })
      .filter((c) => c.total > 0);

    const byRegion: Record<string, { region: string; open: number }> = {};
    for (const l of openLoans) {
      const region = String(l.region || 'Unassigned');
      if (!byRegion[region]) byRegion[region] = { region, open: 0 };
      byRegion[region].open++;
    }

    res.json({
      success: true,
      kits_total: kits.length,
      kits_out: kits.filter((k) => k.loan_status === KIT_LOAN_ST.CHECKED_OUT).length,
      kits_ready: kits.filter((k) => k.loan_status !== KIT_LOAN_ST.CHECKED_OUT).length,
      open_loans: openLoans.length,
      overdue: overdue.length,
      careers,
      regions: Object.values(byRegion),
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

export default router;
