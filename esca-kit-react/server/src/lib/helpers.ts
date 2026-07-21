import { findBy } from '../sheets/client.js';
import type { SheetRow } from '../sheets/schema.js';

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
