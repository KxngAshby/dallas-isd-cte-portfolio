import { google, sheets_v4 } from 'googleapis';
import { SCHEMA, type SheetRow } from './schema.js';

let sheetsClient: sheets_v4.Sheets | null = null;

function spreadsheetId(): string {
  const id = process.env.SPREADSHEET_ID;
  if (!id) {
    throw new Error('SPREADSHEET_ID is not set. Copy .env.example to .env and configure it.');
  }
  return id;
}

/** JWT auth from GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY. */
export function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) {
    throw new Error(
      'Missing Google credentials. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in your environment.',
    );
  }
  const privateKey = key.replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function sheets(): Promise<sheets_v4.Sheets> {
  if (!sheetsClient) {
    const auth = getAuth();
    sheetsClient = google.sheets({ version: 'v4', auth });
  }
  return sheetsClient;
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

async function getHeaders(tab: string): Promise<string[]> {
  const api = await sheets();
  const res = await api.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${tab}!1:1`,
  });
  const row = res.data.values?.[0] || [];
  return row.map((h) => String(h));
}

/** Returns all data rows as objects keyed by header. Each has `_row` (1-based). */
export async function getRows(tab: string): Promise<SheetRow[]> {
  const api = await sheets();
  const res = await api.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: tab,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });
  const values = res.data.values || [];
  if (values.length <= 1) return [];
  const headers = values[0].map((h) => String(h));
  return values.slice(1).map((row, i) => {
    const o: SheetRow = { _row: i + 2 };
    headers.forEach((k, j) => {
      o[k] = row[j] !== undefined && row[j] !== null ? row[j] : '';
    });
    return o;
  });
}

export async function findBy(
  tab: string,
  field: string,
  val: unknown,
): Promise<SheetRow | null> {
  const rows = await getRows(tab);
  return rows.find((r) => String(r[field]) === String(val)) || null;
}

export async function findAllBy(
  tab: string,
  field: string,
  val: unknown,
): Promise<SheetRow[]> {
  const rows = await getRows(tab);
  return rows.filter((r) => String(r[field]) === String(val));
}

export async function appendRow(tab: string, obj: Record<string, unknown>): Promise<void> {
  const headers = await getHeaders(tab);
  const values = headers.map((k) => (obj[k] !== undefined ? cellStr(obj[k]) : ''));
  const api = await sheets();
  await api.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${tab}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
}

export async function updateRow(
  tab: string,
  rowIdx: number,
  obj: Record<string, unknown>,
): Promise<void> {
  const headers = await getHeaders(tab);
  const api = await sheets();
  const data: sheets_v4.Schema$ValueRange[] = [];
  headers.forEach((k, i) => {
    if (obj[k] !== undefined) {
      const col = columnLetter(i + 1);
      data.push({
        range: `${tab}!${col}${rowIdx}`,
        values: [[cellStr(obj[k])]],
      });
    }
  });
  if (!data.length) return;
  await api.spreadsheets.values.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });
}

/** Delete a sheet row by 1-based index. */
export async function deleteRow(tab: string, rowIdx: number): Promise<void> {
  const api = await sheets();
  const meta = await api.spreadsheets.get({ spreadsheetId: spreadsheetId() });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === tab);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    throw new Error(`Sheet tab not found: ${tab}`);
  }
  await api.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIdx - 1,
              endIndex: rowIdx,
            },
          },
        },
      ],
    },
  });
}

export async function getSetting(key: string): Promise<string | null> {
  const r = await findBy('Settings', 'key', key);
  return r ? String(r.value) : null;
}

export async function setSetting(key: string, val: unknown): Promise<void> {
  const r = await findBy('Settings', 'key', key);
  if (r) {
    await updateRow('Settings', r._row, { key, value: String(val) });
  } else {
    await appendRow('Settings', { key, value: String(val) });
  }
}

/** Same as GAS: seq_pfx in Settings → PFX-0001 */
export async function nextId(pfx: string): Promise<string> {
  const key = `seq_${pfx}`;
  const n = parseInt((await getSetting(key)) || '1', 10);
  await setSetting(key, n + 1);
  return `${pfx}-${String(n).padStart(4, '0')}`;
}

/** Item barcode: ESCA-{kitShortId}-{seq} */
export async function nextBarcode(kitShortId: string): Promise<string> {
  const prefix = (await getSetting('barcode_prefix')) || 'ESCA';
  const seq = parseInt((await getSetting('next_seq')) || '1', 10);
  await setSetting('next_seq', seq + 1);
  return `${prefix}-${kitShortId}-${String(seq).padStart(3, '0')}`;
}

export async function logAudit(
  barcode: string,
  kitId: string,
  action: string,
  oldSt: string,
  newSt: string,
  user: string,
  notes: string,
): Promise<void> {
  await appendRow('AuditLog', {
    timestamp: new Date().toISOString(),
    barcode: barcode || '',
    kit_id: kitId || '',
    action,
    old_status: oldSt || '',
    new_status: newSt || '',
    user,
    notes: notes || '',
  });
}

/** Create missing sheets/headers if possible. */
export async function ensureSchema(): Promise<void> {
  const api = await sheets();
  const id = spreadsheetId();
  const meta = await api.spreadsheets.get({ spreadsheetId: id });
  const existingSheets = meta.data.sheets || [];
  const byTitle = new Map(
    existingSheets.map((s) => [s.properties?.title || '', s]),
  );

  const requests: sheets_v4.Schema$Request[] = [];

  for (const [name, headers] of Object.entries(SCHEMA)) {
    const existing = byTitle.get(name);
    if (!existing) {
      requests.push({
        addSheet: {
          properties: { title: name },
        },
      });
    }
  }

  if (requests.length) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests },
    });
  }

  // Refresh sheet list after creates
  const meta2 = await api.spreadsheets.get({ spreadsheetId: id });
  const sheets2 = meta2.data.sheets || [];

  for (const [name, headers] of Object.entries(SCHEMA)) {
    const sheet = sheets2.find((s) => s.properties?.title === name);
    if (!sheet) continue;

    const headerRes = await api.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${name}!1:1`,
    });
    const existingHeaders = (headerRes.data.values?.[0] || []).map((h) => String(h));

    if (existingHeaders.length === 0) {
      await api.spreadsheets.values.update({
        spreadsheetId: id,
        range: `${name}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
      continue;
    }

    const missing = headers.filter((h) => !existingHeaders.includes(h));
    if (missing.length) {
      const startCol = existingHeaders.length + 1;
      await api.spreadsheets.values.update({
        spreadsheetId: id,
        range: `${name}!${columnLetter(startCol)}1`,
        valueInputOption: 'RAW',
        requestBody: { values: [missing] },
      });
    }
  }

  // Seed default settings on first run
  const settingsRows = await getRows('Settings');
  if (settingsRows.length === 0) {
    const defaults: [string, string][] = [
      ['barcode_prefix', 'ESCA'],
      ['next_seq', '1'],
      ['schema_version', '2'],
      ['allowlist', ''],
      ['overdue_threshold_days', '90'],
      ['dept_hours', '8:00 AM – 4:30 PM, Monday–Friday'],
      ['dept_signature', 'CTE Department, Dallas ISD'],
      ['dept_reply_to', ''],
    ];
    for (const [key, value] of defaults) {
      await appendRow('Settings', { key, value });
    }
  }
}

function columnLetter(n: number): string {
  let s = '';
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}
