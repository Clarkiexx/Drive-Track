import React, { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { fetchAuditLogs } from '../api/auditLogApi';

const ACTION_LABELS = {
  created_driver: 'Created Driver',
  updated_driver: 'Updated Driver',
  changed_driver_status: 'Changed Driver Status',
  deleted_driver: 'Deleted Driver',
  created_enforcer: 'Created Enforcer',
  updated_enforcer: 'Updated Enforcer',
  changed_enforcer_status: 'Changed Enforcer Status',
  reset_enforcer_password: 'Reset Enforcer Password',
  deleted_enforcer: 'Deleted Enforcer',
  verified_citation: 'Verified Citation',
  overrode_fine_amount: 'Overrode Fine Amount',
  settled_citation: 'Settled Citation',
  cancelled_citation: 'Cancelled Citation',
  sent_reminder: 'Sent Reminder',
  created_violation_type: 'Created Violation Type',
  updated_violation_type: 'Updated Violation Type',
  activated_violation_type: 'Activated Violation Type',
  deactivated_violation_type: 'Deactivated Violation Type',
  sent_broadcast: 'Sent Broadcast',
};

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  function load(page = 1) {
    setIsLoading(true);
    setLoadError('');
    fetchAuditLogs({ page })
      .then((res) => {
        setLogs(res.data.data.logs);
        setPagination(res.data.data.pagination);
      })
      .catch((err) => setLoadError(err.response?.data?.message || 'Unable to load audit logs.'))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    load(1);
  }, []);

  return (
    <DashboardLayout title="Audit Log">
      <h1 className="page-heading">Audit Log</h1>
      <p className="page-subheading">
        A permanent, read-only record of every action taken by admin accounts. Entries here cannot be edited or removed.
      </p>

      <div className="card">
        {isLoading ? (
          <div style={{ padding: 24 }}>Loading…</div>
        ) : loadError ? (
          <div className="error-text" style={{ padding: 24 }}>{loadError}</div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.auditLogId}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {new Date(log.createdAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>{log.Admin ? `${log.Admin.firstName} ${log.Admin.lastName}` : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{ACTION_LABELS[log.action] || log.action}</td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {log.targetType} {log.targetId ? `#${log.targetId}` : ''}
                    </td>
                    <td style={{ fontSize: 13 }}>{log.details || '—'}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>
                      No actions logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="pagination">
              <span>
                Showing page {pagination.page} of {pagination.totalPages || 1} ({pagination.total} entries)
              </span>
              <button disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>Previous</button>
              <button disabled={pagination.page >= pagination.totalPages} onClick={() => load(pagination.page + 1)}>Next</button>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
