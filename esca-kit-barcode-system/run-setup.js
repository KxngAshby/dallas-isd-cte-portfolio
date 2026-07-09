// Calls ensureSchema() directly via the Apps Script Execution API
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const SCRIPT_ID = 'YOUR_APPS_SCRIPT_ID';
const creds     = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.clasprc.json'), 'utf8')).tokens.default;

async function getToken() {
  const p = 'client_id=' + encodeURIComponent(creds.client_id) +
    '&client_secret=' + encodeURIComponent(creds.client_secret) +
    '&refresh_token=' + encodeURIComponent(creds.refresh_token) +
    '&grant_type=refresh_token';
  return new Promise((resolve, reject) => {
    const r = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(p) },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d).access_token)); });
    r.on('error', reject); r.write(p); r.end();
  });
}

async function runFunction(token, fnName) {
  const body = JSON.stringify({ function: fnName, devMode: true });
  return new Promise((resolve, reject) => {
    const r = https.request({
      hostname: 'script.googleapis.com',
      path: `/v1/scripts/${SCRIPT_ID}:run`,
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    r.on('error', reject); r.write(body); r.end();
  });
}

async function main() {
  console.log('Getting token...');
  const token = await getToken();
  console.log('Running ensureSchema() on the live spreadsheet...');
  const result = await runFunction(token, 'ensureSchema');
  if (result.error) {
    console.error('Error:', JSON.stringify(result.error, null, 2));
    process.exit(1);
  }
  console.log('Done! Schema bootstrapped successfully.');
  console.log('Response:', JSON.stringify(result.response || result, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
