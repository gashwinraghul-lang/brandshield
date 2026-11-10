import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setCsrfToken } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [org, setOrg] = useState({ name: 'Northwind Labs', palette: ['#1F6F6B', '#E8845B', '#F2E8DC', '#12232E'] });
  const [privacy, setPrivacy] = useState({ externalAI: false, defaultDisclosure: 'AI-assisted', retentionDays: 365 });
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/api/auth/me');
      setUser(data.user);
      setOrg(data.org);
      setPrivacy(data.privacy);
      setWorkspaces(data.workspaces || []);
      setCsrfToken(data.csrfToken);
      return data.user;
    } catch {
      setUser(null);
      setWorkspaces([]);
      setCsrfToken(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUnauthorized = () => {
      setUser(null);
      setWorkspaces([]);
      setCsrfToken(null);
    };
    window.addEventListener('brandshield:unauthorized', onUnauthorized);
    return () => window.removeEventListener('brandshield:unauthorized', onUnauthorized);
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const data = await api.post('/api/auth/login', { email, password });
    setCsrfToken(data.csrfToken);
    setUser(data.user);
    setLoading(false);
    await refresh();
    return data.user;
  }, [refresh]);

  const signup = useCallback(async (payload) => {
    // Sign-up does not create a session. The person verifies their email first.
    return api.post('/api/auth/signup', payload);
  }, []);

  const verifyEmail = useCallback(async (token) => {
    const data = await api.post('/api/auth/verify-email', { token });
    if (data.csrfToken) setCsrfToken(data.csrfToken);
    if (data.user) setUser(data.user);
    setLoading(false);
    const refreshed = await refresh();
    return refreshed || data.user;
  }, [refresh]);

  const resendVerification = useCallback(async () => {
    return api.post('/api/auth/resend-verification', {});
  }, []);

  const forgotPassword = useCallback(async (email) => {
    return api.post('/api/auth/forgot-password', { email });
  }, []);

  const resetPassword = useCallback(async ({ token, password, confirmPassword }) => {
    return api.post('/api/auth/reset-password', { token, password, confirmPassword });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout', {});
    } catch {
      // Session may already be gone.
    }
    setUser(null);
    setWorkspaces([]);
    setCsrfToken(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      org,
      privacy,
      workspaces,
      loading,
      login,
      signup,
      verifyEmail,
      resendVerification,
      forgotPassword,
      resetPassword,
      logout,
      refresh,
      setOrg,
      setPrivacy,
    }),
    [
      user,
      org,
      privacy,
      workspaces,
      loading,
      login,
      signup,
      verifyEmail,
      resendVerification,
      forgotPassword,
      resetPassword,
      logout,
      refresh,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export function homeForRole(role) {
  switch (role) {
    case 'admin':
      return '/library';
    case 'reviewer':
      return '/queue';
    case 'leadership':
      return '/insights';
    default:
      return '/dashboard';
  }
}
