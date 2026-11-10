import { useAuth } from '../auth/AuthContext';
import InkVaultScene from './InkVaultScene';
import Wordmark from './Wordmark';
import styles from './AuthShell.module.css';

const PRINCIPLES = [
  {
    title: 'Grounded in your brand library',
    body: 'Every blocker or warning cites a guideline, rule or approved fact.',
  },
  {
    title: 'Human decisions, always',
    body: 'Nothing publishes automatically. Creators choose. Reviewers decide.',
  },
  {
    title: 'Evidence you can audit',
    body: 'Revision history, decisions and exports are append-only and transparent.',
  },
];

/**
 * Shared Ink Vault shell for the public account pages (sign in, sign up,
 * verification, password reset). It keeps the story side consistent while each
 * page supplies its own card content.
 */
export default function AuthShell({ eyebrow, headline, lede, children, footer, label = 'Account form' }) {
  const { org } = useAuth();
  return (
    <main className={styles.page}>
      <a className="skip-link" href="#auth-card">
        Skip to the form
      </a>
      <InkVaultScene palette={org.palette} />
      <div className={styles.layout}>
        <section className={styles.story} aria-labelledby="auth-story-title">
          <Wordmark large />
          <p className="eyebrow" style={{ marginTop: 26 }}>
            {eyebrow || 'AI brand governance by Inkloom AI'}
          </p>
          <h1 id="auth-story-title" className={styles.headline}>
            {headline || (
              <>
                Every word on brand.
                <br />
                Every claim backed.
              </>
            )}
          </h1>
          <p className={styles.lede}>
            {lede ||
              'BrandShield.ai reviews content against your approved guidelines, facts and assets before it goes out. It highlights risk, shows the evidence, and leaves the final decision with a human.'}
          </p>
          <ul className={styles.principles}>
            {PRINCIPLES.map((principle) => (
              <li key={principle.title}>
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>{principle.title}</strong>
                  <p>{principle.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className={styles.demoNote}>
            <strong>Demo workspace.</strong> Northwind Labs seed data uses fictional people and facts. AI review runs
            locally with the MOCK provider unless an admin switches it on.
          </p>
        </section>

        <section className={styles.cardColumn} id="auth-card" aria-label={label}>
          <div className={`panel ${styles.card}`}>{children}</div>
          {footer && <p className={styles.footer}>{footer}</p>}
        </section>
      </div>
    </main>
  );
}
