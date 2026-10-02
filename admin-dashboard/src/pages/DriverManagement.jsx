import React, { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import Modal, { ConfirmModal } from '../components/Modal';
import { toastSuccess, toastError } from '../components/Toast';
import { fetchDrivers, createDriver, updateDriver, updateDriverStatus, fetchDriverCitations } from '../api/driverApi';
import { fetchProtectedImageUrl } from '../api/media';
import { useAuth } from '../context/AuthContext';

const STATUS_LABELS = {
  verified: 'Verified',
  pending: 'Pending',
  flagged: 'Flagged',
  revoked: 'Revoked',
  suspended: 'Suspended',
};

function initials(firstName, lastName) {
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
}

export default function DriverManagement() {
  const [drivers, setDrivers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [editingDriver, setEditingDriver] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isBulkActing, setIsBulkActing] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState(null); // { driver, mode } mode: verify|flag|flaggedChoice|reinstate
  const [statusReason, setStatusReason] = useState('');
  const [isStatusActing, setIsStatusActing] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(null); // newStatus
  const [openMenuId, setOpenMenuId] = useState(null);

  useEffect(() => {
    if (openMenuId === null) return;
    function handlePointerDown(e) {
      if (!e.target.closest?.('.row-actions')) setOpenMenuId(null);
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpenMenuId(null);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuId]);

  async function loadDrivers(page = 1, searchValue = search, statusValue = statusFilter) {
    setIsLoading(true);
    setLoadError('');
    setSelectedIds([]);
    try {
      const response = await fetchDrivers({ search: searchValue, status: statusValue, page });
      setDrivers(response.data.data.drivers);
      setPagination(response.data.data.pagination);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Unable to load drivers.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDrivers(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearchSubmit(e) {
    e.preventDefault();
    loadDrivers(1, search, statusFilter);
  }

  function handleStatusFilterChange(e) {
    const value = e.target.value;
    setStatusFilter(value);
    loadDrivers(1, search, value);
  }

  /**
   * Status-aware action: pending → verify, verified → flag,
   * flagged → revoke (with reason) or reinstate, revoked/suspended → reinstate.
   * No hard delete — flagged/revoked records stay for transparency.
   * Confirmation uses in-app modals (no window.confirm/prompt).
   */
  function handleStatusAction(driver) {
    setStatusReason('');
    if (driver.verificationStatus === 'pending') {
      setStatusConfirm({ driver, mode: 'verify' });
    } else if (driver.verificationStatus === 'verified') {
      setStatusConfirm({ driver, mode: 'flag' });
    } else if (driver.verificationStatus === 'flagged') {
      setStatusConfirm({ driver, mode: 'flaggedChoice' });
    } else {
      setStatusConfirm({ driver, mode: 'reinstate' });
    }
  }

  async function confirmStatusAction(nextStatus, reason) {
    const driver = statusConfirm?.driver;
    if (!driver) return;
    setIsStatusActing(true);
    try {
      await updateDriverStatus(driver.driverId, nextStatus, reason || undefined);
      toastSuccess(`Driver ${nextStatus}.`);
      setStatusConfirm(null);
      setStatusReason('');
      await loadDrivers(pagination.page);
    } catch (err) {
      toastError(err.response?.data?.message || 'Unable to update driver status.');
    } finally {
      setIsStatusActing(false);
    }
  }

  function actionTitleFor(status) {
    if (status === 'pending') return 'Verify';
    if (status === 'verified') return 'Flag Account';
    if (status === 'flagged') return 'Review Flag';
    return 'Reinstate to Verified';
  }

  function toggleSelect(driverId) {
    setSelectedIds((prev) =>
      prev.includes(driverId) ? prev.filter((id) => id !== driverId) : [...prev, driverId]
    );
  }

  function toggleSelectAll() {
    if (selectedIds.length === drivers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(drivers.map((d) => d.driverId));
    }
  }

  async function handleBulkStatusChange(newStatus) {
    setBulkConfirm(newStatus);
  }

  async function confirmBulkStatusChange() {
    const newStatus = bulkConfirm;
    if (!newStatus) return;
    const label = newStatus === 'verified' ? 'Verify' : newStatus === 'flagged' ? 'Flag' : 'Revoke';

    setIsBulkActing(true);
    try {
      // Sequential, not Promise.all — keeps this gentle on the backend and
      // matches the pace of a real admin working through a small batch,
      // rather than firing dozens of simultaneous requests at once.
      for (const driverId of selectedIds) {
        // eslint-disable-next-line no-await-in-loop
        await updateDriverStatus(driverId, newStatus);
      }
      toastSuccess(`${label}d ${selectedIds.length} driver(s).`);
      setBulkConfirm(null);
      await loadDrivers(pagination.page);
    } catch (err) {
      toastError(err.response?.data?.message || 'Some updates may not have completed. Please review the list.');
      await loadDrivers(pagination.page);
    } finally {
      setIsBulkActing(false);
    }
  }

  return (
    <DashboardLayout title="Driver Management">
      <div className="page-header-row">
        <div>
          <h1 className="page-heading">Driver Management</h1>
          <p className="page-subheading">Manage registered drivers and their records.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + Add Driver
        </button>
      </div>

      <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 12 }}>
        <input
          className="search-bar"
          placeholder="Search by name or license number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <select
          className="search-bar"
          style={{ width: 180, flex: 'none' }}
          value={statusFilter}
          onChange={handleStatusFilterChange}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="flagged">Flagged</option>
          <option value="revoked">Revoked</option>
        </select>
      </form>

      {selectedIds.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: '#EAF4EB',
            border: '1px solid var(--primary)',
            borderRadius: 8,
            padding: '10px 16px',
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedIds.length} selected</span>
          <button className="btn btn-primary" disabled={isBulkActing} onClick={() => handleBulkStatusChange('verified')}>
            Verify Selected
          </button>
          <button className="btn btn-secondary" disabled={isBulkActing} onClick={() => handleBulkStatusChange('flagged')}>
            Flag Selected
          </button>
          <button className="btn btn-secondary" disabled={isBulkActing} onClick={() => handleBulkStatusChange('revoked')}>
            Revoke Selected
          </button>
          {isBulkActing && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Working…</span>}
        </div>
      )}

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
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      checked={drivers.length > 0 && selectedIds.length === drivers.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>Driver Name</th>
                  <th>License Number</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Total Violations</th>
                  <th style={{ textAlign: 'center' }}>Unsettled</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver) => (
                  <tr key={driver.driverId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(driver.driverId)}
                        onChange={() => toggleSelect(driver.driverId)}
                      />
                    </td>
                    <td>
                      <span className="avatar-badge">{initials(driver.firstName, driver.lastName)}</span>
                      {driver.firstName} {driver.lastName}
                    </td>
                    <td>{driver.licenseNumber}</td>
                    <td>
                      <span className={`status-pill status-${driver.verificationStatus}`}>
                        {STATUS_LABELS[driver.verificationStatus]}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>{driver.totalViolations}</td>
                    <td style={{ textAlign: 'center' }}>
                      {driver.unsettledViolations === 0 ? (
                        <span className="status-pill status-active">Clear</span>
                      ) : (
                        <span className="status-pill status-suspended">{driver.unsettledViolations} Unsettled</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setSelectedDriver(driver)}>
                          View
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setEditingDriver(driver)}>
                          Edit
                        </button>
                        <div className="row-actions">
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '6px 12px' }}
                            aria-haspopup="menu"
                            aria-expanded={openMenuId === driver.driverId}
                            onClick={() => setOpenMenuId(openMenuId === driver.driverId ? null : driver.driverId)}
                          >
                            More ▾
                          </button>
                          {openMenuId === driver.driverId && (
                            <div className="row-actions-menu" role="menu">
                              <button
                                role="menuitem"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  handleStatusAction(driver);
                                }}
                              >
                                {actionTitleFor(driver.verificationStatus)}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                {drivers.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>
                      No drivers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="pagination">
              <span>
                Showing page {pagination.page} of {pagination.totalPages || 1} ({pagination.total} results)
              </span>
              <button disabled={pagination.page <= 1} onClick={() => loadDrivers(pagination.page - 1)}>
                Previous
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadDrivers(pagination.page + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>

      {showAddModal && (
        <AddDriverModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            loadDrivers(1);
          }}
        />
      )}

      {selectedDriver && (
        <DriverDetailModal driver={selectedDriver} onClose={() => setSelectedDriver(null)} />
      )}

      {editingDriver && (
        <EditDriverModal
          driver={editingDriver}
          onClose={() => setEditingDriver(null)}
          onSaved={() => {
            setEditingDriver(null);
            loadDrivers(pagination.page);
          }}
        />
      )}

      {statusConfirm?.mode === 'verify' && (
        <ConfirmModal
          title={`Verify ${statusConfirm.driver.firstName} ${statusConfirm.driver.lastName}?`}
          message="This confirms their license/details are legitimate."
          confirmLabel="Verify"
          isWorking={isStatusActing}
          onClose={() => setStatusConfirm(null)}
          onConfirm={() => confirmStatusAction('verified')}
        />
      )}

      {statusConfirm?.mode === 'reinstate' && (
        <ConfirmModal
          title={`Reinstate ${statusConfirm.driver.firstName} ${statusConfirm.driver.lastName} to Verified?`}
          message="The driver record stays for transparency."
          confirmLabel="Reinstate"
          isWorking={isStatusActing}
          onClose={() => setStatusConfirm(null)}
          onConfirm={() => confirmStatusAction('verified')}
        />
      )}

      {statusConfirm?.mode === 'flag' && (
        <Modal title={`Flag ${statusConfirm.driver.firstName} ${statusConfirm.driver.lastName}?`} onClose={() => setStatusConfirm(null)}>
          <div className="form-group">
            <label>Reason (optional)</label>
            <input placeholder="e.g. License needs re-check" value={statusReason} onChange={(e) => setStatusReason(e.target.value)} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setStatusConfirm(null)} disabled={isStatusActing}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={() => confirmStatusAction('flagged', statusReason.trim() || undefined)} disabled={isStatusActing}>
              {isStatusActing ? 'Working…' : 'Flag Account'}
            </button>
          </div>
        </Modal>
      )}

      {statusConfirm?.mode === 'flaggedChoice' && (
        <Modal title={`${statusConfirm.driver.firstName} ${statusConfirm.driver.lastName} is flagged`} onClose={() => setStatusConfirm(null)}>
          <p style={{ fontSize: 14, marginTop: 0 }}>Revoke permanently, or reinstate to Verified? The record is kept either way.</p>
          <div className="form-group">
            <label>Revocation reason (optional, used only when revoking)</label>
            <input placeholder="e.g. Fraudulent license" value={statusReason} onChange={(e) => setStatusReason(e.target.value)} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => confirmStatusAction('verified')} disabled={isStatusActing}>
              {isStatusActing ? 'Working…' : 'Reinstate'}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => confirmStatusAction('revoked', statusReason.trim() || undefined)} disabled={isStatusActing}>
              {isStatusActing ? 'Working…' : 'Revoke'}
            </button>
          </div>
        </Modal>
      )}

      {bulkConfirm && (
        <ConfirmModal
          title={`${bulkConfirm === 'verified' ? 'Verify' : bulkConfirm === 'flagged' ? 'Flag' : 'Revoke'} ${selectedIds.length} selected driver(s)?`}
          message="Records are kept for transparency — no hard delete."
          confirmLabel={bulkConfirm === 'verified' ? 'Verify Selected' : bulkConfirm === 'flagged' ? 'Flag Selected' : 'Revoke Selected'}
          isWorking={isBulkActing}
          onClose={() => setBulkConfirm(null)}
          onConfirm={confirmBulkStatusChange}
        />
      )}
    </DashboardLayout>
  );
}

