# ESCA Kit Inventory — Deployment Guide

## Files in this project

| File | Role |
|------|------|
| `appsscript.json` | Apps Script manifest (runtime, webapp settings) |
| `Code.gs` | URL routing — Hub vs Admin |
| `Data.gs` | Schema, sheet helpers, ID generation |
| `Services.gs` | Business logic + all server-side API functions |
| `Hub.html` | Counselor Operations Hub (scan, checkout, check-in, item status) |
| `Admin.html` | ESCA Admin tools (dashboard, kits, labels, audit, settings) |

---

## First-time deployment (Option A — Copy/paste into Apps Script editor)

1. Open the spreadsheet:  
   https://docs.google.com/spreadsheets/d/YOUR_GOOGLE_SHEET_ID/edit

2. Click **Extensions → Apps Script**

3. Delete any existing `Code.gs` content, then create/replace files:
   - Paste `Code.gs` → into the default `Code.gs`
   - Create new script file → name it `Data`, paste `Data.gs`
   - Create new script file → name it `Services`, paste `Services.gs`
   - Create new HTML file → name it `Hub`, paste `Hub.html`
   - Create new HTML file → name it `Admin`, paste `Admin.html`

4. Copy `appsscript.json` contents into **Project Settings → Edit appsscript.json manifest**

5. Save all files (Ctrl+S)

6. Run **Bootstrap** (one time only):
   - In the script editor, select `runSetup` from the function dropdown
   - Click Run
   - Grant permissions when prompted
   - Confirm all Sheet tabs were created

7. **Deploy as Web App**:
   - Click Deploy → New Deployment
   - Type: Web app
   - Execute as: **Me** (your account)
   - Who has access: **Anyone within [your district domain]**
   - Click Deploy → copy the web app URL

8. **Two bookmarks**:
   - Counselors: `https://script.google.com/.../exec`  (base URL)
   - ESCA Admin: `https://script.google.com/.../exec?view=admin`

---

## First-time deployment (Option B — clasp CLI)

Prerequisites: Node.js installed, `npm install -g @google/clasp`

```bash
# In this project folder:
clasp login
clasp push
```

Then follow steps 6–8 above in the Apps Script editor.

---

## After deploying — setup checklist

- [ ] Run `runSetup()` to bootstrap all Sheet tabs
- [ ] Open Admin → Settings → add staff/counselor emails to Allowlist
   (leave blank to allow all district Google accounts)
- [ ] Set Barcode Prefix if you want something other than `ESCA`
- [ ] Admin → Item Types → add your kit contents (Hotspot, HDMI Cable, Power Adapter, etc.)
- [ ] Admin → Kits → create your first kit
- [ ] Admin → Labels → select kit, add item types + quantities, Generate → Print
- [ ] Affix labels, scan a few in Hub to confirm the flow works

---

## Day-to-day use

| Who | URL | What they do |
|-----|-----|-------------|
| Counselors | base URL | Scan kit → checkout or check-in |
| ESCA staff | `?view=admin` | Manage kits, generate labels, view dashboard, run audits |

---

## Making changes later

- Add a new Sheet column: update `SCHEMA` in `Data.gs`, re-run `runSetup()` — no data lost
- Add a new item status or issue type: update the constants at the top of `Data.gs` + update button labels in `Hub.html`
- TipWeb integration: fill in `tipweb_tag` field on kits after asset management assigns it
- After any code changes, re-deploy: Apps Script → Deploy → Manage deployments → edit → new version
