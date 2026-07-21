import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import {
  findBy,
  getRows,
  getSetting,
} from '../sheets/client.js';
import type { SheetRow } from '../sheets/schema.js';

export type SendMailOpts = {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  fromName?: string;
};

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!smtpConfigured()) return null;
  const options: SMTPTransport.Options = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  };
  return nodemailer.createTransport(options);
}

/** Send email via SMTP. No-ops (logs) if SMTP is not configured. */
export async function sendMail(opts: SendMailOpts): Promise<{ sent: boolean; skipped?: boolean }> {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('[email] SMTP not configured — skipping send:', opts.subject, '→', opts.to);
    return { sent: false, skipped: true };
  }

  const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER || '';
  const from = opts.fromName ? `"${opts.fromName}" <${fromAddr}>` : fromAddr;

  await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
    cc: opts.cc,
    bcc: opts.bcc,
    replyTo: opts.replyTo,
  });
  return { sent: true };
}

/** Replace {{field}} placeholders (case-sensitive). */
export function mergeTemplate(body: string, data: Record<string, unknown>): string {
  if (!body) return '';
  let result = body;
  for (const key of Object.keys(data)) {
    const val = data[key] !== undefined && data[key] !== null ? String(data[key]) : '';
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
  }
  return result;
}

export type EmailOpts = {
  replyTo?: string;
  cc?: string;
  bcc?: string;
  fromName: string;
};

/** Port of GAS _buildEmailOpts_. */
export async function buildEmailOpts(
  data: { principalEmail?: string },
): Promise<EmailOpts> {
  let ccPrincipal = await getSetting('cc_principal');
  if (ccPrincipal === null || ccPrincipal === '') ccPrincipal = 'true';
  const extraCcRaw = (await getSetting('extra_cc')) || '';
  const extraBccRaw = (await getSetting('extra_bcc')) || '';
  const extraCcList = extraCcRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const extraBccList = extraBccRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const ccList: string[] = [];
  if (ccPrincipal === 'true' && data.principalEmail) ccList.push(data.principalEmail);
  ccList.push(...extraCcList);

  const opts: EmailOpts = {
    fromName: (await getSetting('dept_signature')) || 'CTE Department, Dallas ISD',
  };
  const replyTo = (await getSetting('dept_reply_to')) || '';
  if (replyTo) opts.replyTo = replyTo;
  if (ccList.length) opts.cc = ccList.join(', ');
  if (extraBccList.length) opts.bcc = extraBccList.join(', ');
  return opts;
}

async function findCounselorForLoan(loan: SheetRow): Promise<SheetRow | null> {
  const name = String(loan.teacher_name || '')
    .trim()
    .toLowerCase();
  if (!name) return null;
  const counselors = await getRows('Counselors');
  return (
    counselors.find((c) => String(c.name || '').trim().toLowerCase() === name) || null
  );
}

async function getTemplate(templateId: unknown): Promise<SheetRow | null> {
  if (!templateId) return null;
  return findBy('KitTemplates', 'template_id', templateId);
}

export type LoanEmailData = {
  counselorName: string;
  firstName: string;
  lastName: string;
  campusName: string;
  kitName: string;
  kitId: string;
  career: string;
  checkoutDate: string;
  checkoutMonth: string;
  returnDate: string;
  returnDeadline: string;
  deptHours: string;
  deptSignature: string;
  counselorEmail: string;
  principalEmail: string;
};

function fmtDate(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = d.getFullYear();
  return `${mm}/${dd}/${yy}`;
}

/** Port of GAS _getLoanEmailData_. */
export async function getLoanEmailData(loanId: string): Promise<LoanEmailData> {
  const loan = await findBy('Loans', 'loan_id', loanId);
  if (!loan) throw new Error('Loan not found: ' + loanId);

  const kit = loan.kit_id ? await findBy('Kits', 'kit_id', loan.kit_id) : null;
  const tpl = kit?.template_id ? await getTemplate(kit.template_id) : null;

  let principalEmail = '';
  if (loan.campus_id) {
    const campus = await findBy('Campuses', 'campus_id', String(loan.campus_id).trim());
    if (campus) principalEmail = String(campus.principal_email || '');
  }

  let counselorEmail = '';
  let counselor: SheetRow | null = null;
  if (loan.counselor_email) {
    counselorEmail = String(loan.counselor_email);
    counselor = await findCounselorForLoan(loan);
  } else if (loan.counselor_eid) {
    const eidStr = String(loan.counselor_eid).trim();
    const counselors = await getRows('Counselors');
    counselor =
      counselors.find((c) => String(c.eid || '').trim() === eidStr) || null;
    if (counselor) counselorEmail = String(counselor.email || '');
  } else {
    counselor = await findCounselorForLoan(loan);
    if (counselor) counselorEmail = String(counselor.email || '');
  }

  const fullName = counselor
    ? String(counselor.name || loan.teacher_name || '')
    : String(loan.teacher_name || '');
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const coDate = loan.checked_out_at ? new Date(String(loan.checked_out_at)) : null;
  const monthName = coDate
    ? coDate.toLocaleString('en-US', { month: 'long', timeZone: 'America/Chicago' })
    : '';

  let returnDate = '';
  if (loan.due_date) {
    const rd = loan.due_date instanceof Date ? loan.due_date : new Date(String(loan.due_date));
    returnDate = isNaN(rd.getTime()) ? String(loan.due_date) : fmtDate(rd);
  }

  return {
    counselorName: fullName,
    firstName,
    lastName,
    campusName: String(loan.campus_name || ''),
    kitName: kit ? String(kit.name || '') : '',
    kitId: String(loan.kit_id || ''),
    career: tpl ? String(tpl.career || '') : '',
    checkoutDate: fmtDate(coDate),
    checkoutMonth: monthName,
    returnDate,
    returnDeadline: '',
    deptHours: (await getSetting('dept_hours')) || '8:00 AM – 4:30 PM, Monday–Friday',
    deptSignature: (await getSetting('dept_signature')) || 'CTE Department, Dallas ISD',
    counselorEmail,
    principalEmail,
  };
}

export async function sendCheckoutEmail(loanId: string): Promise<void> {
  try {
    const data = await getLoanEmailData(loanId);
    if (!data.counselorEmail) return;

    const tplRow = await findBy('EmailTemplates', 'template_id', 'checkout');
    if (!tplRow || tplRow.active === 'FALSE') return;

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
  } catch (e) {
    console.error('sendCheckoutEmail error:', e instanceof Error ? e.message : e);
  }
}

export async function sendCheckinEmail(loanId: string): Promise<void> {
  try {
    const data = await getLoanEmailData(loanId);
    if (!data.counselorEmail) return;

    const subject = `ESCA Kit Check-In Confirmation — ${data.kitName || data.kitId || ''}`;
    const body =
      `Dear ${data.counselorName || 'Counselor'},\n\n` +
      `This confirms the ${data.kitName || 'kit'} (${data.career || ''} Career Kit) has been successfully checked in and returned. ` +
      `Thank you for your participation this semester!\n\n` +
      `Sincerely,\n${(await getSetting('dept_signature')) || 'CTE Department, Dallas ISD'}`;
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
  } catch (e) {
    console.error('sendCheckinEmail error:', e instanceof Error ? e.message : e);
  }
}

/** Shared helper for open/overdue loan counselor resolution (GAS _findCounselorForLoan_). */
export async function resolveCounselorForLoan(
  loan: SheetRow,
): Promise<SheetRow | null> {
  return findCounselorForLoan(loan);
}
