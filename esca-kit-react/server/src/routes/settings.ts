import { Router } from 'express';
import { getRows, setSetting, updateRow } from '../sheets/client.js';
import { LOAN_ST, REGIONS } from '../sheets/schema.js';
import {
  errMsg,
  formatDueDateStr_,
  parseDueDate_,
  strip_,
} from '../lib/helpers.js';

const router = Router();

/** GET /regions — before generic if needed; mounted separately path */
router.get('/regions', async (_req, res) => {
  try {
    res.json({ success: true, regions: REGIONS });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** GET / */
router.get('/', async (_req, res) => {
  try {
    const settings = (await getRows('Settings')).map((s) => strip_(s));
    res.json({ success: true, settings });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** POST / { key, value } */
router.post('/', async (req, res) => {
  try {
    const { key, value } = req.body || {};
    if (!key) {
      res.json({ success: false, error: 'key is required.' });
      return;
    }
    if (String(key) === 'default_due_date') {
      const d = parseDueDate_(value);
      if (!d) {
        res.json({ success: false, error: 'Invalid due date.' });
        return;
      }
      const dueDate = formatDueDateStr_(d);
      await setSetting('default_due_date', dueDate);
      const open = (await getRows('Loans')).filter((l) => l.status === LOAN_ST.OPEN);
      for (const l of open) {
        if (l._row != null) await updateRow('Loans', Number(l._row), { due_date: dueDate });
      }
      res.json({ success: true, due_date: dueDate, updated: open.length });
      return;
    }
    await setSetting(String(key), value);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

export default router;
