import { Component } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, homeForRole, useAuth } from './auth/AuthContext';
import AppShell from './components/AppShell';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupTypePage from './pages/SignupTypePage';
import SignupDetailsPage from './pages/SignupDetailsPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import PendingApprovalPage from './pages/PendingApprovalPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import LegalPage from './pages/LegalPage';
import DashboardPage from './pages/DashboardPage';
import BrandLibraryPage from './pages/BrandLibraryPage';
import NewSubmissionPage from './pages/NewSubmissionPage';
import ReviewWorkspacePage from './pages/ReviewWorkspacePage';
import ReviewerQueuePage from './pages/ReviewerQueuePage';
import InsightsPage from './pages/InsightsPage';
import SettingsPage from './pages/SettingsPage';

function LoadingScreen({ label = 'Opening the Ink Vault…' }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.accountState === 'pending') return <Navigate to="/pending" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeForRole(user.role)} replace />;
  return children;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen label="Checking your session…" />;
  if (user) {
    if (user.accountState === 'pending') return <Navigate to="/pending" replace />;
    const destination = location.state?.from && location.state.from !== '/login' ? location.state.from : homeForRole(user.role);
    return <Navigate to={destination} replace />;
  }
  return <LoginPage />;
}

function PublicAccountRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen label="Checking your session…" />;
  if (user) {
    return <Navigate to={user.accountState === 'pending' ? '/pending' : homeForRole(user.role)} replace />;
  }
  return children;
}

function PendingRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen label="Checking your account…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.accountState !== 'pending') return <Navigate to={homeForRole(user.role)} replace />;
  return <PendingApprovalPage />;
}

function NotFound() {
  return (
    <section className="page">
      <div className="empty-state">
        <p className="eyebrow">Page not found</p>
        <h2>That page is not in the vault.</h2>
        <p>Use the navigation to return to a workspace you have access to.</p>
      </div>
    </section>
  );
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="loading-screen">
          <div className="panel" role="alert" style={{ maxWidth: 560 }}>
            <p className="eyebrow">Something interrupted the review</p>
            <h1 style={{ marginBottom: 12 }}>BrandShield.ai needs a refresh.</h1>
            <p className="muted" style={{ marginBottom: 18 }}>
              The interface hit an unexpected error. Your content and decisions are stored on the server, so nothing is
              lost. Reload to continue.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload BrandShield.ai
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginRoute />} />
            <Route
              path="/signup"
              element={
                <PublicAccountRoute>
                  <SignupTypePage />
                </PublicAccountRoute>
              }
            />
            <Route
              path="/signup/details"
              element={
                <PublicAccountRoute>
                  <SignupDetailsPage />
                </PublicAccountRoute>
              }
            />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route
              path="/forgot-password"
              element={
                <PublicAccountRoute>
                  <ForgotPasswordPage />
                </PublicAccountRoute>
              }
            />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/legal/:kind" element={<LegalPage />} />
            <Route path="/pending" element={<PendingRoute />} />

            <Route
              element={
                <Protected>
                  <AppShell />
                </Protected>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route
                path="/new"
                element={
                  <Protected roles={['creator', 'agency', 'admin']}>
                    <NewSubmissionPage />
                  </Protected>
                }
              />
              <Route
                path="/queue"
                element={
                  <Protected roles={['reviewer', 'admin']}>
                    <ReviewerQueuePage />
                  </Protected>
                }
              />
              <Route
                path="/library"
                element={
                  <Protected roles={['admin']}>
                    <BrandLibraryPage />
                  </Protected>
                }
              />
              <Route
                path="/insights"
                element={
                  <Protected roles={['admin', 'reviewer', 'leadership']}>
                    <InsightsPage />
                  </Protected>
                }
              />
              <Route
                path="/settings"
                element={
                  <Protected roles={['admin']}>
                    <SettingsPage />
                  </Protected>
                }
              />
              <Route path="/submissions/:id" element={<ReviewWorkspacePage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
