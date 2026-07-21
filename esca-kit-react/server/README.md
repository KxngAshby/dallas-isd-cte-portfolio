# ESCA Kit Tracker API

Express + TypeScript server that mirrors the Google Apps Script kit-tracker logic, backed by the same Google Spreadsheet.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Google service account**

   - In [Google Cloud Console](https://console.cloud.google.com/), create a project (or use an existing one).
   - Enable the **Google Sheets API**.
   - Create a **Service Account**, download a JSON key.
   - Share the spreadsheet with the service account email (`client_email`) as Editor.
   - Copy `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `private_key` → `GOOGLE_PRIVATE_KEY` (keep `\n` escapes; the server expands them).

3. **Environment**

   ```bash
   cp .env.example .env
   ```

   Fill in:

   | Variable | Notes |
   |---|---|
   | `SPREADSHEET_ID` | Default points at the existing ESCA sheet |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email |
   | `GOOGLE_PRIVATE_KEY` | Private key from JSON (quoted; `\n` OK) |
   | `SMTP_*` | Optional; without SMTP, emails log and no-op |
   | `CORS_ORIGIN` | `*` or comma-separated origins |
   | `PORT` | Default `3001` |

4. **Run**

   ```bash
   npm run dev    # watch mode
   npm start      # one-shot
   npm run build  # compile to dist/
   ```

## Railway / production env vars

Set the same keys as `.env.example` in the Railway service variables:

- `PORT` (Railway usually injects this)
- `SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY` (paste the full key; Railway handles multiline / `\n`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (if sending mail)
- `CORS_ORIGIN` (your React app URL)

Start command: `npm start` (or `npm run build && node dist/index.js` if you prefer compiled output).

## API overview

Base path: `/api/v1`

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Scan | `POST /scan` |
| Loans | `POST /loans/checkout`, `POST /loans/checkin`, `GET /loans/open`, `GET /loans/overdue` |
| Campuses | `GET/POST /campuses`, `POST /campuses/import`, `DELETE /campuses/:id` |
| Counselors | `GET/POST /counselors`, `POST /counselors/import`, `GET /counselors/by-eid/:eid`, `POST /counselors/upsert-hub` |
| Kits | `GET/POST /kits`, `DELETE /kits/:id`, `GET /kits/:id/items`, `POST /kits/:id/barcodes`, templates & types under `/kits/...` |
| Emails | `GET/POST /emails/templates`, `POST /emails/test`, `POST /emails/return-reminder`, `POST /emails/overdue-notices` |
| Dashboard | `GET /dashboard`, `GET /dashboard/regional` |
| Settings | `GET/POST /settings`, `GET /settings/regions` |
| Audit | `POST /audit/run` |

Optional header `X-User-Email` is recorded as the acting user on checkout/check-in/audit (replaces GAS `Session` user).
