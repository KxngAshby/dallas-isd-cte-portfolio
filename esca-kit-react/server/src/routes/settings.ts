import { Router } from 'express';
import { getRows, setSetting } from '../sheets/client.js';
import { REGIONS } from '../sheets/schema.js';
import { errMsg, strip_ } from '../lib/helpers.js';

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
    await setSetting(String(key), value);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

export default router;
