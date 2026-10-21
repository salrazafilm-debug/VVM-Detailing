// Prices and durations for online booking, copied from Square and written here on purpose.
// The site does NOT read prices from Square. Square is used only to see which days and times are already booked.
// When a price or length changes in Square, update it here too (and on the homepage).
// Engine Bay is quote-only and is not listed, as on the homepage.
const { kindOf } = require('./rules');

// [variation id, item name, size label, price in cents, minutes, minutes between jobs]
const ROWS = [
  ['CCCIFOELHJVWOPCBQSMEYQPA', 'Exterior Reset', 'Coupe', 11000, 75, 60],
  ['ZW3NMFQFVO2WE6Z2EYVETE3T', 'Exterior Reset', 'Sedan', 12000, 90, 0],
  ['RSHY6YRV3BBU5DLO6YDO3RUS', 'Exterior Reset', 'Truck', 13500, 120, 0],
  ['EV6277U7MIGLJX55YWXI3MD6', 'Interior Reset', 'Sedan', 23500, 215, 0],
  ['4TK4LE5UBP75QABUOOZBBKSL', 'Interior Reset', 'SUV / Truck', 25500, 240, 0],
  ['JOG3ZPAB66PYSBMRHCZNW5IV', 'Full Factory Reset', 'Sedan (Regular size)', 29500, 330, 0],
  ['4KALC6QBJF26FWASX3F3JQPC', 'Full Factory Reset', 'Coupe (2 door)', 26500, 300, 30],
  ['WBR7W5SAYQMYFUYDUSTO3UYQ', 'Full Factory Reset', 'Truck', 34500, 360, 0],
  ['BL3ZQGHFSFAS5I5J2M6UUHUK', 'Full Factory Reset', 'SUV', 32000, 360, 0],
  ['HHQOAPLGTP5BJO3BQILLLEZR', 'Full Factory Reset', 'Mini-Van', 41000, 390, 0],
  ['XUPH2SUQVMYWTZYSJGYDTMUJ', 'Headlight Restoration', 'Regular', 13500, 45, 0],
  ['HKSILNOZQNSM4HCOKFY4AMT3', 'Paint Enhancement + 5 yr Ceramic coating', 'Sedan', 85000, 450, 0],
  ['IXM6IW5GWRZFC2QXFH5G3LGE', 'Paint Enhancement + 5 yr Ceramic coating', 'Truck', 120000, 540, 0],
  ['3VBCXDLBN6YQ73X6XCKJRFO3', 'Paint Enhancement + 5 yr Ceramic coating', 'Coupe', 77500, 300, 0],
  ['6OMJPB4L2PZON4ELQM6OJKP2', 'Paint Enhancement + 5 yr Ceramic coating', 'SUV', 95000, 390, 0],
];

const STATIC_CATALOG = Object.fromEntries(ROWS.map(([id, item, label, priceCents, durationMin, transitionMin]) => [id, {
  id, item, label, kind: kindOf(item), priceCents, durationMin, transitionMin, version: 1, bookable: true, teamMemberId: 'TMxa3fFm7Kfql50I',
}]));

module.exports = { STATIC_CATALOG };
