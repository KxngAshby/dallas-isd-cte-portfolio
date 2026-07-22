/**
 * Dual transport:
 * - Inside Google Apps Script (ReactApp.html): google.script.run → Services.gs
 * - Local Vite dev: fetch → Express /api/v1 (optional Node server)
 */

declare global {
  interface Window {
    google?: {
      script?: {
        run: {
          withSuccessHandler: (cb: (result: unknown) => void) => {
            withFailureHandler: (cb: (err: Error) => void) => Record<string, (...args: unknown[]) => void>;
          };
        };
      };
    };
  }
}

const BASE = import.meta.env.VITE_API_URL || '/api/v1';

function isGas(): boolean {
  return typeof window !== 'undefined' && !!window.google?.script?.run;
}

const GAS_TIMEOUT_MS = 45_000;

function runGas<T>(fnName: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Request timed out (${fnName}). Try again — the sheet may be busy.`));
    }, GAS_TIMEOUT_MS);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      fn();
    };

    const runner = window.google!.script!.run
      .withSuccessHandler((result: unknown) => {
        finish(() => {
          const data = result as { success?: boolean; error?: string };
          if (data && data.success === false) reject(new Error(data.error || 'Request failed'));
          else resolve(result as T);
        });
      })
      .withFailureHandler((err: Error) => {
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      });
    const fn = runner[fnName];
    if (typeof fn !== 'function') {
      finish(() => reject(new Error(`GAS function not found: ${fnName}`)));
      return;
    }
    fn(...args);
  });
}

function parseBody(options?: RequestInit): any {
  if (!options?.body) return {};
  try {
    return JSON.parse(String(options.body));
  } catch {
    return {};
  }
}

/** Map REST path + method to Services.gs function calls */
async function apiViaGas<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase();
  const body = parseBody(options);
  // Normalize: drop query, trim, and strip a trailing slash (except root) so
  // routes like `/kits/ABC/` or `/kits/ ` still match their regexes.
  let p = path.split('?')[0].trim();
  if (p.length > 1) p = p.replace(/\/+$/, '');

  // Scan
  if (method === 'POST' && p === '/scan') return runGas<T>('scanBarcode', body.barcode);

  // Loans
  if (method === 'POST' && p === '/loans/checkout') {
    return runGas<T>(
      'checkoutKit',
      body.kitId,
      body.tipwebTag || '',
      body.teacherName,
      body.confirmedBarcodes || [],
      body.campusId,
      body.counselorEid,
      body.counselorEmail,
      !!body.forceCheckout,
    );
  }
  if (method === 'POST' && p === '/loans/checkin') {
    return runGas<T>('checkinKit', body.loanId, body.returnType, body.issues || []);
  }
  if (method === 'GET' && p === '/loans/open') return runGas<T>('getOpenLoans');
  if (method === 'GET' && p === '/loans/overdue') return runGas<T>('getOverdueLoans');
  {
    const mByEid = p.match(/^\/loans\/open-by-eid\/(.+)$/);
    if (method === 'GET' && mByEid) {
      return runGas<T>('getOpenLoansForCounselor', decodeURIComponent(mByEid[1]));
    }
  }
  if (method === 'GET' && p === '/loans/history') {
    const q = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '').get('q') || '';
    return runGas<T>('getLoanHistory', q);
  }
  if (method === 'GET' && p === '/loans/status-board') return runGas<T>('getStatusBoard');

  // Campuses
  if (method === 'GET' && p === '/campuses') return runGas<T>('getCampuses');
  if (method === 'POST' && p === '/campuses') return runGas<T>('saveCampus', body);
  if (method === 'POST' && p === '/campuses/import') return runGas<T>('importCampuses', body.rows || body);
  {
    const m = p.match(/^\/campuses\/(.+)$/);
    if (method === 'DELETE' && m) return runGas<T>('deleteCampus', decodeURIComponent(m[1]));
  }

  // Counselors
  if (method === 'GET' && p === '/counselors') return runGas<T>('getCounselors');
  if (method === 'POST' && p === '/counselors') return runGas<T>('saveCounselor', body);
  if (method === 'POST' && p === '/counselors/import') return runGas<T>('importCounselors', body.rows || body);
  if (method === 'POST' && p === '/counselors/upsert-hub') {
    return runGas<T>('upsertCounselorFromHub', body.eid, body.name, body.campusId, body.email);
  }
  {
    const mByEid = p.match(/^\/counselors\/by-eid\/(.+)$/);
    if (method === 'GET' && mByEid) {
      return runGas<T>('getCounselorByEid', decodeURIComponent(mByEid[1]));
    }
    const mDel = p.match(/^\/counselors\/([^/]+)$/);
    if (method === 'DELETE' && mDel) {
      return runGas<T>('deleteCounselor', decodeURIComponent(mDel[1]));
    }
  }

  // Kits / templates / types
  if (method === 'GET' && p === '/kits') return runGas<T>('getKits');
  if (method === 'POST' && p === '/kits') return runGas<T>('saveKit', body);
  if (method === 'GET' && p === '/kits/templates') return runGas<T>('getKitTemplates');
  if (method === 'POST' && p === '/kits/templates') return runGas<T>('saveKitTemplate', body);
  if (method === 'GET' && p === '/kits/types') return runGas<T>('getItemTypes');
  if (method === 'POST' && p === '/kits/types') return runGas<T>('saveItemType', body);
  if (method === 'POST' && p === '/kits/item-status') {
    return runGas<T>('updateItemStatus', body.barcode, body.status, body.notes || '');
  }
  // Explicit DELETE routes (kept at top level so they cannot be shadowed/missed).
  if (method === 'DELETE') {
    // No id → purge unlabeled/junk template rows.
    if (p === '/kits/templates') return runGas<T>('deleteKitTemplate', '');
    const dTpl = p.match(/^\/kits\/templates\/(.+)$/);
    if (dTpl) return runGas<T>('deleteKitTemplate', decodeURIComponent(dTpl[1]));
    const dType = p.match(/^\/kits\/types\/(.+)$/);
    if (dType) return runGas<T>('deleteItemType', decodeURIComponent(dType[1]));
    const dKit = p.match(/^\/kits\/(.+)$/);
    if (dKit) return runGas<T>('deleteKit', decodeURIComponent(dKit[1]));
  }
  {
    const mDelType = p.match(/^\/kits\/types\/([^/]+)$/);
    if (method === 'DELETE' && mDelType) {
      return runGas<T>('deleteItemType', decodeURIComponent(mDelType[1]));
    }
    const mTplItems = p.match(/^\/kits\/([^/]+)\/template-items$/);
    if (method === 'GET' && mTplItems) {
      return runGas<T>('getTemplateItemsForKit', decodeURIComponent(mTplItems[1]));
    }
    const mItems = p.match(/^\/kits\/([^/]+)\/items$/);
    if (method === 'GET' && mItems) return runGas<T>('getKitItems', decodeURIComponent(mItems[1]));
    const mBar = p.match(/^\/kits\/([^/]+)\/barcodes$/);
    if (method === 'POST' && mBar) return runGas<T>('generateBarcodes', decodeURIComponent(mBar[1]), body.items || []);
    const mTpl = p.match(/^\/kits\/templates\/([^/]+)\/items$/);
    if (method === 'POST' && mTpl) return runGas<T>('saveTemplateItems', decodeURIComponent(mTpl[1]), body.items || []);
    const mDelTpl = p.match(/^\/kits\/templates\/([^/]+)$/);
    if (method === 'DELETE' && mDelTpl) return runGas<T>('deleteKitTemplate', decodeURIComponent(mDelTpl[1]));
    const mDel = p.match(/^\/kits\/([^/]+)$/);
    if (method === 'DELETE' && mDel) return runGas<T>('deleteKit', decodeURIComponent(mDel[1]));
  }

  // Emails
  if (method === 'GET' && p === '/emails/templates') return runGas<T>('getEmailTemplates');
  if (method === 'POST' && p === '/emails/templates') return runGas<T>('saveEmailTemplate', body);
  if (method === 'POST' && p === '/emails/test') {
    return runGas<T>('sendTestEmailServer', body.toEmail, body.subject, body.body);
  }
  if (method === 'POST' && p === '/emails/return-reminder') {
    return runGas<T>('sendReturnReminder', body.loanIds, body.returnDeadline);
  }
  if (method === 'POST' && p === '/emails/overdue-notices') {
    return runGas<T>('sendOverdueNotices', body.loanIds, body.returnDeadline);
  }

  // Dashboard / settings
  if (method === 'GET' && p === '/dashboard') return runGas<T>('getDashboardData');
  if (method === 'GET' && p === '/dashboard/regional') return runGas<T>('getRegionalData');
  if (method === 'GET' && p === '/settings') return runGas<T>('getSettings');
  if (method === 'POST' && p === '/settings') return runGas<T>('saveSetting', body.key, body.value);
  if (method === 'GET' && p === '/settings/regions') return runGas<T>('getRegions');

  // Audit
  if (method === 'POST' && p === '/audit/run') {
    return runGas<T>('runAudit', body.kitId, body.scannedBarcodes || []);
  }

  throw new Error(`No GAS mapping for ${method} ${p}`);
}

export async function api<T = any>(path: string, options?: RequestInit): Promise<T> {
  if (isGas()) return apiViaGas<T>(path, options);

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok || data.success === false) throw new Error(data.error || res.statusText);
  return data;
}

export function usingGasBackend(): boolean {
  return isGas();
}
