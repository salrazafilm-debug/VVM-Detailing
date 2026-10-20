// Shared by Garage pages, booking emails and maintenance reminders.
function vehicleLabel(vehicle) {
  return [vehicle?.year, vehicle?.make, vehicle?.model]
    .filter(value => value !== null && value !== undefined && String(value).trim() !== '')
    .map(value => String(value).trim()).join(' ') || 'Vehicle';
}
module.exports = { vehicleLabel };
