const fs = require('fs');
const path = require('path');

const logoB64 = fs.readFileSync(path.join('assets', 'logos', '_inline-CTE LOGO WHITE-480.b64.txt'), 'utf8').trim();
const logoDataUri = 'data:image/png;base64,' + logoB64;

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <base target="_top">
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <title>Dallas ISD CTE \u2014 PD Check-In</title>
  <?!= HtmlService.createHtmlOutputFromFile('styles').getContent(); ?>
</head>
<body data-theme="light">

<header id="brandBar">
  <div id="brandLeft">
    <img id="brandLogo" alt="Dallas ISD Career and Technical Education" src="${logoDataUri}" />
    <span id="brandSubtitle">Professional Development Check-In</span>
  </div>
  <div id="brandRight">
    <span id="listeningIndicator" role="status" aria-live="polite">
      <span class="pulse-dot" aria-hidden="true"></span>
      <span class="listening-text">Listening</span>
    </span>
    <span id="stationLabel">Station: --</span>
    <button id="themeToggle" type="button" class="icon-btn" aria-label="Toggle dark mode" title="Toggle dark mode">
      <svg id="themeIcon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4"></circle>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>
      </svg>
    </button>
    <button id="adminButton" type="button" class="ghost-btn" aria-label="Admin">Admin</button>
  </div>
</header>

<main id="container">
  <section id="panel" data-state="idle" aria-live="polite">
    <div id="statusBadge" aria-hidden="true">
      <svg id="statusIcon" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
      </svg>
      <div id="spinner" class="spinner-ring" aria-hidden="true"></div>
    </div>
    <h1 id="message">Ready to Scan</h1>
    <p id="subMessage">Scan a teacher barcode to record attendance</p>
  </section>

  <p id="scanHint">Keep this page open at the check-in station. The scanner sends Enter after each barcode.</p>
</main>

<div id="toastContainer" aria-live="polite" aria-atomic="false"></div>

<input id="scanInput" autofocus autocomplete="off" aria-hidden="true" tabindex="-1" />

<div id="adminModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="adminTitle">
  <div class="modal-card">
    <div id="adminTitle" class="modal-title">Station Override</div>
    <input id="pinInput" type="password" placeholder="Enter admin PIN" autocomplete="one-time-code" />
    <button id="loadStationsButton" type="button" class="btn btn-secondary">Load Stations</button>
    <select id="stationSelect"></select>
    <div id="adminMessage" class="modal-meta"></div>
    <div class="modal-actions">
      <button id="closeAdminButton" type="button" class="btn btn-ghost">Close</button>
      <button id="applyStationButton" type="button" class="btn btn-primary">Apply Station</button>
    </div>
  </div>
</div>

<div id="diagnosticModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="diagnosticTitle">
  <div class="modal-card modal-card-wide">
    <div class="modal-title-row">
      <div id="diagnosticTitle" class="modal-title">Diagnostics</div>
      <span class="modal-hint">Hidden hotkey: Ctrl+Shift+D</span>
    </div>
    <div id="diagnosticStatus" class="modal-meta">No scan attempts yet.</div>
    <pre id="diagnosticDetails"></pre>
    <div class="modal-actions">
      <button id="closeDiagnosticButton" type="button" class="btn btn-ghost">Close</button>
    </div>
  </div>
</div>

<script>
  const STATION = "<?= station ?>";
</script>
<?!= HtmlService.createHtmlOutputFromFile('script').getContent(); ?>

