import { Link, useParams } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import styles from './AccountPages.module.css';

const CONTENT = {
  terms: {
    eyebrow: 'Terms of use',
    headline: (
      <>
        Clear rules,
        <br />
        for clearer work.
      </>
    ),
    lede: 'These demo terms explain how BrandShield.ai is meant to be used. They are not legal advice and are not a production contract.',
    title: 'Terms of use',
    body: (
      <>
        <p>
          BrandShield.ai is a brand-governance tool. It highlights content that may conflict with your approved brand
          library and records human decisions. It does not publish content automatically.
        </p>
        <h2>Your responsibilities</h2>
        <ul>
          <li>Use a work email you are allowed to use and keep your password private.</li>
          <li>Only upload content you have the right to review and store.</li>
          <li>Review every finding before accepting a suggestion. Humans make the final decision.</li>
          <li>Do not use the service to process unlawful, harmful or confidential third-party material without permission.</li>
        </ul>
        <h2>Demo data</h2>
        <p>
          The Northwind Labs workspace, its guidelines, facts and people are fictional seed data. Demo accounts are for
          evaluation only and must not be used for real client content.
        </p>
        <h2>Availability</h2>
        <p>
          This is a demonstration build. Features and data may change, and no uptime or data-retention guarantee is
          offered beyond the retention settings shown to administrators.
        </p>
      </>
    ),
  },
  privacy: {
    eyebrow: 'Privacy notice',
    headline: (
      <>
        Your content
        <br />
        stays accountable.
      </>
    ),
    lede: 'This notice describes what the demo stores, where content goes, and the choices administrators control.',
    title: 'Privacy notice',
    body: (
      <>
        <p>
          BrandShield.ai stores the account details you provide, the content you submit, review findings, decisions and
          an append-only audit trail. Passwords are hashed with bcrypt and never stored in plain text.
        </p>
        <h2>Where content goes</h2>
        <ul>
          <li>
            By default, review runs locally with the MOCK provider. Content does not leave the server.
          </li>
          <li>
            Administrators can enable an external AI provider. Confidential patterns are masked before content leaves the
            server and restored locally afterwards.
          </li>
          <li>API keys live in server-side environment variables and are never exposed to the browser.</li>
        </ul>
        <h2>Email</h2>
        <p>
          Verification and password-reset emails are mocked in this build. Their full contents, including action links,
          are written to the server console and to the administrator-only Sent emails panel. No external email service is
          contacted.
        </p>
        <h2>Retention and decisions</h2>
        <p>
          Administrators choose a retention period and can purge old submissions, except content awaiting review.
          Reviewers and administrators can see submission content; creators and agency users see only their own content
          within workspaces they belong to.
        </p>
        <h2>Your choices</h2>
        <p>
          You can sign out at any time, ask an administrator to deactivate your account, or request a password reset from
          the sign-in page. To have demo data removed, reset the database with the documented seed commands.
        </p>
      </>
    ),
  },
};

export default function LegalPage() {
  const { kind } = useParams();
  const content = CONTENT[kind];

  if (!content) {
    return (
      <AuthShell eyebrow="Not found" headline="That page is not in the vault." label="Legal page not found">
        <p className="eyebrow">Page not found</p>
        <h2 className={styles.title}>We couldn’t find that document.</h2>
        <p className={styles.intro}>Choose the terms of use or the privacy notice.</p>
        <div className={styles.inlineLinks} style={{ marginTop: 18 }}>
          <Link to="/legal/terms">Terms of use</Link>
          <Link to="/legal/privacy">Privacy notice</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow={content.eyebrow} headline={content.headline} lede={content.lede} label={content.title}>
      <p className="eyebrow">{content.eyebrow}</p>
      <h2 className={styles.title}>{content.title}</h2>
      <div className={styles.legal}>{content.body}</div>
      <div className={styles.inlineLinks} style={{ marginTop: 22 }}>
        <Link to={kind === 'terms' ? '/legal/privacy' : '/legal/terms'}>
          {kind === 'terms' ? 'Read the privacy notice' : 'Read the terms of use'}
        </Link>
        <Link to="/">Back to the home page</Link>
      </div>
    </AuthShell>
  );
}
