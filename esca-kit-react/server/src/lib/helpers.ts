import { findBy } from '../sheets/client.js';
import { KIT_LOAN_ST, LOAN_ST, type SheetRow } from '../sheets/schema.js';

/** Normalize a status value ('Checked Out' → 'checked_out'). */
function normStatus_(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
}

/** True when a loan row is still open, tolerant of case/spacing. */
export function isOpenLoan_(loan: Record<string, unknown> | null | undefined): boolean {
  return normStatus_(loan?.status) === LOAN_ST.OPEN;
}

/** True when a kit row is checked out, tolerant of case/spacing. */
export function isKitCheckedOut_(kit: Record<string, unknown> | null | undefined): boolean {
  return normStatus_(kit?.loan_status) === KIT_LOAN_ST.CHECKED_OUT;
}

/** Strip internal `_row` before sending to clients. */
export function strip_<T extends Record<string, unknown>>(
  obj: T | null | undefined,
): Omit<T, '_row'> | null {
  if (!obj) return null;
  const o = { ...obj };
  delete (o as { _row?: number })._row;
  return o;
}

export function isConsumable_(type: SheetRow | null | undefined): boolean {
  if (!type) return false;
  const v = type.is_consumable;
  return v === true || v === 'TRUE' || v === 'true';
}

export async function getTemplate_(templateId: unknown): Promise<SheetRow | null> {
  if (!templateId) return null;
  return findBy('KitTemplates', 'template_id', templateId);
}

export async function enrichKit_(kit: SheetRow | null): Promise<Record<string, unknown> | null> {
  if (!kit) return null;
  const k = strip_(kit) as Record<string, unknown>;
  const tpl = await getTemplate_(k.template_id);
  if (tpl) {
    k.template_name = tpl.name;
    k.career = tpl.career;
  }
  return k;
}

/** API user identity — no GAS Session; use header or default service user. */
export function getApiUser(req: { headers: Record<string, unknown> }): string {
  const h = req.headers['x-user-email'];
  if (typeof h === 'string' && h.trim()) return h.trim();
  return 'api@esca';
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Parse due dates from Sheets (Date), MM/DD/YYYY, or YYYY-MM-DD → local midnight Date. */
export function parseDueDate_(value: unknown): Date | null {
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

export function formatDueDateStr_(d: Date | null | undefined): string {
  if (!d || isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

export function startOfToday_(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

export function isLoanOverdue_(loan: Record<string, unknown> | null | undefined): boolean {
  const due = parseDueDate_(loan?.due_date);
  if (!due) return false;
  return due < startOfToday_();
}
