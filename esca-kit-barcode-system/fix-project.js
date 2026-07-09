// Removes setup.gs from remote project and re-pushes clean file list via Apps Script API
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const SCRIPT_ID = 'YOUR_APPS_SCRIPT_ID';
const creds     = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.clasprc.json'), 'utf8')).tokens.default;

function req(method, hostname, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = https.request({
      hostname, path: urlPath, method,
      headers: {
        Authorization:  'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

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

const FILES = [
  { name: 'appsscript', type: 'JSON',      file: 'appsscript.json' },
  { name: 'Code',       type: 'SERVER_JS', file: 'Code.gs' },
  { name: 'Data',       type: 'SERVER_JS', file: 'Data.gs' },
  { name: 'Services',   type: 'SERVER_JS', file: 'Services.gs' },
  { name: 'Hub',        type: 'HTML',      file: 'Hub.html' },
  { name: 'Admin',      type: 'HTML',      file: 'Admin.html' },
];

async function main() {
  const token = await getToken();
  console.log('Token ready. Updating project content (removing setup.gs)...');

  const files = FILES.map(f => ({
    name:   f.name,
    type:   f.type,
    source: fs.readFileSync(path.join(__dirname, f.file), 'utf8'),
  }));

  const resp = await req('PUT', 'script.googleapis.com',
    `/v1/projects/${SCRIPT_ID}/content`, { files }, token);

  if (resp.error) { console.error('Error:', JSON.stringify(resp.error)); process.exit(1); }
  console.log('Project updated. Files:', (resp.files || []).map(f => f.name).join(', '));
}

main().catch(e => { console.error(e); process.exit(1); });
