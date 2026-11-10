import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { useAuth } from '../auth/AuthContext';
import { isEmail } from '../utils/passwordRules';
import styles from './AccountPages.module.css';

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!isEmail(email)) {
      setError('Enter the work email address on your account.');
      return;
    }
    setBusy(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (submitError) {
      setError(submitError.message || 'Could not request a reset link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Reset your password"
      headline={
        <>
          Locked out?
          <br />
          Let’s get you back in.
        </>
      }
      lede="We’ll send a one-hour reset link to the work email on your account. For security, we never say whether an address is registered."
      label="Forgot password"
    >
      <p className="eyebrow">Password reset</p>
      {sent ? (
        <div className={styles.success}>
          <h2 className={styles.title}>Check your email.</h2>
          <p className={styles.intro}>
            If an account exists for <strong>{email}</strong>, a reset link has been sent. It expires in one hour and can
            be used once.
          </p>
          <div className="notice" role="note">
            <span className="notice-icon" aria-hidden="true">
              ✉
            </span>
            <div>
              <strong>Demo email delivery.</strong> The reset link is written to the server console and to Settings →
              Sent emails.
            </div>
          </div>
          <Link className="btn btn-primary" to="/login">
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <h2 className={styles.title}>Forgot your password?</h2>
          <p className={styles.intro}>Enter your work email and we’ll send a reset link.</p>
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <div className="form-field">
              <label htmlFor="forgot-email">Work email</label>
              <input
                id="forgot-email"
                name="email"
                type="email"
                className="input"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'forgot-email-error' : undefined}
                required
                maxLength={254}
              />
              {error && (
                <p className="error-text" id="forgot-email-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <button type="submit" className={`btn btn-primary ${styles.submit}`} disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Sending…
                </>
              ) : (
                'Send reset link'
              )}
            </button>
          </form>
          <div className={styles.inlineLinks} style={{ marginTop: 18 }}>
            <Link to="/login">Back to sign in</Link>
            <span className="muted">
              Need an account? <Link to="/signup">Create one</Link>
            </span>
          </div>
        </>
      )}
    </AuthShell>
  );
}
