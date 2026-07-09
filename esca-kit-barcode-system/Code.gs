// ── ROUTING ────────────────────────────────────────────────────────────────
// Entry point for the web app. Routes to Hub (counselors) or Admin (ESCA staff)
// based on the ?view=admin query param.
//
// Counselor bookmark:  https://script.google.com/.../exec
// Admin bookmark:      https://script.google.com/.../exec?view=admin

function doGet(e) {
  const view = (e && e.parameter && e.parameter.view === 'admin') ? 'Admin' : 'Hub';
  return HtmlService.createHtmlOutputFromFile(view)
    .setTitle(view === 'Admin' ? 'ESCA Inventory — Admin' : 'ESCA Kit Hub')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
