import React from 'react';
import Sidebar from './Sidebar';
import Toasts from './Toast';
import { useAuth } from '../context/AuthContext';

export default function DashboardLayout({ title, children }) {
  const { admin } = useAuth();

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <div className="topbar">
          <div className="topbar-title">{title}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>System Admin</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {admin ? `${admin.firstName} ${admin.lastName}` : 'CTMO Office'}
            </div>
          </div>
        </div>
        <div className="page-body">{children}</div>
      </div>
      <Toasts />
    </div>
  );
}
