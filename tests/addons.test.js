const assert = require('assert');
const { ADDONS, resolveAddons, eligible } = require('../server/addons');
assert.deepEqual(ADDONS.map(a => [a.id, a.priceCents]), [['stain', 6000], ['pet-hair', 5000], ['odor', 6000]]);
assert.equal(eligible([{ kind: 'full' }]), true); assert.equal(eligible([{ kind: 'interior' }]), true); assert.equal(eligible([{ kind: 'exterior' }, { kind: 'ceramic' }]), false);
assert.deepEqual(resolveAddons([['odor', 'odor']], [{ services: [{ kind: 'interior' }] }]).map(l => l.map(a => a.id)), [['odor']]);   // duplicates collapse
assert.deepEqual(resolveAddons(undefined, [{ services: [{ kind: 'exterior' }] }]), [[]]);
assert.throws(() => resolveAddons([['stain']], [{ services: [{ kind: 'exterior' }] }]), /Add-ons are for/);
console.log('addon tests passed');
