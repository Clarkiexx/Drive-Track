import React, { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import { toastSuccess, toastError } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { fetchCitations, settleCitation, sendReminder } from '../api/citationApi';
import { fetchDashboardSummary } from '../api/dashboardApi';

function daysUntil(dueDate) {
  if (!dueDate) return null;
  const target = new Date(dueDate);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target - new Date()) / (1000 * 60 * 60 * 24));
}

function formatPeso(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `₱${amount.toLocaleString()}`;
}

function formatDueDate(dueDate) {
  if (!dueDate) return '—';
  const target = new Date(dueDate);
  if (Number.isNaN(target.getTime())) return '—';
  return target.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Settlements() {
  const [tab, setTab] = useState('unsettled'); // unsettled | settled | all
  const [search, setSearch] = useState('');
  const [citations, setCitations] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [totalUnsettledAmount, setTotalUnsettledAmount] = useState(0);
  const [payingCitation, setPayingCitation] = useState(null);
  const [receiptCitation, setReceiptCitation] = useState(null);
  const [remindingId, setRemindingId] = useState(null);

  function loadUnsettledTotal() {
    fetchDashboardSummary()
      .then((res) => setTotalUnsettledAmount(res.data.data.unsettledAmount))
      .catch(() => {
        // Non-critical for this page — the badge just shows 0 if this fails.
      });
  }

  async function load(page = 1, tabValue = tab, searchValue = search) {
    setIsLoading(true);
    setLoadError('');
    try {
      const status = tabValue === 'unsettled' ? 'pending' : tabValue === 'settled' ? 'settled' : '';
      // Server-side recordType filter keeps warnings out with correct
      // pagination counts (never fetch-all-and-filter client-side).
      const response = await fetchCitations({ search: searchValue, status, recordType: 'citation', page, limit: 20 });
      setCitations(response.data.data.citations);
      setPagination(response.data.data.pagination);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Unable to load settlements.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    loadUnsettledTotal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTabChange(newTab) {
    setTab(newTab);
    load(1, newTab, search);
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    load(1, tab, search);
  }

  async function handleMarkPaid(citation) {
    setPayingCitation(citation);
  }

  async function confirmMarkPaid(method, reference) {
    try {
      await settleCitation(payingCitation.citationId, { paymentMethod: method, paymentReference: reference });
      setPayingCitation(null);
      toastSuccess('Citation marked as settled.');
      load(pagination.page);
      loadUnsettledTotal();
    } catch (err) {
      const message = err.response?.data?.message || 'Unable to mark as paid.';
      toastError(message);
      throw err;
    }
  }

  function handleExportCsv() {
    const rows = [['Citation No', 'Driver', 'Amount', 'Due Date', 'Status', 'Payment Method', 'Reference', 'Settled At']];
    citations.forEach((c) => {
      rows.push([
        c.citationNumber,
        `${c.Driver?.firstName || ''} ${c.Driver?.lastName || ''}`.trim(),
        c.fineAmount,
        c.dueDate || '',
        c.settlementStatus,
        c.paymentMethod || '',
        c.paymentReference || '',
        c.settledAt ? new Date(c.settledAt).toLocaleString() : '',
      ]);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `settlements-${tab}-p${pagination.page}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleRemind(citation) {
    if (remindingId) return;
    setRemindingId(citation.citationId);
    try {
      await sendReminder(citation.citationId);
      toastSuccess(`Reminder sent to ${citation.Driver?.firstName} ${citation.Driver?.lastName}.`);
    } catch (err) {
      toastError(err.response?.data?.message || 'Unable to send reminder.');
    } finally {
      setRemindingId(null);
    }
  }

  return (
    <DashboardLayout title="Settlements">
      <div className="page-header-row">
        <div>
          <h1 className="page-heading">Settlement Management</h1>
          <p className="page-subheading">Track fine payments and manage overdue citations.</p>
        </div>
        {tab === 'unsettled' && (
          <div style={{ background: '#DCFCE7', color: '#16A34A', padding: '10px 16px', borderRadius: 10, fontWeight: 700 }}>
            Total Unsettled: ₱{Number(totalUnsettledAmount).toLocaleString()}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 16px' }}>
          {[
            { key: 'unsettled', label: 'Unsettled & Overdue' },
            { key: 'settled', label: 'Settled' },
            { key: 'all', label: 'All Records' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              style={{
                padding: '14px 16px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? 'var(--primary)' : 'var(--text-secondary)',
                borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 16, display: 'flex', gap: 12 }}>
          <form onSubmit={handleSearchSubmit} style={{ flex: 1 }}>
            <input
              className="search-bar"
              placeholder="Search citation number or driver..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%' }}
            />
          </form>
          <button className="btn btn-secondary" onClick={handleExportCsv} title="Exports only the rows shown on this page">⬇ Export this page (CSV)</button>
        </div>

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
                <th>Amount</th>
                <th>Due Date</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {citations.map((c) => {
                const remaining = daysUntil(c.dueDate);
                const overdue = c.settlementStatus === 'pending' && remaining !== null && remaining < 0;
                return (
                  <tr key={c.citationId}>
                    <td style={{ fontWeight: 600 }}>{c.citationNumber}</td>
                    <td>{c.Driver?.firstName} {c.Driver?.lastName}</td>
                    <td style={{ fontWeight: 600 }}>{formatPeso(c.fineAmount)}</td>
                    <td>{formatDueDate(c.dueDate)}</td>
                    <td style={{ fontSize: 12 }}>{c.settlementStatus === 'settled' ? `${c.paymentMethod || 'cash'}${c.paymentReference ? ` • ${c.paymentReference}` : ''}` : '—'}</td>
                    <td>
                      {c.settlementStatus === 'settled' ? (
                        <span className="status-pill status-active">Settled</span>
                      ) : overdue ? (
                        <span className="status-pill status-suspended">Overdue ({Math.abs(remaining)}d)</span>
                      ) : remaining === null ? (
                        <span className="status-pill status-pending">No due date</span>
                      ) : (
                        <span className="status-pill status-pending">{remaining} days left</span>
                      )}
                    </td>
                    <td>
                      {c.settlementStatus === 'pending' && (
                        <>
                          <button className="btn btn-primary" onClick={() => handleMarkPaid(c)}>Mark Paid</button>
                          <button className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={() => handleRemind(c)} disabled={remindingId === c.citationId}>{remindingId === c.citationId ? 'Sending…' : 'Remind'}</button>
                        </>
                      )}
                      {c.settlementStatus === 'settled' && (
                        <button className="btn btn-secondary" onClick={() => setReceiptCitation(c)}>🧾 Receipt</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {citations.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>No records found.</td></tr>
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

      {payingCitation && (
        <MarkPaidModal
          citation={payingCitation}
          onClose={() => setPayingCitation(null)}
          onConfirm={confirmMarkPaid}
        />
      )}

      {receiptCitation && (
        <Modal title={`Receipt — ${receiptCitation.citationNumber}`} onClose={() => setReceiptCitation(null)}>
          <div style={{ fontSize: 14 }}>
            <p><strong>Driver:</strong> {receiptCitation.Driver?.firstName} {receiptCitation.Driver?.lastName} ({receiptCitation.Driver?.licenseNumber})</p>
            <p><strong>Amount:</strong> {formatPeso(receiptCitation.fineAmount)}</p>
            <p><strong>Method:</strong> {receiptCitation.paymentMethod || 'cash'}</p>
            {receiptCitation.paymentReference && <p><strong>Reference:</strong> {receiptCitation.paymentReference}</p>}
            <p><strong>Settled:</strong> {receiptCitation.settledAt ? new Date(receiptCitation.settledAt).toLocaleString() : '—'}</p>
            <p><strong>Due was:</strong> {formatDueDate(receiptCitation.dueDate)}</p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-primary" onClick={() => setReceiptCitation(null)}>Close</button>
          </div>
        </Modal>
      )}
    </DashboardLayout>
  );
}

function MarkPaidModal({ citation, onClose, onConfirm }) {
  const { admin } = useAuth();
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    // Office payment: full amount only, Cash/Other, OR/reference required.
    if (!reference.trim()) {
      setError('Official Receipt / OR number is required for office payments.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirm(method, reference.trim());
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to mark as paid.');
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={`Record Office Payment — ${citation.citationNumber}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p style={{ fontSize: 13 }}>Amount due (full payment only): <strong>{formatPeso(citation.fineAmount)}</strong></p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 0 }}>
          Partial payments are not supported — the full citation amount is recorded as paid.
        </p>
        <div className="form-group">
          <label>Payment Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="form-group">
          <label>Official Receipt / OR No. <span className="required">*</span></label>
          <input placeholder="e.g. OR-2026-000123" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <p style={{ fontSize: 13 }}>
          Received by: <strong>{admin ? `${admin.firstName} ${admin.lastName}` : 'System Admin'}</strong>
        </p>
        {error ? <div className="error-text">{error}</div> : null}
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Confirm Paid'}</button>
        </div>
      </form>
    </Modal>
  );
}
