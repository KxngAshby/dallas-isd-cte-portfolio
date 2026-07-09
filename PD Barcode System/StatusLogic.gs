const STATUS_FLOW = ['IN', 'LUNCH OUT', 'LUNCH IN', 'OUT'];

/**
 * True when the station is a Day 2 session room (name starts with "Room ").
 */
function isRoomStation_(station) {
  return /^Room\s/i.test(String(station || '').trim());
}

/**
 * Typed Staff ID at a room iPad — always logs IN for attendance only.
 *
 * Front-desk exception: a typed Staff ID at a Main Check In station drives the
 * full check-in / lunch / clock-out flow exactly like a USB scanner, so an iPad
 * can act as a supplemental Main Check In lane alongside the scanners.
 * (Main Check In lunch-id entry is still handled separately as LUNCH IN.)
 */
function isSessionIdEntry_(station, scanSource) {
  if (isLostBadgeLunchInEntry_(station, scanSource)) return false;
  if (isMainCheckInStation_(station)) return false;
  const src = String(scanSource || '').trim().toLowerCase();
  if (src === 'manual' || src === 'id' || src === 'typed') return true;
  return isRoomStation_(station);
}

/**
 * Last IN / LUNCH OUT / LUNCH IN / OUT from a front-desk barcode scan.
 * Skips room rows so a session check-in does not reset the lunch sequence.
 */
function getLastFlowStatus_(id) {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const targetId = String(id).trim();

  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][1] || '').trim() !== targetId) continue;
    const station = String(values[i][3] || '').trim();
    if (isRoomStation_(station)) continue;
    return String(values[i][2] || '').trim() || null;
  }
  return null;
}

/**
 * Resolves the status to record for this scan.
 * @return {{ ok: boolean, status: string, repeat: boolean, message?: string }}
 */
function resolveScanStatus_(lastFlowStatus, station, scanDate, scanSource) {
  const stationName = String(station || '').trim();
  const now = scanDate || new Date();

  if (isLostBadgeLunchInEntry_(stationName, scanSource)) {
    if (lastFlowStatus !== 'LUNCH OUT') {
      return {
        ok: false,
        status: lastFlowStatus || '',
        repeat: false,
        message: getLostBadgeLunchInRejectedMessage_(lastFlowStatus)
      };
    }
    if (!isTransitionAllowedAtTime_('LUNCH OUT', 'LUNCH IN', now)) {
      return {
        ok: false,
        status: lastFlowStatus,
        repeat: false,
        message: getTransitionBlockedMessage_('LUNCH OUT', 'LUNCH IN')
      };
    }
    return { ok: true, status: 'LUNCH IN', repeat: false };
  }

  if (isSessionIdEntry_(stationName, scanSource)) {
    return {
      ok: true,
      status: 'IN',
      repeat: true
    };
  }

  if (!lastFlowStatus) {
    return { ok: true, status: 'IN', repeat: false };
  }

  const skipLunch = shouldSkipLunchOnCheckout_(lastFlowStatus, stationName, scanSource, now);
  const next = skipLunch ? 'OUT' : getNextStatusInFlow_(lastFlowStatus);
  if (!skipLunch && !isTransitionAllowedAtTime_(lastFlowStatus, next, now)) {
    return {
      ok: false,
      status: lastFlowStatus,
      repeat: false,
      message: getTransitionBlockedMessage_(lastFlowStatus, next)
    };
  }

  return { ok: true, status: next, repeat: false, skipLunch: skipLunch };
}

/**
 * After the lunch window (Settings: Lunch Out Start through Lunch In), teachers
 * who never scanned lunch out can check out with one badge scan (IN → OUT).
 * Barcode at Main Check In only.
 */
function shouldSkipLunchOnCheckout_(lastFlowStatus, station, scanSource, scanDate) {
  if (String(lastFlowStatus || '').trim() !== 'IN') return false;
  if (isSessionIdEntry_(station, scanSource)) return false;
  if (!isMainCheckInStation_(station)) return false;
  if (isWithinLunchPeriod_(scanDate)) return false;
  return true;
}

/**
 * Determines next status. Pass an already-known lastFlowStatus to avoid an
 * extra ScanLog read; optional station and scanSource for room vs barcode.
 */
function getNextStatus(id, knownLastFlowStatus, station, scanSource) {
  const lastFlowStatus = knownLastFlowStatus !== undefined
    ? knownLastFlowStatus
    : getLastFlowStatus_(id);
  const resolved = resolveScanStatus_(lastFlowStatus, station, new Date(), scanSource);
  return resolved.status;
}

