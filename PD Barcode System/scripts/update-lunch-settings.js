/**
 * Updates lunch rows on Settings in Data/PD System (2).xlsx
 * Run: node scripts/update-lunch-settings.js
 */
const path = require('path');
const xlsx = require('xlsx');

const SYSTEM_PATH = path.join(__dirname, '..', 'Data', 'PD System (2).xlsx');

const LUNCH = {
  'Lunch Out Start': ['12:00 PM', 'Start of lunch window — clock out for lunch (front desk)'],
  'Lunch In': ['12:30 PM', 'End of lunch window — clock back in by this time']
};

const wb = xlsx.readFile(SYSTEM_PATH);
const sheetName = wb.SheetNames.includes('Settings') ? 'Settings' : null;
if (!sheetName) {
  console.error('Settings sheet not found in', SYSTEM_PATH);
  process.exit(1);
}

const sheet = wb.Sheets[sheetName];
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
if (!rows.length) {
  console.error('Settings sheet is empty');
  process.exit(1);
}

let updated = 0;
for (let i = 1; i < rows.length; i++) {
  const name = String(rows[i][0] || '').trim();
  if (!LUNCH[name]) continue;
  rows[i][1] = LUNCH[name][0];
  rows[i][2] = LUNCH[name][1];
  updated++;
}

const out = xlsx.utils.aoa_to_sheet(rows);
wb.Sheets[sheetName] = out;
xlsx.writeFile(wb, SYSTEM_PATH);
console.log('Updated', updated, 'lunch settings in', SYSTEM_PATH);
