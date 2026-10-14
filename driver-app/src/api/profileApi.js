import client from './client';

// My Profile self-service (driver). The session driver object is cached in
// AuthContext/SecureStore — callers must persist the returned record via
// updateDriver() so the UI (and next restart) shows the new values.

export function updateMyProfile(payload) {
  // payload: { firstName?, middleInitial?, lastName?, address?, contactNumber? }
  // identity fields (licenseNumber, status) are admin-owned server-side.
  return client.patch('/drivers/me', payload);
}

export function uploadMyPhoto(photoUri) {
  const form = new FormData();
  const name = String(photoUri.split('/').pop() || 'avatar.jpg');
  form.append('photo', { uri: photoUri, name, type: 'image/jpeg' });
  return client.patch('/drivers/me/photo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
