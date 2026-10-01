import React, { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { sendBroadcast, fetchBroadcasts } from '../api/notificationApi';

const RECIPIENT_LABELS = {
  unsettled_drivers: 'Unsettled Drivers',
  all_drivers: 'All Drivers',
  all_enforcers: 'All Enforcers',
  everyone: 'Everyone',
  single_driver: 'Specific Driver',
  single_enforcer: 'Specific Enforcer',
};

const RECIPIENT_OPTIONS = [
  { key: 'unsettled_drivers', icon: '⚠️', label: 'Unsettled Drivers', description: 'Reminders for pending settlements' },
  { key: 'all_drivers', icon: '👥', label: 'All Drivers', description: 'Announcements to all drivers' },
  { key: 'all_enforcers', icon: '🛡️', label: 'All Enforcers', description: 'Memos to all enforcers' },
  { key: 'everyone', icon: '📢', label: 'Everyone', description: 'Drivers + enforcers' },
  { key: 'single_driver', icon: '🧍', label: 'Specific Driver', description: 'By license number' },
  { key: 'single_enforcer', icon: '👮', label: 'Specific Enforcer', description: 'By employee ID / badge' },
];

export default function NotificationsAdmin() {
  const [recipientType, setRecipientType] = useState('unsettled_drivers');
  const [message, setMessage] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [broadcasts, setBroadcasts] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  function loadBroadcasts() {
    fetchBroadcasts()
      .then((res) => setBroadcasts(res.data.data))
      .catch(() => {
        // Non-critical for this panel — it just stays empty if this fails.
      });
  }

  useEffect(() => {
    loadBroadcasts();
  }, []);

  async function handleSend(e) {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!message.trim()) {
      setErrorMessage('Message cannot be empty.');
      return;
    }

    const extra = {};
    if (recipientType === 'single_driver') {
      if (!identifier.trim()) {
        setErrorMessage('Enter the driver’s license number.');
        return;
      }
      extra.licenseNumber = identifier.trim();
    }
    if (recipientType === 'single_enforcer') {
      if (!identifier.trim()) {
        setErrorMessage('Enter the enforcer’s employee ID or badge number.');
        return;
      }
      extra.employeeId = identifier.trim();
      extra.badgeNumber = identifier.trim();
    }

    setIsSending(true);
    try {
      const response = await sendBroadcast(recipientType, message.trim(), extra);
      setSuccessMessage(response.data.message);
      setMessage('');
      setIdentifier('');
      loadBroadcasts();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Unable to send notification.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <DashboardLayout title="Notifications">
      <h1 className="page-heading">Notification Management</h1>
      <p className="page-subheading">Send reminders and announcements to drivers and enforcers.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>💬 Compose Message</h3>
          <form onSubmit={handleSend}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Select Recipients</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '10px 0 18px' }}>
              {RECIPIENT_OPTIONS.map((o) => (
                <RecipientOption
                  key={o.key}
                  icon={o.icon}
                  label={o.label}
                  description={o.description}
                  selected={recipientType === o.key}
                  onClick={() => setRecipientType(o.key)}
                />
              ))}
            </div>

            {recipientType === 'single_driver' && (
              <div className="form-group">
                <label>Driver License Number</label>
                <input placeholder="e.g. G-75-45-571924" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
              </div>
            )}
            {recipientType === 'single_enforcer' && (
              <div className="form-group">
                <label>Employee ID or Badge Number</label>
                <input placeholder="e.g. ENF-2024-001 or B-4592" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
              </div>
            )}

            <label style={{ fontSize: 13, fontWeight: 600 }}>Message Content</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 500))}
              rows={5}
              maxLength={500}
              style={{ width: '100%', marginTop: 8, padding: 12, borderRadius: 8, border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 14 }}
              placeholder="Type your message here..."
            />
            <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              {message.length} / 500 characters
            </div>

            {errorMessage ? <div className="error-text">{errorMessage}</div> : null}
            {successMessage ? <div style={{ color: 'var(--success)', fontSize: 13, marginTop: 8 }}>{successMessage}</div> : null}

            <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }} disabled={isSending}>
              {isSending ? 'Sending…' : '📨 Send Notification'}
            </button>
          </form>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>🕒 Recent Broadcasts</h3>
          {broadcasts.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No broadcasts sent yet.</p>
          ) : (
            broadcasts.map((b) => (
              <div key={b.broadcastId} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                <span className="status-pill status-active">{RECIPIENT_LABELS[b.recipientType]}</span>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                  {new Date(b.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                  To: {RECIPIENT_LABELS[b.recipientType]} ({b.recipientCount})
                </div>
                <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 2 }}>● Sent</div>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function RecipientOption({ icon, label, description, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1,
        border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
        background: selected ? '#EAF4EB' : '#fff',
        borderRadius: 10,
        padding: 14,
        cursor: 'pointer',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13 }}>{icon} {label}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{description}</div>
    </div>
  );
}
