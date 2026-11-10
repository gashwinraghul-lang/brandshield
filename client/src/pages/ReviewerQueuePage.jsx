import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, timeAgo } from '../api';
import styles from './ReviewerQueuePage.module.css';

const CHANNELS = ['LinkedIn', 'website', 'email', 'print'];
const SEVERITIES = [
  { value: '', label: 'Any severity' },
  { value: 'blocker', label: 'With blockers' },
  { value: 'warning', label: 'With warnings' },
];
const AGES = [
  { value: '', label: 'Any age' },
  { value: '2', label: 'Waiting 2+ days' },
  { value: '7', label: 'Waiting 7+ days' },
  { value: '14', label: 'Waiting 14+ days' },
];

export default function ReviewerQueuePage() {
  const [filters, setFilters] = useState({ channel: '', team: '', severity: '', ageDays: '' });
  const [queue, setQueue] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    setLoading(true);
    api
      .get(`/api/queue${params.toString() ? `?${params.toString()}` : ''}`)
      .then((payload) => {
        if (!active) return;
        setQueue(payload.queue);
        setTeams((previous) => [...new Set([...previous, ...payload.queue.map((item) => item.team)])].sort());
        setError('');
      })
      .catch((loadError) => active && setError(loadError.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [filters]);

  const stats = useMemo(
    () => ({
      total: queue.length,
      blockers: queue.filter((item) => item.counts.blockers > 0).length,
      warnings: queue.filter((item) => item.counts.warnings > 0).length,
      oldest: queue.reduce((max, item) => Math.max(max, item.ageDays || 0), 0),
    }),
    [queue]
  );

  const set = (key) => (event) => setFilters((previous) => ({ ...previous, [key]: event.target.value }));
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Reviewer queue · Brand</p>
          <h1 className="page-title">Decisions waiting for a human.</h1>
          <p className="page-subtitle">
            Every item here has been reviewed against the brand library and submitted by its creator. Open the
            workspace, inspect the evidence, then approve, request changes or reject.
          </p>
        </div>
        <span className="chip chip-accent">Oldest first · no auto-publishing</span>
      </header>

      <div className={styles.stats}>
        <div className="card card-tight">
          <span className={styles.statLabel}>In the queue</span>
          <strong className={styles.statValue}>{stats.total}</strong>
        </div>
        <div className="card card-tight">
          <span className={styles.statLabel}>With blockers</span>
          <strong className={`${styles.statValue} ${styles.danger}`}>{stats.blockers}</strong>
        </div>
        <div className="card card-tight">
          <span className={styles.statLabel}>With warnings</span>
          <strong className={`${styles.statValue} ${styles.warn}`}>{stats.warnings}</strong>
        </div>
        <div className="card card-tight">
          <span className={styles.statLabel}>Oldest wait</span>
          <strong className={styles.statValue}>{stats.oldest}d</strong>
        </div>
      </div>

      <div className="panel">
        <div className={styles.filters} role="group" aria-label="Filter the reviewer queue">
          <div className="form-field">
            <label htmlFor="channel-filter">Channel</label>
            <select id="channel-filter" className="select" value={filters.channel} onChange={set('channel')}>
              <option value="">All channels</option>
              {CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="team-filter">Team</label>
            <select id="team-filter" className="select" value={filters.team} onChange={set('team')}>
              <option value="">All teams</option>
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="severity-filter">Findings</label>
            <select id="severity-filter" className="select" value={filters.severity} onChange={set('severity')}>
              {SEVERITIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="age-filter">Age</label>
            <select id="age-filter" className="select" value={filters.ageDays} onChange={set('ageDays')}>
              {AGES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <span className="label">&nbsp;</span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setFilters({ channel: '', team: '', severity: '', ageDays: '' })}
              disabled={!hasFilters}
            >
              Clear filters
            </button>
          </div>
        </div>

        {error && (
          <div className="notice notice-danger" role="alert" style={{ marginTop: 16 }}>
            <span className="notice-icon" aria-hidden="true">
              !
            </span>
            <div>{error}</div>
          </div>
        )}

        {loading ? (
          <div className="loading-screen" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <span>Checking who is waiting…</span>
          </div>
        ) : queue.length ? (
          <ul className={styles.queueList}>
            {queue.map((item) => (
              <li key={item.id} className={styles.queueCard}>
                <div className={styles.queueMain}>
                  <div className={styles.queueTop}>
                    <span className="chip">{item.channel}</span>
                    <span className={`chip ${item.ageDays >= 7 ? 'chip-warn' : ''}`}>
                      Waiting {item.ageDays} day{item.ageDays === 1 ? '' : 's'}
                    </span>
                    {item.counts.blockers > 0 ? (
                      <span className="chip chip-danger">{item.counts.blockers} blockers</span>
                    ) : (
                      <span className="chip chip-ok">No blockers</span>
                    )}
                    {item.counts.warnings > 0 && <span className="chip chip-warn">{item.counts.warnings} warnings</span>}
                  </div>
                  <h2 className={styles.queueTitle}>{item.title}</h2>
                  <p className={styles.queueMeta}>
                    By {item.owner_name} · {item.team} · Submitted {timeAgo(item.submitted_at || item.created_at)} · Version v
                    {item.current_version}
                  </p>
                  <p className={styles.excerpt}>{String(item.content || '').slice(0, 220)}{String(item.content || '').length > 220 ? '…' : ''}</p>
                </div>
                <div className={styles.queueActions}>
                  <Link to={`/submissions/${item.id}`} className="btn btn-primary">
                    Open review
                  </Link>
                  <span className="tiny muted">Human decision required</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <h3>{hasFilters ? 'No submissions match these filters' : 'The queue is clear'}</h3>
            <p>
              {hasFilters
                ? 'Try clearing a filter to see other submissions waiting for review.'
                : 'When creators submit content for review, it will appear here oldest first.'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
