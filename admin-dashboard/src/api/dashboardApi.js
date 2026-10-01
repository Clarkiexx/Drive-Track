import client from './client';

export function fetchDashboardSummary() {
  return client.get('/dashboard/summary');
}

export function fetchDashboardTrend() {
  return client.get('/dashboard/trend');
}

export function fetchRecentActivity() {
  return client.get('/dashboard/recent-activity');
}
