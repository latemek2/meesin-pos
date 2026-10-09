import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@fontsource/anuphan/400.css';
import '@fontsource/anuphan/500.css';
import '@fontsource/anuphan/600.css';
import './styles.css';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider, Loading } from './components/ui';
import LoginPage from './pages/LoginPage';
import AdminLayout from './admin/AdminLayout';
import Dashboard from './admin/Dashboard';
import ProductsPage from './admin/ProductsPage';
import ProductEditPage from './admin/ProductEditPage';
import SuppliersPage from './admin/SuppliersPage';
import ReceivePage from './admin/ReceivePage';
import LabelsPage from './admin/LabelsPage';
import SettingsPage from './admin/SettingsPage';
import PosApp from './pos/PosApp';
import type { Role } from './lib/types';

function Home() {
  const { loading, session, role } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={role === 'owner' ? '/admin' : '/pos'} replace />;
}

function RequireRole({ allow, children }: { allow: Role[]; children: React.ReactNode }) {
  const { loading, session, role, signOut } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (!role) {
    return (
      <div className="login">
        <div className="card">
          <h2>บัญชีนี้ยังไม่ได้กำหนดสิทธิ์</h2>
          <p className="muted">ให้เจ้าของร้านกำหนดบัญชีนี้เป็นเจ้าของร้านหรือเครื่อง POS ใน Supabase ก่อน (ดูคู่มือข้อ 5)</p>
          <button className="btn" onClick={signOut}>
            ออกจากระบบ
          </button>
        </div>
      </div>
    );
  }
  if (!allow.includes(role)) return <Navigate to={role === 'owner' ? '/admin' : '/pos'} replace />;
  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/pos/*"
              element={
                <RequireRole allow={['pos', 'owner']}>
                  <PosApp />
                </RequireRole>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireRole allow={['owner']}>
                  <AdminLayout />
                </RequireRole>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="products/new" element={<ProductEditPage />} />
              <Route path="products/:id" element={<ProductEditPage />} />
              <Route path="suppliers" element={<SuppliersPage />} />
              <Route path="receive" element={<ReceivePage />} />
              <Route path="labels" element={<LabelsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>,
);
