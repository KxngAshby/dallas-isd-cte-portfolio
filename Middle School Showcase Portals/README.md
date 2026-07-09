# Middle School Showcase Portals

A fully functional event management web application built on **Google Apps Script** (GAS), serving as a reusable, portfolio-ready system for managing school showcase events.

---

## Overview

This system was originally built to manage a district-level Middle School Showcase event. It handles vendor/exhibitor registration, campus attendee registration, admin management, check-in kiosks, and portal logins — all hosted directly on Google Apps Script with Google Sheets as the database.

**This repository contains a sanitized code copy only. No real data, credentials, spreadsheet IDs, or deployment URLs are included.**

---

## What's Included

```
backend/
  Code.gs              — Full Google Apps Script backend (API + data logic)
  Admin.html           — Admin Hub interface (management dashboard)
  Public.html          — Public-facing event site (registration, FAQ, branding)
  CheckIn.html         — iPad vendor check-in kiosk
  appsscript.json      — Apps Script project manifest (scopes, runtime)
  .claspignore         — Clasp push exclusions
  deploy-live.ps1      — Automated live deployment script (PowerShell)
  push-dev.ps1         — Dev push script (PowerShell)
  Deploy to LIVE.cmd   — One-click launcher for deploy-live.ps1
  Push to DEV.cmd      — One-click launcher for push-dev.ps1

update_campus_names.py — Utility to normalize campus names from a district CSV

.gitignore             — Excludes .clasp.json, data files, and build artifacts
```

---

## Key Features

- **Public Site** — Branded splash page with video/image background, registration hub, and FAQ (dynamically managed from Admin Hub)
- **Registration Flows** — Separate exhibitor and campus/attendee registration with per-path gates, confirmation emails, and principal CC notifications
- **Admin Hub** — Full management dashboard with panels for:
  - Exhibitor & Attendee Registrations (approve/waitlist/deny with email notifications)
  - Vendor roster, allergy disclosures, check-in tracking
  - Campus data (CSV upsert, manual add, editable table)
  - Attendee checklist per campus (Field Trip Paperwork, Lunch Confirmation, Transportation, Materials)
  - Portal Uploads with approve/deny workflow
  - Email Communications (auto-send + manual broadcast with audience targeting)
  - FAQ management, Documents library, Executive Dashboard, Reporting
  - Site & Appearance (branding, background video/image, logo)
- **Login Portals** — Vendor Portal (by vendor number) and Campus/Attendee Portal (by org number) with registration fail-safe
- **Vendor Check-In Kiosk** — iPad-optimized UI with on-screen keypad, syncs to vendor roster
- **Dev / Live Environment Split** — `IS_LIVE` flag + PowerShell deploy scripts for safe, non-destructive deployments

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Google Apps Script (V8 runtime) |
| Frontend | Vanilla HTML / CSS / JavaScript |
| Database | Google Sheets |
| File Storage | Google Drive |
| Email | MailApp (GAS) |
| Deployment | clasp (Google Apps Script CLI) |

---

## Setup (Reuse / Adaptation)

1. Create a new Google Apps Script project at [script.google.com](https://script.google.com)
2. Install [clasp](https://github.com/google/clasp): `npm install -g @google/clasp`
3. Run `clasp login` and `clasp clone <your-script-id>`
4. Copy the `backend/` files into your clasp project directory
5. In `Code.gs`, replace the placeholder constants:
   - `YOUR_LIVE_GOOGLE_SHEET_ID` — your Google Sheet ID
   - `YOUR_DEPLOYED_WEB_APP_URL` — your Apps Script web app URL
   - `YOUR_APPS_SCRIPT_SCRIPT_ID` — your script ID
6. Run `clasp push` then deploy as a web app

---

## Sensitive Data Note

All credentials, sheet IDs, script IDs, and deployment URLs have been replaced with `YOUR_*` placeholders. You must supply your own values before deploying.

The following files are intentionally excluded:
- `.clasp.json` (contains script ID — excluded via `.gitignore`)
- Any `.xlsx`, `.csv`, or real data exports
- Email template documents with real staff information