function getNextStatusInFlow_(lastStatus) {
  const index = STATUS_FLOW.indexOf(lastStatus);
  if (index < 0) return 'IN';
  return STATUS_FLOW[(index + 1) % STATUS_FLOW.length];
}

/**
 * Lunch OUT and lunch IN use one shared window from Settings:
 *   Lunch Out Start (default 12:00 PM) through Lunch In (default 12:30 PM).
 * Example: out at 12:00, back at 12:15 — both succeed with no error.
 */
function isTransitionAllowedAtTime_(lastStatus, nextStatus, scanDate) {
  if (lastStatus === 'IN' && nextStatus === 'LUNCH OUT') {
    return isWithinLunchPeriod_(scanDate);
  }
  if (lastStatus === 'LUNCH OUT' && nextStatus === 'LUNCH IN') {
    return isWithinLunchPeriod_(scanDate);
  }
  return true;
}

/**
 * Reads the simple two-row lunch settings (or legacy four-row names).
 */
function getLunchPeriodBounds_() {
  const startMinutes = parseTimeToMinutes_(getSettingValue_('Lunch Out Start', '12:00 PM'));

  let endRaw = String(getSettingValue_('Lunch In', '') || '').trim();
  if (!endRaw) endRaw = String(getSettingValue_('Lunch In End', '') || '').trim();
  if (!endRaw) endRaw = String(getSettingValue_('Lunch In Start', '') || '').trim();
  if (!endRaw) endRaw = String(getSettingValue_('Lunch Out End', '') || '').trim();
  const endMinutes = parseTimeToMinutes_(endRaw || '12:30 PM');

  return { startMinutes: startMinutes, endMinutes: endMinutes };
}

function getLunchPeriodLabels_() {
  const start = getSettingValue_('Lunch Out Start', '12:00 PM');
  let end = String(getSettingValue_('Lunch In', '') || '').trim();
  if (!end) end = getSettingValue_('Lunch In End', '12:30 PM');
  return { start: start, end: end || '12:30 PM' };
}

function isWithinLunchPeriod_(scanDate) {
  const now = scanDate || new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const bounds = getLunchPeriodBounds_();
  if (bounds.startMinutes === null || bounds.endMinutes === null) return true;
  return currentMinutes >= bounds.startMinutes && currentMinutes <= bounds.endMinutes;
}

function getTransitionBlockedMessage_(lastStatus, nextStatus) {
  const labels = getLunchPeriodLabels_();
  const windowText = formatLunchWindow_(labels.start, labels.end);
  if (lastStatus === 'IN' && nextStatus === 'LUNCH OUT') {
    return 'Lunch out is only available during the lunch window (' + windowText + ').';
  }
  if (lastStatus === 'LUNCH OUT' && nextStatus === 'LUNCH IN') {
    return 'Lunch in is only available during the lunch window (' + windowText + ').';
  }
  return 'That scan is not available at this time.';
}

function getLostBadgeLunchInRejectedMessage_(lastFlowStatus) {
  const status = String(lastFlowStatus || '').trim();
  if (!status || status === 'IN') {
    return 'Staff ID is only for returning from lunch. Scan your badge to check in or go to lunch first.';
  }
  if (status === 'LUNCH IN') {
    return 'You are already checked back from lunch. Scan your badge for your next step.';
  }
  if (status === 'OUT') {
    return 'You have already checked out today. See the front desk if this is wrong.';
  }
  return 'Staff ID entry is only for returning from lunch (after a lunch-out scan).';
}

/**
 * Gets last status for ID
 */
function getLastStatus(id) {
  const sheet = getSheet();
  const row = getLastRowForId(sheet, id);

  if (!row) return null;

  return sheet.getRange(row, 3).getValue(); // Column C
}

/**
 * Prevent rapid duplicate scans
 */
function isDuplicateScan(id) {
  const sheet = getSheet();
  const row = getLastRowForId(sheet, id);

  if (!row) return false;

  const lastTimestamp = new Date(sheet.getRange(row, 1).getValue());
  const now = new Date();

  const diff = (now - lastTimestamp) / 1000;

  return diff < 5;
}

/**
 * Validates sequence order. Room stations may repeat the current status
 * (e.g. multiple IN rows at different rooms) without advancing the flow.
 */
