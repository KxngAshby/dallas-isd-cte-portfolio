/**
 * PD System load tester.
 *
 *   node scripts/load-test.js <webAppUrl> <pattern> [options]
 *
 * Patterns:
 *   burst N
 *     Fire N requests in parallel as fast as Node and the network allow.
 *     Worst-case "everyone walked in at 8:01" stress.
 *
 *   sustained RPS DURATION_SEC
 *     Send RPS requests every second for DURATION_SEC seconds.
 *     Example: sustained 10 60  -> 600 requests at 10/sec for 1 minute.
 *
 *   realistic [TOTAL] [DURATION_MIN]
 *     Default 1000 scans over 30 minutes with a realistic check-in curve:
 *     50% in the first 5 minutes, 35% in the next 10, 15% in the last 15.
 *
 * Required: <webAppUrl> is the Apps Script /exec URL.
 *
 * Options (env vars):
 *   IDS_FILE       Path to xlsx file with Staff Barcodes (default Data/PD System (2).xlsx)
 *   STATIONS       Comma-separated station names (default LoadTest-1,LoadTest-2)
 *   CSV_OUT        Optional path to dump per-request CSV log
 *   CONCURRENCY    Cap parallel in-flight requests (default 64)
 *   TIMEOUT_MS     Per-request timeout (default 60000)
 *   SKIP_STAFF     "true" to tell server to skip staff-lookup cost
 *
 * The script POSTs action=loadTest so scans land in TestScanLog, never ScanLog.
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const DEFAULT_IDS_FILE = path.join('Data', 'PD System (2).xlsx');
const DEFAULT_STATIONS = ['LoadTest-1', 'LoadTest-2'];
const DEFAULT_CONCURRENCY = 64;
const DEFAULT_TIMEOUT_MS = 60000;

function parseArgs(argv) {
  const positional = argv.slice(2);
  if (positional.length < 2) usage('Missing arguments.');
  const url = positional[0];
  const pattern = positional[1].toLowerCase();
  const rest = positional.slice(2).map(Number);
  return { url, pattern, args: rest };
}

function usage(msg) {
  console.error(msg);
  console.error('');
  console.error('Usage:');
  console.error('  node scripts/load-test.js <url> burst <N>');
  console.error('  node scripts/load-test.js <url> sustained <rps> <durationSec>');
  console.error('  node scripts/load-test.js <url> realistic [total] [durationMin]');
  process.exit(1);
}

function loadIds(file) {
  const wb = xlsx.readFile(file);
  const ws = wb.Sheets['Staff Barcodes'];
  if (!ws) throw new Error('Staff Barcodes sheet missing in ' + file);
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const ids = [];
  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i][0] || '').trim();
    if (/^[0-9]+$/.test(id)) ids.push(id);
  }
  if (ids.length === 0) throw new Error('No numeric staff IDs found in Staff Barcodes');
  return ids;
}

function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildBody(params) {
  return Object.keys(params)
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&');
}

async function postScan(url, payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  let status = 0;
  let bodyText = '';
  let error = '';
  let parsed = null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: buildBody(payload),
      signal: controller.signal
    });
    status = res.status;
    bodyText = await res.text();
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parsed = null;
    }
  } catch (err) {
    error = err.name === 'AbortError' ? 'timeout' : (err.message || String(err));
  } finally {
    clearTimeout(timer);
  }

  const finishedAt = Date.now();
  return {
    requestId: payload.requestId,
    id: payload.id,
    station: payload.station,
    httpStatus: status,
    error: error,
    success: !!(parsed && parsed.success),
    message: parsed ? parsed.message : (bodyText.slice(0, 120) || error),
    serverProcessingMs: parsed && parsed.data ? parsed.data.serverProcessingMs : '',
    startedAt: startedAt,
    finishedAt: finishedAt,
    e2eLatencyMs: finishedAt - startedAt,
    isJson: !!parsed
  };
}

class Limiter {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.active = 0;
    this.queue = [];
  }

  run(fn) {
    return new Promise((resolve, reject) => {
      const exec = () => {
        this.active++;
        Promise.resolve()
          .then(fn)
          .then((v) => { this.active--; resolve(v); this.next(); })
          .catch((e) => { this.active--; reject(e); this.next(); });
      };
      if (this.active < this.concurrency) exec(); else this.queue.push(exec);
    });
  }

  next() {
    if (this.queue.length && this.active < this.concurrency) {
      const fn = this.queue.shift();
      fn();
    }
  }
}

async function executeBurst(url, ids, count, opts) {
  console.log(`Pattern: burst N=${count}`);
  const limiter = new Limiter(opts.concurrency);
  const results = [];
  const promises = [];
  const startedAt = Date.now();

  for (let i = 0; i < count; i++) {
    const id = ids[i % ids.length];
    const station = opts.stations[i % opts.stations.length];
    const payload = makePayload(id, station, opts);
    promises.push(limiter.run(() => postScan(url, payload, opts.timeoutMs)).then((r) => results.push(r)));
  }

  await Promise.all(promises);
  return { results, startedAt, finishedAt: Date.now() };
}

async function executeSustained(url, ids, rps, durationSec, opts) {
  console.log(`Pattern: sustained ${rps} req/sec for ${durationSec}s (~${rps * durationSec} requests)`);
  const limiter = new Limiter(opts.concurrency);
  const results = [];
  const promises = [];
  const startedAt = Date.now();
  const intervalMs = 1000 / rps;
  const totalRequests = rps * durationSec;
  let issued = 0;

  let t0 = Date.now();
  for (let i = 0; i < totalRequests; i++) {
    const targetTime = startedAt + Math.round(i * intervalMs);
    const wait = targetTime - Date.now();
    if (wait > 0) await sleep(wait);
    const id = ids[i % ids.length];
    const station = opts.stations[i % opts.stations.length];
    const payload = makePayload(id, station, opts);
    promises.push(limiter.run(() => postScan(url, payload, opts.timeoutMs)).then((r) => results.push(r)));
    issued++;
    if (Date.now() - t0 > 5000) {
      t0 = Date.now();
      console.log(`  issued ${issued}/${totalRequests}, in-flight=${limiter.active}, completed=${results.length}`);
    }
  }

  await Promise.all(promises);
  return { results, startedAt, finishedAt: Date.now() };
}

async function executeRealistic(url, ids, total, durationMin, opts) {
  console.log(`Pattern: realistic ${total} requests over ${durationMin}min`);
  const totalMs = durationMin * 60 * 1000;
  const splits = [
    { fraction: 0.50, windowMs: Math.min(totalMs, 5 * 60 * 1000) },
    { fraction: 0.35, windowMs: Math.min(totalMs - 5 * 60 * 1000, 10 * 60 * 1000) },
    { fraction: 0.15, windowMs: Math.max(0, totalMs - 15 * 60 * 1000) }
  ].filter((s) => s.windowMs > 0);

  const startedAt = Date.now();
  const limiter = new Limiter(opts.concurrency);
  const promises = [];
  const results = [];
  let cursor = startedAt;
  let issued = 0;

  for (const split of splits) {
    const splitCount = Math.round(total * split.fraction);
    const interval = splitCount > 0 ? split.windowMs / splitCount : 0;
    for (let i = 0; i < splitCount; i++) {
      const target = cursor + Math.round(i * interval);
      const wait = target - Date.now();
      if (wait > 0) await sleep(wait);
      const id = ids[(issued) % ids.length];
      const station = opts.stations[issued % opts.stations.length];
      const payload = makePayload(id, station, opts);
      promises.push(limiter.run(() => postScan(url, payload, opts.timeoutMs)).then((r) => results.push(r)));
      issued++;
    }
    cursor += split.windowMs;
  }

  await Promise.all(promises);
  return { results, startedAt, finishedAt: Date.now() };
}

function makePayload(id, station, opts) {
  return {
    action: 'loadTest',
    id: id,
    station: station,
    requestId: 'lt-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8),
    userAgent: 'load-test/1.0',
    clientSentAt: String(Date.now()),
    skipStaff: opts.skipStaff ? 'true' : 'false'
  };
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function summarize(results, startedAt, finishedAt, opts) {
  const total = results.length;
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const httpErrors = failed.filter((r) => r.httpStatus !== 200 || r.error || !r.isJson);
  const apiErrors = failed.filter((r) => r.isJson && r.httpStatus === 200 && !r.success);

  const successLatencies = successful.map((r) => r.e2eLatencyMs).sort((a, b) => a - b);
  const serverLatencies = successful
    .map((r) => Number(r.serverProcessingMs))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  const wallSec = (finishedAt - startedAt) / 1000;
  const throughput = total > 0 ? total / wallSec : 0;
  const successRate = total > 0 ? (successful.length / total) * 100 : 0;

  function p(arr, q) {
    if (!arr.length) return 0;
    const idx = Math.min(arr.length - 1, Math.floor(arr.length * q));
    return arr[idx];
  }

  const errorBuckets = {};
  for (const r of failed) {
    const key = r.error ? 'transport:' + r.error : (r.isJson ? 'api:' + (r.message || 'unknown') : 'http:' + r.httpStatus);
    errorBuckets[key] = (errorBuckets[key] || 0) + 1;
  }

  const stationCounts = {};
  for (const r of results) {
    stationCounts[r.station] = (stationCounts[r.station] || 0) + 1;
  }

  console.log('');
  console.log('========================================================');
  console.log('  Load Test Summary');
  console.log('========================================================');
  console.log(`Total requests:       ${total}`);
  console.log(`Wall clock:           ${wallSec.toFixed(1)} s`);
  console.log(`Throughput observed:  ${throughput.toFixed(2)} req/s`);
  console.log(`Successful:           ${successful.length}  (${successRate.toFixed(2)}%)`);
  console.log(`Failed:               ${failed.length}`);
  console.log(`  api errors:         ${apiErrors.length}`);
  console.log(`  transport/HTTP:     ${httpErrors.length}`);
  console.log('');
  console.log('End-to-end latency on successful scans (ms):');
  console.log(`  p50: ${p(successLatencies, 0.5)}`);
  console.log(`  p95: ${p(successLatencies, 0.95)}`);
  console.log(`  p99: ${p(successLatencies, 0.99)}`);
  console.log(`  max: ${successLatencies.length ? successLatencies[successLatencies.length - 1] : 0}`);
  console.log('');
  console.log('Server-only processing latency (ms):');
  console.log(`  p50: ${p(serverLatencies, 0.5)}`);
  console.log(`  p95: ${p(serverLatencies, 0.95)}`);
  console.log(`  p99: ${p(serverLatencies, 0.99)}`);
  console.log(`  max: ${serverLatencies.length ? serverLatencies[serverLatencies.length - 1] : 0}`);
  console.log('');
  console.log('Scans per simulated station:');
  for (const k of Object.keys(stationCounts).sort()) {
    console.log(`  ${k.padEnd(20)} ${stationCounts[k]}`);
  }

  if (Object.keys(errorBuckets).length) {
    console.log('');
    console.log('Error breakdown:');
    Object.keys(errorBuckets).sort((a, b) => errorBuckets[b] - errorBuckets[a]).forEach((k) => {
      console.log(`  ${errorBuckets[k]} x ${k}`);
    });
  }

  console.log('');
  const hardPass = successRate === 100 && p(successLatencies, 0.95) < 5000;
  const softPass = successRate >= 99 && p(successLatencies, 0.95) < 10000;
  console.log(`Verdict: ${hardPass ? 'PASS (production-grade)' : softPass ? 'SOFT PASS (acceptable, watch p95)' : 'FAIL'}`);
  console.log('========================================================');

  if (opts.csvOut) {
    const header = 'requestId,id,station,httpStatus,success,e2eLatencyMs,serverProcessingMs,error,message,startedAt,finishedAt';
    const lines = [header];
    for (const r of results) {
      lines.push([
        r.requestId, r.id, r.station, r.httpStatus,
        r.success ? '1' : '0', r.e2eLatencyMs, r.serverProcessingMs,
        csvField(r.error), csvField(r.message),
        new Date(r.startedAt).toISOString(),
        new Date(r.finishedAt).toISOString()
      ].join(','));
    }
    fs.writeFileSync(opts.csvOut, lines.join('\n'));
    console.log(`CSV log written: ${opts.csvOut}`);
  }
}

function csvField(s) {
  const v = String(s == null ? '' : s).replace(/"/g, '""');
  return /[",\n]/.test(v) ? '"' + v + '"' : v;
}

async function main() {
  const { url, pattern, args } = parseArgs(process.argv);
  const opts = {
    stations: (process.env.STATIONS || DEFAULT_STATIONS.join(',')).split(',').map((s) => s.trim()).filter(Boolean),
    csvOut: process.env.CSV_OUT || '',
    concurrency: Number(process.env.CONCURRENCY) || DEFAULT_CONCURRENCY,
    timeoutMs: Number(process.env.TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    skipStaff: String(process.env.SKIP_STAFF || '').toLowerCase() === 'true',
    idsFile: process.env.IDS_FILE || DEFAULT_IDS_FILE
  };

  console.log('Target URL:    ' + url);
  console.log('IDs file:      ' + opts.idsFile);
  const ids = shuffle(loadIds(opts.idsFile));
  console.log('Numeric IDs:   ' + ids.length);
  console.log('Stations:      ' + opts.stations.join(', '));
  console.log('Concurrency:   ' + opts.concurrency);
  console.log('Timeout (ms):  ' + opts.timeoutMs);
  console.log('skipStaff:     ' + opts.skipStaff);
  console.log('');

  let outcome;
  if (pattern === 'burst') {
    const n = args[0] || 50;
    outcome = await executeBurst(url, ids, n, opts);
  } else if (pattern === 'sustained') {
    const rps = args[0] || 10;
    const durationSec = args[1] || 60;
    outcome = await executeSustained(url, ids, rps, durationSec, opts);
  } else if (pattern === 'realistic') {
    const total = args[0] || 1000;
    const durationMin = args[1] || 30;
    outcome = await executeRealistic(url, ids, total, durationMin, opts);
  } else {
    usage('Unknown pattern: ' + pattern);
    return;
  }

  summarize(outcome.results, outcome.startedAt, outcome.finishedAt, opts);
}

main().catch((e) => { console.error(e.stack || e.message || e); process.exit(1); });
