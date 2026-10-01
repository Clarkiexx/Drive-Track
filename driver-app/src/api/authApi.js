import client from './client';

export function registerDriver(payload, licensePhotoUri) {
  // payload: { firstName, middleInitial, lastName, licenseNumber, address, contactNumber, ...license fields }
  // If a license photo is attached, send multipart so the admin can verify against it.
  if (!licensePhotoUri) {
    return client.post('/auth/driver/register', payload);
  }
  const form = new FormData();
  Object.entries(payload || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') form.append(k, String(v));
  });
  const name = String(licensePhotoUri.split('/').pop() || 'license.jpg');
  form.append('licensePhoto', { uri: licensePhotoUri, name, type: 'image/jpeg' });
  return client.post('/auth/driver/register', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function loginDriver({ fullName, password }) {
  return client.post('/auth/driver/login', { fullName, password });
}

export function changePassword(newPassword) {
  return client.post('/auth/driver/change-password', { newPassword });
}
