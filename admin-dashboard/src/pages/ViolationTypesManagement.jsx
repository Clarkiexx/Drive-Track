import React, { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import Modal, { ConfirmModal } from '../components/Modal';
import { toastSuccess, toastError } from '../components/Toast';
import {
  fetchViolationTypes,
  createViolationType,
  updateViolationType,
  updateViolationTypeStatus,
} from '../api/violationTypeApi';

const CATEGORY_LABELS = {
  moving: 'Moving',
  non_moving: 'Non-Moving',
};

function formatPeso(amount) {
  return `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export default function ViolationTypesManagement() {
  const [violationTypes, setViolationTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modalMode, setModalMode] = useState(null); // null | 'add' | editing violationType object
  const [tab, setTab] = useState('active'); // active | archived | all
  const [statusConfirm, setStatusConfirm] = useState(null);
  const [isStatusActing, setIsStatusActing] = useState(false);

  async function loadViolationTypes() {
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await fetchViolationTypes();
      setViolationTypes(response.data.data);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Unable to load violation types.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadViolationTypes();
  }, []);

  async function handleToggleActive(vt) {
    setStatusConfirm(vt);
  }

  async function confirmToggleActive() {
    const vt = statusConfirm;
    if (!vt) return;
    setIsStatusActing(true);
    try {
      await updateViolationTypeStatus(vt.violationTypeId, !vt.isActive);
      toastSuccess(vt.isActive ? 'Violation type archived.' : 'Violation type restored.');
      setStatusConfirm(null);
      await loadViolationTypes();
    } catch (err) {
      toastError(err.response?.data?.message || 'Unable to update violation type.');
    } finally {
      setIsStatusActing(false);
    }
  }

  const filtered = violationTypes.filter((vt) => {
    if (tab === 'active') return vt.isActive;
    if (tab === 'archived') return !vt.isActive;
    return true;
  });
  const activeCount = violationTypes.filter((v) => v.isActive).length;
  const archivedCount = violationTypes.filter((v) => !v.isActive).length;

  return (
    <DashboardLayout title="Violation Types Management">
      <div className="page-header-row">
        <div>
          <h1 className="page-heading">Violation Types Management</h1>
          <p className="page-subheading">
            Manage the master list of traffic violations and their standard penalties.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalMode('add')}>
          + Add Violation Type
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['active', `Active (${activeCount})`], ['archived', `Archived (${archivedCount})`], ['all', `All (${violationTypes.length})`]].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card">
        {isLoading ? (
          <div style={{ padding: 24 }}>Loading…</div>
        ) : loadError ? (
          <div className="error-text" style={{ padding: 24 }}>
            {loadError}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Article / Section</th>
                <th>Description</th>
                <th>Category</th>
                <th>Standard Penalty</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((vt) => (
                <tr key={vt.violationTypeId} style={{ opacity: vt.isActive ? 1 : 0.55 }}>
                  <td>{vt.articleSection}</td>
                  <td>{vt.description}</td>
                  <td>{CATEGORY_LABELS[vt.category]}</td>
                  <td>{formatPeso(vt.defaultPenalty)}</td>
                  <td>
                    <span className={`status-pill status-${vt.isActive ? 'active' : 'archived'}`}>
                      {vt.isActive ? 'Active' : 'Archived'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setModalMode(vt)}>
                        Edit
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={vt.isActive ? { padding: '6px 12px', color: 'var(--danger)' } : { padding: '6px 12px' }}
                        onClick={() => handleToggleActive(vt)}
                      >
                        {vt.isActive ? 'Archive' : 'Restore'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>
                    {tab === 'archived' ? 'No archived violation types. Archived items are kept here for transparency.' : 'No violation types yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modalMode && (
        <ViolationTypeModal
          existing={modalMode === 'add' ? null : modalMode}
          onClose={() => setModalMode(null)}
          onSaved={() => {
            setModalMode(null);
            loadViolationTypes();
          }}
        />
      )}

      {statusConfirm && (
        <ConfirmModal
          title={statusConfirm.isActive ? `Archive "${statusConfirm.description}"?` : `Restore "${statusConfirm.description}" to Active?`}
          message={
            statusConfirm.isActive
              ? 'It will be hidden from enforcers for new citations, but past citations are kept for transparency.'
              : 'It will be available to enforcers for new citations again.'
          }
          confirmLabel={statusConfirm.isActive ? 'Archive' : 'Restore'}
          isWorking={isStatusActing}
          onClose={() => setStatusConfirm(null)}
          onConfirm={confirmToggleActive}
        />
      )}
    </DashboardLayout>
  );
}

function ViolationTypeModal({ existing, onClose, onSaved }) {
  const isEdit = Boolean(existing);
  const [articleSection, setArticleSection] = useState(existing?.articleSection || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [category, setCategory] = useState(existing?.category || 'moving');
  const [defaultPenalty, setDefaultPenalty] = useState(existing?.defaultPenalty || '');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage('');

    if (!articleSection.trim() || !description.trim() || !defaultPenalty) {
      setErrorMessage('All fields are required.');
      return;
    }
    if (Number(defaultPenalty) < 0) {
      setErrorMessage('Penalty must be a positive number.');
      return;
    }

    const payload = {
      articleSection: articleSection.trim(),
      description: description.trim(),
      category,
      defaultPenalty: Number(defaultPenalty),
    };

    setIsSubmitting(true);
    try {
      if (isEdit) {
        await updateViolationType(existing.violationTypeId, payload);
      } else {
        await createViolationType(payload);
      }
      onSaved();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Unable to save violation type.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? 'Edit Violation Type' : 'Add Violation Type'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>
            Article / Section<span className="required"> *</span>
          </label>
          <input
            placeholder="e.g. Art III, Sec 11-17"
            value={articleSection}
            onChange={(e) => setArticleSection(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>
            Description<span className="required"> *</span>
          </label>
          <input
            placeholder="e.g. Disobedience of Traffic Control Signs/Signals"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>
              Category<span className="required"> *</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
            >
              <option value="moving">Moving</option>
              <option value="non_moving">Non-Moving</option>
            </select>
          </div>
          <div className="form-group">
            <label>
              Standard Penalty (₱)<span className="required"> *</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 1000"
              value={defaultPenalty}
              onChange={(e) => setDefaultPenalty(e.target.value)}
            />
          </div>
        </div>

        {isEdit && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Note: changing the penalty only affects citations issued after this change. Citations
            already issued keep the amount they were given at the time.
          </p>
        )}

        {errorMessage ? <div className="error-text">{errorMessage}</div> : null}

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
