import React, { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import { fetchCitations, fetchCitation, verifyCitation, overrideFineAmount, settleCitation, cancelCitation, resolveProtest } from '../api/citationApi';
import { getMediaUrl } from '../api/media';

const STATUS_LABELS = {
  pending: 'Unsettled',
  settled: 'Settled',
  cancelled: 'Cancelled',
  warning_only: 'Warning',
};
const STATUS_CLASS = {
  pending: 'suspended',
  settled: 'active',
  cancelled: 'on_leave',
  warning_only: 'pending',
};

function violationSummary(citation) {
  const lines = (citation.violations || []).map((v) => v.violationType?.description).filter(Boolean);
  if (lines.length === 0) return citation.otherViolation || '—';
  if (lines.length === 1) return lines[0];
  return `${lines[0]} +${lines.length - 1} more`;
}

export default function ViolationMonitoring() {
  const [citations, setCitations] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // all | pending | settled | protest | cancelled | warning
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedCitationId, setSelectedCitationId] = useState(null);

  function paramsForTab(tab) {
    if (tab === 'pending') return { status: 'pending', underProtest: '' };
    if (tab === 'settled') return { status: 'settled', underProtest: '' };
    if (tab === 'protest') return { status: '', underProtest: 'true' };
    if (tab === 'cancelled') return { status: 'cancelled', underProtest: '' };
    if (tab === 'warning') return { status: 'warning_only', underProtest: '' };
    return { status: '', underProtest: '' };
  }

  async function load(page = 1, searchValue = search, tab = activeTab) {
    setIsLoading(true);
    setLoadError('');
    try {
      const { status, underProtest } = paramsForTab(tab);
      const response = await fetchCitations({
        search: searchValue,
        status,
        underProtest,
        page,
      });
      setCitations(response.data.data.citations);
      setPagination(response.data.data.pagination);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Unable to load citations.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearchSubmit(e) {
    e.preventDefault();
    load(1, search, activeTab);
  }

  function handleTabChange(tab) {
    setActiveTab(tab);
    load(1, search, tab);
  }

  const TABS = [
    ['all', 'All'],
    ['pending', 'Unsettled'],
    ['settled', 'Settled'],
    ['protest', '⚠️ Under Protest'],
    ['cancelled', 'Cancelled'],
    ['warning', 'Warnings'],
  ];

  return (
    <DashboardLayout title="Violation Monitoring">
      <h1 className="page-heading">Violation Monitoring</h1>
      <p className="page-subheading">Review submitted citations and photo evidence.</p>

      <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
        <input
          className="search-bar"
          style={{ flex: 1, marginBottom: 0 }}
          placeholder="Search citation number or driver..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn btn-secondary">Search</button>
      </form>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(([key, label]) => (
          <button
            key={key}
            className={activeTab === key ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => handleTabChange(key)}
          >
            {label}
          </button>
        ))}
      </div>

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
                  <th>Citation No.</th>
                  <th>Driver</th>
                  <th>Enforcer</th>
                  <th>Date & Time</th>
                  <th>Violation</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {citations.map((c) => (
                  <tr key={c.citationId}>
                    <td style={{ color: 'var(--primary)', fontWeight: 600 }}>{c.citationNumber}</td>
                    <td>{c.Driver?.firstName} {c.Driver?.lastName}</td>
                    <td>Officer {c.Enforcer?.lastName}</td>
                    <td>{new Date(c.occurredAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                    <td>{violationSummary(c)}</td>
                    <td>
                      <span className={`status-pill status-${STATUS_CLASS[c.settlementStatus]}`}>
                        {STATUS_LABELS[c.settlementStatus]}
                      </span>
                      {c.verified && <span title="Verified" style={{ marginLeft: 6 }}>✅</span>}
                      {c.driverUnderProtest && <span title="Driver marked this citation as under protest" style={{ marginLeft: 6 }}>⚠️</span>}
                    </td>
                    <td>
                      <button className="btn btn-secondary" onClick={() => setSelectedCitationId(c.citationId)}>👁 View</button>
                    </td>
                  </tr>
                ))}
                {citations.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>No citations found.</td></tr>
                )}
              </tbody>
            </table>

            <div className="pagination">
              <span>Showing page {pagination.page} of {pagination.totalPages || 1} ({pagination.total} results)</span>
              <button disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>Previous</button>
              <button disabled={pagination.page >= pagination.totalPages} onClick={() => load(pagination.page + 1)}>Next</button>
            </div>
          </>
        )}
      </div>

      {selectedCitationId && (
        <CitationDetailModal
          citationId={selectedCitationId}
          onClose={() => setSelectedCitationId(null)}
          onChanged={() => {
            setSelectedCitationId(null);
            load(pagination.page);
          }}
        />
      )}
    </DashboardLayout>
  );
}

