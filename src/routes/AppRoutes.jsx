import { Routes, Route, Navigate } from 'react-router-dom';
import Splash from '../auth/Splash';
import Login from '../auth/Login';
import SignUp from '../auth/SignUp';
import ForgotPassword from '../auth/ForgotPassword';
import SiteSelection from '../features/siteSelection/SiteSelection';
import ProtectedRoute from './ProtectedRoute';
import AppShell from './AppShell';

/**
 * Top-level routing. Splash → auth → site selection → app shell.
 * App shell holds the header + the three primary tabs (Seed / Trail Netting / Harvest).
 */
export default function AppRoutes({ booted, onSplashDone }) {
  if (!booted) return <Splash onDone={() => onSplashDone?.(true)} />;

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/sites" replace />} />

      {/* Auth */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      {/* Site selection (post-auth landing) */}
      <Route
        path="/sites"
        element={
          <ProtectedRoute>
            <SiteSelection />
          </ProtectedRoute>
        }
      />

      {/* Authenticated app shell */}
      <Route
        path="/app/*"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
