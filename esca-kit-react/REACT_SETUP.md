# ESCA React Rebuild — Setup Checklist

Original GAS apps stay at `?view=` (Hub) and `?view=admin`.  
React apps: `?view=react` and `?view=react-admin` after `clasp push` with `ReactApp.html`.

## 1. Google Service Account (required for Sheets)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create or select a project.
2. Enable **Google Sheets API**.
3. **IAM & Admin → Service Accounts → Create**.
4. Create a JSON key for that account. Download it.
5. Open the ESCA spreadsheet and **Share** it with the service account email as **Editor**.
6. Copy into `server/.env` (and later Railway variables):

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=...@....iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SPREADSHEET_ID=1YiIh5XNyjlSAB6bRxJmL6ArDtWYS77p0z4xxw9s9GZ4
```

## 2. Local development

```bash
# Terminal 1 — API
cd server
cp .env.example .env   # fill credentials
npm run dev

# Terminal 2 — React
cd client
npm run dev
```

- Hub: http://localhost:5173/
- Admin: http://localhost:5173/admin
- API health: http://localhost:3001/health

## 3. Railway (API hosting)

1. Create a project at [railway.app](https://railway.app) and connect `iashby-beep/esca-kit-react`.
2. Set **Root Directory** to `server`.
3. Add the same env vars as `.env` (plus optional SMTP_* for email).
4. Deploy. Copy the public URL (e.g. `https://esca-api.up.railway.app`).

## 4. Point React at Railway

In `client/.env.production` (or before `build:gas`):

```
VITE_API_URL=https://YOUR-RAILWAY-URL/api/v1
```

Then:

```bash
cd client
npm run build:gas
cd ..
clasp push --force
```

Redeploy the GAS web app if needed. Open:

- Hub (React): `.../exec?view=react`
- Admin (React): `.../exec?view=react-admin`

## 5. SMTP (optional)

Without SMTP, checkout/check-in emails are logged and skipped. Set `SMTP_*` on Railway when ready.
