import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { useAuth } from '../auth/AuthContext';
import styles from './AccountPages.module.css';

const NOTICES = {
  verified: 'Your email is verified. Sign in to continue.',
  reset: 'Your password was updated. Sign in with your new password.',
  pending: 'Your account is waiting for administrator approval.',
};

export default function LoginPage() {
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const notice = NOTICES[searchParams.get('notice')] || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
    } catch (loginError) {
      setError(loginError.message || 'Could not sign in. Check the email and password.');
      setBusy(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Sign in"
      headline={
        <>
          Every word on brand.
          <br />
          Every claim backed.
        </>
      }
      lede="Sign in to review content, make decisions, and keep the brand library honest."
      label="Sign in"
      footer="BrandShield.ai by Inkloom AI · Humans make every final decision."
    >
      <p className="eyebrow">Sign in</p>
      <h2 className={styles.title}>Enter the review room.</h2>
      <p className={styles.intro}>Use the work email and password for your account.</p>

      {notice && (
        <div className="notice" role="status" style={{ marginTop: 16 }}>
          <span className="notice-icon" aria-hidden="true">
            ✓
          </span>
          <div>{notice}</div>
        </div>
      )}

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <div className="form-field">
          <label htmlFor="email">Work email</label>
          <input
            id="email"
            name="email"
            type="email"
            className="input"
            autoComplete="username"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError('');
            }}
            aria-invalid={Boolean(error)}
            required
            maxLength={254}
          />
        </div>
        <div className="form-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError('');
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'login-error' : undefined}
            required
          />
        </div>

        {error && (
          <p className="error-text" id="login-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className={`btn btn-primary ${styles.submit}`} disabled={busy}>
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" /> Signing in…
            </>
          ) : (
            'Sign in securely'
          )}
        </button>
      </form>

      <div className={styles.inlineLinks} style={{ marginTop: 18 }}>
        <Link to="/forgot-password">Forgot your password?</Link>
        <span className="muted">
          New here? <Link to="/signup">Create an account</Link>
        </span>
      </div>

      <p className={styles.adminNote}>
        <strong>Evaluating the demo?</strong> Use the seeded account for your role. The emails and shared demo password
        are listed in the project README so no account is pre-filled here.
      </p>
    </AuthShell>
  );
}