function validateSequence(lastFlowStatus, nextStatus, station, scanSource, scanDate) {
  if (!lastFlowStatus) return nextStatus === 'IN';

  if (isSessionIdEntry_(station, scanSource) && nextStatus === 'IN') {
    return true;
  }

  if (lastFlowStatus === 'IN' && nextStatus === 'OUT' &&
      shouldSkipLunchOnCheckout_(lastFlowStatus, station, scanSource, scanDate || new Date())) {
    return true;
  }

  const lastIndex = STATUS_FLOW.indexOf(lastFlowStatus);
  const nextIndex = STATUS_FLOW.indexOf(nextStatus);

  return nextIndex === (lastIndex + 1) % STATUS_FLOW.length;
}

/**
 * Returns soft-warning metadata for scans outside expected windows.
 */
function getScanTimingMetadata(status, scanDate, station, scanSource, lastFlowStatus) {
  if (isSessionIdEntry_(station, scanSource)) {
    return {
      severity: 'ok',
      message: 'Session room visit recorded.'
    };
  }

  if (status === 'OUT' &&
      shouldSkipLunchOnCheckout_(lastFlowStatus, station, scanSource, scanDate)) {
    return {
      severity: 'ok',
      skipLunch: true,
      message: 'Checked out without lunch scans (stayed for lunch).'
    };
  }

  if (isLostBadgeLunchInEntry_(station, scanSource) && status === 'LUNCH IN') {
    const lunchMeta = getLunchTimingMetadata(status, scanDate);
    if (!lunchMeta) {
      return {
        severity: 'ok',
        message: 'Lunch in recorded via Staff ID (lost badge).'
      };
    }
    return {
      severity: lunchMeta.severity,
      message: lunchMeta.message + ' Staff ID entry (lost badge).'
    };
  }

  if (status === 'IN') {
    return getCheckInTimingMetadata_(scanDate);
  }

  return getLunchTimingMetadata(status, scanDate);
}

/**
 * Returns soft-warning metadata for check-ins after the cutoff.
 */
function getCheckInTimingMetadata_(scanDate) {
  const now = scanDate || new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startValue = getSettingValue_('Check-In Start', '8:00 AM');
  const cutoffValue = getSettingValue_('Check-In Cutoff', '9:00 AM');
  const startMinutes = parseTimeToMinutes_(startValue);
  const cutoffMinutes = parseTimeToMinutes_(cutoffValue);

  if (startMinutes === null || cutoffMinutes === null) {
    return {
      severity: 'warning',
      message: 'Check-in recorded, but the check-in window settings need attention.'
    };
  }

  if (currentMinutes <= cutoffMinutes) {
    return {
      severity: 'ok',
      message: 'Check-in recorded by the ' + String(cutoffValue).trim() + ' cutoff.'
    };
  }

  return {
    severity: 'warning',
    message: 'Check-in recorded after the ' + formatCheckInWindow_(startValue, cutoffValue) + ' check-in window.'
  };
}

/**
 * Returns soft-warning metadata for lunch scans outside expected windows.
 */
function getLunchTimingMetadata(status, scanDate) {
  const config = getLunchWindowConfig_(status);
  if (!config) return null;

  const now = scanDate || new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes_(config.start);
  const endMinutes = parseTimeToMinutes_(config.end);

  if (startMinutes === null || endMinutes === null) {
    return {
      severity: 'warning',
      message: config.label + ' recorded, but the expected lunch window settings need attention.'
    };
  }

  const inWindow = currentMinutes >= startMinutes && currentMinutes <= endMinutes;

  const expectedWindow = formatLunchWindow_(config.start, config.end);
  if (inWindow) {
    return {
      severity: 'ok',
      message: config.label + ' recorded during the expected ' + expectedWindow + ' window.'
    };
  }

  return {
    severity: 'warning',
    message: config.label + ' recorded outside the expected ' + expectedWindow + ' window.'
  };
}

function getLunchWindowConfig_(status) {
  if (status === 'LUNCH OUT' || status === 'LUNCH IN') {
    const labels = getLunchPeriodLabels_();
    return {
      label: status === 'LUNCH OUT' ? 'Lunch out' : 'Lunch in',
      start: labels.start,
      end: labels.end
    };
  }

  return null;
}

function parseTimeToMinutes_(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3] ? match[3].toUpperCase() : '';

  if (minute < 0 || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    if (meridiem === 'PM' && hour !== 12) hour += 12;
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return hour * 60 + minute;
}

function formatLunchWindow_(startValue, endValue) {
  return String(startValue).trim() + '–' + String(endValue).trim();
}

function formatCheckInWindow_(startValue, cutoffValue) {
  return String(startValue).trim() + '-' + String(cutoffValue).trim();
}
