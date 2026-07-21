import { Router } from 'express';
import { appendRow, findBy, getRows, getSetting, updateRow } from '../sheets/client.js';
import { errMsg, strip_ } from '../lib/helpers.js';
import {
  buildEmailOpts,
  getLoanEmailData,
  mergeTemplate,
  sendMail,
} from '../email/send.js';

const router = Router();

/** GET /templates */
router.get('/templates', async (_req, res) => {
  try {
    const templates = (await getRows('EmailTemplates')).map((t) => strip_(t));
    res.json({ success: true, templates });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** POST /templates */
router.post('/templates', async (req, res) => {
  try {
    const data = req.body || {};
    if (!data.template_id) {
      res.json({ success: false, error: 'template_id is required.' });
      return;
    }
    const existing = await findBy('EmailTemplates', 'template_id', data.template_id);
    if (existing) {
      await updateRow('EmailTemplates', existing._row, data);
    } else {
      await appendRow('EmailTemplates', { ...data, active: 'TRUE' });
    }
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** POST /test */
router.post('/test', async (req, res) => {
  try {
    const { toEmail, subject, body } = req.body || {};
    if (!toEmail) {
      res.json({ success: false, error: 'No recipient email configured.' });
      return;
    }
    const sig = (await getSetting('dept_signature')) || 'CTE Department, Dallas ISD';
    const replyTo = (await getSetting('dept_reply_to')) || '';
    await sendMail({
      to: toEmail,
      subject: '[TEST] ' + (subject || ''),
      body: body || '',
      replyTo: replyTo || undefined,
      fromName: sig,
    });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** POST /return-reminder { loanIds, returnDeadline } */
router.post('/return-reminder', async (req, res) => {
  try {
    const { loanIds, returnDeadline } = req.body || {};
    const tplRow = await findBy('EmailTemplates', 'template_id', 'return_reminder');
    if (!tplRow || tplRow.active === 'FALSE') {
      res.json({
        success: false,
        error: 'Return Reminder template not found or inactive.',
      });
      return;
    }

    let sent = 0;
    const errors: string[] = [];

    for (const loanId of loanIds || []) {
      try {
        const data = await getLoanEmailData(String(loanId));
        if (!data.counselorEmail) {
          errors.push(loanId + ': no email');
          continue;
        }
        data.returnDeadline = returnDeadline || '';
        const subject = mergeTemplate(String(tplRow.subject || ''), data);
        const body = mergeTemplate(String(tplRow.body || ''), data);
        const opts = await buildEmailOpts(data);
        await sendMail({
          to: data.counselorEmail,
          subject,
          body,
          cc: opts.cc,
          bcc: opts.bcc,
          replyTo: opts.replyTo,
          fromName: opts.fromName,
        });
        sent++;
      } catch (err) {
        errors.push(loanId + ': ' + errMsg(err));
      }
    }

    res.json({ success: true, sent, errors });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** POST /overdue-notices { loanIds, returnDeadline } */
router.post('/overdue-notices', async (req, res) => {
  try {
    const { loanIds, returnDeadline } = req.body || {};
    const tplRow = await findBy('EmailTemplates', 'template_id', 'overdue');
    if (!tplRow || tplRow.active === 'FALSE') {
      res.json({
        success: false,
        error: 'Overdue Notice template not found or inactive.',
      });
      return;
    }

    let sent = 0;
    const errors: string[] = [];

    for (const loanId of loanIds || []) {
      try {
        const data = await getLoanEmailData(String(loanId));
        if (!data.counselorEmail) {
          errors.push(loanId + ': no email');
          continue;
        }
        data.returnDeadline = returnDeadline || '';
        const subject = mergeTemplate(String(tplRow.subject || ''), data);
        const body = mergeTemplate(String(tplRow.body || ''), data);
        const opts = await buildEmailOpts(data);
        await sendMail({
          to: data.counselorEmail,
          subject,
          body,
          cc: opts.cc,
          bcc: opts.bcc,
          replyTo: opts.replyTo,
          fromName: opts.fromName,
        });
        sent++;
      } catch (err) {
        errors.push(loanId + ': ' + errMsg(err));
      }
    }

    res.json({ success: true, sent, errors });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

export default router;