</body>
</html>
`;

const stylesHtml = `<style>
  :root {
    --navy: #0B2340;
    --navy-dark: #07182B;
    --red: #B22234;
    --red-soft: #f4d3d6;
    --gold: #c9a227;
    --green: #16a34a;
    --green-soft: #dcfce7;
    --amber: #d97706;
    --amber-soft: #fef3c7;
    --ink: #0F172A;
    --ink-mute: #475569;
    --ink-soft: #64748B;
    --line: #E2E8F0;
    --bg: #F8FAFC;
    --card: #FFFFFF;
    --pill: #F1F5F9;
    --shadow: 0 14px 32px rgba(11, 35, 64, 0.08);
    --shadow-lg: 0 28px 60px rgba(11, 35, 64, 0.16);
    --radius: 16px;
    --radius-sm: 10px;
    --focus-ring: 0 0 0 3px rgba(11, 35, 64, 0.20);
  }

  body[data-theme="dark"] {
    --navy: #0B2340;
    --navy-dark: #050d1a;
    --ink: #E2E8F0;
    --ink-mute: #94A3B8;
    --ink-soft: #64748B;
    --line: #1F2A3D;
    --bg: #0B1220;
    --card: #111B2D;
    --pill: #18243A;
    --green-soft: #052e1a;
    --red-soft: #3a0c11;
    --amber-soft: #3a2a08;
    --shadow: 0 14px 32px rgba(0, 0, 0, 0.45);
    --shadow-lg: 0 28px 60px rgba(0, 0, 0, 0.6);
    --focus-ring: 0 0 0 3px rgba(186, 209, 245, 0.30);
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    height: 100%;
    background: var(--bg);
    color: var(--ink);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    transition: background-color 240ms ease, color 240ms ease;
  }

  body { display: flex; flex-direction: column; }

  /* ---- Top brand bar ---- */
  #brandBar {
    background: var(--navy);
    color: #fff;
    padding: 14px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    box-shadow: 0 6px 18px rgba(11, 35, 64, 0.18);
  }

  #brandLeft {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  #brandLogo {
    height: 44px;
    width: auto;
    user-select: none;
    pointer-events: none;
    flex: 0 0 auto;
  }

  #brandSubtitle {
    color: rgba(255, 255, 255, 0.72);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    border-left: 1px solid rgba(255, 255, 255, 0.22);
    padding-left: 14px;
    white-space: nowrap;
  }

  #brandRight {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  #listeningIndicator {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.82rem;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    padding: 5px 12px;
  }

  #listeningIndicator[data-state="busy"] .listening-text::after { content: ""; }
  #listeningIndicator[data-state="busy"] .pulse-dot { background: var(--gold); }

  .pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22C55E;
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
    animation: pulse 1.7s ease-out infinite;
  }

  @keyframes pulse {
    0%   { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55); }
    70%  { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
    100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
  }

  #stationLabel {
    color: #fff;
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    padding: 6px 14px;
    font-size: 0.86rem;
    font-weight: 600;
  }

  .icon-btn, .ghost-btn {
    background: transparent;
    color: rgba(255, 255, 255, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
    transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease;
  }
  .icon-btn { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
  .ghost-btn { padding: 6px 12px; font-size: 0.84rem; font-weight: 600; }
  .icon-btn:hover, .ghost-btn:hover, .icon-btn:focus-visible, .ghost-btn:focus-visible {
    background: rgba(255, 255, 255, 0.10);
    color: #fff;
    border-color: rgba(255, 255, 255, 0.42);
    outline: none;
  }

  /* ---- Main ---- */
  #container {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 22px;
    padding: 56px 24px 36px;
  }

  #panel {
    width: min(720px, 100%);
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 48px 36px 42px;
    text-align: center;
    box-shadow: var(--shadow);
    transition: box-shadow 240ms ease, border-color 240ms ease;
  }

  #statusBadge {
    position: relative;
    width: 96px;
    height: 96px;
    border-radius: 999px;
    background: var(--pill);
    color: var(--ink-mute);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
    transition: background-color 200ms ease, color 200ms ease;
  }

  #statusIcon { transition: opacity 160ms ease; }

  /* Spinner shown only during pending */
  .spinner-ring {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: 3px solid rgba(11, 35, 64, 0.12);
    border-top-color: var(--navy);
    animation: spin 0.9s linear infinite;
    display: none;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  body[data-theme="dark"] .spinner-ring { border-color: rgba(255,255,255,0.12); border-top-color: #C7D6F4; }

  #panel[data-state="pending"] #statusIcon { opacity: 0; }
  #panel[data-state="pending"] .spinner-ring { display: block; }

  #panel[data-state="pending"] #statusBadge { background: var(--amber-soft); color: var(--amber); }
  #panel[data-state="success"] #statusBadge { background: var(--green-soft); color: var(--green); }
  #panel[data-state="error"]   #statusBadge { background: var(--red-soft); color: var(--red); }
  #panel[data-state="warning"] #statusBadge { background: var(--amber-soft); color: var(--amber); }

  h1#message {
    margin: 4px 0 6px;
    font-size: clamp(2.4rem, 5.8vw, 3.8rem);
    line-height: 1.04;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  #subMessage {
    margin: 0 auto;
    max-width: 540px;
    font-size: clamp(1rem, 2.2vw, 1.15rem);
    color: var(--ink-mute);
  }

  #panel[data-state="success"] { border-color: rgba(22, 163, 74, 0.45); box-shadow: 0 14px 32px rgba(22, 163, 74, 0.16); }
  #panel[data-state="error"]   { border-color: rgba(178, 34, 52, 0.55); box-shadow: 0 14px 32px rgba(178, 34, 52, 0.16); }
  #panel[data-state="pending"] { border-color: rgba(217, 119, 6, 0.55); }
  #panel[data-state="warning"] { border-color: rgba(217, 119, 6, 0.55); box-shadow: 0 14px 32px rgba(217, 119, 6, 0.18); }

  #scanHint {
    color: var(--ink-soft);
    font-size: 0.92rem;
    text-align: center;
    max-width: 720px;
    margin: 0;
  }

  /* ---- Toasts ---- */
  #toastContainer {
    position: fixed;
    top: 88px;
    right: 24px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 60;
    pointer-events: none;
    width: min(420px, calc(100vw - 32px));
  }

  .toast {
    pointer-events: auto;
    display: flex;
    gap: 14px;
    align-items: flex-start;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--card);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-lg);
    animation: toastIn 240ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .toast.toast-out { animation: toastOut 220ms ease-in both; }

  @keyframes toastIn  { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes toastOut { from { transform: translateX(0); opacity: 1; }  to { transform: translateX(120%); opacity: 0; } }

  .toast-icon {
    flex: 0 0 36px;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .toast-icon svg { width: 20px; height: 20px; }

  .toast-body { min-width: 0; flex: 1; }
  .toast-title {
    font-weight: 800;
    font-size: 0.96rem;
    color: var(--ink);
    line-height: 1.2;
    margin-bottom: 2px;
    word-wrap: break-word;
  }
  .toast-message {
    font-size: 0.86rem;
    color: var(--ink-mute);
    line-height: 1.35;
    word-wrap: break-word;
  }

  .toast.toast-success .toast-icon { background: var(--green-soft); color: var(--green); }
  .toast.toast-warning .toast-icon { background: var(--amber-soft); color: var(--amber); }
  .toast.toast-error   .toast-icon { background: var(--red-soft);   color: var(--red); }

  /* ---- Hidden barcode input ---- */
  #scanInput {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; border: 0;
    opacity: 0; pointer-events: none;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  /* ---- Modals ---- */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(7, 24, 43, 0.55);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    z-index: 70;
    animation: fadeIn 180ms ease both;
  }
  .modal-overlay.hidden { display: none; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .modal-card {
    width: min(440px, 100%);
    background: var(--card);
    border-radius: var(--radius);
    padding: 22px;
    box-shadow: var(--shadow-lg);
    border: 1px solid var(--line);
    color: var(--ink);
  }
  .modal-card-wide { width: min(720px, 100%); }

  .modal-title { font-size: 1.05rem; font-weight: 800; color: var(--navy); }
  body[data-theme="dark"] .modal-title { color: #C7D6F4; }
  .modal-title-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
  .modal-hint { color: var(--ink-soft); font-size: 0.78rem; }

  #pinInput, #stationSelect {
    width: 100%;
    margin: 10px 0 10px;
    padding: 11px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 0.96rem;
    font-family: inherit;
    color: var(--ink);
    background: var(--card);
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }
  #pinInput:focus, #stationSelect:focus {
    outline: none;
    border-color: var(--navy);
    box-shadow: var(--focus-ring);
  }

  .btn {
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 0.92rem;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid transparent;
    font-family: inherit;
    transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease, transform 100ms ease;
  }
  .btn:active { transform: translateY(1px); }
  .btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }

  .btn-primary { background: var(--navy); color: #fff; }
  .btn-primary:hover { background: var(--navy-dark); }
  .btn-secondary { background: var(--pill); color: var(--ink); border-color: var(--line); width: 100%; margin-bottom: 10px; }
  .btn-secondary:hover { background: var(--line); }
  .btn-ghost { background: transparent; color: var(--ink-mute); }
  .btn-ghost:hover { background: var(--pill); color: var(--ink); }

  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
  .modal-meta { min-height: 18px; font-size: 0.86rem; margin: 6px 0 12px; color: var(--ink-soft); }

  #diagnosticDetails {
    margin: 10px 0 0;
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, Menlo, monospace;
    font-size: 0.78rem;
    max-height: 360px;
    overflow: auto;
    color: var(--ink);
  }

  /* ---- Smaller screens ---- */
  @media (max-width: 600px) {
    #brandBar { padding: 12px 16px; gap: 12px; flex-wrap: wrap; }
    #brandLogo { height: 32px; }
    #brandSubtitle { display: none; }
    #stationLabel { font-size: 0.78rem; padding: 5px 11px; }
    #listeningIndicator { font-size: 0.74rem; padding: 4px 10px; }
    #container { padding: 32px 16px; gap: 18px; }
    #panel { padding: 30px 22px; }
    #statusBadge { width: 78px; height: 78px; }
    #statusBadge svg { width: 38px; height: 38px; }
    .spinner-ring { width: 52px; height: 52px; }
    #toastContainer { top: auto; bottom: 16px; right: 16px; left: 16px; width: auto; }
    .toast { animation: toastInBottom 240ms cubic-bezier(0.16, 1, 0.3, 1) both; }
    @keyframes toastInBottom { from { transform: translateY(120%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  }

  @media (prefers-reduced-motion: reduce) {
    .toast, .toast.toast-out { animation: none !important; }
    .pulse-dot { animation: none !important; }
    .spinner-ring { animation: none !important; }
  }
</style>
`;

fs.writeFileSync('index.html', indexHtml);
fs.writeFileSync('styles.html', stylesHtml);
console.log('Wrote index.html (' + indexHtml.length + ' chars) and styles.html (' + stylesHtml.length + ' chars)');
