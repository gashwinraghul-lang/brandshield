import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { initials } from '../api';
import Wordmark from './Wordmark';
import InkVaultScene from './InkVaultScene';
import styles from './AppShell.module.css';

const ICONS = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  new: 'M12 5v14M5 12h14',
  queue: 'M4 6h16M4 12h16M4 18h10',
  library: 'M4 5h6v14H4zM12 5h8v14h-8z',
  insights: 'M4 19V9M10 19V5M16 19v-7M22 19H2',
  settings: 'M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

function navItems(role) {
  const items = [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'creator', 'reviewer', 'agency', 'leadership'] },
  ];
  items.push({ to: '/new', label: 'New submission', icon: 'new', roles: ['creator', 'agency', 'admin'] });
  items.push({ to: '/queue', label: 'Reviewer queue', icon: 'queue', roles: ['reviewer', 'admin'] });
  items.push({ to: '/library', label: 'Brand library', icon: 'library', roles: ['admin'] });
  items.push({ to: '/insights', label: 'Insights', icon: 'insights', roles: ['admin', 'reviewer', 'leadership'] });
  items.push({ to: '/settings', label: 'Settings', icon: 'settings', roles: ['admin'] });
  return items.filter((item) => item.roles.includes(role));
}

export default function AppShell() {
  const { user, org, privacy, logout, resendVerification } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState('');

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const resend = async () => {
    setResending(true);
    setResendNote('');
    try {
      await resendVerification();
      setResendNote('A fresh verification link is in the server console and Settings → Sent emails.');
    } catch (error) {
      setResendNote(error.message || 'Could not resend the verification email.');
    } finally {
      setResending(false);
    }
  };

  const items = navItems(user.role);

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <InkVaultScene palette={org.palette} />
      <div className="shell">
        <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`} aria-label="Sidebar">
          <Link to="/dashboard" className={styles.brand}>
            <Wordmark />
          </Link>
          <div className={styles.org}>
            <span className="eyebrow">Brand library</span>
            <strong>{org.name}</strong>
          </div>
          <nav id="primary-navigation-mobile" className={styles.nav} aria-label="Primary navigation">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navActive : ''}`}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className={styles.sidebarFooter}>
            <p className={styles.motto}>Humans make every final decision.</p>
            <p className="tiny muted">BrandShield.ai · Inkloom AI</p>
          </div>
        </aside>

        <div className="shell-main">
          <header className={styles.topbar}>
            <button
              type="button"
              className={styles.menuButton}
              onClick={() => setMenuOpen((value) => !value)}
              aria-expanded={menuOpen}
              aria-controls="primary-navigation-mobile"
            >
              <span aria-hidden="true">☰</span>
              <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
            </button>
            <div className={styles.topbarContext}>
              <span className="chip">{privacy.externalAI ? 'External AI: on' : 'AI: local mock'}</span>
              <span className={`chip ${privacy.externalAI ? 'chip-warn' : 'chip-ok'}`}>
                {privacy.externalAI ? 'Content may leave the platform' : 'Content stays on this server'}
              </span>
            </div>
            <div className={styles.topActions}>
              <div className={styles.user}>
                <span className={styles.avatar} aria-hidden="true">
                  {initials(user.name)}
                </span>
                <span className={styles.userText}>
                  <strong>{user.name}</strong>
                  <span className="tiny muted">
                    {user.role} · {user.team}
                  </span>
                </span>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
                Sign out
              </button>
            </div>
          </header>

          {!user.emailVerified && (
            <div className="notice notice-warn" role="status">
              <span className="notice-icon" aria-hidden="true">
                !
              </span>
              <div>
                <strong>Verify your email to submit content.</strong> You can explore the workspace, but creating or
                submitting content stays locked until your address is verified.
                <div className="row" style={{ marginTop: 8 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={resend} disabled={resending}>
                    {resending ? 'Sending…' : 'Resend verification email'}
                  </button>
                  {resendNote && <span className="tiny muted">{resendNote}</span>}
                </div>
              </div>
            </div>
          )}

          <main id="main-content" className={styles.main}>
            <Outlet />
          </main>

          <footer className={styles.footer}>
            <span>BrandShield.ai by Inkloom AI</span>
            <span aria-hidden="true">·</span>
            <span>Reviews happen before publishing. Humans decide.</span>
          </footer>
        </div>
      </div>
      {menuOpen && <button type="button" className={styles.scrim} aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
    </>
  );
}
