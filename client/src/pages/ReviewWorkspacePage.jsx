import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, downloadFile, formatDateTime, timeAgo, titleCase } from '../api';
import { useAuth } from '../auth/AuthContext';
import { ReferenceChips, SeverityBadge, StatusPill } from '../components/Badges';
import DiffView from '../components/DiffView';
import Modal from '../components/Modal';
import PrivacyNotice from '../components/PrivacyNotice';
import { tabKeyboard } from '../utils/tabs';
import styles from './ReviewWorkspacePage.module.css';

const SEVERITY_RANK = { blocker: 0, warning: 1, suggestion: 2 };
const ACTIVITY_TABS = ['discussion', 'versions'];

const ACTION_LABELS = {
  issue_accepted: 'Finding accepted',
  issue_edited: 'Finding edited and accepted',
  issue_rejected: 'Finding rejected',
  submit: 'Submitted for review',
  approve: 'Approved',
  request_changes: 'Changes requested',
  reject: 'Rejected',
  comment: 'Comment',
};

const INSTRUCTION = /^(add|remove|replace|shorten|split|change|test|describe|rephrase|trim|rewrite|consider|link|review|check|mark|use descriptive|open)\b/i;

function isReplacementSuggestion(issue) {
  const suggestion = String(issue.suggestion || '').trim();
  if (!suggestion) return false;
  if (Number(issue.span_end) <= Number(issue.span_start)) return false;
  if (INSTRUCTION.test(suggestion)) return false;
  return suggestion.length <= Math.max(80, String(issue.quote || '').length * 4);
}

function isAltTextIssue(issue, submission) {
  return (
    Boolean(submission) &&
    submission.type === 'image' &&
    issue.category === 'accessibility' &&
    /ALT/i.test(String(issue.rule_ref || ''))
  );
}

function buildSegments(content, issues) {
  const text = String(content || '');
  const ordered = [...issues]
    .filter((issue) => Number(issue.span_end) > Number(issue.span_start))
    .sort((left, right) => Number(left.span_start) - Number(right.span_start));
  const nodes = [];
  const highlighted = [];
  let cursor = 0;
  for (const issue of ordered) {
    const start = Math.max(0, Math.min(text.length, Number(issue.span_start)));
    const end = Math.max(start, Math.min(text.length, Number(issue.span_end)));
    if (end <= cursor) continue;
    const safeStart = Math.max(start, cursor);
    if (safeStart > cursor) nodes.push({ type: 'text', value: text.slice(cursor, safeStart), key: `text-${cursor}` });
    nodes.push({ type: 'mark', issue, value: text.slice(safeStart, end), key: issue.id });
    highlighted.push(issue);
    cursor = end;
  }
  if (cursor < text.length) nodes.push({ type: 'text', value: text.slice(cursor), key: `text-${cursor}` });
  return { nodes, highlighted };
}

