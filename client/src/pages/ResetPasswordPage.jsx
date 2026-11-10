import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { useAuth } from '../auth/AuthContext';
import { PASSWORD_RULES, passwordProblems } from '../utils/passwordRules';
import styles from './AccountPages.module.css';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { resetPassword } = useAuth();
  const [fields, setFields] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const update = (field, value) => {
    setFields((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError('');
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    const next = {};
    if (passwordProblems(fields.password).length) next.password = 'Choose a password that meets every rule below.';
    if (fields.confirmPassword !== fields.password) next.confirmPassword = 'Passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) {
      setFormError('Please correct the highlighted fields.');
      return;
    }
    setBusy(true);
    try {
      await resetPassword({ token, password: fields.password, confirmPassword: fields.confirmPassword });
      setDone(true);
    } catch (submitError) {
      if (Array.isArray(submitError.details)) {
        const mapped = {};
        for (const detail of submitError.details) {
          if (detail.field) mapped[detail.field] = detail.message;
        }
        setErrors(mapped);
      }
      setFormError(submitError.message || 'Could not reset the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Choose a new password"
      headline={
        <>
          A fresh key
          <br />
          to the review room.
        </>
      }
      lede="Reset links expire after one hour. Choosing a new password signs out every other session for your account."
      label="Reset password"
    >
      <p className="eyebrow">New password</p>
      {!token ? (
        <div className={styles.success}>
          <h2 className={styles.title}>This reset link is incomplete.</h2>
          <p className={styles.intro}>Open the link from your reset email, or request a new one.</p>
          <Link className="btn btn-primary" to="/forgot-password">
            Request a new link
          </Link>
        </div>
      ) : done ? (
        <div className={styles.success}>
          <h2 className={styles.title}>Password updated.</h2>
          <p className={styles.intro}>Your other sessions have been signed out. Sign in with your new password.</p>
          <Link className="btn btn-primary" to="/login">
            Sign in
          </Link>
        </div>
      ) : (
        <>
          <h2 className={styles.title}>Choose a new password.</h2>
          <p className={styles.intro}>It must meet every rule below.</p>
          {formError && (
            <div className="notice notice-danger" role="alert" style={{ marginTop: 16 }}>
              <span className="notice-icon" aria-hidden="true">
                !
              </span>
              <div>{formError}</div>
            </div>
          )}
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <div className="form-field">
              <label htmlFor="reset-password">New password</label>
              <input
                id="reset-password"
                name="password"
                type="password"
                className="input"
                autoComplete="new-password"
                value={fields.password}
                onChange={(event) => update('password', event.target.value)}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'reset-password-error reset-password-rules' : 'reset-password-rules'}
                required
              />
              <ul className={styles.rules} id="reset-password-rules" aria-label="Password requirements">
                {PASSWORD_RULES.map((rule) => {
                  const met = rule.test(fields.password || '');
                  return (
                    <li key={rule.id} className={`${styles.rule} ${met ? styles.ruleMet : ''}`}>
                      <span className={styles.ruleMark} aria-hidden="true">
                        {met ? '✓' : '·'}
                      </span>
                      <span>
                        {rule.label}
                        <span className="sr-only">{met ? ' — met' : ' — not met'}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {errors.password && (
                <p className="error-text" id="reset-password-error" role="alert">
                  {errors.password}
                </p>
              )}
            </div>
            <div className="form-field">
              <label htmlFor="reset-confirmPassword">Confirm new password</label>
              <input
                id="reset-confirmPassword"
                name="confirmPassword"
                type="password"
                className="input"
                autoComplete="new-password"
                value={fields.confirmPassword}
                onChange={(event) => update('confirmPassword', event.target.value)}
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={errors.confirmPassword ? 'reset-confirmPassword-error' : undefined}
                required
              />
              {errors.confirmPassword && (
                <p className="error-text" id="reset-confirmPassword-error" role="alert">
                  {errors.confirmPassword}
                </p>
              )}
            </div>
            <button type="submit" className={`btn btn-primary ${styles.submit}`} disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Updating…
                </>
              ) : (
                'Update password'
              )}
            </button>
          </form>
          <div className={styles.inlineLinks} style={{ marginTop: 18 }}>
            <Link to="/login">Back to sign in</Link>
          </div>
        </>
      )}
    </AuthShell>
  );
}
