/**
 * Preview Day 2 time slots.csv → RoomConfig import and station cross-reference.
 * Run: node scripts/preview-room-config-sync.js
 */
const path = require('path');
const {
  resolveCdPdSourcePath,
  readDay2GridRows,
  parseDay2Records,
  uniqueRoomStations,
  readExistingStationNames,
  compareStationLists,
  summarizeRecords,
  formatTimeFrac,
  excelDateKey
} = require('./day2-schedule-shared');

const SYSTEM_PATH = path.join('Data', 'PD System (2).xlsx');

const sourcePath = resolveCdPdSourcePath();
const { day2Rows, sheetName } = readDay2GridRows(sourcePath);
const records = parseDay2Records(day2Rows);
const summary = summarizeRecords(records);
const newRoomStations = uniqueRoomStations(records);
const priorStations = readExistingStationNames(SYSTEM_PATH);
const stationDiff = compareStationLists(
  priorStations.filter((n) => n.startsWith('Room ')),
  newRoomStations
);

console.log('Source:', sourcePath, '(' + sheetName + ' tab)');
console.log('Session slots:', summary.sessionSlots);
console.log('Room stations:', summary.roomStations);
console.log('Campuses:', summary.campuses.join(', '));
console.log('By date:', summary.byDate);

if (stationDiff.added.length) {
  console.log('\nNew room stations (' + stationDiff.added.length + '):');
  stationDiff.added.forEach((n) => console.log('  +', n));
}
if (stationDiff.removed.length) {
  console.log('\nRemoved room stations (' + stationDiff.removed.length + '):');
  stationDiff.removed.forEach((n) => console.log('  -', n));
}
if (!stationDiff.added.length && !stationDiff.removed.length) {
  console.log('\nRoom station names match prior Stations sheet (room rows only).');
}

console.log('\nSample sessions:');
records.slice(0, 5).forEach((rec) => {
  const dateKey = typeof rec.pdDate === 'number' ? excelDateKey(rec.pdDate) : rec.pdDate;
  console.log(
    ' ',
    dateKey,
    formatTimeFrac(rec.startTime) + '-' + formatTimeFrac(rec.endTime),
    rec.stationName + ':',
    rec.sessionName
  );
});
