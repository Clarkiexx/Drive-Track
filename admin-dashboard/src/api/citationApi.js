import client from './client';

export function fetchCitations({ search = '', status = '', recordType = '', underProtest = '', page = 1, limit = 10 } = {}) {
  return client.get('/citations', { params: { search, status, recordType, underProtest, page, limit } });
}

export function fetchCitation(citationId) {
  return client.get(`/citations/${citationId}`);
}

export function verifyCitation(citationId) {
  return client.patch(`/citations/${citationId}/verify`);
}

export function overrideFineAmount(citationId, fineAmount, reason) {
  return client.patch(`/citations/${citationId}/fine-amount`, { fineAmount, reason });
}

export function settleCitation(citationId, payload) {
  return client.patch(`/citations/${citationId}/settle`, payload || {});
}

export function sendReminder(citationId) {
  return client.patch(`/citations/${citationId}/remind`);
}

export function cancelCitation(citationId) {
  return client.patch(`/citations/${citationId}/cancel`);
}

export function resolveProtest(citationId, action) {
  return client.patch(`/citations/${citationId}/protest`, { action });
}
