import React, { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import { fetchEnforcers, createEnforcer, updateEnforcer, updateEnforcerStatus, resetEnforcerPassword } from '../api/enforcerApi';

const STATUS_LABELS = {
  active: 'Active',
  on_leave: 'On Leave',
  suspended: 'Suspended',
  archived: 'Archived',
};

export default function EnforcerManagement() {
  const [enforcers, setEnforcers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEnforcer, setEditingEnforcer] = useState(null);
  const [selectedEnforcer, setSelectedEnforcer] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  async function loadEnforcers(page = 1, searchValue = search, archived = showArchived) {
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await fetchEnforcers({ search: searchValue, page, includeArchived: archived });
      setEnforcers(response.data.data.enforcers);
      setPagination(response.data.data.pagination);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Unable to load enforcers.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadEnforcers(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearchSubmit(e) {
    e.preventDefault();
    loadEnforcers(1, search, showArchived);
  }

  async function handleStatusChange(enforcer, nextStatus, confirmText) {
    if (!window.confirm(confirmText)) return;
    await updateEnforcerStatus(enforcer.enforcerId, nextStatus);
    loadEnforcers(pagination.page, search, showArchived);
  }

  async function handleToggleSuspend(enforcer) {
    if (enforcer.status === 'suspended') {
      return handleStatusChange(enforcer, 'active', `Reinstate Officer ${enforcer.lastName}?`);
    }
    return handleStatusChange(enforcer, 'suspended', `Suspend Officer ${enforcer.lastName}? They will be unable to log in.`);
  }

  async function handleToggleLeave(enforcer) {
    if (enforcer.status === 'on_leave') {
      return handleStatusChange(enforcer, 'active', `Mark Officer ${enforcer.lastName} back Active?`);
    }
    return handleStatusChange(enforcer, 'on_leave', `Mark Officer ${enforcer.lastName} On Leave? Record is kept.`);
  }

  async function handleArchive(enforcer) {
    if (enforcer.status === 'archived') {
      return handleStatusChange(enforcer, 'active', `Restore Officer ${enforcer.lastName} to Active?`);
    }
    return handleStatusChange(enforcer, 'archived', `Archive Officer ${enforcer.lastName}? They will be hidden by default but the record is kept for transparency.`);
  }

  return (
    <DashboardLayout title="Enforcer Management">
      <div className="page-header-row">
        <div>
          <h1 className="page-heading">Enforcer Management</h1>
          <p className="page-subheading">Manage CTMO personnel and monitor their activity.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + Add Enforcer
        </button>
      </div>

      <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <input
          className="search-bar"
          placeholder="Search by name, badge, employee ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => { setShowArchived(e.target.checked); loadEnforcers(1, search, e.target.checked); }}
          />
          Show archived
        </label>
      </form>

      <div className="card">
        {isLoading ? (
          <div style={{ padding: 24 }}>Loading…</div>
        ) : loadError ? (
          <div className="error-text" style={{ padding: 24 }}>
            {loadError}
          </div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Enforcer</th>
                  <th>Badge Number</th>
                  <th>Station</th>
                  <th>Contact</th>
                  <th>Citations Issued</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {enforcers.map((enforcer) => (
                  <tr key={enforcer.enforcerId} style={enforcer.status === 'archived' ? { opacity: 0.6 } : undefined}>
                    <td>
                      Officer {enforcer.firstName} {enforcer.lastName}
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        ID: {enforcer.employeeId}
                      </div>
                    </td>
                    <td>{enforcer.badgeNumber || '—'}</td>
                    <td>{enforcer.station}</td>
                    <td style={{ fontSize: 12 }}>{enforcer.contactNumber || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{enforcer.citationsIssued}</td>
                    <td>
                      <span className={`status-pill status-${enforcer.status}`}>
                        {STATUS_LABELS[enforcer.status]}
                      </span>
                    </td>
                    <td>
                      <button className="icon-btn" title="View Details" onClick={() => setSelectedEnforcer(enforcer)}>
                        👁
                      </button>
                      <button className="icon-btn" title="Edit" onClick={() => setEditingEnforcer(enforcer)}>
                        ✏️
                      </button>
                      <button
                        className="icon-btn"
                        title={enforcer.status === 'on_leave' ? 'Mark Active' : 'Mark On Leave'}
                        onClick={() => handleToggleLeave(enforcer)}
                      >
                        {enforcer.status === 'on_leave' ? '✅' : '🏖️'}
                      </button>
                      <button
                        className="icon-btn"
                        title="Suspend/Reinstate"
                        onClick={() => handleToggleSuspend(enforcer)}
                      >
                        {enforcer.status === 'suspended' ? '✅' : '🚫'}
                      </button>
                      <button
                        className="icon-btn"
                        title={enforcer.status === 'archived' ? 'Restore' : 'Archive (keeps record)'}
                        onClick={() => handleArchive(enforcer)}
                      >
                        {enforcer.status === 'archived' ? '♻️' : '📦'}
                      </button>
                    </td>
                  </tr>
                ))}
                {enforcers.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>
                      No enforcers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="pagination">
              <span>
                Showing page {pagination.page} of {pagination.totalPages || 1} ({pagination.total} results)
              </span>
              <button disabled={pagination.page <= 1} onClick={() => loadEnforcers(pagination.page - 1)}>
                Previous
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadEnforcers(pagination.page + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>

      {showAddModal && (
        <AddEnforcerModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            loadEnforcers(1);
          }}
        />
      )}

      {editingEnforcer && (
        <EditEnforcerModal
          enforcer={editingEnforcer}
          onClose={() => setEditingEnforcer(null)}
          onSaved={() => {
            setEditingEnforcer(null);
            loadEnforcers(pagination.page);
          }}
        />
      )}

      {selectedEnforcer && (
        <EnforcerDetailModal enforcer={selectedEnforcer} onClose={() => setSelectedEnforcer(null)} />
      )}
    </DashboardLayout>
  );
}

function AddEnforcerModal({ onClose, onCreated }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [station, setStation] = useState('Cordova Station');
  const [address, setAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdCreds, setCreatedCreds] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage('');

    if (!firstName.trim() || !lastName.trim() || !employeeId.trim()) {
      setErrorMessage('First name, last name, and Enforcer ID Number are all required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await createEnforcer({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        employeeId: employeeId.trim(),
        badgeNumber: badgeNumber.trim() || undefined,
        station: station.trim() || undefined,
        address: address.trim() || undefined,
        contactNumber: contactNumber.trim() || undefined,
      });
      // Show the generated username/temp password once, since there's no
      // other way for the admin to retrieve it later (it's not stored in plain text).
      setCreatedCreds({
        username: response.data.data.username,
        temporaryPassword: response.data.data.temporaryPassword,
      });
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Unable to create enforcer.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (createdCreds) {
    return (
      <Modal title="Enforcer Account Created" onClose={onCreated}>
        <p>Share these credentials with the enforcer directly — they won't be shown again:</p>
        <p>
          <strong>Username:</strong> {createdCreds.username}
          <br />
          <strong>Temporary Password:</strong> {createdCreds.temporaryPassword}
        </p>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onCreated}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Account Details" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>
              First Name<span className="required"> *</span>
            </label>
            <input placeholder="e.g. John" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>
              Last Name<span className="required"> *</span>
            </label>
            <input placeholder="e.g. Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>
            Enforcer ID Number<span className="required"> *</span>
          </label>
          <input placeholder="e.g. ENF-2024-001" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Badge Number</label>
            <input placeholder="e.g. B-4592" value={badgeNumber} onChange={(e) => setBadgeNumber(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Station</label>
            <input value={station} onChange={(e) => setStation(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>Address</label>
          <input placeholder="Home address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>

        <div className="form-group">
          <label>Contact Number</label>
          <input placeholder="e.g. 09171234567" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
        </div>

        {errorMessage ? <div className="error-text">{errorMessage}</div> : null}

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create Account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditEnforcerModal({ enforcer, onClose, onSaved }) {
  const [firstName, setFirstName] = useState(enforcer.firstName);
  const [lastName, setLastName] = useState(enforcer.lastName);
  const [badgeNumber, setBadgeNumber] = useState(enforcer.badgeNumber || '');
  const [station, setStation] = useState(enforcer.station || '');
  const [address, setAddress] = useState(enforcer.address || '');
  const [contactNumber, setContactNumber] = useState(enforcer.contactNumber || '');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage('');

    if (!firstName.trim() || !lastName.trim()) {
      setErrorMessage('First name and last name are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateEnforcer(enforcer.enforcerId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        badgeNumber: badgeNumber.trim() || null,
        station: station.trim() || null,
        address: address.trim() || null,
        contactNumber: contactNumber.trim() || null,
      });
      onSaved();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Unable to update enforcer.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={`Edit Enforcer — ${enforcer.employeeId}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>
              First Name<span className="required"> *</span>
            </label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>
              Last Name<span className="required"> *</span>
            </label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>Badge Number</label>
          <input placeholder="e.g. B-4592" value={badgeNumber} onChange={(e) => setBadgeNumber(e.target.value)} />
        </div>

        <div className="form-group">
          <label>Station</label>
          <input placeholder="e.g. Cordova Station" value={station} onChange={(e) => setStation(e.target.value)} />
        </div>

        <div className="form-group">
          <label>Address</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>

        <div className="form-group">
          <label>Contact Number</label>
          <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
        </div>

        {errorMessage ? <div className="error-text">{errorMessage}</div> : null}

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const STATUS_LABEL_MAP = { active: 'Active', on_leave: 'On Leave', suspended: 'Suspended', archived: 'Archived' };

function EnforcerDetailModal({ enforcer, onClose }) {
  const [resetResult, setResetResult] = useState(null);
  const [isResetting, setIsResetting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleResetPassword() {
    if (!window.confirm(`Reset the password for Officer ${enforcer.lastName}? Their current password will stop working immediately.`)) {
      return;
    }
    setErrorMessage('');
    setIsResetting(true);
    try {
      const response = await resetEnforcerPassword(enforcer.enforcerId);
      setResetResult(response.data.data);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Unable to reset password.');
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <Modal title={`Enforcer Details — ${enforcer.employeeId}`} onClose={onClose}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ margin: '4px 0' }}>
          <strong>Name:</strong> Officer {enforcer.firstName} {enforcer.lastName}
        </p>
        <p style={{ margin: '4px 0' }}>
          <strong>Username:</strong> {enforcer.username}
        </p>
        <p style={{ margin: '4px 0' }}>
          <strong>Employee ID:</strong> {enforcer.employeeId}
        </p>
        <p style={{ margin: '4px 0' }}>
          <strong>Badge Number:</strong> {enforcer.badgeNumber || '—'}
        </p>
        <p style={{ margin: '4px 0' }}>
          <strong>Station:</strong> {enforcer.station || '—'}
        </p>
        <p style={{ margin: '4px 0' }}>
          <strong>Address:</strong> {enforcer.address || '—'}
        </p>
        <p style={{ margin: '4px 0' }}>
          <strong>Contact Number:</strong> {enforcer.contactNumber || '—'}
        </p>
        <p style={{ margin: '4px 0' }}>
          <strong>Status:</strong>{' '}
          <span className={`status-pill status-${enforcer.status}`}>{STATUS_LABEL_MAP[enforcer.status]}</span>
        </p>
        <p style={{ margin: '4px 0' }}>
          <strong>Citations Issued:</strong> {enforcer.citationsIssued}
        </p>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <h4 style={{ marginTop: 0, marginBottom: 8 }}>Account Recovery</h4>
        {resetResult ? (
          <div style={{ background: '#EAF4EB', borderRadius: 8, padding: 12, fontSize: 13 }}>
            <p style={{ margin: 0 }}>Password reset. Share this with the enforcer directly — it won't be shown again:</p>
            <p style={{ margin: '8px 0 0' }}>
              <strong>Username:</strong> {resetResult.username}
              <br />
              <strong>New Temporary Password:</strong> {resetResult.temporaryPassword}
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0 }}>
              If this enforcer forgot their password, reset it here and share the new one with them directly.
            </p>
            {errorMessage ? <div className="error-text">{errorMessage}</div> : null}
            <button className="btn btn-secondary" onClick={handleResetPassword} disabled={isResetting}>
              {isResetting ? 'Resetting…' : '🔑 Reset Password'}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
