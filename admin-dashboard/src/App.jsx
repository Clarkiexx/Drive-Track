import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DriverManagement from './pages/DriverManagement';
import EnforcerManagement from './pages/EnforcerManagement';
import ViolationTypesManagement from './pages/ViolationTypesManagement';
import ViolationMonitoring from './pages/ViolationMonitoring';
import Settlements from './pages/Settlements';
import NotificationsAdmin from './pages/NotificationsAdmin';
import AuditLog from './pages/AuditLog';

function ProtectedRoute({ children }) {
  const { token, isLoading } = useAuth();

  if (isLoading) return null; // brief flash while checking localStorage
  if (!token) return <Navigate to="/login" replace />;

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/drivers" element={<ProtectedRoute><DriverManagement /></ProtectedRoute>} />
      <Route path="/enforcers" element={<ProtectedRoute><EnforcerManagement /></ProtectedRoute>} />
      <Route path="/violation-types" element={<ProtectedRoute><ViolationTypesManagement /></ProtectedRoute>} />
      <Route path="/violations" element={<ProtectedRoute><ViolationMonitoring /></ProtectedRoute>} />
      <Route path="/settlements" element={<ProtectedRoute><Settlements /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsAdmin /></ProtectedRoute>} />
      <Route path="/audit-log" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
