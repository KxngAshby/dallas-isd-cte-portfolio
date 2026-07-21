import { Router } from 'express';
import { appendRow, findBy, getRows, updateRow } from '../sheets/client.js';
import { errMsg, strip_ } from '../lib/helpers.js';

const router = Router();

async function resolveCampusName(campusId: unknown): Promise<string> {
  if (!campusId) return '';
  const c = await findBy('Campuses', 'campus_id', String(campusId).trim());
  return c ? String(c.name || '') : '';
}

/** GET / */
router.get('/', async (_req, res) => {
  try {
    const counselors = (await getRows('Counselors'))
      .filter((c) => c.active !== 'FALSE')
      .map((c) => strip_(c));
    res.json({ success: true, counselors });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** POST / — save counselor */
router.post('/', async (req, res) => {
  try {
    const data = req.body || {};
    if (!data.eid || !String(data.eid).trim()) {
      res.json({ success: false, error: 'EID is required.' });
      return;
    }
    const eid = String(data.eid).trim();
    const campusName = await resolveCampusName(data.campus_id);
    const existing = await findBy('Counselors', 'eid', eid);
    if (existing) {
      await updateRow('Counselors', existing._row, {
        ...data,
        eid,
        campus_name: campusName,
        last_seen: new Date().toISOString(),
        active: 'TRUE',
      });
    } else {
      const now = new Date().toISOString();
      await appendRow('Counselors', {
        ...data,
        eid,
        campus_name: campusName,
        first_seen: now,
        last_seen: now,
        active: 'TRUE',
      });
    }
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** DELETE /:eid — soft-delete (hide from Hub sign-in) */
router.delete('/:eid', async (req, res) => {
  try {
    const eid = String(req.params.eid || '').trim();
    if (!eid) {
      res.json({ success: false, error: 'EID is required.' });
      return;
    }
    const c = await findBy('Counselors', 'eid', eid);
    if (!c) {
      res.json({ success: false, error: 'Counselor not found.' });
      return;
    }
    await updateRow('Counselors', c._row, { active: 'FALSE' });
    res.json({ success: true });
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
      if (!r.eid || !String(r.eid).trim()) continue;
      const eid = String(r.eid).trim();
      let campusName = r.campus_name ? String(r.campus_name).trim() : '';
      if (!campusName && r.campus_id && String(r.campus_id).trim()) {
        campusName = await resolveCampusName(r.campus_id);
      }
      const now = new Date().toISOString();
      const existing = await findBy('Counselors', 'eid', eid);
      if (existing) {
        const patch: Record<string, unknown> = { eid, last_seen: now, active: 'TRUE' };
        if (r.name && String(r.name).trim()) patch.name = String(r.name).trim();
        if (r.email && String(r.email).trim()) patch.email = String(r.email).trim();
        if (r.campus_id && String(r.campus_id).trim())
          patch.campus_id = String(r.campus_id).trim();
        if (campusName) patch.campus_name = campusName;
        await updateRow('Counselors', existing._row, patch);
        updated++;
      } else {
        await appendRow('Counselors', {
          eid,
          name: r.name ? String(r.name).trim() : '',
          email: r.email ? String(r.email).trim() : '',
          campus_id: r.campus_id ? String(r.campus_id).trim() : '',
          campus_name: campusName,
          first_seen: now,
          last_seen: now,
          active: 'TRUE',
        });
        inserted++;
      }
    }
    res.json({ success: true, inserted, updated });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** GET /by-eid/:eid — Hub lookup, no admin auth */
router.get('/by-eid/:eid', async (req, res) => {
  try {
    const eid = String(req.params.eid || '').trim();
    if (!eid) {
      res.json({ success: false, error: 'EID required.' });
      return;
    }
    const c = await findBy('Counselors', 'eid', eid);
    if (!c || c.active === 'FALSE') {
      res.json({ success: true, found: false });
      return;
    }
    res.json({ success: true, found: true, counselor: strip_(c) });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** POST /upsert-hub — Hub sign-in upsert */
router.post('/upsert-hub', async (req, res) => {
  try {
    const { eid, name, campusId, email } = req.body || {};
    if (!eid || !String(eid).trim()) {
      res.json({ success: false, error: 'EID is required.' });
      return;
    }
    const eidStr = String(eid).trim();
    const campusName = await resolveCampusName(campusId);
    const existing = await findBy('Counselors', 'eid', eidStr);
    const now = new Date().toISOString();
    if (existing) {
      await updateRow('Counselors', existing._row, {
        name: name || existing.name || '',
        email: email || existing.email || '',
        campus_id: campusId || existing.campus_id || '',
        campus_name: campusName || existing.campus_name || '',
        last_seen: now,
      });
      res.json({
        success: true,
        counselor: {
          eid: eidStr,
          name: name || existing.name || '',
          email: email || existing.email || '',
          campus_id: campusId,
          campus_name: campusName,
        },
      });
      return;
    }
    await appendRow('Counselors', {
      eid: eidStr,
      name: name || '',
      email: email || '',
      campus_id: campusId || '',
      campus_name: campusName,
      first_seen: now,
      last_seen: now,
      active: 'TRUE',
    });
    res.json({
      success: true,
      counselor: {
        eid: eidStr,
        name: name || '',
        email: email || '',
        campus_id: campusId,
        campus_name: campusName,
      },
    });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

export default router;
