const assert = require('assert');
const { ADDONS, resolveAddons, eligible, priceFor } = require('../server/addons');
const svc = (kind, label, item = 'x') => ({ kind, label, item });
const sedanReset = [svc('full', 'Sedan', 'Full Factory Reset')];
const suvReset = [svc('full', 'SUV', 'Full Factory Reset')];
const truckInterior = [svc('interior', 'SUV / Truck', 'Interior Reset')];
const price = (id, services) => priceFor(ADDONS.find(a => a.id === id), services);

assert.deepEqual(ADDONS.map(a => [a.id, a.priceCents]), [['stain', 6000], ['water-stain', 8000], ['pet-hair', 6000], ['odor', 6000], ['leather', 6000], ['paint', 25000], ['leather-coat', 4500], ['fabric-coat', 4500]]);
assert.equal(eligible([{ kind: 'full' }]), true); assert.equal(eligible([{ kind: 'interior' }]), true); assert.equal(eligible([{ kind: 'exterior' }, { kind: 'ceramic' }]), false);

// Interior add-ons: Full Factory Reset or Interior Reset, same price for every size
assert.equal(price('pet-hair', sedanReset), 6000); assert.equal(price('water-stain', truckInterior), 8000);
assert.equal(price('pet-hair', [svc('exterior', 'Sedan')]), null);

// Paint enhancement: only with a Full Factory Reset, $250 coupe/sedan, $275 SUV/truck, not with interior alone or minivan
assert.equal(price('paint', sedanReset), 25000); assert.equal(price('paint', suvReset), 27500);
assert.equal(price('paint', [svc('full', 'Coupe', 'Full Factory Reset')]), 25000);
assert.equal(price('paint', truckInterior), null, 'interior alone is not enough');
assert.equal(price('paint', [svc('full', 'Mini-Van', 'Full Factory Reset')]), null, 'minivan not priced yet');

// Protection: same rule as interior add-ons
assert.equal(price('leather-coat', sedanReset), 4500); assert.equal(price('fabric-coat', [svc('exterior', 'Sedan')]), null);

// Resolving a booking: duplicates collapse, bad or unavailable add-ons are refused
assert.deepEqual(resolveAddons([['odor', 'odor']], [{ services: sedanReset }]).map(l => l.map(a => a.id)), [['odor']]);
assert.deepEqual(resolveAddons(undefined, [{ services: [svc('exterior', 'Sedan')] }]), [[]]);
assert.deepEqual(resolveAddons([['paint']], [{ services: suvReset }])[0][0].priceCents, 27500);
assert.throws(() => resolveAddons([['stain']], [{ services: [svc('exterior', 'Sedan')] }]), /not available/);
assert.throws(() => resolveAddons([['paint']], [{ services: truckInterior }]), /not available/);
assert.throws(() => resolveAddons([['nope']], [{ services: sedanReset }]), /Unknown add-on/);
console.log('addon tests passed');
