// Bootstraps the blank Google Sheet directly via the Sheets API.
// Equivalent to running ensureSchema() from within Apps Script.

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const SS_ID = '1YiIh5XNyjlSAB6bRxJmL6ArDtWYS77p0z4xxw9s9GZ4';

const SCHEMA = {
  Kits:          ['kit_id','name','kit_barcode','tipweb_tag','location','loan_status','notes','active'],
  ItemTypes:     ['type_id','name','reorder_threshold','is_consumable','notes'],
  KitItems:      ['barcode','kit_id','type_id','status','last_updated','updated_by','notes'],
  AuditLog:      ['timestamp','barcode','kit_id','action','old_status','new_status','user','notes'],
  Audits:        ['audit_id','kit_id','started','completed','scanned_count','missing_count'],
  Loans:         ['loan_id','kit_id','tipweb_tag','teacher_name','checked_out_at','checked_out_by',
                  'checked_in_at','checked_in_by','return_type','notes','status'],
  CheckoutItems: ['loan_id','barcode','type_id','status_at_checkout','confirmed'],
  CheckinIssues: ['loan_id','barcode','issue_type','notes','reported_at','reported_by'],
  Settings:      ['key','value'],
};

const credsPath = path.join(process.env.USERPROFILE || process.env.HOME, '.clasprc.json');
const creds     = JSON.parse(fs.readFileSync(credsPath, 'utf8')).tokens.default;

function post(hostname, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request({
      hostname, path: urlPath, method: 'POST',
      headers: {
        'Authorization':  'Bearer ' + token,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(urlPath, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'sheets.googleapis.com', path: urlPath, method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject);
    req.end();
  });
}

async function refreshToken() {
  const params = 'client_id='     + encodeURIComponent(creds.client_id) +
                 '&client_secret=' + encodeURIComponent(creds.client_secret) +
                 '&refresh_token=' + encodeURIComponent(creds.refresh_token) +
                 '&grant_type=refresh_token';
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(params),
      },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject);
    req.write(params);
    req.end();
  }).then(r => {
    if (r.access_token) return r.access_token;
    console.error('Refresh response:', JSON.stringify(r));
    return null;
  });
}

async function main() {
  console.log('Refreshing auth token...');
  const token = await refreshToken();
  if (!token) { console.error('Token refresh failed.'); process.exit(1); }
  console.log('Token ready.\n');

  // Get existing sheet tabs
  const ssInfo   = await get(`/v4/spreadsheets/${SS_ID}?fields=sheets.properties`, token);
  const existing = (ssInfo.sheets || []).map(s => s.properties.title);
  console.log('Existing tabs:', existing.length ? existing.join(', ') : '(none)');

  // Create any missing tabs
  const toCreate = Object.keys(SCHEMA).filter(n => !existing.includes(n));
  if (toCreate.length) {
    console.log('Creating tabs:', toCreate.join(', '));
    const addReqs = toCreate.map(name => ({ addSheet: { properties: { title: name } } }));
    const addResp = await post('sheets.googleapis.com', `/v4/spreadsheets/${SS_ID}:batchUpdate`, { requests: addReqs }, token);
    if (addResp.error) { console.error('Error creating tabs:', addResp.error.message); process.exit(1); }
    console.log('Tabs created.');
  } else {
    console.log('All tabs already exist.');
  }

  // Write headers to all tabs (safe to re-run)
  console.log('Writing headers...');
  const headerData = Object.entries(SCHEMA).map(([name, headers]) => ({
    range:  `${name}!A1`,
    values: [headers],
  }));
  const hResp = await post('sheets.googleapis.com', `/v4/spreadsheets/${SS_ID}/values:batchUpdate`,
    { valueInputOption: 'RAW', data: headerData }, token);
  if (hResp.error) { console.error('Error writing headers:', hResp.error.message); process.exit(1); }
  console.log(`Headers written (${hResp.totalUpdatedCells} cells updated).`);

  // Seed Settings defaults
  console.log('Seeding Settings...');
  const sResp = await post('sheets.googleapis.com', `/v4/spreadsheets/${SS_ID}/values:batchUpdate`, {
    valueInputOption: 'RAW',
    data: [{
      range:  'Settings!A2:B5',
      values: [
        ['barcode_prefix', 'ESCA'],
        ['next_seq',       '1'],
        ['schema_version', '1'],
        ['allowlist',      ''],
      ],
    }],
  }, token);
  if (sResp.error) { console.error('Error seeding settings:', sResp.error.message); process.exit(1); }
  console.log(`Settings seeded (${sResp.totalUpdatedCells} cells).`);

  // Bold the header row in each tab
  console.log('Formatting headers...');
  const sheetInfo = await get(`/v4/spreadsheets/${SS_ID}?fields=sheets.properties`, token);
  const sheetIds  = {};
  (sheetInfo.sheets || []).forEach(s => { sheetIds[s.properties.title] = s.properties.sheetId; });

  const fmtReqs = Object.entries(SCHEMA).map(([name, headers]) => ({
    repeatCell: {
      range: {
        sheetId:        sheetIds[name],
        startRowIndex:  0,
        endRowIndex:    1,
        startColumnIndex: 0,
        endColumnIndex: headers.length,
      },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: 'userEnteredFormat.textFormat.bold',
    },
  })).filter(r => sheetIds[r.repeatCell.range.sheetId] !== undefined);

  const validFmtReqs = Object.entries(SCHEMA).reduce((acc, [name, headers]) => {
    if (sheetIds[name] !== undefined) {
      acc.push({
        repeatCell: {
          range: { sheetId: sheetIds[name], startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: 'userEnteredFormat.textFormat.bold',
        },
      });
    }
    return acc;
  }, []);

  const fmtResp = await post('sheets.googleapis.com', `/v4/spreadsheets/${SS_ID}:batchUpdate`,
    { requests: validFmtReqs }, token);
  if (fmtResp.error) console.warn('Formatting warning:', fmtResp.error.message);
  else console.log('Headers bolded.');

  console.log('\n✓ Schema bootstrap complete! Your Google Sheet is ready.');
  console.log('\nAdmin URL:');
  console.log('  https://script.google.com/macros/s/AKfycbwPVRPsFVAzczPOXVQ4zvcta-n5PI2epnzkoJSqC3216M5qhCO14VXb3ucV4A7Q6QXtjw/exec?view=admin');
  console.log('\nCounselor Hub URL:');
  console.log('  https://script.google.com/macros/s/AKfycbwPVRPsFVAzczPOXVQ4zvcta-n5PI2epnzkoJSqC3216M5qhCO14VXb3ucV4A7Q6QXtjw/exec');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
