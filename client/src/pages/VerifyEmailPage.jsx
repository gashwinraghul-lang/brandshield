import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { homeForRole, useAuth } from '../auth/AuthContext';
import styles from './AccountPages.module.css';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { verifyEmail, user } = useAuth();
  const navigate = useNavigate();
  const started = useRef(false);
  const [status, setStatus] = useState(token ? 'verifying' : 'missing');
  const [verifiedUser, setVerifiedUser] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    let active = true;
    verifyEmail(token)
      .then((nextUser) => {
        if (!active) return;
        setVerifiedUser(nextUser);
        setStatus('success');
      })
      .catch((verifyError) => {
        if (!active) return;
        setError(verifyError.message || 'This verification link is invalid or has expired.');
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [token, verifyEmail]);

  const continueToWorkspace = () => {
    const next = verifiedUser || user;
    if (!next) {
      navigate('/login', { replace: true });
      return;
    }
    navigate(next.accountState === 'pending' ? '/pending' : homeForRole(next.role), { replace: true });
  };

  return (
    <AuthShell
      eyebrow="Email verification"
      headline={
        <>
          A verified email.
          <br />
          An accountable trail.
        </>
      }
      lede="Verification confirms the person behind each review decision. It only takes one click."
      label="Email verification"
    >
      <p className="eyebrow">Email verification</p>

      {status === 'verifying' && (
        <div className={styles.success} role="status" aria-live="polite">
          <h2 className={styles.title}>Verifying your email…</h2>
          <p className={styles.intro}>One moment while we confirm the link.</p>
          <span className="spinner" aria-hidden="true" />
        </div>
      )}

      {status === 'success' && (
        <div className={styles.success}>
          <h2 className={styles.title}>Email verified.</h2>
          <p className={styles.intro}>
            Thanks{verifiedUser ? `, ${verifiedUser.name.split(' ')[0]}` : ''}. Your address is confirmed.
          </p>
          {verifiedUser?.accountState === 'pending' ? (
            <div className="notice notice-warn" role="status">
              <span className="notice-icon" aria-hidden="true">
                !
              </span>
              <div>
                <strong>Your agency account is still pending.</strong> An administrator must approve it and assign a
                brand workspace before you can submit content.
              </div>
            </div>
          ) : (
            <div className="notice" role="status">
              <span className="notice-icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>You can now submit content.</strong> Reviews still require a human reviewer’s approval before
                anything publishes.
              </div>
            </div>
          )}
          <button type="button" className="btn btn-primary" onClick={continueToWorkspace}>
            Continue
          </button>
        </div>
      )}

      {(status === 'error' || status === 'missing') && (
        <div className={styles.success}>
          <h2 className={styles.title}>{status === 'missing' ? 'No verification link found.' : 'That link did not work.'}</h2>
          <p className={styles.intro}>
            {status === 'missing'
              ? 'Open the verification link from your email, or sign in to request a new one.'
              : error}
          </p>
          <div className="notice notice-warn" role="note">
            <span className="notice-icon" aria-hidden="true">
              !
            </span>
            <div>
              Verification links expire after 24 hours and can only be used once. Sign in and use the banner to resend a
              fresh link.
            </div>
          </div>
          <Link className="btn btn-primary" to="/login">
            Go to sign in
          </Link>
        </div>
      )}

      <div className={styles.inlineLinks} style={{ marginTop: 18 }}>
        <Link to="/">Back to the home page</Link>
        <span className="muted">
          Need an account? <Link to="/signup">Create one</Link>
        </span>
      </div>
    </AuthShell>
  );
}
