// Points ALL web app deployments at the highest existing version,
// so every /exec URL serves the same latest code.
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
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({ raw: d }); } }); });
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

function webAppUrl(dep) {
  const wa = (dep.entryPoints || []).find(e => e.entryPointType === 'WEB_APP');
  return wa && wa.webApp ? wa.webApp.url : null;
}

async function main() {
  const token = await getToken();

  // Highest existing version
  const versions = await req('GET', 'script.googleapis.com', `/v1/projects/${SCRIPT_ID}/versions?pageSize=200`, null, token);
  const maxVer = (versions.versions || []).reduce((m, v) => Math.max(m, v.versionNumber || 0), 0);
  if (!maxVer) { console.error('No versions found.'); process.exit(1); }
  console.log('Latest version is v' + maxVer);

  const list = await req('GET', 'script.googleapis.com', `/v1/projects/${SCRIPT_ID}/deployments`, null, token);
  const deployments = (list.deployments || []).filter(d => webAppUrl(d));

  for (const d of deployments) {
    const cfg = d.deploymentConfig || {};
    if (!cfg.versionNumber) { console.log('Skipping HEAD/test deployment ' + d.deploymentId); continue; }
    if (cfg.versionNumber === maxVer) { console.log('Already current: ' + d.deploymentId + ' (v' + maxVer + ')'); continue; }
    const upd = await req('PUT', 'script.googleapis.com', `/v1/projects/${SCRIPT_ID}/deployments/${d.deploymentId}`,
      { deploymentConfig: { scriptId: SCRIPT_ID, versionNumber: maxVer, manifestFileName: 'appsscript', description: 'Web app — synced to latest' } }, token);
    if (upd.error) console.error('  Failed ' + d.deploymentId + ': ' + JSON.stringify(upd.error));
    else console.log('Updated ' + d.deploymentId + ' -> v' + maxVer + '  ' + webAppUrl(upd));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
