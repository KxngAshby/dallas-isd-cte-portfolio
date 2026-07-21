import { Router } from 'express';
import { appendRow, findBy, getRows, updateRow } from '../sheets/client.js';
import { errMsg, strip_ } from '../lib/helpers.js';

const router = Router();

/** GET / */
router.get('/', async (_req, res) => {
  try {
    const campuses = (await getRows('Campuses'))
      .filter((c) => c.active !== 'FALSE')
      .map((c) => strip_(c));
    res.json({ success: true, campuses });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** POST / — save campus */
router.post('/', async (req, res) => {
  try {
    const data = req.body || {};
    if (!data.campus_id || !String(data.campus_id).trim()) {
      res.json({ success: false, error: 'Org Number (campus_id) is required.' });
      return;
    }
    const campusId = String(data.campus_id).trim();
    const c = await findBy('Campuses', 'campus_id', campusId);
    if (c) {
      await updateRow('Campuses', c._row, { ...data, campus_id: campusId });
      res.json({ success: true, campus_id: campusId });
      return;
    }
    await appendRow('Campuses', { ...data, campus_id: campusId, active: 'TRUE' });
    res.json({ success: true, campus_id: campusId });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** POST /import */
router.post('/import', async (req, res) => {
  try {
    const rows = req.body?.rows || req.body || [];
    let inserted = 0;
    let updated = 0;
    for (const r of rows) {
      if (!r.campus_id || !String(r.campus_id).trim()) continue;
      const campusId = String(r.campus_id).trim();
      const c = await findBy('Campuses', 'campus_id', campusId);
      if (c) {
        await updateRow('Campuses', c._row, { ...r, campus_id: campusId });
        updated++;
      } else {
        await appendRow('Campuses', { ...r, campus_id: campusId, active: 'TRUE' });
        inserted++;
      }
    }
    res.json({ success: true, inserted, updated });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** DELETE /:id — soft delete */
router.delete('/:id', async (req, res) => {
  try {
    const c = await findBy('Campuses', 'campus_id', req.params.id);
    if (c) await updateRow('Campuses', c._row, { active: 'FALSE' });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

export default router;
