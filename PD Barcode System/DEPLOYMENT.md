# PD System Deployment

## Architecture

- Google Sheet `PD System` is the live database.
- Apps Script is the front-facing website and scan API.
- `Teacher Numbers` feeds `Staff`.
- `Staff` validates teacher barcodes.
- `ScanLog` records each scan.
- `Staff Barcodes` generates printable barcode rows.

## Sheet Setup

1. Open the Google Sheet `PD System`.
2. Confirm the `Teacher Numbers` sheet exists.
3. Use `PD Scanner > Apply Staff PD Defaults (One Click)`.
4. Use `PD Scanner > Run System Check`.

## Web App Deployment

1. Open the Apps Script project tied to the Google Sheet.
2. Deploy as a web app.
3. Execute as: `Me`.
4. Who has access: choose the district-safe option approved by IT.
5. After deployment, run `PD Scanner > Build Station URLs`.

## Daily Use

- Open the station URL at each PD check-in point.
- Keep the cursor/page focused.
- Teachers scan their printed barcode.
- Successful scans write to `ScanLog`.
- Unknown barcodes are rejected and are not logged.

## Refreshing Staff

When `Teacher Numbers` changes:

1. Run `PD Scanner > Sync Staff from Teacher Numbers`.
2. Run `PD Scanner > Build Staff Barcodes`.
3. Reprint any changed barcodes.

## Recommended District Checks

- Verify the web app access setting with district IT.
- Keep the admin PIN private.
- Use station-specific URLs for clearer reporting.
- Test with 3-5 real teacher barcodes before district-wide use.
