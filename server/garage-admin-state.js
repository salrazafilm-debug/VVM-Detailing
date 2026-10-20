// A failed read is not an empty collection. Keep confirmed records on screen
// until a successful refresh provides an authoritative replacement.
function mergeAdminSnapshot(previous, snapshot) {
  const status = snapshot.read_status || {};
  return snapshot.customers.map(customer => {
    const old = previous.find(c => c.user_id === customer.user_id);
    if (status.vehicles === false) return {...customer, garage_vehicles: old?.garage_vehicles || []};
    return {...customer, garage_vehicles: (customer.garage_vehicles || []).map(vehicle => {
      const saved = old?.garage_vehicles?.find(v => v.id === vehicle.id);
      return {...vehicle,
        garage_services: status.services === false ? saved?.garage_services || [] : vehicle.garage_services || [],
        garage_photos: status.photos === false ? saved?.garage_photos || [] : (vehicle.garage_photos || []).map(photo => ({
          ...photo, url: photo.url || saved?.garage_photos?.find(p => p.id === photo.id)?.url || null,
        })),
      };
    })};
  });
}

function mergeSavedPhoto(customers, result) {
  const photo = result.photo;
  if (!photo) return customers;
  return customers.map(customer => ({...customer, garage_vehicles: (customer.garage_vehicles || []).map(vehicle => vehicle.id !== photo.vehicle_id ? vehicle : {
    ...vehicle,
    hero_photo_id: result.cover_saved ? photo.id : vehicle.hero_photo_id,
    garage_photos: [photo, ...(vehicle.garage_photos || []).filter(p => p.id !== photo.id)],
  })}));
}

module.exports = {mergeAdminSnapshot, mergeSavedPhoto};
