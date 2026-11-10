const config = require('../config');
const { randomId } = require('../auth/crypto');
const { runRules } = require('./ruleEngine');
const { resolveProvider } = require('./llm');
const { maskContent, restoreFinding } = require('./masking');
const { audit } = require('../utils/audit');
const { nowIso, isExpired } = require('../utils/time');

const MAX_ISSUES = 80;

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function getSettings(db) {
  return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((row) => [row.key, row.value]));
}

function getLibrary(db) {
  const guidelines = db
    .prepare(
      `SELECT g.*, v.body, v.version AS body_version
       FROM brand_guidelines g
       LEFT JOIN brand_guideline_versions v ON v.guideline_id = g.id AND v.version = g.current_version
       WHERE g.status = 'active'
       ORDER BY g.stable_id`
    )
    .all();
  const facts = db
    .prepare(
      `SELECT f.*,
              s.stable_id AS successor_stable_id, s.statement AS successor_statement,
              s.source AS successor_source, s.owner AS successor_owner, s.expiry_date AS successor_expiry
       FROM approved_facts f
       LEFT JOIN approved_facts s ON s.id = f.successor_id
       WHERE f.status = 'active'
       ORDER BY f.stable_id`
    )
    .all();
  const terminology = db.prepare("SELECT * FROM terminology_entries WHERE status = 'active' ORDER BY code").all();
  const rules = db.prepare('SELECT * FROM rules WHERE active = 1 ORDER BY code').all();
  return { guidelines, facts, terminology, rules };
}

function factEvidence(db, factRef) {
  const fact = db
    .prepare(
      `SELECT f.*,
              s.stable_id AS successor_stable_id, s.statement AS successor_statement,
              s.source AS successor_source, s.owner AS successor_owner, s.expiry_date AS successor_expiry
       FROM approved_facts f
       LEFT JOIN approved_facts s ON s.id = f.successor_id
       WHERE f.stable_id = ?`
    )
    .get(factRef);
  if (!fact) return null;
  const flagged = {
    stableId: fact.stable_id,
    statement: fact.statement,
    source: fact.source,
    owner: fact.owner,
    expiryDate: fact.expiry_date,
    expired: isExpired(fact.expiry_date),
  };
  let nearest = null;
  if (fact.successor_statement) {
    nearest = {
      stableId: fact.successor_stable_id,
      statement: fact.successor_statement,
      source: fact.successor_source,
      owner: fact.successor_owner,
      expiryDate: fact.successor_expiry,
      expired: isExpired(fact.successor_expiry),
    };
  } else if (!flagged.expired) {
    nearest = { ...flagged, expired: false };
  }
  return { flaggedFact: flagged, nearestFact: nearest };
}

/**
 * Enforces the safety rule: a finding without a valid reference can only ever
 * be a suggestion. Also clamps spans to the content and validates references
 * against the live brand library.
 */
function normaliseFinding(finding, { content, guidelineIds, factIds, ruleCodes }) {
  const severity = ['blocker', 'warning', 'suggestion'].includes(finding.severity) ? finding.severity : 'suggestion';
  let guidelineRef = finding.guidelineRef || null;
  let factRef = finding.factRef || null;
  let ruleRef = finding.ruleRef || null;
  if (guidelineRef && !guidelineIds.has(guidelineRef)) guidelineRef = null;
  if (factRef && !factIds.has(factRef)) factRef = null;
  if (ruleRef && !ruleCodes.has(ruleRef) && !String(ruleRef).startsWith('TERM-')) ruleRef = null;

  const hasReference = Boolean(guidelineRef || factRef || ruleRef);
  let explanation = finding.explanation || 'Review this passage against the brand library.';
  let finalSeverity = severity;
  if (!hasReference && severity !== 'suggestion') {
    finalSeverity = 'suggestion';
    explanation = `${explanation} (No guideline, rule or fact reference was available, so this is shown as a suggestion only.)`;
  }

  let start = Number.isFinite(finding.spanStart) ? Math.max(0, finding.spanStart) : 0;
  let end = Number.isFinite(finding.spanEnd) ? Math.max(start, finding.spanEnd) : start;
  if (content.length > 0) {
    start = Math.min(start, content.length);
    end = Math.min(end, content.length);
  } else {
    start = 0;
    end = 0;
  }

  return {
    category: finding.category || 'tone',
    severity: finalSeverity,
    spanStart: start,
    spanEnd: end,
    quote: (finding.quote || content.slice(start, end) || '').slice(0, 240),
    guidelineRef,
    ruleRef,
    factRef,
    explanation,
    suggestion: finding.suggestion || null,
    evidence: finding.evidence || null,
    source: finding.source || 'rule',
  };
}