function AddDriverModal({ onClose, onCreated }) {
  const [firstName, setFirstName] = useState('');
  const [middleInitial, setMiddleInitial] = useState('');
  const [lastName, setLastName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [address, setAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [nationality, setNationality] = useState('PHL');
  const [sex, setSex] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [heightM, setHeightM] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [agencyCode, setAgencyCode] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [eyeColor, setEyeColor] = useState('');
  const [dlCodes, setDlCodes] = useState('');
  const [condition, setCondition] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage('');

    if (!firstName.trim() || !lastName.trim() || !licenseNumber.trim()) {
      setErrorMessage('First name, last name, and license number are all required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const clean = (v) => (v && String(v).trim() ? String(v).trim() : undefined);
      await createDriver({
        firstName: firstName.trim(),
        middleInitial: middleInitial.trim() || undefined,
        lastName: lastName.trim(),
        licenseNumber: licenseNumber.trim(),
        address: clean(address),
        contactNumber: clean(contactNumber),
        nationality: clean(nationality) || 'PHL',
        sex: clean(sex),
        dateOfBirth: clean(dateOfBirth),
        weightKg: clean(weightKg),
        heightM: clean(heightM),
        expirationDate: clean(expirationDate),
        agencyCode: clean(agencyCode),
        bloodType: clean(bloodType),
        eyeColor: clean(eyeColor),
        dlCodes: clean(dlCodes),
        condition: clean(condition),
      });
      onCreated();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Unable to create driver.');
    } finally {
      setIsSubmitting(false);
    }
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
          <div className="form-group" style={{ maxWidth: 90 }}>
            <label>M.I.</label>
            <input placeholder="M" value={middleInitial} onChange={(e) => setMiddleInitial(e.target.value)} maxLength={5} />
          </div>
          <div className="form-group">
            <label>
              Last Name<span className="required"> *</span>
            </label>
            <input placeholder="e.g. Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Nationality</label>
            <input placeholder="PHL" value={nationality} onChange={(e) => setNationality(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Sex</label>
            <select value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="">—</option>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </div>
          <div className="form-group">
            <label>Date of Birth</label>
            <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Weight (kg)</label>
            <input placeholder="59" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Height (m)</label>
            <input placeholder="1.53" value={heightM} onChange={(e) => setHeightM(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Blood Type</label>
            <input placeholder="-" value={bloodType} onChange={(e) => setBloodType(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>
            Driver's License Number<span className="required"> *</span>
          </label>
          <input
            placeholder="e.g. G-75-45-571924"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Expiration Date</label>
            <input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Agency Code</label>
            <input placeholder="G33" value={agencyCode} onChange={(e) => setAgencyCode(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Eyes Color</label>
            <input placeholder="Black" value={eyeColor} onChange={(e) => setEyeColor(e.target.value)} />
          </div>
          <div className="form-group">
            <label>DL Codes</label>
            <input placeholder="A, B, B1, B2" value={dlCodes} onChange={(e) => setDlCodes(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Condition</label>
            <input placeholder="None" value={condition} onChange={(e) => setCondition(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>Address</label>
          <input
            placeholder="e.g. Purok Kokomama, Pilipog, Cordova, Cebu 6017"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Contact Number</label>
          <input
            placeholder="e.g. 09171234567"
            value={contactNumber}
            onChange={(e) => setContactNumber(e.target.value)}
          />
        </div>

        {errorMessage ? <div className="error-text">{errorMessage}</div> : null}

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Reset Form
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create Account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditDriverModal({ driver, onClose, onSaved }) {
  const [firstName, setFirstName] = useState(driver.firstName || '');
  const [middleInitial, setMiddleInitial] = useState(driver.middleInitial || '');
  const [lastName, setLastName] = useState(driver.lastName || '');
  const [address, setAddress] = useState(driver.address || '');
  const [contactNumber, setContactNumber] = useState(driver.contactNumber || '');
  const [nationality, setNationality] = useState(driver.nationality || 'PHL');
  const [sex, setSex] = useState(driver.sex || '');
  const [dateOfBirth, setDateOfBirth] = useState(driver.dateOfBirth || '');
  const [weightKg, setWeightKg] = useState(driver.weightKg || '');
  const [heightM, setHeightM] = useState(driver.heightM || '');
  const [expirationDate, setExpirationDate] = useState(driver.expirationDate || '');
  const [agencyCode, setAgencyCode] = useState(driver.agencyCode || '');
  const [bloodType, setBloodType] = useState(driver.bloodType || '');
  const [eyeColor, setEyeColor] = useState(driver.eyeColor || '');
  const [dlCodes, setDlCodes] = useState(driver.dlCodes || '');
  const [condition, setCondition] = useState(driver.condition || '');
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
      const clean = (v) => (v && String(v).trim() ? String(v).trim() : null);
      // License number is immutable here by design (PATCH /drivers/:id).
      await updateDriver(driver.driverId, {
        firstName: firstName.trim(),
        middleInitial: middleInitial.trim() || null,
        lastName: lastName.trim(),
        address: clean(address),
        contactNumber: clean(contactNumber),
        nationality: clean(nationality),
        sex: clean(sex),
        dateOfBirth: clean(dateOfBirth),
        weightKg: clean(weightKg),
        heightM: clean(heightM),
        expirationDate: clean(expirationDate),
        agencyCode: clean(agencyCode),
        bloodType: clean(bloodType),
        eyeColor: clean(eyeColor),
        dlCodes: clean(dlCodes),
        condition: clean(condition),
      });
      onSaved();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Unable to update driver.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={`Edit Driver: ${driver.firstName} ${driver.lastName}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>First Name<span className="required"> *</span></label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="form-group" style={{ maxWidth: 90 }}>
            <label>M.I.</label>
            <input value={middleInitial} onChange={(e) => setMiddleInitial(e.target.value)} maxLength={5} />
          </div>
          <div className="form-group">
            <label>Last Name<span className="required"> *</span></label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>License Number (cannot be changed here)</label>
          <input value={driver.licenseNumber} disabled />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Nationality</label>
            <input value={nationality} onChange={(e) => setNationality(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Sex</label>
            <select value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="">—</option>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </div>
          <div className="form-group">
            <label>Date of Birth</label>
            <input type="date" value={dateOfBirth || ''} onChange={(e) => setDateOfBirth(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Weight (kg)</label>
            <input value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Height (m)</label>
            <input value={heightM} onChange={(e) => setHeightM(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Blood Type</label>
            <input value={bloodType} onChange={(e) => setBloodType(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Expiration Date</label>
            <input type="date" value={expirationDate || ''} onChange={(e) => setExpirationDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Agency Code</label>
            <input value={agencyCode} onChange={(e) => setAgencyCode(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Eyes Color</label>
            <input value={eyeColor} onChange={(e) => setEyeColor(e.target.value)} />
          </div>
          <div className="form-group">
            <label>DL Codes</label>
            <input value={dlCodes} onChange={(e) => setDlCodes(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Condition</label>
            <input value={condition} onChange={(e) => setCondition(e.target.value)} />
          </div>
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

function DriverDetailModal({ driver, onClose }) {
  const { token } = useAuth();
  const [citations, setCitations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [licensePhotoUrl, setLicensePhotoUrl] = useState('');
  const [licensePhotoError, setLicensePhotoError] = useState('');

  useEffect(() => {
    if (!driver.licensePhotoPath) return;
    let objectUrl = '';
    let cancelled = false;
    setLicensePhotoUrl('');
    setLicensePhotoError('');
    // License photos are served only to authenticated admins — fetch with
    // the JWT (in the header, never in the URL) and render a blob URL,
    // since a plain <img> cannot attach an Authorization header.
    fetchProtectedImageUrl(driver.licensePhotoPath, token)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setLicensePhotoUrl(url);
      })
      .catch(() => {
        if (!cancelled) setLicensePhotoError('Unable to load license photo.');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [driver.licensePhotoPath, token]);

  useEffect(() => {
    fetchDriverCitations(driver.driverId)
      .then((res) => setCitations(res.data.data))
      .catch((err) => setErrorMessage(err.response?.data?.message || 'Unable to load violation history.'))
      .finally(() => setIsLoading(false));
  }, [driver.driverId]);

  return (
    <Modal title={`Driver Record: ${driver.firstName} ${driver.lastName}`} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', marginBottom: 16, fontSize: 13 }}>
        <p style={{ margin: '2px 0' }}><strong>Last Name:</strong> {driver.lastName || '—'}</p>
        <p style={{ margin: '2px 0' }}><strong>First Name:</strong> {driver.firstName || '—'}</p>
        <p style={{ margin: '2px 0' }}><strong>Middle Name:</strong> {driver.middleInitial || '—'}</p>
        <p style={{ margin: '2px 0' }}><strong>Nationality:</strong> {driver.nationality || 'PHL'}</p>
        <p style={{ margin: '2px 0' }}><strong>Sex:</strong> {driver.sex || '—'}</p>
        <p style={{ margin: '2px 0' }}><strong>Date of Birth:</strong> {driver.dateOfBirth || '—'}</p>
        <p style={{ margin: '2px 0' }}><strong>Weight (kg):</strong> {driver.weightKg || '—'}</p>
        <p style={{ margin: '2px 0' }}><strong>Height (m):</strong> {driver.heightM || '—'}</p>
        <p style={{ margin: '2px 0', gridColumn: '1 / -1' }}><strong>Address:</strong> {driver.address || '—'}</p>
        <p style={{ margin: '2px 0' }}><strong>Contact:</strong> {driver.contactNumber || '—'}</p>
        <p style={{ margin: '2px 0' }}><strong>License No.:</strong> {driver.licenseNumber}</p>
        <p style={{ margin: '2px 0' }}><strong>Expiration Date:</strong> {driver.expirationDate || '—'}</p>
        <p style={{ margin: '2px 0' }}><strong>Agency Code:</strong> {driver.agencyCode || '—'}</p>
        <p style={{ margin: '2px 0' }}><strong>Blood Type:</strong> {driver.bloodType || '—'}</p>
        <p style={{ margin: '2px 0' }}><strong>Eyes Color:</strong> {driver.eyeColor || '—'}</p>
        <p style={{ margin: '2px 0' }}><strong>DL Codes:</strong> {driver.dlCodes || '—'}</p>
        <p style={{ margin: '2px 0' }}><strong>Condition:</strong> {driver.condition || 'None'}</p>
        <p style={{ margin: '2px 0' }}>
          <strong>Status:</strong>{' '}
          <span className={`status-pill status-${driver.verificationStatus}`}>{STATUS_LABELS[driver.verificationStatus] || driver.verificationStatus}</span>
        </p>
        {driver.statusReason && (
          <p style={{ margin: '2px 0', gridColumn: '1 / -1' }}><strong>Reason:</strong> {driver.statusReason}</p>
        )}
      </div>

      {driver.licensePhotoPath ? (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ marginBottom: 8 }}>License Photo</h4>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 0, marginBottom: 8 }}>
            Captured by the enforcer at the time this record was created — use this to confirm the details above before verifying.
          </p>
          {licensePhotoError ? (
            <p className="error-text">{licensePhotoError}</p>
          ) : licensePhotoUrl ? (
            <img
              src={licensePhotoUrl}
              alt="Driver's license"
              style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8, border: '1px solid var(--border)' }}
            />
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading license photo…</p>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>No license photo on file.</p>
      )}

      <h4 style={{ marginBottom: 8 }}>Violation History ({citations.length})</h4>

      {isLoading ? (
        <p>Loading…</p>
      ) : errorMessage ? (
        <p className="error-text">{errorMessage}</p>
      ) : citations.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No violations on record.</p>
      ) : (
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {citations.map((c) => (
            <div
              key={c.citationId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.citationNumber}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {c.violations?.[0]?.violationType?.description || c.otherViolation || 'Violation'}
                  {c.violations?.length > 1 ? ` +${c.violations.length - 1} more` : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {new Date(c.occurredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {c.placeOfViolation}
                </div>
              </div>
              <span className={`status-pill status-${c.settlementStatus === 'settled' ? 'active' : c.settlementStatus === 'cancelled' ? 'on_leave' : 'suspended'}`}>
                {c.settlementStatus === 'pending' ? 'Unsettled' : c.settlementStatus}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
