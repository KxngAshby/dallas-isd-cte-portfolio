/**
 * Concurrent two-laptop simulation.
 *
 * Aims two simulated stations at the deployed web app and times their
 * scans to land at the exact same instant. Repeats N rounds.
 * Pass criteria: every round records BOTH scans without overwriting,
 * and TestScanLog shows two rows per round with distinct stations.
 *
 *   node scripts/concurrent-test.js <webAppUrl> [rounds] [delayBetweenRoundsMs]
 *
 * Example:
 *   node scripts/concurrent-test.js https://script.google.com/.../exec 25 250
 */

const path = require('path');
const xlsx = require('xlsx');

const DEFAULT_IDS_FILE = path.join('Data', 'PD System (2).xlsx');
const DEFAULT_ROUNDS = 25;
const DEFAULT_DELAY = 200;

function buildBody(p) {
  return Object.keys(p).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(p[k])).join('&');
}

function loadIds(file) {
  const wb = xlsx.readFile(file);
  const ws = wb.Sheets['Staff Barcodes'];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const ids = [];
  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i][0] || '').trim();
    if (/^[0-9]+$/.test(id)) ids.push(id);
  }
  return ids;
}

async function postScan(url, payload) {
  const startedAt = Date.now();
  let parsed = null;
  let bodyText = '';
  let error = '';
  let httpStatus = 0;
  try {
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: buildBody(payload)
    });
    httpStatus = res.status;
    bodyText = await res.text();
    try { parsed = JSON.parse(bodyText); } catch { /* not JSON */ }
  } catch (err) {
    error = err.message || String(err);
  }
  return {
    requestId: payload.requestId,
    id: payload.id,
    station: payload.station,
    success: !!(parsed && parsed.success),
    httpStatus: httpStatus,
    error: error,
    message: parsed ? parsed.message : (bodyText.slice(0, 120) || error),
    startedAt: startedAt,
    finishedAt: Date.now(),
    serverProcessingMs: parsed && parsed.data ? parsed.data.serverProcessingMs : ''
  };
}

function makePayload(id, station) {
  return {
    action: 'loadTest',
    id: id,
    station: station,
    requestId: 'cc-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8),
    userAgent: 'concurrent-test/1.0',
    clientSentAt: String(Date.now())
  };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const url = process.argv[2];
  const rounds = Number(process.argv[3]) || DEFAULT_ROUNDS;
  const delay = Number(process.argv[4]) || DEFAULT_DELAY;
  if (!url) {
    console.error('usage: node scripts/concurrent-test.js <url> [rounds] [delayMs]');
    process.exit(1);
  }

  const ids = loadIds(DEFAULT_IDS_FILE);
  console.log(`Target:  ${url}`);
  console.log(`Rounds:  ${rounds}`);
  console.log(`Delay:   ${delay} ms between rounds`);
  console.log(`Stations: Laptop-A vs Laptop-B`);
  console.log(`IDs available: ${ids.length}`);
  console.log('');

  const summary = { rounds: 0, bothSucceeded: 0, oneFailed: 0, bothFailed: 0, errors: [] };

  for (let i = 0; i < rounds; i++) {
    const idA = ids[(i * 2) % ids.length];
    const idB = ids[(i * 2 + 1) % ids.length];
    const payloadA = makePayload(idA, 'Laptop-A');
    const payloadB = makePayload(idB, 'Laptop-B');

    const [resA, resB] = await Promise.all([postScan(url, payloadA), postScan(url, payloadB)]);
    summary.rounds++;

    const both = resA.success && resB.success;
    const neither = !resA.success && !resB.success;

    if (both) summary.bothSucceeded++;
    else if (neither) summary.bothFailed++;
    else summary.oneFailed++;

    const aFlag = resA.success ? 'OK' : 'FAIL';
    const bFlag = resB.success ? 'OK' : 'FAIL';
    const offset = Math.abs(resA.startedAt - resB.startedAt);
    console.log(`round ${String(i + 1).padStart(3)} | A:${aFlag.padEnd(4)} ${idA.padEnd(7)} ${resA.serverProcessingMs}ms | B:${bFlag.padEnd(4)} ${idB.padEnd(7)} ${resB.serverProcessingMs}ms | dispatch offset ${offset}ms`);

    if (!resA.success) summary.errors.push({ round: i + 1, side: 'A', id: idA, message: resA.message, error: resA.error, http: resA.httpStatus });
    if (!resB.success) summary.errors.push({ round: i + 1, side: 'B', id: idB, message: resB.message, error: resB.error, http: resB.httpStatus });

    if (delay > 0 && i < rounds - 1) await sleep(delay);
  }

  console.log('');
  console.log('========================================================');
  console.log('  Concurrent two-laptop test summary');
  console.log('========================================================');
  console.log(`Rounds:           ${summary.rounds}`);
  console.log(`Both succeeded:   ${summary.bothSucceeded}`);
  console.log(`One failed:       ${summary.oneFailed}`);
  console.log(`Both failed:      ${summary.bothFailed}`);
  if (summary.errors.length) {
    console.log('');
    console.log('Failures:');
    for (const e of summary.errors) {
      console.log(`  round ${e.round} side ${e.side} id ${e.id} http=${e.http} error=${e.error || ''} message=${e.message || ''}`);
    }
  }

  const verdict = (summary.bothSucceeded === summary.rounds) ? 'PASS' :
                  (summary.bothSucceeded / summary.rounds >= 0.99) ? 'SOFT PASS' : 'FAIL';
  console.log('');
  console.log(`Verdict: ${verdict}`);
  console.log('Open the spreadsheet TestScanLog tab and confirm 2 rows per round (one per station).');
}

main().catch((e) => { console.error(e.stack || e.message || e); process.exit(1); });
