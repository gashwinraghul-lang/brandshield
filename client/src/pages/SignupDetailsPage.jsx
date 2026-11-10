import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { useAuth } from '../auth/AuthContext';
import { PASSWORD_RULES, isEmail, passwordProblems } from '../utils/passwordRules';
import styles from './AccountPages.module.css';

const META = {
  creator: {
    eyebrow: 'Creator account',
    headline: 'Bring your content to the shield.',
    lede: 'Submit content, run a review against the live brand library, and decide which suggestions to accept.',
    title: 'Create your creator account',
  },
  reviewer: {
    eyebrow: 'Reviewer / Brand Manager account',
    headline: 'Make the final call with evidence.',
    lede: 'See findings across teams, ask for changes when something is unclear, and approve only what meets the brand.',
    title: 'Create your reviewer account',
  },
  agency: {
    eyebrow: 'Agency or partner account',
    headline: 'Work inside the brand, not around it.',
    lede: 'Agency accounts create content inside invited brand workspaces. Without a valid invitation code, an administrator must approve the account first.',
    title: 'Create your agency account',
  },
  leadership: {
    eyebrow: 'Leadership account',
    headline: 'See the brand’s risk at a glance.',
    lede: 'Read dashboards, recurring-issue trends and audit exports without editing the library or content.',
    title: 'Create your leadership account',
  },
};

const EMPTY = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  team: '',
  agencyName: '',
  invitationCode: '',
  termsAccepted: false,
};

