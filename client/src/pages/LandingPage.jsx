import { Link } from 'react-router-dom';
import { useAuth, homeForRole } from '../auth/AuthContext';
import InkVaultScene from '../components/InkVaultScene';
import Wordmark from '../components/Wordmark';
import styles from './LandingPage.module.css';

const FEATURES = [
  {
    eyebrow: 'Grounded review',
    title: 'Every finding shows its evidence',
    body: 'Deterministic rules catch measurable risks first. AI suggestions are only accepted when they cite a guideline, rule or approved fact.',
  },
  {
    eyebrow: 'Human control',
    title: 'A person makes every final call',
    body: 'Creators decide which suggestions to accept. Reviewers approve, request changes or reject. Nothing publishes automatically.',
  },
  {
    eyebrow: 'Built to audit',
    title: 'A history you can defend',
    body: 'Version history, reviewer feedback and exports are append-only, so you can trace why content was approved.',
  },
];

const ACCOUNT_TYPES = [
  { name: 'Creator', note: 'Submit content and decide on suggestions' },
  { name: 'Reviewer / Brand Manager', note: 'Approve, request changes or reject' },
  { name: 'Agency or partner', note: 'Work inside invited brand workspaces' },
  { name: 'Leadership', note: 'Read dashboards and trend reports' },
];

export default function LandingPage() {
  const { user, org, loading } = useAuth();
  const signedInDestination = user ? (user.accountState === 'pending' ? '/pending' : homeForRole(user.role)) : null;

  return (
    <div className={styles.page}>
      <a className="skip-link" href="#landing-choices">
        Skip to sign in or create an account
      </a>
      <InkVaultScene palette={org.palette} />

      <header className={styles.nav}>
        <Link to="/" className={styles.brand} aria-label="BrandShield.ai home">
          <Wordmark />
        </Link>
        <nav className={styles.navLinks} aria-label="Account">
          {user ? (
            <Link className="btn btn-primary btn-sm" to={signedInDestination}>
              Go to my workspace
            </Link>
          ) : (
            <>
              <Link className="btn btn-ghost btn-sm" to="/login">
                Sign in
              </Link>
              <Link className="btn btn-primary btn-sm" to="/signup">
                Create an account
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="landing-title">
          <p className="eyebrow">AI brand governance by Inkloom AI</p>
          <h1 id="landing-title" className={styles.headline}>
            Every word on brand.
            <br />
            Every claim backed.
          </h1>
          <p className={styles.lede}>
            BrandShield.ai reviews content against your approved guidelines, facts and assets before it goes out. It
            highlights risk, shows the evidence, and leaves the final decision with a human.
          </p>
          {!loading && !user && (
            <div className={styles.choices} id="landing-choices">
              <Link to="/login" className={styles.choice} aria-label="Sign in to an existing BrandShield.ai account">
                <span className={styles.choiceEyebrow}>Already have an account?</span>
                <span className={styles.choiceTitle}>Sign in</span>
                <span className={styles.choiceBody}>Return to your review room and pick up where you left off.</span>
                <span className={styles.choiceAction}>Sign in securely →</span>
              </Link>
              <Link to="/signup" className={styles.choice} aria-label="Create a new BrandShield.ai account">
                <span className={styles.choiceEyebrow}>New to BrandShield.ai?</span>
                <span className={styles.choiceTitle}>Create an account</span>
                <span className={styles.choiceBody}>Choose the account type that matches how you work with the brand.</span>
                <span className={styles.choiceAction}>Start a secure sign-up →</span>
              </Link>
            </div>
          )}
          {!loading && user && (
            <div className={styles.signedIn}>
              <p className="muted">
                Signed in as <strong>{user.name}</strong>. {user.emailVerified ? '' : 'Verify your email to submit content.'}
              </p>
              <Link className="btn btn-primary" to={signedInDestination}>
                Go to my workspace
              </Link>
            </div>
          )}
        </section>

        <section className={styles.features} aria-label="How BrandShield.ai works">
          {FEATURES.map((feature) => (
            <article key={feature.title} className={styles.feature}>
              <p className="eyebrow">{feature.eyebrow}</p>
              <h2>{feature.title}</h2>
              <p className={styles.featureBody}>{feature.body}</p>
            </article>
          ))}
        </section>

        <section className={styles.accounts} aria-labelledby="account-types-title">
          <div>
            <p className="eyebrow">Account types</p>
            <h2 id="account-types-title" className={styles.sectionTitle}>
              The right access for every role.
            </h2>
          </div>
          <ul className={styles.accountList}>
            {ACCOUNT_TYPES.map((type) => (
              <li key={type.name}>
                <strong>{type.name}</strong>
                <span>{type.note}</span>
              </li>
            ))}
          </ul>
          <p className={styles.accountNote}>
            Admin accounts are never self-serve. An existing administrator creates them from Settings, or the first one
            is bootstrapped with <code>npm run create-admin</code>.
          </p>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>BrandShield.ai by Inkloom AI</span>
        <span aria-hidden="true">·</span>
        <Link to="/legal/terms">Terms</Link>
        <Link to="/legal/privacy">Privacy</Link>
        <span className="muted">Humans make every final decision.</span>
      </footer>
    </div>
  );
}