function CitationDetailModal({ citationId, onClose, onChanged }) {
  const [citation, setCitation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [enlargedPhoto, setEnlargedPhoto] = useState(null);

  function load() {
    setIsLoading(true);
    fetchCitation(citationId)
      .then((res) => setCitation(res.data.data))
      .catch((err) => setErrorMessage(err.response?.data?.message || 'Unable to load citation.'))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citationId]);

  async function handleVerify() {
    await verifyCitation(citationId);
    onChanged();
  }

  async function handleSettle() {
    if (!window.confirm('Mark this citation as settled? Use this once the fine has actually been paid (e.g. the driver settled it in person).')) return;
    await settleCitation(citationId);
    onChanged();
  }

  async function handleCancel() {
    if (!window.confirm('Cancel this citation? This should only be done if it was issued in error.')) return;
    await cancelCitation(citationId);
    onChanged();
  }

  async function handleProtest(action) {
    const msg = action === 'dismiss'
      ? 'Dismiss this protest? The citation will stand and the protest flag will be cleared.'
      : 'Uphold this protest? The citation will be cancelled in the driver\'s favor.';
    if (!window.confirm(msg)) return;
    await resolveProtest(citationId, action);
    onChanged();
  }

  if (isLoading) {
    return (
      <Modal title="Citation Details" onClose={onClose}>
        <div style={{ padding: 20 }}>Loading…</div>
      </Modal>
    );
  }

  if (errorMessage || !citation) {
    return (
      <Modal title="Citation Details" onClose={onClose}>
        <div className="error-text">{errorMessage || 'Citation not found.'}</div>
      </Modal>
    );
  }

  return (
    <>
      <Modal title={`Citation Details: ${citation.citationNumber}`} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <h4 style={{ marginBottom: 6 }}>Driver Information</h4>
          <p style={{ margin: 0 }}>{citation.Driver?.firstName} {citation.Driver?.lastName}</p>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>{citation.Driver?.licenseNumber}</p>

          <h4 style={{ marginTop: 16, marginBottom: 6 }}>Vehicle Information</h4>
          <p style={{ margin: 0, fontSize: 13 }}>Unit: {citation.vehicleUnitType || '—'}</p>
          <p style={{ margin: 0, fontSize: 13 }}>Plate Number: {citation.plateNumber || '—'}</p>
          <p style={{ margin: 0, fontSize: 13 }}>Registered Owner: {citation.registeredOwner || '—'}</p>

          <h4 style={{ marginTop: 16, marginBottom: 6 }}>Violation Details</h4>
          {(citation.violations || []).map((v) => (
            <p key={v.id} style={{ margin: '2px 0', fontSize: 13 }}>• {v.violationType?.description} (₱{Number(v.penaltyAtIssuance).toLocaleString()})</p>
          ))}
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            {new Date(citation.occurredAt).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>📍 {citation.placeOfViolation}</p>
          {citation.driverUnderProtest && (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#D97706', fontWeight: 600 }}>
              ⚠️ Driver indicated they are under protest for this citation
            </p>
          )}
          {citation.latitude && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>{citation.latitude}° N, {citation.longitude}° E</p>
          )}
        </div>

        <div>
          <h4 style={{ marginBottom: 6 }}>Evidence</h4>
          {citation.evidence && citation.evidence.length > 0 ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {citation.evidence.map((ev) => (
                <div
                  key={ev.evidenceId}
                  onClick={() => setEnlargedPhoto(getMediaUrl(ev.imagePath))}
                  title="Click to view full image"
                  style={{ cursor: 'pointer' }}
                >
                  <img
                    src={getMediaUrl(ev.imagePath)}
                    alt="Evidence"
                    style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No photo evidence attached.</p>
          )}

          <h4 style={{ marginTop: 16, marginBottom: 6 }}>Fine Amount</h4>
          {citation.recordType === 'warning' ? (
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>No fine — warning only</p>
          ) : (
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>₱{Number(citation.fineAmount || 0).toLocaleString()}</p>
          )}
          {citation.fineOverrideReason && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>
              Overridden: {citation.fineOverrideReason}
            </p>
          )}

          <h4 style={{ marginTop: 16, marginBottom: 6 }}>Status</h4>
          <p style={{ margin: 0, fontWeight: 600 }}>
            {citation.verified ? '✅ Verified' : '⏳ Not yet verified'}
          </p>
        </div>
      </div>

      <div className="modal-footer" style={{ marginTop: 20 }}>
        {citation.driverUnderProtest && (
          <>
            <button className="btn btn-secondary" onClick={() => handleProtest('dismiss')}>Dismiss Protest</button>
            <button className="btn btn-primary" onClick={() => handleProtest('uphold')}>Uphold Protest (Cancel)</button>
          </>
        )}
        {citation.settlementStatus === 'pending' && (
          <button className="btn btn-danger" onClick={handleCancel}>Cancel Citation</button>
        )}
        {citation.settlementStatus === 'pending' && citation.recordType === 'citation' && (
          <button className="btn btn-secondary" onClick={() => setShowOverride(true)}>Override Fine</button>
        )}
        {citation.settlementStatus === 'pending' && citation.recordType === 'citation' && (
          <button className="btn btn-primary" onClick={handleSettle}>✓ Mark as Settled</button>
        )}
        {!citation.verified && (
          <button className="btn btn-primary" onClick={handleVerify}>Mark as Verified</button>
        )}
      </div>
      {citation.recordType === 'warning' && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
          Warning — no fine is due and settlement actions do not apply.
        </p>
      )}

      {showOverride && (
        <FineOverrideForm
          citationId={citationId}
          currentAmount={citation.fineAmount}
          onClose={() => setShowOverride(false)}
          onSaved={() => {
            setShowOverride(false);
            load();
          }}
        />
      )}
      </Modal>

      {enlargedPhoto && (
        <div
          onClick={() => setEnlargedPhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            cursor: 'pointer',
          }}
        >
          <img
            src={enlargedPhoto}
            alt="Evidence — full size"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }}
          />
        </div>
      )}
    </>
  );
}

function FineOverrideForm({ citationId, currentAmount, onClose, onSaved }) {
  const [amount, setAmount] = useState(currentAmount);
  const [reason, setReason] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage('');
    if (!reason.trim()) {
      setErrorMessage('A reason is required for overriding a fine amount.');
      return;
    }
    setIsSubmitting(true);
    try {
      await overrideFineAmount(citationId, Number(amount), reason.trim());
      onSaved();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Unable to override fine.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ marginTop: 16, padding: 16, background: 'var(--background)', borderRadius: 10 }}>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>New Fine Amount (₱)</label>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Reason for Override <span className="required">*</span></label>
          <input placeholder="e.g. Reduced per CTMO appeal decision" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {errorMessage ? <div className="error-text">{errorMessage}</div> : null}
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save Override'}</button>
        </div>
      </form>
    </div>
  );
}
