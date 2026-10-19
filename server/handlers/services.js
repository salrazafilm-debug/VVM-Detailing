const { loadCatalog, json, fail, isPublic } = require('../square');
const { ADDONS } = require('../addons');

const ORDER = { full: 0, interior: 1, exterior: 2, headlight: 3, engine: 4, ceramic: 5 };

exports.handler = async () => {
  try {
    const cat = await loadCatalog();
    const groups = {};
    for (const v of Object.values(cat)) {
      if (!isPublic(v) || !v.bookable || !v.durationMin) continue;
      const g = (groups[v.item] = groups[v.item] || { name: v.item, kind: v.kind, variations: [] });
      g.variations.push({ id: v.id, label: v.label, priceCents: v.priceCents, minutes: v.durationMin });
    }
    const list = Object.values(groups).sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
    list.forEach(g => g.variations.sort((a, b) => a.priceCents - b.priceCents));
    return json(200, { services: list, addons: ADDONS });
  } catch (e) { return fail(e); }
};
