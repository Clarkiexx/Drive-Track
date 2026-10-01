import client from './client';

/**
 * Submits the citation as multipart/form-data since it includes photo files.
 * `photos` is an array of { uri, fileName, mimeType } objects from expo-image-picker.
 */
export function submitCitation(fields, photos) {
  const formData = new FormData();

  formData.append('driverId', String(fields.driverId));
  formData.append('recordType', fields.recordType || 'citation');
  formData.append('address', fields.address || '');
  formData.append('vehicleUnitType', fields.vehicleUnitType || '');
  formData.append('plateNumber', fields.plateNumber || '');
  formData.append('registeredOwner', fields.registeredOwner || '');
  formData.append('violationTypeIds', JSON.stringify(fields.violationTypeIds));
  formData.append('otherViolation', fields.otherViolation || '');
  formData.append('placeOfViolation', fields.placeOfViolation);
  formData.append('latitude', fields.latitude != null ? String(fields.latitude) : '');
  formData.append('longitude', fields.longitude != null ? String(fields.longitude) : '');
  formData.append('driverUnderProtest', String(fields.driverUnderProtest));

  photos.forEach((photo, index) => {
    formData.append('photos', {
      uri: photo.uri,
      name: photo.fileName || `evidence-${index}.jpg`,
      type: photo.mimeType || 'image/jpeg',
    });
  });

  return client.post('/citations', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function fetchMyCitations() {
  return client.get('/citations/mine');
}

export function fetchCitation(citationId) {
  return client.get(`/citations/${citationId}`);
}
