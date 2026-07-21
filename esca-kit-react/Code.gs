// ── ROUTING ────────────────────────────────────────────────────────────────
// React is the default UI. Classic HTML remains as a fallback only.
//
// Counselor Hub (React):  https://script.google.com/.../exec
// ESCA Admin (React):     https://script.google.com/.../exec?view=admin
// Classic Hub fallback:   .../exec?view=classic
// Classic Admin fallback: .../exec?view=classic-admin
//
// Also accepted: ?view=react and ?view=react-admin (same as Hub / Admin).

function doGet(e) {
  const view = (e && e.parameter && e.parameter.view) || '';

  // Classic fallbacks (old HTML)
  if (view === 'classic') {
    return HtmlService.createHtmlOutputFromFile('Hub')
      .setTitle('ESCA Kit Hub (Classic)')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (view === 'classic-admin') {
    return HtmlService.createHtmlOutputFromFile('Admin')
      .setTitle('ESCA Inventory — Admin (Classic)')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  // React is default. Treat admin / react-admin as Admin; everything else as Hub.
  const isAdmin = view === 'admin' || view === 'react-admin';
  const injected = isAdmin ? 'react-admin' : 'react';
  const raw = HtmlService.createHtmlOutputFromFile('ReactApp').getContent()
    .replace('</head>', '<script>window.__ESCA_VIEW__=' + JSON.stringify(injected) + ';</script></head>');
  return HtmlService.createHtmlOutput(raw)
    .setTitle(isAdmin ? 'ESCA Inventory — Admin' : 'ESCA Kit Hub')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