function withTimeout(promise, ms, label = 'LLM review') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out`);
      error.code = 'LLM_TIMEOUT';
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function runReview(db, submission, { actorId = null, provider: injectedProvider = null, timeoutMs = config.llm.timeoutMs } = {}) {
  const library = getLibrary(db);
  const settings = getSettings(db);
  const content = submission.content || '';
  const altText = submission.alt_text || '';

  const { findings: ruleFindings, rulesRun } = runRules({
    content,
    altText,
    type: submission.type,
    channel: submission.channel,
    terminology: library.terminology,
    rules: library.rules,
  });

  const resolution = injectedProvider
    ? { provider: injectedProvider, external: Boolean(injectedProvider.external), reason: null }
    : resolveProvider(settings);
  const provider = resolution.provider;
  const patterns = db.prepare('SELECT * FROM confidential_patterns WHERE active = 1').all();
  const masking = resolution.external ? maskContent(content, patterns) : { masked: content, map: new Map(), applied: 0, names: [] };

  let llmResult = { status: 'ok', findings: [], provider: provider.name, version: provider.version, external: resolution.external };
  let llmNotice = null;
  try {
    const result = await withTimeout(
      provider.review({
        text: masking.masked,
        channel: submission.channel,
        type: submission.type,
        title: submission.title,
        altText,
        guidelines: library.guidelines,
        facts: library.facts,
      }),
      timeoutMs
    );
    llmResult = { ...result, external: resolution.external };
    if (resolution.external) {
      llmResult.findings = llmResult.findings.map((finding) => restoreFinding(finding, masking.map));
    }
  } catch (error) {
    const timedOut = error?.code === 'LLM_TIMEOUT';
    llmResult = {
      status: timedOut ? 'timeout' : 'error',
      findings: [],
      provider: provider.name,
      version: provider.version,
      external: resolution.external,
    };
    llmNotice = timedOut
      ? 'The AI review did not finish in time. Rule-engine results are shown; the AI review was incomplete. You can run it again.'
      : 'The AI review could not be completed. Rule-engine results are shown; the AI review was incomplete.';
  }
  if (resolution.reason) llmNotice = resolution.reason;

  const version = db
    .prepare('SELECT * FROM submission_versions WHERE submission_id = ? AND version = ?')
    .get(submission.id, submission.current_version);
  if (!version) throw new Error('Submission version missing');

  const guidelineIds = new Set(db.prepare('SELECT stable_id FROM brand_guidelines').all().map((row) => row.stable_id));
  const factIds = new Set(db.prepare('SELECT stable_id FROM approved_facts').all().map((row) => row.stable_id));
  const ruleCodes = new Set([
    ...db.prepare('SELECT code FROM rules').all().map((row) => row.code),
    ...db.prepare('SELECT code FROM terminology_entries').all().map((row) => row.code),
  ]);

  const allFindings = [...ruleFindings, ...llmResult.findings].slice(0, MAX_ISSUES);
  const normalised = allFindings.map((finding) => {
    const clean = normaliseFinding(finding, { content, guidelineIds, factIds, ruleCodes });
    if (clean.factRef && !clean.evidence) clean.evidence = factEvidence(db, clean.factRef);
    if (clean.category === 'claim' && clean.factRef && !clean.evidence) clean.evidence = factEvidence(db, clean.factRef);
    return clean;
  });

  const now = nowIso();
  const insertIssues = db.transaction(() => {
    db.prepare('DELETE FROM issues WHERE submission_id = ?').run(submission.id);
    const stmt = db.prepare(
      `INSERT INTO issues
        (id, submission_id, submission_version_id, category, severity, span_start, span_end, quote,
         guideline_ref, rule_ref, fact_ref, explanation, suggestion, evidence, decision, source, provider_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    );
    for (const item of normalised) {
      stmt.run(
        randomId(),
        submission.id,
        version.id,
        item.category,
        item.severity,
        item.spanStart,
        item.spanEnd,
        item.quote,
        item.guidelineRef,
        item.ruleRef,
        item.factRef,
        item.explanation,
        item.suggestion,
        item.evidence ? JSON.stringify(item.evidence) : null,
        item.source,
        item.source === 'llm' ? llmResult.version : null,
        now
      );
    }
    const nextStatus = ['draft', 'analysed', 'changes_requested'].includes(submission.status) ? 'analysed' : submission.status;
    db.prepare(
      `UPDATE submissions SET status = ?, last_llm_provider = ?, last_llm_version = ?, last_llm_status = ?, updated_at = ? WHERE id = ?`
    ).run(nextStatus, llmResult.provider, llmResult.version, llmResult.status, now, submission.id);
  });
  insertIssues();

  audit(db, {
    userId: actorId,
    eventType: 'review.run',
    entityType: 'submission',
    entityId: submission.id,
    metadata: {
      ruleFindings: ruleFindings.length,
      llmFindings: llmResult.findings.length,
      blockers: normalised.filter((item) => item.severity === 'blocker').length,
      warnings: normalised.filter((item) => item.severity === 'warning').length,
      suggestions: normalised.filter((item) => item.severity === 'suggestion').length,
      provider: llmResult.provider,
      providerVersion: llmResult.version,
      external: resolution.external,
      maskedValues: masking.applied,
      rulesRun: rulesRun.length,
    },
  });

  const issues = listIssues(db, submission.id);
  return {
    issues,
    meta: {
      externalAI: resolution.external,
      provider: llmResult.provider,
      providerVersion: llmResult.version,
      llmStatus: llmResult.status,
      llmNotice,
      maskedValues: masking.applied,
      maskedPatterns: masking.names,
      rulesRun: rulesRun.length,
    },
  };
}

