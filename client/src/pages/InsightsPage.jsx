import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadFile, formatDateTime, titleCase } from '../api';
import { useAuth } from '../auth/AuthContext';
import Modal from '../components/Modal';
import TrendChart from '../components/TrendChart';
import styles from './InsightsPage.module.css';

function Tile({ label, value, note, tone }) {
  return (
    <div className={`card card-tight ${styles.tile} ${tone ? styles[tone] : ''}`}>
      <span className={styles.tileLabel}>{label}</span>
      <strong className={styles.tileValue}>{value}</strong>
      {note && <span className={styles.tileNote}>{note}</span>}
    </div>
  );
}

export default function InsightsPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [draft, setDraft] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  const canAudit = user.role === 'admin' || user.role === 'leadership';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await api.get('/api/insights');
      setData(payload);
      setError('');
      if (canAudit) {
        const auditPayload = await api.get('/api/audit?limit=8');
        setAudit(auditPayload.entries);
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [canAudit]);

  useEffect(() => {
    load();
  }, [load]);

  const highestHeat = useMemo(
    () => Math.max(1, ...(data?.heatmap || []).flatMap((row) => row.cells.map((cell) => cell.count))),
    [data]
  );

  const highestChannel = useMemo(
    () => Math.max(1, ...(data?.byChannel || []).map((channel) => channel.total)),
    [data]
  );

  const openDraft = async (item) => {
    if (!item.id) {
      setFeedback('This guideline no longer exists in the library, so a draft cannot be generated.');
      return;
    }
    setDraft({ item, loading: true, data: null, error: '' });
    try {
      const payload = await api.post(`/api/insights/guidelines/${item.id}/draft`, {});
      setDraft({ item, loading: false, data: payload, error: '' });
    } catch (draftError) {
      setDraft({ item, loading: false, data: null, error: draftError.message });
    }
  };

  const saveDraftToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(draft.data.draft);
      setFeedback('Draft copied. Paste it into the brand library when you are ready to edit and publish it.');
    } catch {
      setFeedback('Clipboard access was blocked. Select the draft text and copy it manually.');
    }
  };

  const exportAudit = async () => {
    try {
      await downloadFile('/api/audit/export', 'brandshield-audit.csv');
    } catch (exportError) {
      setFeedback(exportError.message);
    }
  };

  const verifyAudit = async () => {
    setVerifyBusy(true);
    try {
      const payload = await api.get('/api/audit/verify');
      setVerifyResult(payload);
    } catch (verifyError) {
      setFeedback(verifyError.message);
    } finally {
      setVerifyBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <span>Reading the brand pulse…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <section className="page">
        <div className="notice notice-danger" role="alert">
          <span className="notice-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>Insights could not load.</strong> {error}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Insights · Brand intelligence</p>
          <h1 className="page-title">Where the brand needs help.</h1>
          <p className="page-subtitle">
            Aggregate findings across channels and teams. Use the pattern, not an individual score, to decide which
            guidance needs clarifying or which team needs support.
          </p>
        </div>
        <div className="row">
          {canAudit && (
            <button type="button" className="btn btn-primary" onClick={exportAudit}>
              Export audit CSV
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={load}>
            Refresh
          </button>
        </div>
      </header>

      {feedback && (
        <div className="notice" role="status">
          <span className="notice-icon" aria-hidden="true">
            ✓
          </span>
          <div>{feedback}</div>
        </div>
      )}

      <div className={styles.tiles}>
        <Tile label="Findings" value={data.totals.issues} note={`${data.totals.submissions} submissions analysed`} />
        <Tile label="Blockers" value={data.totals.blockers} note="Claims and access risks" tone="danger" />
        <Tile label="Warnings" value={data.totals.warnings} note="Tone, terms and structure" tone="warn" />
        <Tile label="Suggestions" value={data.totals.suggestions} note="Ideas without a hard reference" />
        <Tile label="Resolved" value={data.totals.resolved} note="Accepted or edited by a human" tone="ok" />
      </div>

      <div className={styles.topGrid}>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Findings over time</h2>
              <p className="tiny muted">Every issue created over the last 12 weeks, by severity.</p>
            </div>
            <span className="chip">Weekly</span>
          </div>
          <TrendChart trend={data.trend} label="Findings over the last 12 weeks" />
          <div className={styles.pulseSummary}>
            <div>
              <strong>{data.pulse.resolved}</strong>
              <span className="tiny muted">resolved by humans</span>
            </div>
            <div>
              <strong>{data.pulse.blockers}</strong>
              <span className="tiny muted">blockers seen</span>
            </div>
            <div>
              <strong>{data.pulse.warnings}</strong>
              <span className="tiny muted">warnings seen</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Needs clarity</h2>
              <p className="tiny muted">Guidelines producing repeated findings. The guidance may need a sharper example.</p>
            </div>
          </div>
          {data.needsClarity.length ? (
            <ul className={styles.clarityList}>
              {data.needsClarity.map((item) => (
                <li key={item.reference}>
                  <div className={styles.clarityMain}>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="mono">{item.reference}</span>
                      <span className="chip chip-warn">{item.total} findings</span>
                    </div>
                    <strong>{item.title}</strong>
                    <p className="tiny muted">
                      {item.open} open · {Object.keys(item.teams || {}).length} teams ·{' '}
                      {Object.keys(item.channels || {}).length} channels
                    </p>
                  </div>
                  {user.role === 'admin' && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => openDraft(item)}
                      disabled={!item.id}
                      title={item.id ? 'Draft a clearer version with the AI assistant' : 'Guideline not found'}
                    >
                      Draft update
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <h3>No repeated pressure yet</h3>
              <p>When a guideline produces two or more findings, it will appear here.</p>
            </div>
          )}
          <p className="tiny muted" style={{ marginTop: 12 }}>
            Drafts are suggestions for an admin. They are never saved or applied automatically.
          </p>
        </div>
      </div>

      <div className={styles.midGrid}>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Clarity heatmap</h2>
              <p className="tiny muted">Findings by guideline and team. Darker cells mean more friction.</p>
            </div>
            <span className="chip">{data.teams.length} teams</span>
          </div>
          <div className="table-wrap">
            <table className={`data-table ${styles.heatmap}`}>
              <caption className="sr-only">Findings by guideline and team</caption>
              <thead>
                <tr>
                  <th scope="col">Guideline</th>
                  {data.teams.map((team) => (
                    <th scope="col" key={team}>
                      {team}
                    </th>
                  ))}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.heatmap.map((row) => (
                  <tr key={row.reference}>
                    <th scope="row">
                      <span className="mono">{row.reference}</span>
                      <span className={styles.heatTitle}>{row.title}</span>
                    </th>
                    {row.cells.map((cell) => (
                      <td key={cell.team}>
                        <span
                          className={styles.heatCell}
                          style={{ opacity: cell.count ? 0.24 + (cell.count / highestHeat) * 0.76 : 0 }}
                          aria-label={`${cell.count} findings`}
                        >
                          {cell.count}
                        </span>
                      </td>
                    ))}
                    <td>
                      <strong>{row.total}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-heading">
              <h2>By channel</h2>
            </div>
            <ul className={styles.channelBars}>
              {data.byChannel.map((channel) => (
                <li key={channel.channel}>
                  <div className={styles.channelHead}>
                    <strong>{titleCase(channel.channel)}</strong>
                    <span className="tiny muted">
                      {channel.total} findings · {channel.blockers} blockers
                    </span>
                  </div>
                  <span className={styles.barTrack} aria-hidden="true">
                    <i style={{ width: `${(channel.total / highestChannel) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <h2>Team pulse</h2>
            </div>
            <ul className={styles.teamPulse}>
              {data.pulse.byTeam.map((team) => (
                <li key={team.team}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>{team.team}</strong>
                    <span className="tiny muted">{team.resolved} resolved</span>
                  </div>
                  <div className={styles.teamCounts}>
                    <span className="chip chip-danger">{team.blockers} blockers</span>
                    <span className="chip chip-warn">{team.warnings} warnings</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {canAudit && (
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Audit & evidence</h2>
              <p className="tiny muted">
                Append-only decision history for governance. Exports include review actions, findings and audit events,
                never full content or secrets.
              </p>
            </div>
            <div className="row">
              <button type="button" className="btn btn-secondary btn-sm" onClick={verifyAudit} disabled={verifyBusy}>
                {verifyBusy ? 'Checking…' : 'Verify integrity'}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={exportAudit}>
                Export CSV
              </button>
            </div>
          </div>

          {verifyResult && (
            <div className={`notice ${verifyResult.appendOnlyGaps.length ? 'notice-danger' : ''}`} role="status">
              <span className="notice-icon" aria-hidden="true">
                {verifyResult.appendOnlyGaps.length ? '!' : '✓'}
              </span>
              <div>
                <strong>
                  {verifyResult.appendOnlyGaps.length
                    ? `${verifyResult.appendOnlyGaps.length} version gap${verifyResult.appendOnlyGaps.length === 1 ? '' : 's'} found.`
                    : 'No version gaps found. Append-only history is consistent.'}
                </strong>{' '}
                Digest <span className="mono">{verifyResult.digest.slice(0, 16)}…</span> · generated{' '}
                {formatDateTime(verifyResult.generatedAt)}
              </div>
            </div>
          )}

          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data-table">
              <caption className="sr-only">Recent audit events</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Event</th>
                  <th scope="col">Entity</th>
                  <th scope="col">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={entry.id}>
                    <td className="small">{formatDateTime(entry.created_at)}</td>
                    <td className="small">{entry.user_name || 'System'}</td>
                    <td>
                      <span className="chip">{entry.event_type}</span>
                    </td>
                    <td className="mono">{entry.entity_type || '—'}</td>
                    <td className="tiny muted">
                      {entry.metadata ? Object.entries(entry.metadata).map(([key, value]) => `${key}: ${String(value)}`).join(' · ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny muted" style={{ marginTop: 10 }}>
            Need the full library? Admins can review all guideline versions in the <Link to="/library">brand library</Link>.
          </p>
        </div>
      )}

      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={draft ? `Draft update · ${draft.item.reference}` : ''}
        description="A local or external AI assistant proposes wording from the guideline and recurring findings. Nothing is saved automatically."
        wide
      >
        {draft?.loading ? (
          <div className="loading-screen" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <span>Drafting a clearer version…</span>
          </div>
        ) : draft?.error ? (
          <p className="error-text" role="alert">
            {draft.error}
          </p>
        ) : (
          draft?.data && (
            <div className="stack">
              {draft.data.notice && (
                <div className="notice notice-warn">
                  <span className="notice-icon" aria-hidden="true">
                    !
                  </span>
                  <div>{draft.data.notice}</div>
                </div>
              )}
              <div className="row">
                <span className="chip">{draft.data.provider}{draft.data.providerVersion ? ` · ${draft.data.providerVersion}` : ''}</span>
                <span className={`chip ${draft.data.externalAI ? 'chip-warn' : 'chip-ok'}`}>
                  {draft.data.externalAI ? 'External AI used' : 'Content stayed local'}
                </span>
              </div>
              <pre className={styles.draftBody}>{draft.data.draft}</pre>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
                  Close
                </button>
                <button type="button" className="btn btn-primary" onClick={saveDraftToClipboard}>
                  Copy draft
                </button>
              </div>
            </div>
          )
        )}
      </Modal>
    </section>
  );
}
