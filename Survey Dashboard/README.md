# CTE Program Survey — Cross-Reference Dashboard
**Portfolio / reusable system copy. All real survey data, credentials, and district-specific identifiers have been removed.**

---

## What this system does

An interactive web dashboard that cross-references CTE (Career & Technical Education) annual teacher survey data across two academic years, identifying:

- Recurring teacher needs (flagged for priority action)
- Priority scoring (P1 Critical → P5 No Response)
- Campus and region heat maps
- Drill-down modals per campus
- Manual issue-resolution tracking (backed by Google Sheets)
- One-click Excel export (multi-sheet workbook)

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Data processing | Python, openpyxl |
| Dashboard UI | Vanilla JS, Tailwind CSS (CDN) |
| Hosting | Google Apps Script (free, shareable link) |
| Persistence | Google Sheets via Apps Script server functions |
| Excel export | SheetJS (CDN) |
| Deployment | clasp CLI |

---

## Project structure

```
process_surveys.py          # Core data pipeline → outputs survey_data.json / survey_data.js
bundle.py                   # Bundles survey_data.js into dashboard.html → standalone HTML
update_dashboard.py         # One-command rebuild + redeploy (clasp push + deploy)
dashboard.html              # Single-page interactive dashboard (source)
deploy_appsscript.py        # One-shot Apps Script project creation via REST API
prepare_appsscript.py       # Copies bundled HTML into appsscript/ for clasp
generate_pdf.py             # Optional: Playwright-based PDF export
deploy.py                   # Netlify deploy helper (alternative hosting)

appsscript/
  Code.js                   # Apps Script server: doGet(), markResolved(), getResolutions()
  appsscript.json           # Manifest (scopes, webapp config)
```

---

## Input files required (not included — add your own)

Place these in the project root before running `process_surveys.py`:

| File | Description |
|------|-------------|
| `[your 2024-25 survey].xlsx` | First-year survey Excel export |
| `[your 2025-26 survey].xlsx` | Second-year survey Excel export |
| `Campus Information [year].csv` | Campus-to-region mapping CSV |

Update the file path constants at the top of `process_surveys.py` to match your filenames.

---

## Priority scale

| Level | Label | Meaning |
|-------|-------|---------|
| P1 | Critical | 2+ needs repeated across both years |
| P2 | High | Exactly 1 need repeated across both years |
| P3 | Medium | New active needs this year, no recurrence |
| P4 | Resolved | Had needs in prior year, nothing active now |
| P5 | No Response | Responded previously but did not re-submit |

---

## First-time setup

```bash
pip install openpyxl
npm install -g @google/clasp
clasp login
python update_dashboard.py
```

---

## Security notes

The `.gitignore` excludes all `.xlsx`, `.csv`, processed data files, tokens, and deployment artifacts. Only source code is committed. Never force-commit data files.

---

*Original system built for Dallas ISD CTE Department. Sanitized for portfolio use.*