function EvidenceCard({ evidence }) {
  if (!evidence?.flaggedFact && !evidence?.nearestFact) return null;
  const flagged = evidence.flaggedFact;
  const nearest = evidence.nearestFact;
  return (
    <div className={styles.evidence}>
      <p className="eyebrow">Evidence</p>
      {flagged && (
        <div className={styles.fact}>
          <div className="row" style={{ gap: 6 }}>
            <span className="chip">{flagged.stableId}</span>
            {flagged.expired ? <span className="chip chip-danger">Expired</span> : <span className="chip chip-ok">Current</span>}
          </div>
          <p className={styles.factStatement}>{flagged.statement}</p>
          <p className="tiny muted">
            Source: {flagged.source} · Owner: {flagged.owner}
            {flagged.expiryDate ? ` · Expiry: ${flagged.expiryDate}` : ''}
          </p>
        </div>
      )}
      {nearest && nearest.stableId !== flagged?.stableId && (
        <div className={styles.fact}>
          <div className="row" style={{ gap: 6 }}>
            <span className="chip chip-accent">Nearest valid fact</span>
            <span className="chip">{nearest.stableId}</span>
          </div>
          <p className={styles.factStatement}>{nearest.statement}</p>
          <p className="tiny muted">
            Source: {nearest.source} · Owner: {nearest.owner}
            {nearest.expiryDate ? ` · Expiry: ${nearest.expiryDate}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

function IssueCard({
  issue,
  submission,
  busy,
  editing,
  editText,
  setEditText,
  onAccept,
  onReject,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  cardRef,
}) {
  const resolved = issue.decision !== 'pending';
  const replacement = isReplacementSuggestion(issue);
  const altIssue = isAltTextIssue(issue, submission);
  const hasSpan = Number(issue.span_end) > Number(issue.span_start);
  const canDecide = !resolved && !busy;

  return (
    <article
      className={`${styles.issueCard} ${styles[`issue-${issue.severity}`]} ${resolved ? styles.issueResolved : ''}`}
      ref={cardRef}
      tabIndex={-1}
      aria-labelledby={`issue-${issue.id}-title`}
    >
      <div className={styles.issueHead}>
        <SeverityBadge severity={issue.severity} />
        <span className="chip">{titleCase(issue.category)}</span>
        <span className={`${styles.sourceChip} tiny muted`}>
          {issue.source === 'llm' ? 'AI finding' : 'Rule engine'}
        </span>
      </div>
      <h3 id={`issue-${issue.id}-title`} className={styles.issueTitle}>
        {issue.explanation?.split('.')[0] || 'Review this passage'}
      </h3>
      {issue.quote && (
        <blockquote className={styles.quote}>
          <q>{issue.quote}</q>
        </blockquote>
      )}
      <p className={styles.explanation}>{issue.explanation}</p>
      <div className={styles.refs}>
        <ReferenceChips issue={issue} />
      </div>

      <EvidenceCard evidence={issue.evidence} />

      {issue.suggestion && replacement && <DiffView original={issue.quote} proposed={issue.suggestion} label="Suggested wording" />}
      {issue.suggestion && !replacement && (
        <div className={styles.suggestionBox}>
          <p className="eyebrow">Suggested next step</p>
          <p>{issue.suggestion}</p>
        </div>
      )}

      {resolved ? (
        <div className={styles.decision}>
          <span className={`chip ${issue.decision === 'rejected' ? '' : 'chip-ok'}`}>
            {issue.decision === 'accepted' ? 'Accepted' : issue.decision === 'edited' ? 'Edited and accepted' : 'Rejected'}
          </span>
          {issue.edited_text && <p className={styles.editedText}>“{issue.edited_text}”</p>}
          <span className="tiny muted">
            Decided {timeAgo(issue.decision_at)}
          </span>
        </div>
      ) : editing ? (
        <div className={styles.editForm}>
          <label htmlFor={`edit-${issue.id}`} className="label">
            {altIssue ? 'Alt text' : hasSpan ? 'Replacement wording' : 'Note for the record'}
          </label>
          <textarea
            id={`edit-${issue.id}`}
            className="textarea"
            style={{ minHeight: 92 }}
            value={editText}
            onChange={(event) => setEditText(event.target.value)}
            maxLength={5000}
          />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelEdit} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onSaveEdit}
              disabled={busy || !editText.trim()}
            >
              {busy ? 'Saving…' : 'Apply and accept'}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.issueActions}>
          {replacement && (
            <button type="button" className="btn btn-success btn-sm" onClick={onAccept} disabled={!canDecide}>
              Accept fix
            </button>
          )}
          {!replacement && !hasSpan && !altIssue && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onAccept} disabled={!canDecide}>
              Mark reviewed
            </button>
          )}
          {(hasSpan || altIssue) && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onStartEdit} disabled={!canDecide}>
              {altIssue ? 'Add alt text' : 'Edit and accept'}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReject} disabled={!canDecide}>
            Reject
          </button>
        </div>
      )}
    </article>
  );
}

export default function ReviewWorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { privacy } = useAuth();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [busyIssue, setBusyIssue] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [comment, setComment] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [activeTab, setActiveTab] = useState('discussion');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [lines, setLines] = useState([]);

  const wrapperRef = useRef(null);
  const markRefs = useRef(new Map());
  const cardRefs = useRef(new Map());
  const autoRan = useRef(false);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const payload = await api.get(`/api/submissions/${id}`);
        setData(payload);
        setError('');
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    load();
  }, [load]);

  const runAnalysis = useCallback(
    async (auto = false) => {
      setAnalysing(true);
      setActionError('');
      setNotice('');
      try {
        const result = await api.post(`/api/submissions/${id}/analyse`, {});
        const findings = result.issues?.length ?? 0;
        setNotice(
          result.meta?.llmNotice ||
            `${auto ? 'First review complete' : 'Review complete'}. ${findings} finding${findings === 1 ? '' : 's'} to consider. Human decisions are still required.`
        );
        await load(true);
      } catch (analysisError) {
        setActionError(analysisError.message);
      } finally {
        setAnalysing(false);
      }
    },
    [id, load]
  );

  useEffect(() => {
    if (!data || autoRan.current) return;
    if (searchParams.get('analyse') !== '1') return;
    autoRan.current = true;
    navigate(`/submissions/${id}`, { replace: true });
    if (data.submission.status === 'draft' && data.can.edit) runAnalysis(true);
  }, [data, id, navigate, runAnalysis, searchParams]);

  const decideIssue = async (issue, decision, editedText) => {
    setBusyIssue(issue.id);
    setActionError('');
    setNotice('');
    try {
      await api.post(`/api/submissions/${id}/issues/${issue.id}/decision`, { decision, editedText });
      setEditingId(null);
      setEditText('');
      setNotice(
        decision === 'rejected'
          ? 'Finding rejected. The content is unchanged and your decision is recorded.'
          : 'Finding resolved. The revision history has been updated.'
      );
      await load(true);
    } catch (decisionError) {
      setActionError(decisionError.message);
    } finally {
      setBusyIssue(null);
    }
  };

  const submitForReview = async () => {
    setActionError('');
    setNotice('');
    try {
      await api.post(`/api/submissions/${id}/submit`, {});
      setNotice('Submitted for review. The brand team will make the final decision.');
      await load(true);
    } catch (submitError) {
      setActionError(submitError.message);
    }
  };

  const reviewerDecision = async (action) => {
    if (action !== 'approve' && !reviewComment.trim()) {
      setActionError('Add a comment before requesting changes or rejecting.');
      return;
    }
    setReviewBusy(true);
    setActionError('');
    setNotice('');
    try {
      await api.post(`/api/submissions/${id}/decision`, { action, comment: reviewComment });
      setReviewComment('');
      setNotice(
        action === 'approve'
          ? 'Approved. The content is ready to publish — publishing remains a separate human step.'
          : action === 'request_changes'
            ? 'Changes requested. The creator has been notified in the history.'
            : 'Submission rejected. The decision is recorded.'
      );
      await load(true);
    } catch (decisionError) {
      setActionError(decisionError.message);
    } finally {
      setReviewBusy(false);
    }
  };

  const addComment = async (event) => {
    event.preventDefault();
    if (!comment.trim()) return;
    setCommentBusy(true);
    setActionError('');
    try {
      await api.post(`/api/submissions/${id}/comments`, { comment });
      setComment('');
      await load(true);
    } catch (commentError) {
      setActionError(commentError.message);
    } finally {
      setCommentBusy(false);
    }
  };

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(submission.content || '');
      setNotice('Content copied to the clipboard.');
    } catch {
      setActionError('The browser blocked clipboard access. Select the text and copy it manually.');
    }
  };

  const download = async () => {
    try {
      await downloadFile(`/api/submissions/${id}/export?format=md`, `${submission.title}.md`);
    } catch (downloadError) {
      setActionError(downloadError.message);
    }
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    try {
      await api.delete(`/api/submissions/${id}`);
      navigate('/dashboard', { replace: true });
    } catch (deleteError) {
      setActionError(deleteError.message);
      setDeleteBusy(false);
      setDeleteOpen(false);
    }
  };

  const submission = data?.submission;
  const issues = data?.issues || [];

  const { nodes, highlighted } = useMemo(
    () => buildSegments(submission?.content || '', issues),
    [submission?.content, issues]
  );

  const orderedIssues = useMemo(
    () =>
      [...issues].sort(
        (left, right) =>
          (left.decision === 'pending' ? 0 : 1) - (right.decision === 'pending' ? 0 : 1) ||
          SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
          Number(left.span_start) - Number(right.span_start)
      ),
    [issues]
  );

  const pendingBlockers = issues.filter((issue) => issue.severity === 'blocker' && issue.decision === 'pending').length;
  const pendingWarnings = issues.filter((issue) => issue.severity === 'warning' && issue.decision === 'pending').length;
  const pendingSuggestions = issues.filter((issue) => issue.severity === 'suggestion' && issue.decision === 'pending').length;

  const computeLines = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof window === 'undefined' || window.innerWidth < 1120) {
      setLines([]);
      return;
    }
    const base = wrapper.getBoundingClientRect();
    const next = [];
    for (const issue of highlighted) {
      const mark = markRefs.current.get(issue.id);
      const card = cardRefs.current.get(issue.id);
      if (!mark || !card) continue;
      const markRect = mark.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      if (markRect.width === 0 || cardRect.width === 0 || cardRect.left <= markRect.right) continue;
      next.push({
        id: issue.id,
        severity: issue.severity,
        x1: markRect.right - base.left,
        y1: markRect.top + markRect.height / 2 - base.top,
        x2: cardRect.left - base.left,
        y2: cardRect.top + Math.min(32, cardRect.height / 2) - base.top,
      });
    }
    setLines(next);
  }, [highlighted]);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(computeLines);
    window.addEventListener('resize', computeLines);
    let observer;
    if (typeof ResizeObserver !== 'undefined' && wrapperRef.current) {
      observer = new ResizeObserver(() => computeLines());
      observer.observe(wrapperRef.current);
    }
    if (document.fonts?.ready) document.fonts.ready.then(computeLines).catch(() => {});
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', computeLines);
      observer?.disconnect();
    };
  }, [computeLines, data]);

  if (loading) {
    return (
      <div className="loading-screen" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <span>Opening the review workspace…</span>
      </div>
    );
  }

  if (error || !submission) {
    return (
      <section className="page">
        <div className="notice notice-danger" role="alert">
          <span className="notice-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>This submission could not be opened.</strong> {error || 'It may have been removed.'}
          </div>
        </div>
        <Link to="/dashboard" className="btn btn-secondary" style={{ width: 'fit-content' }}>
          Back to dashboard
        </Link>
      </section>
    );
  }

  const latestChangeRequest = data.actions.find((action) => action.action === 'request_changes');
  const canRunReview = data.can.edit && !['awaiting_review', 'ready_to_publish', 'approved', 'rejected'].includes(submission.status);
  const providerLabel = data.meta.provider === 'mock' ? 'MOCK provider' : data.meta.provider || 'Rule engine';
  const hasAnalysis = Boolean(data.meta.provider || data.meta.llmStatus || issues.length);
  const llmChipClass =
    data.meta.llmStatus === 'timeout' || data.meta.llmStatus === 'error' ? 'chip-danger' : 'chip-ok';
  const llmChipLabel =
    data.meta.llmStatus === 'timeout'
      ? 'AI review timed out · rule results kept'
      : data.meta.llmStatus === 'error'
        ? 'AI review unavailable · rule results kept'
        : 'AI review complete';

  return (
    <section className="page">
      <header className="page-header">
        <div className={styles.titleBlock}>
          <div className="row" style={{ gap: 8 }}>
            <Link to="/dashboard" className={styles.backLink}>
              ← Dashboard
            </Link>
            <span aria-hidden="true" className="muted">
              /
            </span>
            <span className="chip">{submission.channel}</span>
            <StatusPill status={submission.status} />
          </div>
          <h1 className="page-title">{submission.title}</h1>
          <p className="page-subtitle">
            {submission.type === 'image' ? 'Image submission' : submission.type === 'document' ? 'Document submission' : 'Text submission'} ·
            Owned by {submission.owner_name} · Version {submission.current_version} · Updated {timeAgo(submission.updated_at)}
          </p>
        </div>
        <div className={styles.headerActions}>
          {canRunReview && (
            <button type="button" className="btn btn-secondary" onClick={() => runAnalysis(false)} disabled={analysing}>
              {analysing ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Reviewing…
                </>
              ) : issues.length ? (
                'Re-run review'
              ) : (
                'Run review'
              )}
            </button>
          )}
          {data.can.submit && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitForReview}
              disabled={pendingBlockers > 0}
              title={pendingBlockers > 0 ? `Resolve ${pendingBlockers} blocker${pendingBlockers === 1 ? '' : 's'} first` : undefined}
            >
              Submit for review
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={copyContent}>
            Copy
          </button>
          {data.can.download && (
            <button type="button" className="btn btn-ghost" onClick={download}>
              Download
            </button>
          )}
          {data.can.delete && (
            <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)}>
              Delete
            </button>
          )}
        </div>
      </header>

      <div className={styles.metaStrip}>
        <span className="chip">{submission.ai_disclosure === 'none' ? 'No AI used' : submission.ai_disclosure}</span>
        {hasAnalysis ? (
          <>
            <span className="chip">
              {providerLabel}
              {data.meta.providerVersion ? ` · ${data.meta.providerVersion}` : ''}
            </span>
            <span className={`chip ${llmChipClass}`}>{llmChipLabel}</span>
          </>
        ) : (
          <span className="chip">Review not run yet</span>
        )}
        <span className="chip">{highlighted.length} highlighted passages</span>
        <span className="chip">{issues.length} findings</span>
        {pendingBlockers > 0 && <span className="chip chip-danger">{pendingBlockers} blockers pending</span>}
        {pendingWarnings > 0 && <span className="chip chip-warn">{pendingWarnings} warnings pending</span>}
        {pendingSuggestions > 0 && <span className="chip">{pendingSuggestions} suggestions pending</span>}
        <span className={styles.metaSpacer} />
        <PrivacyNotice externalAI={privacy.externalAI} compact />
      </div>

      {notice && (
        <div className="notice" role="status">
          <span className="notice-icon" aria-hidden="true">
            ✓
          </span>
          <div>{notice}</div>
        </div>
      )}
      {actionError && (
        <div className="notice notice-danger" role="alert">
          <span className="notice-icon" aria-hidden="true">
            !
          </span>
          <div>{actionError}</div>
        </div>
      )}
      {submission.status === 'changes_requested' && latestChangeRequest && (
        <div className="notice notice-warn">
          <span className="notice-icon" aria-hidden="true">
            ↺
          </span>
          <div>
            <strong>Changes requested by {latestChangeRequest.user_name}.</strong> {latestChangeRequest.comment}
          </div>
        </div>
      )}
      {pendingBlockers > 0 && (
        <div className="notice notice-danger">
          <span className="notice-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>{pendingBlockers} blocker{pendingBlockers === 1 ? '' : 's'} must be resolved before this can be submitted.</strong>{' '}
            Accept a safe fix, edit the wording, or reject the finding with a clear human decision.
          </div>
        </div>
      )}

      <div className={styles.workspace} ref={wrapperRef}>
        <svg className={styles.connectors} aria-hidden="true">
          {lines.map((line) => (
            <g key={line.id}>
              <path
                className={`${styles.connector} ${styles[`line-${line.severity}`]}`}
                d={`M ${line.x1} ${line.y1} C ${line.x1 + 36} ${line.y1}, ${line.x2 - 46} ${line.y2}, ${line.x2} ${line.y2}`}
              />
              <circle className={`${styles.dot} ${styles[`dot-${line.severity}`]}`} cx={line.x2} cy={line.y2} r="3.5" />
            </g>
          ))}
        </svg>

        <div className={`panel ${styles.contentPanel}`}>
          <div className="panel-heading">
            <div>
              <h2>Content under review</h2>
              <p className="tiny muted">
                Highlighted passages link to the findings beside them. Use Tab to move through each highlight.
              </p>
            </div>
            <span className="chip">{submission.channel}</span>
          </div>

          {submission.type === 'image' && (
            <figure className={styles.imageFigure}>
              <img src={`/api/submissions/${submission.id}/file`} alt={submission.alt_text || ''} />
              <figcaption className={submission.alt_text ? 'tiny muted' : 'error-text'}>
                {submission.alt_text ? `Alt text: ${submission.alt_text}` : 'No alt text recorded. This is an accessibility blocker.'}
              </figcaption>
            </figure>
          )}

          {submission.content ? (
            <div className={styles.content} aria-label="Submission content with highlighted findings">
              {nodes.map((node) =>
                node.type === 'text' ? (
                  <span key={node.key}>{node.value}</span>
                ) : (
                  <button
                    key={node.key}
                    type="button"
                    ref={(element) => {
                      if (element) markRefs.current.set(node.issue.id, element);
                      else markRefs.current.delete(node.issue.id);
                    }}
                    className={`${styles.mark} ${styles[`mark-${node.issue.severity}`]} ${
                      node.issue.decision !== 'pending' ? styles.markResolved : ''
                    }`}
                    onClick={() => {
                      const card = cardRefs.current.get(node.issue.id);
                      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      card?.focus();
                    }}
                    aria-label={`${node.issue.severity} finding: ${node.issue.explanation}`}
                    title={node.issue.explanation}
                  >
                    {node.value}
                  </button>
                )
              )}
            </div>
          ) : (
            <p className="muted">This submission has no extracted text. The findings are based on the uploaded file and alt text.</p>
          )}

          <div className={styles.legend}>
            <span>
              <i className={styles.blockerKey} /> Blocker
            </span>
            <span>
              <i className={styles.warningKey} /> Warning
            </span>
            <span>
              <i className={styles.suggestionKey} /> Suggestion
            </span>
            <span className="tiny muted">Click a highlight to jump to its evidence.</span>
          </div>
        </div>

        <aside className={styles.issueColumn} aria-label="Findings">
          <div className={styles.issueColumnHead}>
            <h2>Findings</h2>
            <span className="chip">{issues.length}</span>
          </div>
          {orderedIssues.length ? (
            orderedIssues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                submission={submission}
                busy={busyIssue === issue.id}
                editing={editingId === issue.id}
                editText={editText}
                setEditText={setEditText}
                cardRef={(element) => {
                  if (element) cardRefs.current.set(issue.id, element);
                  else cardRefs.current.delete(issue.id);
                }}
                onAccept={() => decideIssue(issue, 'accepted')}
                onReject={() => decideIssue(issue, 'rejected')}
                onStartEdit={() => {
                  setEditingId(issue.id);
                  setEditText(
                    isAltTextIssue(issue, submission)
                      ? submission.alt_text || ''
                      : isReplacementSuggestion(issue)
                        ? issue.suggestion
                        : issue.quote || ''
                  );
                }}
                onCancelEdit={() => {
                  setEditingId(null);
                  setEditText('');
                }}
                onSaveEdit={() => decideIssue(issue, 'edited', editText.trim())}
              />
            ))
          ) : (
            <div className="empty-state">
              <h3>No findings yet</h3>
              <p>{canRunReview ? 'Run the review to check this content against the brand library.' : 'This content has no recorded findings.'}</p>
            </div>
          )}
        </aside>
      </div>

      {data.can.review && (
        <div className={`panel ${styles.reviewPanel}`}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Reviewer decision</p>
              <h2>Make the final human call</h2>
              <p className="tiny muted">
                Approval makes this content ready to publish. It does not publish it. Every decision is recorded with
                your name and timestamp.
              </p>
            </div>
            <span className="chip chip-warn">{pendingBlockers} blockers · {issues.length} findings</span>
          </div>
          <div className="form-field">
            <label htmlFor="reviewer-comment">Reviewer comment</label>
            <textarea
              id="reviewer-comment"
              className="textarea"
              style={{ minHeight: 96 }}
              value={reviewComment}
              onChange={(event) => setReviewComment(event.target.value)}
              placeholder="Optional when approving. Required when requesting changes or rejecting."
              maxLength={4000}
            />
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => reviewerDecision('reject')}
              disabled={reviewBusy || !reviewComment.trim()}
            >
              Reject
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => reviewerDecision('request_changes')}
              disabled={reviewBusy || !reviewComment.trim()}
            >
              Request changes
            </button>
            <button type="button" className="btn btn-primary" onClick={() => reviewerDecision('approve')} disabled={reviewBusy}>
              {reviewBusy ? 'Recording…' : 'Approve content'}
            </button>
          </div>
        </div>
      )}

      <div className={`panel ${styles.activityPanel}`}>
        <div className="tabs" role="tablist" aria-label="Review activity">
          <button
            type="button"
            role="tab"
            id="tab-discussion"
            aria-selected={activeTab === 'discussion'}
            aria-controls="panel-discussion"
            tabIndex={activeTab === 'discussion' ? 0 : -1}
            onKeyDown={(event) => tabKeyboard(event, ACTIVITY_TABS, activeTab, setActiveTab, (key) => `tab-${key}`)}
            onClick={() => setActiveTab('discussion')}
          >
            Discussion & history
            <span className="tab-count">{data.actions.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="tab-versions"
            aria-selected={activeTab === 'versions'}
            aria-controls="panel-versions"
            tabIndex={activeTab === 'versions' ? 0 : -1}
            onKeyDown={(event) => tabKeyboard(event, ACTIVITY_TABS, activeTab, setActiveTab, (key) => `tab-${key}`)}
            onClick={() => setActiveTab('versions')}
          >
            Versions
            <span className="tab-count">{data.versions.length}</span>
          </button>
        </div>

        {activeTab === 'discussion' ? (
          <div id="panel-discussion" role="tabpanel" aria-labelledby="tab-discussion" className={styles.activityBody}>
            <form className={styles.commentForm} onSubmit={addComment}>
              <div className="form-field">
                <label htmlFor="new-comment">Add a comment</label>
                <textarea
                  id="new-comment"
                  className="textarea"
                  style={{ minHeight: 84 }}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Ask a question, explain a decision, or leave context for the next reviewer."
                  maxLength={4000}
                />
              </div>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-secondary btn-sm" disabled={commentBusy || !comment.trim()}>
                  {commentBusy ? 'Posting…' : 'Post comment'}
                </button>
              </div>
            </form>

            <ol className={styles.timeline}>
              {data.actions.map((action) => (
                <li key={action.id} className={styles.timelineItem}>
                  <span className={styles.timelineDot} aria-hidden="true" />
                  <div className={styles.timelineBody}>
                    <div className={styles.timelineHead}>
                      <strong>{ACTION_LABELS[action.action] || titleCase(action.action)}</strong>
                      <span className="tiny muted">
                        {action.user_name || 'System'} · {formatDateTime(action.created_at)}
                      </span>
                    </div>
                    {action.comment && <p className={styles.timelineComment}>{action.comment}</p>}
                    {action.metadata?.reference && (
                      <div className={styles.refs}>
                        <span className="chip">{action.metadata.reference}</span>
                        {action.metadata.severity && <span className="chip">{titleCase(action.metadata.severity)}</span>}
                        {action.metadata.replaced && <span className="chip chip-ok">Content updated</span>}
                      </div>
                    )}
                    {action.before_content !== null && action.after_content !== null && action.before_content !== undefined && (
                      <DiffView original={action.before_content} proposed={action.after_content} label="Content after decision" />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div id="panel-versions" role="tabpanel" aria-labelledby="tab-versions" className={styles.activityBody}>
            <p className="tiny muted">
              Versions are append-only. Accepting a replacement or editing content creates a new version; earlier
              versions are never rewritten.
            </p>
            <div className={styles.versionList}>
              {data.versions.map((version) => (
                <details className={styles.version} key={version.id} open={version.version === submission.current_version}>
                  <summary>
                    <span className="chip chip-accent">v{version.version}</span>
                    <span className={styles.versionTitle}>{version.note}</span>
                    <span className="tiny muted">{formatDateTime(version.created_at)}</span>
                  </summary>
                  <p className="tiny muted">
                    By {version.created_by_name || 'Unknown'}
                    {version.version === submission.current_version ? ' · current version' : ''}
                  </p>
                  <pre className={styles.versionBody}>{version.content || '—'}</pre>
                  {version.alt_text && <p className="tiny muted">Alt text: {version.alt_text}</p>}
                </details>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this submission?"
        description="The submission, its findings and its uploaded file will be removed. Audit events about the deletion remain in the audit log."
      >
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>
            Keep it
          </button>
          <button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={deleteBusy}>
            {deleteBusy ? 'Deleting…' : 'Delete submission'}
          </button>
        </div>
      </Modal>
    </section>
  );
}
