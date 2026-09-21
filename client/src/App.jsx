import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';

import Landing from './pages/Landing.jsx';
import Signup from './pages/Signup.jsx';
import Login from './pages/Login.jsx';
import Verify from './pages/Verify.jsx';
import VerifyGender from './pages/VerifyGender.jsx';
import Chat from './pages/Chat.jsx';
import Terms from './pages/Terms.jsx';
import AdminLayout from './pages/Admin/AdminLayout.jsx';
import AdminDashboard from './pages/Admin/AdminDashboard.jsx';
import AdminVerifications from './pages/Admin/AdminVerifications.jsx';
import AdminReports from './pages/Admin/AdminReports.jsx';
import AdminUsers from './pages/Admin/AdminUsers.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullscreenSpinner />;
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullscreenSpinner />;
  if (!user || user.accountType !== 'ADMIN') return <Navigate to="/" replace />;
  return children;
}

function FullscreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/verify"
        element={
          <RequireAuth>
            <Verify />
          </RequireAuth>
        }
      />
      <Route
        path="/verify-gender"
        element={
          <RequireAuth>
            <VerifyGender />
          </RequireAuth>
        }
      />
      <Route
        path="/chat"
        element={
          <RequireAuth>
            <Chat />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="verifications" element={<AdminVerifications />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="users" element={<AdminUsers />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
