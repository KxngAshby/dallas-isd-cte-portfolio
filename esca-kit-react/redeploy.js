// Creates a new version from current project content and updates the web app
// deployment to point at it, so the existing /exec URL serves the latest code.
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const SCRIPT_ID = '1EVKJwB-szNztOwGUzT2VbtOM4gq2a9Jgyo7Sbwii7teJmGy4qXSfmWaL';
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
  const eps = dep.entryPoints || [];
  const wa  = eps.find(e => e.entryPointType === 'WEB_APP');
  return wa && wa.webApp ? wa.webApp.url : null;
}

async function main() {
  const token = await getToken();

  // 1. List current deployments
  const list = await req('GET', 'script.googleapis.com', `/v1/projects/${SCRIPT_ID}/deployments`, null, token);
  if (list.error) { console.error('List error:', JSON.stringify(list.error)); process.exit(1); }
  const deployments = list.deployments || [];

  console.log('Existing deployments:');
  deployments.forEach(d => {
    const v = d.deploymentConfig && d.deploymentConfig.versionNumber;
    console.log(`  - ${d.deploymentId}  v${v || 'HEAD'}  ${webAppUrl(d) || '(no web app)'}`);
  });

  // Pick the web app deployment that is NOT the HEAD (@HEAD has no versionNumber)
  const webApps = deployments.filter(d => webAppUrl(d));
  const versioned = webApps.find(d => d.deploymentConfig && d.deploymentConfig.versionNumber);
  const target = versioned || webApps[0];

  if (!target) {
    console.error('\nNo web app deployment found. Create one first in the Apps Script editor (Deploy > New deployment > Web app).');
    process.exit(1);
  }

  // 2. Create a new version
  const ver = await req('POST', 'script.googleapis.com', `/v1/projects/${SCRIPT_ID}/versions`,
    { description: 'Add system guide FAQ to Admin dashboard; one-sticker workflow' }, token);
  if (ver.error) { console.error('Version error:', JSON.stringify(ver.error)); process.exit(1); }
  console.log(`\nCreated version ${ver.versionNumber}`);

  // 3. Update the target deployment to the new version (keeps same /exec URL)
  const upd = await req('PUT', 'script.googleapis.com', `/v1/projects/${SCRIPT_ID}/deployments/${target.deploymentId}`,
    { deploymentConfig: { scriptId: SCRIPT_ID, versionNumber: ver.versionNumber, manifestFileName: 'appsscript', description: 'Web app — latest' } }, token);
  if (upd.error) { console.error('Update error:', JSON.stringify(upd.error)); process.exit(1); }

  console.log(`Updated deployment ${target.deploymentId} -> v${ver.versionNumber}`);
  console.log('\nLive web app URL:');
  console.log('  ' + (webAppUrl(upd) || webAppUrl(target)));
}

main().catch(e => { console.error(e); process.exit(1); });
