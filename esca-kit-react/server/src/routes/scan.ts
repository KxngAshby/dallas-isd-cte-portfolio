import { Router } from 'express';
import { findBy, findAllBy, getRows } from '../sheets/client.js';
import { STATUS } from '../sheets/schema.js';
import {
  enrichKit_,
  errMsg,
  isConsumable_,
  isKitCheckedOut_,
  isOpenLoan_,
  strip_,
} from '../lib/helpers.js';

const router = Router();

/** POST /scan { barcode } — same logic as GAS scanBarcode */
router.post('/', async (req, res) => {
  try {
    const barcode = String(req.body?.barcode ?? '').trim();
    if (!barcode) {
      res.json({ success: false, error: 'No barcode scanned. Try again.' });
      return;
    }

    // Match the case sticker OR the TipWeb asset tag.
    let kit = await findBy('Kits', 'kit_barcode', barcode);
    if (!kit) {
      const allKits = await getRows('Kits');
      kit = allKits.find((k) => String(k.tipweb_tag ?? '').trim() === barcode) || null;
    }
    if (kit) {
      const types = await getRows('ItemTypes');
      const items = (await findAllBy('KitItems', 'kit_id', kit.kit_id)).map((i) => {
        const t = types.find((x) => x.type_id === i.type_id);
        return Object.assign(strip_(i) || {}, {
          type_name: t ? t.name : i.type_id,
          is_consumable: isConsumable_(t),
        });
      });

      // Open loan is the source of truth for check-in (loan_status can lag).
      const loans = await getRows('Loans');
      const openLoan =
        loans.find((l) => l.kit_id === kit!.kit_id && isOpenLoan_(l)) || null;
      if (openLoan || isKitCheckedOut_(kit)) {
        if (!openLoan) {
          res.json({
            success: false,
            error:
              'This kit is marked checked out but has no open loan on record. Fix it in Admin → Kits.',
          });
          return;
        }
        res.json({
          success: true,
          panel: 'checkin',
          kit: await enrichKit_(kit),
          loan: strip_(openLoan),
          items,
        });
        return;
      }

      const ready =
        items.length > 0 && items.every((i) => (i as { status?: string }).status === STATUS.AVAILABLE);
      res.json({
        success: true,
        panel: 'checkout',
        kit: await enrichKit_(kit),
        items,
        ready,
      });
      return;
    }

    const item = await findBy('KitItems', 'barcode', barcode);
    if (item) {
      const kit2 = await findBy('Kits', 'kit_id', item.kit_id);
      const type = await findBy('ItemTypes', 'type_id', item.type_id);
      res.json({
        success: true,
        panel: 'item',
        item: strip_(item),
        kit: await enrichKit_(kit2),
        type: strip_(type),
      });
      return;
    }

    res.json({
      success: false,
      error: 'Barcode not found. Use Admin → Labels to generate item barcodes.',
    });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

export default router;
