import client from './client';

export function searchDrivers({ licenseNumber, fullName }) {
  return client.get('/drivers/search', { params: { licenseNumber, fullName } });
}

export function quickCreateDriver(payload, licensePhoto) {
  // payload: { firstName, middleInitial, lastName, licenseNumber, address, contactNumber }
  // licensePhoto: { uri, fileName, mimeType } from expo-image-picker, or null
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) formData.append(key, value);
  });

  if (licensePhoto) {
    formData.append('licensePhoto', {
      uri: licensePhoto.uri,
      name: licensePhoto.fileName || 'license.jpg',
      type: licensePhoto.mimeType || 'image/jpeg',
    });
  }

  return client.post('/drivers', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function fetchDriverCitations(driverId) {
  return client.get(`/drivers/${driverId}/citations`);
}
