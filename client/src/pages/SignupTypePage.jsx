import { Link } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import styles from './AccountPages.module.css';

const TYPES = [
  {
    type: 'creator',
    icon: '✎',
    name: 'Creator',
    body: 'Submit content, run reviews, and decide which suggestions to accept.',
  },
  {
    type: 'reviewer',
    icon: '✓',
    name: 'Reviewer / Brand Manager',
    body: 'Approve, request changes or reject content across teams.',
  },
  {
    type: 'agency',
    icon: '◎',
    name: 'Agency or partner',
    body: 'Create content inside invited brand workspaces only.',
  },
  {
    type: 'leadership',
    icon: '◔',
    name: 'Leadership',
    body: 'Read dashboards, trends and audit exports without editing.',
  },
];

export default function SignupTypePage() {
  return (
    <AuthShell
      eyebrow="Create an account"
      headline={
        <>
          Choose how you
          <br />
          work with the brand.
        </>
      }
      lede="Every account type has a clear job. Pick the one that matches your work; you can change details later with an administrator."
      label="Choose an account type"
    >
      <p className="eyebrow">Account type</p>
      <h2 className={styles.title}>Who are you?</h2>
      <p className={styles.intro}>
        Creator and leadership accounts are active as soon as you verify your email. Agency accounts wait for an
        administrator unless you have an invitation code.
      </p>

      <div className={styles.typeGrid}>
        {TYPES.map((item) => (
          <Link key={item.type} to={`/signup/details?type=${item.type}`} className={styles.typeCard}>
            <span className={styles.typeIcon} aria-hidden="true">
              {item.icon}
            </span>
            <span>
              <span className={styles.typeName}>{item.name}</span>
              <span className={styles.typeBody}>{item.body}</span>
            </span>
            <span className={styles.typeArrow} aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>

      <p className={styles.adminNote}>
        Admin accounts are never offered at sign-up. An existing administrator creates them from Settings, or the first
        one is bootstrapped with <code>npm run create-admin</code>.
      </p>

      <div className={styles.inlineLinks} style={{ marginTop: 20 }}>
        <span className="muted">Already have an account?</span>
        <Link to="/login">Sign in instead</Link>
      </div>
    </AuthShell>
  );
}
