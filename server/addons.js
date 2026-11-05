// Add-ons. Priced here (not in Square) and added to the booking total. Interior add-ons need a Full Factory Reset
// or an Interior Reset. Paint enhancement needs a Full Factory Reset and is priced by size. Protection needs the same
// as interior. Change prices, names or rules in this one file (public/main.js copies the same size rule).
const ADDONS = [
  { id: 'stain', name: 'Shampoo (stain removal)', priceCents: 6000, group: 'interior' },
  { id: 'water-stain', name: 'Water stain removal (for exterior paint & glass)', priceCents: 8000, group: 'interior' },
  { id: 'pet-hair', name: 'Pet hair removal', priceCents: 6000, group: 'interior' },
  { id: 'odor', name: 'Odor removal', priceCents: 6000, group: 'interior' },
  { id: 'leather', name: 'Deep leather clean', note: 'For cars 10 years old and up', priceCents: 6000, group: 'interior' },
  { id: 'paint', name: 'Paint enhancement', note: 'Machine polish for extra gloss', priceCents: 25000, sizePrices: { coupe: 25000, sedan: 25000, suv: 27500, truck: 27500 }, group: 'paint' },
  { id: 'leather-coat', name: 'Leather seat ceramic coating', note: '4 to 6 months. Repels stains and dye transfer', priceCents: 4500, group: 'protection' },
  { id: 'fabric-coat', name: 'Fabric seat coating', note: '3 to 5 months. Guards against stains and dirt', priceCents: 4500, group: 'protection' },
];
const byId = Object.fromEntries(ADDONS.map(a => [a.id, a]));
const eligible = services => services.some(v => v.kind === 'full' || v.kind === 'interior');

// Size from the service label on a Full Factory Reset or Interior Reset ("Sedan", "SUV / Truck", "Mini-Van"...).
function sizeOf(services) {
  for (const s of services) {
    if (s.kind !== 'full' && s.kind !== 'interior') continue;
    const l = String(s.label || '').toLowerCase();
    if (/mini.?van/.test(l)) return 'minivan';
    if (/coupe/.test(l)) return 'coupe';
    if (/sedan/.test(l)) return 'sedan';
    if (/suv/.test(l)) return 'suv';
    if (/truck/.test(l)) return 'truck';
  }
  return null;
}

// The price this add-on costs on this car, or null when it is not offered for the car.
function priceFor(addon, services) {
  if (!eligible(services)) return null;
  if (addon.group === 'paint' && !services.some(s => s.kind === 'full')) return null;
  if (addon.sizePrices) return addon.sizePrices[sizeOf(services)] ?? null;
  return addon.priceCents;
}

// raw: array (one entry per vehicle) of add-on ids. cars: resolved cars from resolvePlan. Returns one list of add-ons per car.
function resolveAddons(raw, cars) {
  return cars.map((car, i) => {
    const ids = Array.isArray(raw) && Array.isArray(raw[i]) ? [...new Set(raw[i])] : [];
    return ids.map(id => {
      const addon = byId[id];
      if (!addon) throw Object.assign(new Error('Unknown add-on.'), { status: 400 });
      const price = priceFor(addon, car.services);
      if (price == null) throw Object.assign(new Error(`${addon.name} is not available for this booking.`), { status: 400 });
      return { id: addon.id, name: addon.name, priceCents: price };
    });
  });
}

module.exports = { ADDONS, resolveAddons, eligible, priceFor, sizeOf };