export default function SignupDetailsPage() {
  const DEMO_USERS = {
    creator: { name: 'Theo Martins', email: 'creator@northwindlabs.example', password: 'BrandShield!23', team: 'Marketing' },
    reviewer: { name: 'Priya Nair', email: 'reviewer@northwindlabs.example', password: 'BrandShield!23', team: '' },
    agency: { name: 'Jules Bennett', email: 'agency@northwindlabs.example', password: 'BrandShield!23', team: '', agencyName: 'Harbor & Finch', invitationCode: '' },
    leadership: { name: 'Sam Okafor', email: 'leadership@northwindlabs.example', password: 'BrandShield!23', team: '' },
    admin: { name: 'Maya Chen', email: 'admin@northwindlabs.example', password: 'BrandShield!23', team: 'Brand' },
  };

  const useDemo = (typeKey) => {
    const demo = DEMO_USERS[typeKey];
    if (!demo) return;
    setFields({
      ...EMPTY,
      name: demo.name,
      email: demo.email,
      password: demo.password,
      confirmPassword: demo.password,
      team: demo.team,
      agencyName: demo.agencyName || '',
      invitationCode: demo.invitationCode || '',
    });
    // Force the URL type to match the demo type (if not already)
    if (type !== typeKey) {
      const newSearch = new URLSearchParams(window.location.search);
      newSearch.set('type', typeKey);
      window.history.replaceState(null, '', `${window.location.pathname}?${newSearch}`);
    }
  };

  // Insert demo selector UI before form rendering
  const demoSelector = (
    <div className={styles.demoSelector} style={{ marginBottom: '1rem' }}>
      <span>Demo accounts: </span>
      {Object.keys(DEMO_USERS).map((k) => (
        <button
          key={k}
          type="button"
          className="btn btn-secondary"
          style={{ marginRight: '0.5rem' }}
          onClick={() => useDemo(k)}
        >{k}</button>
      ))}
    </div>
  );

  const [searchParams] = useSearchParams();
  const type = String(searchParams.get('type') || '').toLowerCase();
  const { signup } = useAuth();
  const [fields, setFields] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const meta = META[type];
  if (!meta) return <Navigate to="/signup" replace />;

  const update = (field, value) => {
    setFields((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError('');
    if (field === 'email') setDuplicate(false);
  };

  const validate = () => {
    const next = {};
    if (!fields.name.trim()) next.name = 'Enter your full name.';
    if (!isEmail(fields.email)) next.email = 'Enter a valid work email address.';
    if (passwordProblems(fields.password).length) next.password = 'Choose a password that meets every rule below.';
    if (fields.confirmPassword !== fields.password) next.confirmPassword = 'Passwords do not match.';
    if (type === 'agency' && !fields.agencyName.trim()) next.agencyName = 'Enter your agency or partner name.';
    if (!fields.termsAccepted) next.termsAccepted = 'Accept the terms and privacy notice to continue.';
    return next;
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    setDuplicate(false);
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) {
      setFormError('Please correct the highlighted fields.');
      const first = Object.keys(next)[0];
      document.getElementById(`signup-${first}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const data = await signup({
        type,
        name: fields.name.trim(),
        email: fields.email.trim(),
        password: fields.password,
        confirmPassword: fields.confirmPassword,
        team: fields.team.trim(),
        agencyName: fields.agencyName.trim(),
        invitationCode: fields.invitationCode.trim(),
        termsAccepted: true,
      });
      setResult(data);
    } catch (error) {
      if (error.status === 409) {
        setDuplicate(true);
        setErrors((current) => ({
          ...current,
          email: error.details?.find((detail) => detail.field === 'email')?.message || 'This email is already registered.',
        }));
      } else if (Array.isArray(error.details)) {
        const mapped = {};
        for (const detail of error.details) {
          if (detail.field) mapped[detail.field] = detail.message;
        }
        setErrors(mapped);
      }
      setFormError(error.message || 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const pending = result.accountState === 'pending';
    return (
      <AuthShell
        eyebrow="Check your email"
        headline="One link, then you’re in."
        lede="We use a verified work email to protect the brand library and keep review decisions accountable."
        label="Account created"
      >
        <div className={styles.success}>
          <p className="eyebrow">Account created</p>
          <h2 className={styles.title}>Check your work email.</h2>
          <p className={styles.intro}>
            We sent a verification link to <strong>{result.user.email}</strong>. Open it to verify your address
            {pending ? ' while an administrator reviews your agency account.' : ' and enter your workspace.'}
          </p>

          <dl className={styles.statusList}>
            <div>
              <dt>Account type</dt>
              <dd>{meta.eyebrow.replace(' account', '')}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{pending ? 'Waiting for administrator approval' : 'Active after email verification'}</dd>
            </div>
            {type === 'agency' && (
              <div>
                <dt>Invitation</dt>
                <dd>
                  {result.invitation?.valid
                    ? `Accepted — linked to ${result.invitation.workspaceName || 'the brand workspace'}`
                    : 'Not provided — an administrator must approve and assign a workspace'}
                </dd>
              </div>
            )}
          </dl>

          {pending && (
            <div className="notice notice-warn" role="status">
              <span className="notice-icon" aria-hidden="true">
                !
              </span>
              <div>
                <strong>Your agency account is pending.</strong> You can verify your email now. An administrator must
                approve the account and assign a brand workspace before you can submit content.
              </div>
            </div>
          )}

          <div className="notice" role="note">
            <span className="notice-icon" aria-hidden="true">
              ✉
            </span>
            <div>
              <strong>Demo email delivery.</strong> The verification link is written to the server console and to
              Settings → Sent emails. No real email is sent.
            </div>
          </div>

          <Link className="btn btn-primary" to="/login">
            Go to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow={meta.eyebrow} headline={meta.headline} lede={meta.lede} label={meta.title}>
      <p className="eyebrow">Account details</p>
      <h2 className={styles.title}>{meta.title}</h2>
      <p className={styles.intro}>
        Use a work email. You’ll verify it before you can submit content.
      </p>

      {formError && (
        <div className="notice notice-danger" role="alert" style={{ marginTop: 16 }}>
          <span className="notice-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>{formError}</strong>
            {duplicate && (
              <>
                {' '}
                <Link to="/login">Sign in to the existing account</Link>.
              </>
            )}
          </div>
        </div>
      )}

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <div className="form-field">
          <label htmlFor="signup-name">Full name</label>
          <input
            id="signup-name"
            name="name"
            className="input"
            autoComplete="name"
            value={fields.name}
            onChange={(event) => update('name', event.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'signup-name-error' : undefined}
            required
            maxLength={120}
          />
          {errors.name && (
            <p className="error-text" id="signup-name-error" role="alert">
              {errors.name}
            </p>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="signup-email">Work email</label>
          <input
            id="signup-email"
            name="email"
            type="email"
            className="input"
            autoComplete="email"
            value={fields.email}
            onChange={(event) => update('email', event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'signup-email-error' : 'signup-email-hint'}
            required
            maxLength={254}
          />
          <span className="hint" id="signup-email-hint">
            We never share this address. Verification keeps the review trail accountable.
          </span>
          {errors.email && (
            <p className="error-text" id="signup-email-error" role="alert">
              {errors.email}
            </p>
          )}
        </div>

        {type === 'creator' && (
          <div className="form-field">
            <label htmlFor="signup-team">Team (optional)</label>
            <input
              id="signup-team"
              name="team"
              className="input"
              value={fields.team}
              onChange={(event) => update('team', event.target.value)}
              aria-invalid={Boolean(errors.team)}
              maxLength={80}
            />
          </div>
        )}

        {type === 'agency' && (
          <>
            <div className="form-field">
              <label htmlFor="signup-agencyName">Agency or partner name</label>
              <input
                id="signup-agencyName"
                name="agencyName"
                className="input"
                value={fields.agencyName}
                onChange={(event) => update('agencyName', event.target.value)}
                aria-invalid={Boolean(errors.agencyName)}
                aria-describedby={errors.agencyName ? 'signup-agencyName-error' : undefined}
                required
                maxLength={120}
              />
              {errors.agencyName && (
                <p className="error-text" id="signup-agencyName-error" role="alert">
                  {errors.agencyName}
                </p>
              )}
            </div>
            <div className="form-field">
              <label htmlFor="signup-invitationCode">Invitation code (optional)</label>
              <input
                id="signup-invitationCode"
                name="invitationCode"
                className="input mono"
                value={fields.invitationCode}
                onChange={(event) => update('invitationCode', event.target.value)}
                aria-invalid={Boolean(errors.invitationCode)}
                aria-describedby={errors.invitationCode ? 'signup-invitationCode-error' : 'signup-invitationCode-hint'}
                maxLength={120}
                placeholder="BS-XXXXXXXX-XXXXXXXX"
              />
              <span className="hint" id="signup-invitationCode-hint">
                A valid code activates the account immediately and links it to the inviting brand workspace.
              </span>
              {errors.invitationCode && (
                <p className="error-text" id="signup-invitationCode-error" role="alert">
                  {errors.invitationCode}
                </p>
              )}
            </div>
          </>
        )}

        <div className="form-field">
          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            name="password"
            type="password"
            className="input"
            autoComplete="new-password"
            value={fields.password}
            onChange={(event) => update('password', event.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'signup-password-error signup-password-rules' : 'signup-password-rules'}
            required
          />
          <ul className={styles.rules} id="signup-password-rules" aria-label="Password requirements">
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
            <p className="error-text" id="signup-password-error" role="alert">
              {errors.password}
            </p>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="signup-confirmPassword">Confirm password</label>
          <input
            id="signup-confirmPassword"
            name="confirmPassword"
            type="password"
            className="input"
            autoComplete="new-password"
            value={fields.confirmPassword}
            onChange={(event) => update('confirmPassword', event.target.value)}
            aria-invalid={Boolean(errors.confirmPassword)}
            aria-describedby={errors.confirmPassword ? 'signup-confirmPassword-error' : undefined}
            required
          />
          {errors.confirmPassword && (
            <p className="error-text" id="signup-confirmPassword-error" role="alert">
              {errors.confirmPassword}
            </p>
          )}
        </div>

        <label className="checkbox">
          <input
            id="signup-termsAccepted"
            name="termsAccepted"
            type="checkbox"
            checked={fields.termsAccepted}
            onChange={(event) => update('termsAccepted', event.target.checked)}
            aria-invalid={Boolean(errors.termsAccepted)}
            aria-describedby={errors.termsAccepted ? 'signup-termsAccepted-error' : undefined}
            required
          />
          <span>
            I accept the <Link to="/legal/terms">terms of use</Link> and acknowledge the{' '}
            <Link to="/legal/privacy">privacy notice</Link>.
          </span>
        </label>
        {errors.termsAccepted && (
          <p className="error-text" id="signup-termsAccepted-error" role="alert">
            {errors.termsAccepted}
          </p>
        )}

        <button type="submit" className={`btn btn-primary ${styles.submit}`} disabled={busy}>
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" /> Creating account…
            </>
          ) : (
            'Create account'
          )}
        </button>
      </form>

      <div className={styles.inlineLinks} style={{ marginTop: 18 }}>
        <Link to="/signup">Choose a different account type</Link>
        <span className="muted">
          Already registered? <Link to="/login">Sign in</Link>
        </span>
      </div>
    </AuthShell>
  );
}
