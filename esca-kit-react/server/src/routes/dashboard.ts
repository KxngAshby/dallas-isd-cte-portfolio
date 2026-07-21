import { Router } from 'express';
import { getRows } from '../sheets/client.js';
import { KIT_LOAN_ST, LOAN_ST, STATUS } from '../sheets/schema.js';
import { errMsg, strip_ } from '../lib/helpers.js';

const router = Router();

/** GET / — dashboard data */
router.get('/', async (_req, res) => {
  try {
    const items = await getRows('KitItems');
    const kits = (await getRows('Kits')).filter((k) => k.active !== 'FALSE');
    const types = await getRows('ItemTypes');
    const templates = (await getRows('KitTemplates')).filter((t) => t.active !== 'FALSE');
    const tItems = await getRows('TemplateItems');

    const counts = { available: 0, needs_replacement: 0, dead: 0 };
    for (const i of items) {
      if (i.status === STATUS.AVAILABLE) counts.available++;
      else if (i.status === STATUS.NEEDS_REPLACEMENT) counts.needs_replacement++;
      else if (i.status === STATUS.DEAD) counts.dead++;
    }

    const alerts = types
      .filter((t) => t.reorder_threshold)
      .reduce(
        (acc: { type_name: unknown; available: number; threshold: unknown; scope: string }[], t) => {
          const avail = items.filter(
            (i) => i.type_id === t.type_id && i.status === STATUS.AVAILABLE,
          ).length;
          if (avail < parseInt(String(t.reorder_threshold), 10)) {
            acc.push({
              type_name: t.name,
              available: avail,
              threshold: t.reorder_threshold,
              scope: 'All kits',
            });
          }
          return acc;
        },
        [],
      );

    const careerAlerts: {
      career: unknown;
      type_name: unknown;
      available: number;
      threshold: number;
      kit_count: number;
    }[] = [];
    for (const tpl of templates) {
      const kitIds = kits
        .filter((k) => k.template_id === tpl.template_id)
        .map((k) => k.kit_id);
      for (const ti of tItems.filter((x) => x.template_id === tpl.template_id)) {
        const thresh = parseInt(String(ti.reorder_threshold || 0), 10);
        if (!thresh) continue;
        const type = types.find((x) => x.type_id === ti.type_id);
        const avail = items.filter(
          (i) =>
            kitIds.includes(i.kit_id) &&
            i.type_id === ti.type_id &&
            i.status === STATUS.AVAILABLE,
        ).length;
        if (avail < thresh) {
          careerAlerts.push({
            career: tpl.career || tpl.name,
            type_name: type ? type.name : ti.type_id,
            available: avail,
            threshold: thresh,
            kit_count: kitIds.length,
          });
        }
      }
    }

    const careerSummary = templates.map((tpl) => {
      const kitIds = kits
        .filter((k) => k.template_id === tpl.template_id)
        .map((k) => k.kit_id);
      const kitItems = items.filter((i) => kitIds.includes(i.kit_id));
      return {
        template_id: tpl.template_id,
        name: tpl.name,
        career: tpl.career || tpl.name,
        kit_count: kitIds.length,
        available: kitItems.filter((i) => i.status === STATUS.AVAILABLE).length,
        needs_replacement: kitItems.filter((i) => i.status === STATUS.NEEDS_REPLACEMENT)
          .length,
        dead: kitItems.filter((i) => i.status === STATUS.DEAD).length,
      };
    });

    const openLoans = (await getRows('Loans'))
      .filter((l) => l.status === LOAN_ST.OPEN)
      .map((l) => strip_(l));

    res.json({
      success: true,
      counts,
      alerts,
      careerAlerts,
      careerSummary,
      kits_total: kits.length,
      kits_checked_out: kits.filter((k) => k.loan_status === KIT_LOAN_ST.CHECKED_OUT).length,
      open_loans: openLoans,
    });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

/** GET /regional */
router.get('/regional', async (_req, res) => {
  try {
    const loans = await getRows('Loans');
    const byRegion: Record<
      string,
      { region: string; checkouts: number; open_loans: number; campuses: Record<string, boolean> }
    > = {};

    for (const l of loans) {
      const region = String(l.region || 'No Region Assigned');
      if (!byRegion[region]) {
        byRegion[region] = { region, checkouts: 0, open_loans: 0, campuses: {} };
      }
      byRegion[region].checkouts++;
      if (l.status === LOAN_ST.OPEN) byRegion[region].open_loans++;
      if (l.campus_name) byRegion[region].campuses[String(l.campus_name)] = true;
    }

    const regions = Object.keys(byRegion)
      .map((k) => {
        const r = byRegion[k];
        return {
          region: r.region,
          checkouts: r.checkouts,
          open_loans: r.open_loans,
          campuses_served: Object.keys(r.campuses).length,
        };
      })
      .sort((a, b) => b.checkouts - a.checkouts);

    const totalCampuses = (await getRows('Campuses')).filter((c) => c.active !== 'FALSE')
      .length;
    const mostActive = regions.length ? regions[0].region : '—';

    res.json({
      success: true,
      regions,
      regions_active: regions.length,
      campuses_total: totalCampuses,
      most_active: mostActive,
    });
  } catch (e) {
    res.json({ success: false, error: errMsg(e) });
  }
});

export default router;
