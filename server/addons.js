// Interior add-ons. Priced here (not in Square) and added to the booking total. They only apply to
// bookings that include a Full Factory Reset or an Interior Reset.
const ADDONS = [
  { id: 'stain', name: 'Shampoo (stain removal)', priceCents: 6000 },
  { id: 'pet-hair', name: 'Pet hair removal', priceCents: 5000 },
  { id: 'odor', name: 'Odor removal', priceCents: 6000 },
];
const byId = Object.fromEntries(ADDONS.map(a => [a.id, a]));
const eligible = services => services.some(v => v.kind === 'full' || v.kind === 'interior');

// raw: array (one entry per vehicle) of add-on ids. cars: resolved cars from resolvePlan. Returns one list of add-ons per car.
function resolveAddons(raw, cars) {
  return cars.map((car, i) => {
    const ids = Array.isArray(raw) && Array.isArray(raw[i]) ? [...new Set(raw[i])] : [];
    if (!ids.length) return [];
    if (!eligible(car.services)) throw Object.assign(new Error('Add-ons are for the Full Factory Reset and Interior Reset.'), { status: 400 });
    return ids.map(id => {
      if (!byId[id]) throw Object.assign(new Error('Unknown add-on.'), { status: 400 });
      return byId[id];
    });
  });
}

module.exports = { ADDONS, resolveAddons, eligible };
