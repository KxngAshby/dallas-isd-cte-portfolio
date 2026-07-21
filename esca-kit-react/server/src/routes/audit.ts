import { Router } from 'express';
import { appendRow, findAllBy, logAudit, nextId } from '../sheets/client.js';
import { errMsg, getApiUser, strip_ } from '../lib/helpers.js';

const router = Router();

/** POST /run { kitId, scannedBarcodes } */
router.post('/run', async (req, res) => {
  try {
    const user = getApiUser(req);
    const { kitId, scannedBarcodes } = req.body || {};
    const expected = await findAllBy('KitItems', 'kit_id', kitId);
    const found: string[] = scannedBarcodes || [];
    const missing = expected
      .filter((i) => !found.includes(String(i.barcode)))
      .map((i) => strip_(i));
    const unexpected = found.filter((b) => !expected.find((i) => String(i.barcode) === b));
    const auditId = await nextId('AUDIT');
    await appendRow('Audits', {
      audit_id: auditId,
      kit_id: kitId,
      started: new Date().toISOString(),
      completed: new Date().toISOString(),
      scanned_count: found.length,
      missing_count: missing.length,
    });
    await logAudit(
      '',
      String(kitId),
      'audit',
      '',
      '',
      user,
      `Found:${found.length} Missing:${missing.length}`,
    );
    res.json({
      success: true,
      expected: expected.length,
      found: found.length,
      missing,
      unexpected,
    });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

export default router;
