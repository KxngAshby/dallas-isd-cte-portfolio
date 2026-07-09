# PD Barcode Check-In System

A fully reusable Google Apps Script web application for managing professional development (PD) attendance using barcode scanning and manual staff ID entry.

> **Note:** This is a sanitized portfolio copy of a production system. All district-specific data, staff records, spreadsheet exports, and credentials have been removed. Survey URLs have been replaced with `[YOUR_..._URL]` placeholders.

---

## What This System Does

- **Kiosk check-in web app** â€” Teachers scan a printed barcode badge (USB scanner) or type their Staff ID on an iPad to check in, go to lunch, and check out.
- **Session room attendance** â€” Room iPads record which PD session a teacher attended (name, time, room).
- **Daily attendance emails** â€” End-of-day emails sent to each teacher with their check-in time, checkout time, and session room visits. Used for district credential tracking.
- **Single-teacher email generator** â€” Re-generate an attendance email for one teacher on a specific date without running the full batch.
- **Summer PD thank-you campaign** â€” Separate Form Mule-ready email sheet for post-PD thank-you / survey emails.
- **Bootstrap Option A** â€” Rebuilds the live schedule (RoomConfig, Stations) from a seed JSON without touching scan records.
- **Badge PDF generation** â€” Generates Avery 74461, SC700, and letter-size printable barcode badge sheets for staff.
- **Staff sync** â€” Syncs staff records from a Teacher Numbers source sheet.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Google Apps Script (V8 runtime) |
| Frontend | Vanilla HTML/CSS/JS (served by Apps Script as a web app) |
| Local tooling | Node.js (schedule sync, badge PDFs, load tests) |
| Deployment | clasp (Command Line Apps Script) |
| Badge PDFs | pdfkit + bwip-js (Code 128 barcodes) |
| Schedule source | Google Sheets / Excel (XLSX) |

---

## Project Structure

```
.
â”œâ”€â”€ *.gs                   # Apps Script backend
â”‚   â”œâ”€â”€ Code.gs            # Web app entry, scan routing, menu
â”‚   â”œâ”€â”€ PdEmailDigest.gs   # Daily + single-teacher email generation
â”‚   â”œâ”€â”€ StatusLogic.gs     # Scan flow engine (IN/LUNCH/OUT)
â”‚   â”œâ”€â”€ Setup.gs           # System init, Settings, station URLs
â”‚   â”œâ”€â”€ SummerPdPlanSync.gs# Bootstrap Option A â€” schedule rebuild
â”‚   â”œâ”€â”€ StaffImport.gs     # Staff sync + barcode validation
â”‚   â”œâ”€â”€ BadgePdf.gs        # Badge PDF via Google Slides
â”‚   â”œâ”€â”€ Utils.gs           # Shared constants and helpers
â”‚   â”œâ”€â”€ ThankYouEmail.gs   # Thank-you / survey email campaign
â”‚   â”œâ”€â”€ JessCleanup.gs     # Sheet formatting utilities
â”‚   â””â”€â”€ Day2Seed.gs        # Auto-generated schedule seed
â”œâ”€â”€ index.html             # Scanner UI markup
â”œâ”€â”€ script.html            # Scanner client logic
â”œâ”€â”€ styles.html            # Scanner UI styles (light/dark)
â”œâ”€â”€ scripts/               # Local Node.js tooling
â”‚   â”œâ”€â”€ apply-option-a.js  # npm run sync:day2
â”‚   â”œâ”€â”€ day2-schedule-shared.js
â”‚   â”œâ”€â”€ badge-shared.js
â”‚   â”œâ”€â”€ generate-badge-pdf*.js
â”‚   â”œâ”€â”€ load-test.js
â”‚   â””â”€â”€ ...
â”œâ”€â”€ appsscript.json        # Apps Script manifest
â”œâ”€â”€ package.json           # npm scripts
â”œâ”€â”€ .claspignore           # clasp push filter
â””â”€â”€ .gitignore
```

---

## Setup (Reuse Guide)

### Prerequisites
- Google account with Google Apps Script access
- Node.js LTS
- clasp: `npm install`

### 1. Create a new Google Sheet
This will be your live database (ScanLog, Staff, RoomConfig, Stations, Settings, etc.).

### 2. Create a new Apps Script project
Bind it to the Sheet, or create standalone and link via the Spreadsheet ID in your code.

### 3. Configure clasp
```bash
npx clasp login
# Create a .clasp.json with your new scriptId:
# { "scriptId": "YOUR_SCRIPT_ID", "rootDir": "." }
```

### 4. Push the code
```bash
npm run clasp:push
```

### 5. Initialize the system
Open the Google Sheet â†’ **PD Scanner â†’ Apply Staff PD Defaults (One Click)**.

### 6. Deploy the web app
In Apps Script: **Deploy â†’ New deployment â†’ Web app**.
- Execute as: Me
- Who has access: (your org or Anyone)

Copy the `/exec` URL â†’ paste into **Settings â†’ Web App URL** in the Sheet.

### 7. Build station URLs
**PD Scanner â†’ Build Station URLs** â€” generates iPad-ready links for each station.

### 8. Update survey URLs
In `ThankYouEmail.gs`, replace the two `[YOUR_..._URL]` placeholders with your own survey links before using the thank-you email campaign.

---

## Key Flows

```
Scan (USB / iPad typed ID)
  â†’ Code.gs (doPost)
  â†’ StatusLogic.gs (IN / LUNCH OUT / LUNCH IN / OUT)
  â†’ ScanLog sheet

End of day:
  ScanLog + RoomConfig â†’ PdEmailDigest.gs â†’ Today's PD Emails sheet â†’ Form Mule

Schedule update:
  Summer PD Plan xlsx â†’ npm run sync:day2 â†’ Day2Seed.gs â†’ clasp push
  â†’ PD Scanner â†’ Bootstrap Option A â†’ RoomConfig + Stations rebuilt
```

---

## What Was Removed for This Portfolio Copy

- All staff/teacher data files (`Data/` folder)
- Badge PDF exports
- Spreadsheet exports (`.xlsx`)
- District-specific survey URLs (replaced with `[YOUR_..._URL]`)
- `Data/Copy of Summer PD Plan.xlsx` and related schedule data
- `.clasp.json` (contains live script ID â€” create your own)
- `node_modules/` and `package-lock.json`
- Logo base64 encoded assets

---

## License

This system was built for Dallas ISD Career and Technical Education (CTE). Shared here as a reusable open-source template. Feel free to adapt it for your organization's professional development tracking needs.

