// Shared by Garage pages, booking emails and maintenance reminders.
function vehicleLabel(vehicle) {
  return [vehicle?.year, vehicle?.make, vehicle?.model]
    .filter(value => value !== null && value !== undefined && String(value).trim() !== '')
    .map(value => String(value).trim()).join(' ') || 'Vehicle';
}
// Prefer a vehicle with an uploaded cover when no explicit selection exists.
// Older empty entries must not hide a client's saved vehicle photo.
function preferredGarageVehicleId(vehicles = [], selected = '') {
  if (vehicles.some(v => v.id === selected)) return selected;
  const photos = v => v.photos || v.garage_photos || [];
  return (vehicles.find(v => photos(v).some(p => p.id === v.hero_photo_id)) ||
    vehicles.find(v => photos(v).some(p => ['hero', 'after'].includes(p.photo_kind))) || vehicles[0])?.id || '';
}
module.exports = { vehicleLabel, preferredGarageVehicleId };
