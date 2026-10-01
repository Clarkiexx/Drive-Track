import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊', enabled: true },
  { to: '/drivers', label: 'Driver Management', icon: '👥', enabled: true },
  { to: '/enforcers', label: 'Enforcer Management', icon: '🛡️', enabled: true },
  { to: '/violation-types', label: 'Violation Types', icon: '📋', enabled: true },
  { to: '/violations', label: 'Violation Monitoring', icon: '📄', enabled: true },
  { to: '/settlements', label: 'Settlements', icon: '💰', enabled: true },
  { to: '/notifications', label: 'Notifications', icon: '🔔', enabled: true },
  { to: '/audit-log', label: 'Audit Log', icon: '📜', enabled: true },
];

export default function Sidebar() {
  const { signOut } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">🛡️</div>
        <div>
          <div className="sidebar-brand-title">DriveTrack</div>
          <div className="sidebar-brand-subtitle">Admin Portal</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) =>
          item.enabled ? (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ) : (
            // Pages not built yet — shown but not clickable, so the sidebar
            // matches the full Figma layout without linking to dead routes.
            <span key={item.to} className="sidebar-link" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </span>
          )
        )}
      </nav>

      <button className="sidebar-logout" onClick={signOut}>
        ⎋ Logout
      </button>
    </aside>
  );
}
