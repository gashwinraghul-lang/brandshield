import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { homeForRole, useAuth } from '../auth/AuthContext';
import styles from './AccountPages.module.css';

export default function PendingApprovalPage() {
  const { user, refresh, logout, resendVerification } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (user && user.accountState !== 'pending') {
      navigate(homeForRole(user.role), { replace: true });
    }
  }, [user, navigate]);

  if (!user) return null;

  const checkAgain = async () => {
    setChecking(true);
    setError('');
    setFeedback('');
    try {
      const next = await refresh();
      if (next && next.accountState === 'pending') {
        setFeedback('Still waiting for an administrator. Check again later.');
      }
    } catch {
      setError('Could not check your status. Try again in a moment.');
    } finally {
      setChecking(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError('');
    setFeedback('');
    try {
      await resendVerification();
      setFeedback('A fresh verification link has been written to the server console and Settings → Sent emails.');
    } catch (resendError) {
      setError(resendError.message || 'Could not resend the verification email.');
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Waiting for approval"
      headline={
        <>
          Your work starts
          <br />
          after the handshake.
        </>
      }
      lede="Agency accounts are reviewed by an administrator before they can join a brand workspace. This keeps client work separated and accountable."
      label="Waiting for approval"
      footer={
        <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
          Sign out
        </button>
      }
    >
      <p className="eyebrow">Account status</p>
      <h2 className={styles.title}>Waiting for administrator approval.</h2>
      <p className={styles.intro}>
        Thanks, {user.name}. Your agency account is verified and queued for review. You’ll be able to submit content once
        an administrator approves the account and assigns a brand workspace.
      </p>

      <dl className={styles.statusList}>
        <div>
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt>Account type</dt>
          <dd>Agency or partner</dd>
        </div>
        {user.agencyName && (
          <div>
            <dt>Agency</dt>
            <dd>{user.agencyName}</dd>
          </div>
        )}
        <div>
          <dt>Email verified</dt>
          <dd>{user.emailVerified ? 'Yes' : 'Not yet — check your inbox'}</dd>
        </div>
        <div>
          <dt>Workspace</dt>
          <dd>{user.workspaceIds?.length ? 'Assigned' : 'Not assigned yet'}</dd>
        </div>
      </dl>

      {feedback && (
        <div className="notice" role="status" style={{ marginTop: 16 }}>
          <span className="notice-icon" aria-hidden="true">
            ✓
          </span>
          <div>{feedback}</div>
        </div>
      )}
      {error && (
        <div className="notice notice-danger" role="alert" style={{ marginTop: 16 }}>
          <span className="notice-icon" aria-hidden="true">
            !
          </span>
          <div>{error}</div>
        </div>
      )}

      <div className="row" style={{ marginTop: 20 }}>
        <button type="button" className="btn btn-primary" onClick={checkAgain} disabled={checking}>
          {checking ? (
            <>
              <span className="spinner" aria-hidden="true" /> Checking…
            </>
          ) : (
            'Check again'
          )}
        </button>
        {!user.emailVerified && (
          <button type="button" className="btn btn-secondary" onClick={resend} disabled={resending}>
            {resending ? 'Sending…' : 'Resend verification email'}
          </button>
        )}
      </div>

      <p className={styles.adminNote}>
        Need help? Ask your brand administrator to approve the account from Settings → User roles. You can also{' '}
        <Link to="/">return to the home page</Link>.
      </p>
    </AuthShell>
  );
}