function listIssues(db, submissionId) {
  return db
    .prepare('SELECT * FROM issues WHERE submission_id = ? ORDER BY span_start, severity DESC, created_at')
    .all(submissionId)
    .map((row) => ({ ...row, evidence: row.evidence ? parseJson(row.evidence, null) : null }));
}

function applyReplacement(content, issue, replacement) {
  if (!replacement) return { content, changed: false, start: null, end: null };
  const start = Number(issue.span_start);
  const end = Number(issue.span_end);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start && content.slice(start, end) === issue.quote) {
    return {
      content: content.slice(0, start) + replacement + content.slice(end),
      changed: true,
      start,
      end,
    };
  }
  if (issue.quote) {
    const index = content.indexOf(issue.quote);
    if (index !== -1) {
      return {
        content: content.slice(0, index) + replacement + content.slice(index + issue.quote.length),
        changed: true,
        start: index,
        end: index + issue.quote.length,
      };
    }
  }
  return { content, changed: false, start: null, end: null };
}

function applyDecision(db, submission, issue, { decision, editedText = null, actor }) {
  const now = nowIso();
  let content = submission.content;
  let altText = submission.alt_text;
  let changed = false;
  let appliedStart = null;
  let appliedEnd = null;
  const replacement = decision === 'edited' ? editedText : issue.suggestion;

  if (decision === 'accepted' || decision === 'edited') {
    if (decision === 'edited' && !editedText) throw Object.assign(new Error('Edited text is required'), { status: 400 });
    const result = applyReplacement(content, issue, replacement);
    content = result.content;
    changed = result.changed;
    appliedStart = result.start;
    appliedEnd = result.end;
    if (!changed && issue.category === 'accessibility' && ['ACC-ALT-TEXT', 'RULE-ALT-01'].includes(issue.rule_ref) && submission.type === 'image' && editedText) {
      altText = editedText;
      changed = true;
    }
  }

  const record = db.transaction(() => {
    db.prepare('UPDATE issues SET decision = ?, decision_by = ?, decision_at = ?, edited_text = ? WHERE id = ?').run(
      decision,
      actor.id,
      now,
      decision === 'edited' ? editedText : null,
      issue.id
    );
    // Keep the spans of sibling findings aligned with the edited content so
    // later decisions still point at the passage they describe.
    if (changed && appliedStart !== null && appliedEnd !== null && appliedEnd > appliedStart) {
      const delta = content.length - submission.content.length;
      if (delta !== 0) {
        db.prepare(
          `UPDATE issues SET span_start = span_start + ?, span_end = span_end + ?
           WHERE submission_id = ? AND id != ? AND span_start >= ?`
        ).run(delta, delta, submission.id, issue.id, appliedEnd);
      }
    }
    let nextVersionId = null;
    if (changed || decision === 'edited') {
      const version = db
        .prepare('SELECT * FROM submission_versions WHERE submission_id = ? AND version = ?')
        .get(submission.id, submission.current_version);
      nextVersionId = version ? version.id : null;
    }
    if (changed) {
      const current = db.prepare('SELECT * FROM submissions WHERE id = ?').get(submission.id);
      const nextVersion = current.current_version + 1;
      const versionRow = {
        ...current,
        content,
        alt_text: altText,
      };
      db.prepare(
        `INSERT INTO submission_versions (id, submission_id, version, title, content, alt_text, file_name, created_by, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(randomId(), submission.id, nextVersion, versionRow.title, content, altText, versionRow.file_name, actor.id, `Creator ${decision} issue ${issue.id}`, now);
      const nextStatus = ['changes_requested', 'draft'].includes(submission.status) ? 'analysed' : submission.status;
      db.prepare(
        'UPDATE submissions SET content = ?, alt_text = ?, current_version = ?, status = ?, updated_at = ? WHERE id = ?'
      ).run(content, altText, nextVersion, nextStatus, now, submission.id);
    }
    db.prepare(
      `INSERT INTO review_actions
        (id, submission_id, submission_version_id, user_id, action, comment, before_content, after_content, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomId(),
      submission.id,
      nextVersionId,
      actor.id,
      `issue_${decision}`,
      null,
      changed ? submission.content : null,
      changed ? content : null,
      JSON.stringify({ issueId: issue.id, severity: issue.severity, category: issue.category, reference: issue.guideline_ref || issue.fact_ref || issue.rule_ref, replaced: changed }),
      now
    );
  });
  record();

  return db.prepare('SELECT * FROM submissions WHERE id = ?').get(submission.id);
}

function pendingBlockerCount(db, submissionId) {
  return db
    .prepare("SELECT COUNT(*) AS count FROM issues WHERE submission_id = ? AND severity = 'blocker' AND decision = 'pending'")
    .get(submissionId).count;
}

function submitForReview(db, submission, actor) {
  const blockers = pendingBlockerCount(db, submission.id);
  if (blockers > 0) {
    throw Object.assign(new Error(`Resolve all ${blockers} blocker${blockers === 1 ? '' : 's'} before submitting for review`), {
      status: 409,
      details: { blockers },
    });
  }
  const now = nowIso();
  db.transaction(() => {
    db.prepare("UPDATE submissions SET status = 'awaiting_review', submitted_at = ?, updated_at = ? WHERE id = ?").run(now, now, submission.id);
    db.prepare(
      `INSERT INTO review_actions (id, submission_id, submission_version_id, user_id, action, comment, before_content, after_content, metadata, created_at)
       VALUES (?, ?, ?, ?, 'submit', NULL, NULL, NULL, ?, ?)`
    ).run(
      randomId(),
      submission.id,
      db.prepare('SELECT id FROM submission_versions WHERE submission_id = ? AND version = ?').get(submission.id, submission.current_version)?.id || null,
      actor.id,
      JSON.stringify({ version: submission.current_version }),
      now
    );
  })();
  audit(db, { userId: actor.id, eventType: 'submission.submitted', entityType: 'submission', entityId: submission.id });
  return db.prepare('SELECT * FROM submissions WHERE id = ?').get(submission.id);
}

function reviewerDecision(db, submission, actor, { action, comment }) {
  if (!['approve', 'request_changes', 'reject'].includes(action)) {
    throw Object.assign(new Error('Decision must be approve, request_changes or reject'), { status: 400 });
  }
  if (submission.status !== 'awaiting_review') {
    throw Object.assign(new Error('Only submissions awaiting review can be decided'), { status: 409 });
  }
  if (action !== 'approve' && !String(comment || '').trim()) {
    throw Object.assign(new Error('A comment is required when requesting changes or rejecting'), { status: 400 });
  }
  const now = nowIso();
  const nextStatus = action === 'approve' ? 'ready_to_publish' : action === 'request_changes' ? 'changes_requested' : 'rejected';
  db.transaction(() => {
    db.prepare('UPDATE submissions SET status = ?, decided_at = ?, updated_at = ? WHERE id = ?').run(nextStatus, now, now, submission.id);
    db.prepare(
      `INSERT INTO review_actions (id, submission_id, submission_version_id, user_id, action, comment, before_content, after_content, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`
    ).run(
      randomId(),
      submission.id,
      db.prepare('SELECT id FROM submission_versions WHERE submission_id = ? AND version = ?').get(submission.id, submission.current_version)?.id || null,
      actor.id,
      action,
      comment || null,
      JSON.stringify({ status: submission.status, nextStatus }),
      now
    );
  })();
  audit(db, {
    userId: actor.id,
    eventType: `submission.${action}`,
    entityType: 'submission',
    entityId: submission.id,
    metadata: { nextStatus },
  });
  return db.prepare('SELECT * FROM submissions WHERE id = ?').get(submission.id);
}

function addComment(db, submission, actor, comment) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO review_actions (id, submission_id, submission_version_id, user_id, action, comment, before_content, after_content, metadata, created_at)
     VALUES (?, ?, ?, ?, 'comment', ?, NULL, NULL, NULL, ?)`
  ).run(
    randomId(),
    submission.id,
    db.prepare('SELECT id FROM submission_versions WHERE submission_id = ? AND version = ?').get(submission.id, submission.current_version)?.id || null,
    actor.id,
    String(comment || '').trim(),
    now
  );
  return now;
}

module.exports = {
  runReview,
  listIssues,
  applyDecision,
  applyReplacement,
  normaliseFinding,
  pendingBlockerCount,
  submitForReview,
  reviewerDecision,
  addComment,
  getSettings,
  getLibrary,
  factEvidence,
  withTimeout,
  MAX_ISSUES,
};
