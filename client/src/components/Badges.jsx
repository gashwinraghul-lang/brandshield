export const SEVERITY_LABEL = { blocker: 'Blocker', warning: 'Warning', suggestion: 'Suggestion' };

export function SeverityBadge({ severity }) {
  return <span className={`sev-badge sev-${severity}`}>{SEVERITY_LABEL[severity] || severity}</span>;
}

const STATUS_LABEL = {
  draft: 'Draft',
  analysed: 'Reviewed — needs creator decision',
  awaiting_review: 'Awaiting review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Rejected',
  ready_to_publish: 'Ready to publish',
};

const STATUS_CLASS = {
  draft: 'chip',
  analysed: 'chip chip-accent',
  awaiting_review: 'chip chip-warn',
  changes_requested: 'chip chip-warn',
  approved: 'chip chip-ok',
  rejected: 'chip chip-danger',
  ready_to_publish: 'chip chip-ok',
};

export function StatusPill({ status }) {
  return <span className={STATUS_CLASS[status] || 'chip'}>{STATUS_LABEL[status] || status}</span>;
}

export function ReferenceChips({ issue }) {
  const refs = [];
  if (issue.guideline_ref) refs.push({ label: issue.guideline_ref, title: 'Guideline' });
  if (issue.fact_ref) refs.push({ label: issue.fact_ref, title: 'Approved fact' });
  if (issue.rule_ref) refs.push({ label: issue.rule_ref, title: 'Rule' });
  if (!refs.length) return <span className="chip">Suggestion only</span>;
  return (
    <>
      {refs.map((ref) => (
        <span className="chip" key={`${ref.title}-${ref.label}`} title={ref.title}>
          {ref.label}
        </span>
      ))}
    </>
  );
}
