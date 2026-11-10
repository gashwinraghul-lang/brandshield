import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate, timeAgo, titleCase } from '../api';
import { useAuth } from '../auth/AuthContext';
import { StatusPill } from '../components/Badges';
import TrendChart from '../components/TrendChart';
import styles from './DashboardPage.module.css';

function Stat({ label, value, note, tone = '' }) {
  return (
    <div className={`card card-tight ${styles.stat} ${tone ? styles[tone] : ''}`}>
      <span className={styles.statLabel}>{label}</span>
      <strong className={styles.statValue}>{value}</strong>
      {note && <span className={styles.statNote}>{note}</span>}
    </div>
  );
}

function SubmissionRow({ submission }) {
  return (
    <li className={styles.submissionRow}>
      <div className={styles.submissionMain}>
        <Link to={`/submissions/${submission.id}`} className={styles.submissionTitle}>
          {submission.title}
        </Link>
        <div className={styles.submissionMeta}>
          <span className="chip">{submission.channel}</span>
          <span className="tiny muted">Updated {timeAgo(submission.updated_at)}</span>
          {submission.owner_name && <span className="tiny muted">by {submission.owner_name}</span>}
          {submission.blockers > 0 && <span className="chip chip-danger">{submission.blockers} open blockers</span>}
        </div>
      </div>
      <StatusPill status={submission.status} />
    </li>
  );
}

