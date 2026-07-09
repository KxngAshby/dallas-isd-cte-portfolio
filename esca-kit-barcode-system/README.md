# ESCA Kit Barcode System (Reusable System Copy)

> **Sanitized portfolio copy.** This is a clean, reusable copy of a barcode-driven
> inventory and checkout system originally built on Google Apps Script + Google
> Sheets. All organization-specific identifiers (Apps Script ID, Google Sheet ID,
> deployment URLs, internal links) have been replaced with `YOUR_*` placeholders.
> **No real student, staff, or district data is included.**

## What it does

A barcode-driven inventory and checkout system that powers two web apps from a
single Apps Script project:

- **Counselor Hub** (`Hub.html`) — scan a kit case barcode to check kits out/in
  and update individual item status. Mobile-first, scanner-friendly.
- **Admin Panel** (`Admin.html`) — manage kits, item types, career templates,
  campuses, barcode label generation, audits, regional reporting, and settings.

## Tech stack

- **Google Apps Script** — server (`.gs`) + client (`.html` via `HtmlService`)
- **Google Sheets** — schema-driven datastore (see `Data.gs`)
- **clasp** — local development and code push
- **JsBarcode** (CDN) for labels, **Font Awesome** (CDN) for the Admin UI

## Project structure

| File | Purpose |
|------|---------|
| `appsscript.json` | Apps Script manifest |
| `Code.gs` | Web app routing (`doGet`) — Hub vs Admin |
| `Data.gs` | Schema definition, region constants, `ensureSchema()` bootstrap |
| `Services.gs` | Backend logic (kits, item types, templates, campuses, loans, audits, dashboard) |
| `Hub.html` | Counselor Hub UI |
| `Admin.html` | Admin Panel UI |
| `fix-project.js` / `redeploy.js` / `run-setup.js` / `sync-deploy.js` | Node helpers that drive the Apps Script API |
| `DEPLOY.md` | Deployment guide |
| `ESCA-Kit-System-Guide.html` | Printable system overview |
| `hub-checkin-preview.html` | Static UI preview of the check-in flow |

## Setup (make it your own)

1. Create a Google Sheet and an Apps Script project bound to it (or standalone).
2. Copy `.clasp.json.example` to `.clasp.json` and set your own `scriptId`.
3. In `Data.gs`, replace `YOUR_GOOGLE_SHEET_ID` with your Sheet ID.
4. Install clasp: `npm install -g @google/clasp`, then `clasp login` and `clasp push`.
5. Run `ensureSchema()` once to build all Sheet tabs.
6. Deploy as a Web App. Replace `YOUR_DEPLOYMENT_ID` references with your URL.

> The Node helpers read Google OAuth credentials **at runtime** from
> `~/.clasprc.json`. No credentials are stored in this repository.

## Security & data handling

- No secrets, tokens, `.env` files, or credentials are committed.
- No student or staff data; spreadsheet exports (`*.xlsx`, `*.csv`) are git-ignored.
- All organization-specific IDs and URLs are placeholders.
