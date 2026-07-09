/**
 * Export Data/PD Check-In Operator Guide.html to PDF.
 * Usage: node scripts/export-operator-guide-pdf.js
 */
const path = require('path');
const fs = require('fs');

const HTML = path.join(__dirname, '..', 'Data', 'PD Check-In Operator Guide.html');
const PDF = path.join(__dirname, '..', 'Data', 'PD Check-In Operator Guide.pdf');

async function main() {
  if (!fs.existsSync(HTML)) {
    console.error('Missing:', HTML);
    process.exit(1);
  }

  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.error('Run: npx playwright install chromium');
    process.exit(1);
  }

  const fileUrl = 'file:///' + HTML.replace(/\\/g, '/').replace(/ /g, '%20');
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage();
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.pdf({
    path: PDF,
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.38in', right: '0.42in', bottom: '0.38in', left: '0.42in' },
    scale: 0.94
  });
  await browser.close();
  console.log('Wrote:', PDF);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