export default function DashboardPage() {
  const { user, privacy } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .get('/api/dashboard')
      .then((payload) => active && setData(payload))
      .catch((loadError) => active && setError(loadError.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const pendingBlockers = useMemo(
    () => (data?.brandPulse?.byTeam || []).reduce((total, team) => total + team.blockers, 0),
    [data]
  );

  const totalSubmissions = useMemo(
    () => Object.values(data?.statusCounts || {}).reduce((total, count) => total + count, 0),
    [data]
  );

  const firstName = user.name.split(' ')[0];
  const canCreate = user.role === 'creator' || user.role === 'admin';
  const canQueue = user.role === 'reviewer' || user.role === 'admin';

  if (loading) {
    return (
      <div className="loading-screen" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <span>Gathering the brand pulse…</span>
      </div>
    );
  }

  if (error) {
    return (
      <section className="page">
        <div className="notice notice-danger" role="alert">
          <span className="notice-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>The dashboard could not load.</strong> {error}
          </div>
        </div>
      </section>
    );
  }

  const pulse = data.brandPulse;
  const pendingReviews = data.pendingReviews || [];

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Dashboard · {titleCase(user.role)}</p>
          <h1 className="page-title">Good to see you, {firstName}.</h1>
          <p className="page-subtitle">
            {user.role === 'creator'
              ? 'Your content, its open findings, and the decisions waiting on you. Nothing moves forward without you.'
              : user.role === 'reviewer'
                ? 'A calm view of what needs a brand decision. Review the evidence, then decide.'
                : 'Brand health, recurring risk and the reviews in motion across Northwind Labs.'}
          </p>
        </div>
        <div className="row">
          {canCreate && (
            <Link to="/new" className="btn btn-primary">
              New submission
            </Link>
          )}
          {canQueue && (
            <Link to="/queue" className="btn btn-secondary">
              Reviewer queue
            </Link>
          )}
          {user.role !== 'creator' && (
            <Link to="/insights" className="btn btn-ghost">
              Insights
            </Link>
          )}
        </div>
      </header>

      <div className={styles.stats}>
        <Stat label="Submissions" value={totalSubmissions} note="All content in the workspace" />
        <Stat
          label="Awaiting review"
          value={data.statusCounts.awaiting_review || 0}
          note={canQueue ? 'Ready for a reviewer decision' : 'With the brand team'}
          tone="warn"
        />
        <Stat
          label="Open blockers"
          value={pendingBlockers}
          note="Must be resolved before submitting"
          tone={pendingBlockers > 0 ? 'danger' : 'ok'}
        />
        <Stat
          label="Resolved findings"
          value={pulse.resolved}
          note={`${pulse.blockers + pulse.warnings + pulse.suggestions} findings seen in total`}
          tone="ok"
        />
      </div>

      <div className={styles.layout}>
        <div className="stack">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>My submissions</h2>
                <p className="tiny muted">The latest work you own, with the blocker count that matters.</p>
              </div>
              {canCreate && (
                <Link to="/new" className="btn btn-secondary btn-sm">
                  Create
                </Link>
              )}
            </div>
            {data.mySubmissions.length ? (
              <ul className={styles.list}>
                {data.mySubmissions.map((submission) => (
                  <SubmissionRow submission={submission} key={submission.id} />
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                <h3>No submissions yet</h3>
                <p>Create a piece of content to review it against the brand library.</p>
                {canCreate && (
                  <Link to="/new" className="btn btn-primary btn-sm">
                    Start a submission
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>{user.role === 'creator' ? 'Waiting on you or the brand team' : 'Pending review'}</h2>
                <p className="tiny muted">
                  {user.role === 'creator'
                    ? 'Submissions that are with the brand team, or have changes to make.'
                    : 'Submitted work, oldest first. Reviewers see the evidence before deciding.'}
                </p>
              </div>
              {canQueue && (
                <Link to="/queue" className="btn btn-secondary btn-sm">
                  Open queue
                </Link>
              )}
            </div>
            {pendingReviews.length ? (
              <ul className={styles.list}>
                {pendingReviews.map((submission) => (
                  <SubmissionRow submission={submission} key={submission.id} />
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                <h3>Nothing waiting</h3>
                <p>{canQueue ? 'The reviewer queue is clear right now.' : 'No submissions are in flight.'}</p>
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>Brand pulse</h2>
                <p className="tiny muted">Findings per week · last 8 weeks</p>
              </div>
              <span className="chip chip-accent">{privacy.externalAI ? 'External AI on' : 'Local mock AI'}</span>
            </div>
            <TrendChart trend={pulse.trend} compact label="Brand findings by week" />
            <div className={styles.teamList}>
              {pulse.byTeam.length ? (
                pulse.byTeam.map((team) => (
                  <div className={styles.teamRow} key={team.team}>
                    <strong>{team.team}</strong>
                    <span className="tiny muted">
                      {team.blockers} blockers · {team.warnings} warnings
                    </span>
                    <span className="chip chip-ok">{team.resolved} resolved</span>
                  </div>
                ))
              ) : (
                <p className="tiny muted">No team findings yet.</p>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>Facts to watch</h2>
                <p className="tiny muted">Approved facts approaching expiry.</p>
              </div>
              {user.role === 'admin' && (
                <Link to="/library" className="btn btn-ghost btn-sm">
                  Library
                </Link>
              )}
            </div>
            {data.expiringFacts.length ? (
              <ul className={styles.factList}>
                {data.expiringFacts.map((fact) => (
                  <li key={fact.id}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="chip">{fact.stable_id}</span>
                      {fact.expired ? (
                        <span className="chip chip-danger">Expired</span>
                      ) : (
                        <span className="chip chip-warn">Expires {formatDate(fact.expiry_date)}</span>
                      )}
                    </div>
                    <p className={styles.factStatement}>{fact.statement}</p>
                    <p className="tiny muted">Owner: {fact.owner}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tiny muted">No facts have an expiry date.</p>
            )}
          </div>

          <div className="panel">
            <div className="panel-heading">
              <h2>Recurring pressure</h2>
            </div>
            {data.recurring.length ? (
              <ul className={styles.recurring}>
                {data.recurring.map((item) => (
                  <li key={item.reference}>
                    <span className="mono">{item.reference}</span>
                    <span className={styles.recurringBar} aria-hidden="true">
                      <i style={{ width: `${Math.min(100, (item.count / data.recurring[0].count) * 100)}%` }} />
                    </span>
                    <span className="tiny muted">{item.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tiny muted">No guideline pressure recorded yet.</p>
            )}
            <p className="tiny muted" style={{ marginTop: 12 }}>
              High recurring counts are a signal that the guidance itself may need clarifying.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
