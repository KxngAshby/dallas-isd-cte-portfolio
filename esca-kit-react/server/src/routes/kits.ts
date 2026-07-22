import { Router } from 'express';
import {
  appendRow,
  deleteRow,
  findAllBy,
  findBy,
  getRows,
  getSetting,
  logAudit,
  nextBarcode,
  nextId,
  updateRow,
} from '../sheets/client.js';
import { KIT_LOAN_ST, STATUS } from '../sheets/schema.js';
import {
  enrichKit_,
  errMsg,
  getApiUser,
  isKitCheckedOut_,
  isOpenLoan_,
  strip_,
} from '../lib/helpers.js';

const router = Router();

/** GET /templates — before /:id */
router.get('/templates', async (_req, res) => {
  try {
    const types = await getRows('ItemTypes');
    const templates = (await getRows('KitTemplates'))
      .filter((t) => t.active !== 'FALSE')
      .map((t) => strip_(t) as Record<string, unknown>);
    const tItems = await getRows('TemplateItems');
    const kits = (await getRows('Kits')).filter((k) => k.active !== 'FALSE');

    for (const t of templates) {
      // Only count real links — a blank template_id must not match blank-id kits.
      t.kit_count = t.template_id
        ? kits.filter((k) => k.template_id && k.template_id === t.template_id).length
        : 0;
      t.contents = tItems
        .filter((i) => i.template_id === t.template_id)
        .map((i) => {
          const type = types.find((x) => x.type_id === i.type_id);
          return Object.assign(strip_(i) || {}, {
            type_name: type ? type.name : i.type_id,
          });
        });
    }
    res.json({ success: true, templates });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** POST /templates */
router.post('/templates', async (req, res) => {
  try {
    const data = req.body || {};
    if (data.template_id) {
      const t = await findBy('KitTemplates', 'template_id', data.template_id);
      if (t) {
        await updateRow('KitTemplates', t._row, data);
        res.json({ success: true, template_id: data.template_id });
        return;
      }
    }
    const templateId = await nextId('TPL');
    await appendRow('KitTemplates', { ...data, template_id: templateId, active: 'TRUE' });
    res.json({ success: true, template_id: templateId });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** DELETE /templates — purge unlabeled / junk template rows (no id) */
async function purgeJunkTemplates(res: import('express').Response) {
  const junk = (await getRows('KitTemplates')).filter(
    (r) =>
      !String(r.template_id || '').trim() ||
      (!String(r.career || '').trim() && !String(r.name || '').trim()),
  );
  if (!junk.length) {
    res.json({ success: false, error: 'Nothing to remove — no unlabeled template rows found.' });
    return;
  }
  for (const r of junk.slice().sort((a, b) => b._row - a._row)) {
    await deleteRow('KitTemplates', r._row);
  }
  res.json({ success: true, removed: junk.length });
}

router.delete('/templates', async (_req, res) => {
  try {
    await purgeJunkTemplates(res);
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** DELETE /templates/:id — soft-delete + unlink kits; hard-delete unlabeled junk */
router.delete('/templates/:id', async (req, res) => {
  try {
    const id = String(req.params.id ?? '').trim();

    // Junk / unlabeled rows: no real id, or blank career+name. Hard-delete them.
    if (!id) {
      await purgeJunkTemplates(res);
      return;
    }

    const t = await findBy('KitTemplates', 'template_id', id);
    if (!t) {
      res.json({ success: false, error: 'Template not found.' });
      return;
    }
    // Unlink kits that point at this template (do not delete the kits).
    for (const k of (await getRows('Kits')).filter((k) => k.template_id === id)) {
      await updateRow('Kits', k._row, { template_id: '' });
    }
    await updateRow('KitTemplates', t._row, { active: 'FALSE' });
    const tItems = (await getRows('TemplateItems'))
      .filter((r) => r.template_id === id)
      .slice()
      .sort((a, b) => b._row - a._row);
    for (const r of tItems) {
      await deleteRow('TemplateItems', r._row);
    }
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** POST /templates/:id/items — replace template items */
router.post('/templates/:id/items', async (req, res) => {
  try {
    const templateId = req.params.id;
    const items = req.body?.items || req.body || [];
    const rows = await getRows('TemplateItems');
    const toDelete = rows
      .filter((r) => r.template_id === templateId)
      .slice()
      .sort((a, b) => b._row - a._row);
    for (const r of toDelete) {
      await deleteRow('TemplateItems', r._row);
    }
    for (const i of items) {
      if (!i.type_id || !parseInt(String(i.qty), 10)) continue;
      await appendRow('TemplateItems', {
        template_id: templateId,
        type_id: i.type_id,
        qty: parseInt(String(i.qty), 10),
        reorder_threshold: i.reorder_threshold || '',
      });
    }
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** GET /types */
router.get('/types', async (_req, res) => {
  try {
    const types = (await getRows('ItemTypes')).map((t) => strip_(t));
    res.json({ success: true, types });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** POST /types */
router.post('/types', async (req, res) => {
  try {
    const data = req.body || {};
    if (data.type_id) {
      const t = await findBy('ItemTypes', 'type_id', data.type_id);
      if (t) {
        await updateRow('ItemTypes', t._row, data);
        res.json({ success: true });
        return;
      }
    }
    const typeId = await nextId('TYPE');
    await appendRow('ItemTypes', { ...data, type_id: typeId });
    res.json({ success: true, type_id: typeId });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** DELETE /types/:id — remove unused item type */
router.delete('/types/:id', async (req, res) => {
  try {
    const typeId = req.params.id;
    const inTemplates = await findAllBy('TemplateItems', 'type_id', typeId);
    if (inTemplates.length) {
      res.json({
        success: false,
        error: 'Cannot remove — this type is used on one or more career templates.',
      });
      return;
    }
    const inKits = await findAllBy('KitItems', 'type_id', typeId);
    if (inKits.length) {
      res.json({
        success: false,
        error: 'Cannot remove — this type is used on one or more kit items.',
      });
      return;
    }
    const t = await findBy('ItemTypes', 'type_id', typeId);
    if (!t) {
      res.json({ success: false, error: 'Item type not found.' });
      return;
    }
    await deleteRow('ItemTypes', t._row as number);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** GET / */
router.get('/', async (_req, res) => {
  try {
    const kits = [];
    for (const k of (await getRows('Kits')).filter((x) => x.active !== 'FALSE')) {
      kits.push(await enrichKit_(k));
    }
    res.json({ success: true, kits });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** POST / — save kit */
router.post('/', async (req, res) => {
  try {
    const data = req.body || {};
    if (data.kit_id) {
      const k = await findBy('Kits', 'kit_id', data.kit_id);
      if (k) {
        await updateRow('Kits', k._row, data);
        res.json({ success: true });
        return;
      }
    }
    const kitId = await nextId('KIT');
    const short = kitId.split('-')[1];
    const tipweb = data.tipweb_tag && String(data.tipweb_tag).trim();
    const kitBarcode = tipweb
      ? tipweb
      : `${(await getSetting('barcode_prefix')) || 'ESCA'}-KIT-${short}`;
    await appendRow('Kits', {
      ...data,
      kit_id: kitId,
      kit_barcode: kitBarcode,
      loan_status: KIT_LOAN_ST.AVAILABLE,
      active: 'TRUE',
    });
    res.json({ success: true, kit_id: kitId, kit_barcode: kitBarcode });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** GET /:id/template-items — career template line items for a kit */
router.get('/:id/template-items', async (req, res) => {
  try {
    const kit = await findBy('Kits', 'kit_id', req.params.id);
    if (!kit || !kit.template_id) {
      res.json({ success: false, error: 'Kit has no career template assigned.' });
      return;
    }
    const types = await getRows('ItemTypes');
    const tpl = await findBy('KitTemplates', 'template_id', kit.template_id);
    const items = (await findAllBy('TemplateItems', 'template_id', kit.template_id)).map((i) => {
      const type = types.find((t) => t.type_id === i.type_id);
      return {
        type_id: i.type_id,
        type_name: type ? type.name : i.type_id,
        qty: parseInt(String(i.qty), 10) || 1,
      };
    });
    res.json({ success: true, items, template: strip_(tpl) });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** GET /:id/items */
router.get('/:id/items', async (req, res) => {
  try {
    const types = await getRows('ItemTypes');
    const items = (await findAllBy('KitItems', 'kit_id', req.params.id)).map((i) => {
      const t = types.find((x) => x.type_id === i.type_id);
      return Object.assign(strip_(i) || {}, {
        type_name: t ? t.name : i.type_id,
      });
    });
    res.json({ success: true, items });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** POST /:id/barcodes — generate item barcodes */
router.post('/:id/barcodes', async (req, res) => {
  try {
    const user = getApiUser(req);
    const kitId = req.params.id;
    const items = req.body?.items || req.body || [];
    const kit = await findBy('Kits', 'kit_id', kitId);
    if (!kit) {
      res.json({ success: false, error: 'Kit not found.' });
      return;
    }
    const short = String(kitId).split('-')[1];
    const created: { barcode: string; type_id: unknown }[] = [];
    for (const { type_id, qty } of items) {
      for (let i = 0; i < parseInt(String(qty), 10); i++) {
        const barcode = await nextBarcode(short);
        await appendRow('KitItems', {
          barcode,
          kit_id: kitId,
          type_id,
          status: STATUS.AVAILABLE,
          last_updated: new Date().toISOString(),
          updated_by: user,
          notes: '',
        });
        await logAudit(barcode, String(kitId), 'created', '', STATUS.AVAILABLE, user, '');
        created.push({ barcode, type_id });
      }
    }
    res.json({ success: true, created, kit: strip_(kit) });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** DELETE /:id — soft delete (blocked while checked out) */
router.delete('/:id', async (req, res) => {
  try {
    const k = await findBy('Kits', 'kit_id', req.params.id);
    if (!k) {
      res.json({ success: false, error: 'Kit not found.' });
      return;
    }
    const loans = await getRows('Loans');
    const openLoan = loans.find((l) => l.kit_id === req.params.id && isOpenLoan_(l));
    if (openLoan || isKitCheckedOut_(k)) {
      res.json({
        success: false,
        error: 'Cannot remove — this kit is checked out. Check it in first.',
      });
      return;
    }
    await updateRow('Kits', k._row, { active: 'FALSE' });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

export default router;
