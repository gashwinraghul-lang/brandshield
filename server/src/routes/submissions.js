const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { requireRole } = require('../auth/middleware');
const { asyncHandler, httpError } = require('../utils/http');
const { asString, asEnum, asBoolean } = require('../utils/validate');
const { audit } = require('../utils/audit');
const { nowIso, ageInDays } = require('../utils/time');
const { upload, extractText, removeFile, isImage } = require('../utils/uploads');
const { createSubmission, addVersion, getSubmission, canAccessSubmission, canEditSubmission } = require('../services/submissionService');
const { defaultWorkspaceId, getWorkspace } = require('../services/workspaces');
const {
  runReview,
  listIssues,
  applyDecision,
  pendingBlockerCount,
  submitForReview,
  reviewerDecision,
  addComment,
  getSettings,
} = require('../services/reviewService');

const CHANNELS = ['LinkedIn', 'website', 'email', 'print'];
const DISCLOSURES = ['none', 'AI-assisted', 'AI-generated'];

function parseJson(value, fallback) {
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
}

function requireVerifiedEmail(user) {
  if (!user.emailVerified) {
    throw httpError(403, 'Verify your email address before creating or submitting content.', {
      code: 'EMAIL_UNVERIFIED',
    });
  }
}

function resolveWorkspaceId(db, user, requested) {
  const requestedId = requested ? String(requested) : null;
  if (user.role === 'agency') {
    const memberships = user.workspaceIds || [];
    if (!memberships.length) throw httpError(403, 'Your agency account is not assigned to a brand workspace yet.');
    if (requestedId) {
      if (!memberships.includes(requestedId)) throw httpError(403, 'You do not have access to that workspace.');
      return requestedId;
    }
    if (memberships.length === 1) return memberships[0];
    throw httpError(400, 'Choose which brand workspace this content belongs to.');
  }
  if (requestedId) {
    if (!getWorkspace(db, requestedId)) throw httpError(404, 'Workspace not found');
    return requestedId;
  }
  return defaultWorkspaceId(db);
}

function issueCounts(db, submissionId) {
  const row = db
    .prepare(
      `SELECT
        SUM(CASE WHEN severity = 'blocker' AND decision = 'pending' THEN 1 ELSE 0 END) AS blockers,
        SUM(CASE WHEN severity = 'warning' AND decision = 'pending' THEN 1 ELSE 0 END) AS warnings,
        SUM(CASE WHEN severity = 'suggestion' AND decision = 'pending' THEN 1 ELSE 0 END) AS suggestions,
        SUM(CASE WHEN decision IN ('accepted', 'edited') THEN 1 ELSE 0 END) AS resolved
       FROM issues WHERE submission_id = ?`
    )
    .get(submissionId);
  return {
    blockers: row.blockers || 0,
    warnings: row.warnings || 0,
    suggestions: row.suggestions || 0,
    resolved: row.resolved || 0,
  };
}

function submissionSummary(db, row) {
  return { ...row, counts: issueCounts(db, row.id), ageDays: ageInDays(row.submitted_at || row.created_at) };
}

function submissionRouter(db) {
  const router = express.Router();

  router.get(
    '/submissions',
    asyncHandler(async (req, res) => {
      const params = [];
      let sql = 'SELECT s.*, u.name AS owner_name, u.email AS owner_email FROM submissions s JOIN users u ON u.id = s.owner_id WHERE 1=1';
      if (['creator', 'agency'].includes(req.user.role)) {
        sql += ' AND s.owner_id = ?';
        params.push(req.user.id);
      }
      if (req.user.role === 'agency') {
        const memberships = req.user.workspaceIds || [];
        if (!memberships.length) {
          sql += ' AND 1=0';
        } else {
          sql += ` AND s.brand_workspace_id IN (${memberships.map(() => '?').join(', ')})`;
          params.push(...memberships);
        }
      }
      if (req.query.workspaceId && req.user.role !== 'agency') {
        sql += ' AND s.brand_workspace_id = ?';
        params.push(String(req.query.workspaceId));
      }
      if (req.query.status) {
        sql += ' AND s.status = ?';
        params.push(String(req.query.status));
      }
      if (req.query.channel) {
        sql += ' AND s.channel = ?';
        params.push(String(req.query.channel));
      }
      if (req.query.team) {
        sql += ' AND s.team = ?';
        params.push(String(req.query.team));
      }
      sql += ' ORDER BY s.updated_at DESC LIMIT 200';
      const rows = db.prepare(sql).all(...params).map((row) => submissionSummary(db, row));
      res.json({ submissions: rows });
    })
  );

  router.get(
    '/queue',
    asyncHandler(async (req, res) => {
      if (!['admin', 'reviewer'].includes(req.user.role)) throw httpError(403, 'Only reviewers and admins can view the queue');
      const params = [];
      let sql = `SELECT s.*, u.name AS owner_name FROM submissions s JOIN users u ON u.id = s.owner_id WHERE s.status = 'awaiting_review'`;
      if (req.query.channel) {
        sql += ' AND s.channel = ?';
        params.push(String(req.query.channel));
      }
      if (req.query.team) {
        sql += ' AND s.team = ?';
        params.push(String(req.query.team));
      }
      sql += ' ORDER BY s.submitted_at ASC';
      let rows = db.prepare(sql).all(...params).map((row) => submissionSummary(db, row));
      const severity = req.query.severity;
      if (severity === 'blocker') rows = rows.filter((row) => row.counts.blockers > 0);
      if (severity === 'warning') rows = rows.filter((row) => row.counts.warnings > 0);
      const minAge = Number(req.query.ageDays || 0);
      if (minAge > 0) rows = rows.filter((row) => row.ageDays >= minAge);
      res.json({ queue: rows });
    })
  );

  router.post(
    '/submissions',
    requireRole('creator', 'agency', 'admin'),
    upload.single('file'),
    asyncHandler(async (req, res) => {
      requireVerifiedEmail(req.user);
      const title = asString(req.body?.title, 'Title', { required: true, max: 200 });
      const channel = asEnum(req.body?.channel, 'Channel', CHANNELS, { required: true });
      const disclosure = asEnum(req.body?.aiDisclosure, 'AI disclosure', DISCLOSURES, { required: true });
      const altText = asString(req.body?.altText, 'Alt text', { max: 1000 }) || null;
      const contentInput = asString(req.body?.content, 'Content', { max: 200000 }) || '';
      let type = asEnum(req.body?.type, 'Type', ['text', 'document', 'image']) || 'text';
      let content = contentInput;
      if (req.file) {
        type = isImage(req.file) ? 'image' : 'document';
        content = await extractText(req.file);
      }
      if (type !== 'image' && !content.trim()) throw httpError(400, 'Add some content or upload a document');
      if (type === 'image' && !req.file) throw httpError(400, 'Upload a PNG or JPG image');

      const submission = createSubmission(db, {
        title,
        channel,
        type,
        content,
        altText,
        filePath: req.file?.path || null,
        fileName: req.file?.originalname || null,
        aiDisclosure: disclosure,
        owner: req.user,
        brandWorkspaceId: resolveWorkspaceId(db, req.user, req.body?.brandWorkspaceId),
        note: 'Created',
      });
      audit(db, {
        userId: req.user.id,
        eventType: 'submission.create',
        entityType: 'submission',
        entityId: submission.id,
        metadata: { channel, type, aiDisclosure: disclosure, workspaceId: submission.brand_workspace_id },
      });
      res.status(201).json({ submission });
    })
  );

  router.post(
    '/submissions/:id/analyse',
    requireRole('creator', 'agency', 'admin'),
    asyncHandler(async (req, res) => {
      const submission = getSubmission(db, req.params.id);
      if (!submission) throw httpError(404, 'Submission not found');
      if (!canAccessSubmission(req.user, submission)) throw httpError(403, 'You cannot review this submission');
      if (submission.owner_id !== req.user.id && req.user.role !== 'admin') throw httpError(403, 'Only the owner can run a review');
      if (['awaiting_review', 'approved', 'ready_to_publish', 'rejected'].includes(submission.status)) {
        throw httpError(409, 'This submission cannot be re-analysed in its current state');
      }
      const result = await runReview(db, submission, { actorId: req.user.id });
      res.json({ ...result, submission: getSubmission(db, submission.id) });
    })
  );

  router.get(
    '/submissions/:id',
    asyncHandler(async (req, res) => {
      const submission = getSubmission(db, req.params.id);
      if (!submission) throw httpError(404, 'Submission not found');
      if (!canAccessSubmission(req.user, submission)) throw httpError(403, 'You cannot view this submission');
      const issues = listIssues(db, submission.id);
      const versions = db
        .prepare(
          `SELECT v.*, u.name AS created_by_name FROM submission_versions v
           LEFT JOIN users u ON u.id = v.created_by WHERE v.submission_id = ? ORDER BY v.version DESC`
        )
        .all(submission.id);
      const actions = db
        .prepare(
          `SELECT a.*, u.name AS user_name, u.role_key AS user_role FROM review_actions a
           LEFT JOIN users u ON u.id = a.user_id WHERE a.submission_id = ? ORDER BY a.created_at DESC`
        )
        .all(submission.id)
        .map((row) => ({ ...row, metadata: row.metadata ? parseJson(row.metadata, null) : null }));
      const settings = getSettings(db);
      const canEdit = canEditSubmission(req.user, submission);
      res.json({
        submission: {
          ...submission,
          owner_name: db.prepare('SELECT name FROM users WHERE id = ?').get(submission.owner_id)?.name || 'Unknown',
        },
        issues,
        versions,
        actions,
        meta: {
          externalAI: settings.external_llm_enabled === 'true',
          provider: submission.last_llm_provider,
          providerVersion: submission.last_llm_version,
          llmStatus: submission.last_llm_status,
        },
        can: {
          edit: canEdit,
          analyse: canEdit && submission.status !== 'draft' ? canEdit : canEdit,
          decideIssue: canEdit,
          submit: canEdit && submission.status === 'analysed',
          review: ['admin', 'reviewer'].includes(req.user.role) && submission.status === 'awaiting_review',
          comment: true,
          delete: req.user.role === 'admin' || submission.owner_id === req.user.id,
          download: ['ready_to_publish', 'approved'].includes(submission.status) || ['admin', 'reviewer'].includes(req.user.role),
        },
      });
    })
  );

  router.patch(
    '/submissions/:id',
    asyncHandler(async (req, res) => {
      const submission = getSubmission(db, req.params.id);
      if (!submission) throw httpError(404, 'Submission not found');
      if (!canEditSubmission(req.user, submission)) throw httpError(403, 'This submission cannot be edited now');
      const title = asString(req.body?.title, 'Title', { max: 200 });
      const channel = asEnum(req.body?.channel, 'Channel', CHANNELS);
      const disclosure = asEnum(req.body?.aiDisclosure, 'AI disclosure', DISCLOSURES);
      const content = asString(req.body?.content, 'Content', { max: 200000 });
      const altText = req.body?.altText !== undefined ? asString(req.body.altText, 'Alt text', { max: 1000 }) || null : submission.alt_text;
      if (content !== undefined && submission.type === 'document' && !content.trim()) throw httpError(400, 'Content cannot be empty');
      const now = nowIso();
      db.transaction(() => {
        db.prepare('UPDATE submissions SET title = ?, channel = ?, ai_disclosure = ?, content = ?, alt_text = ?, status = ?, updated_at = ? WHERE id = ?').run(
          title || submission.title,
          channel || submission.channel,
          disclosure || submission.ai_disclosure,
          content !== undefined ? content : submission.content,
          altText,
          'draft',
          now,
          submission.id
        );
        db.prepare('DELETE FROM issues WHERE submission_id = ?').run(submission.id);
      })();
      const updated = getSubmission(db, submission.id);
      addVersion(db, updated, req.user.id, 'Edited before review');
      audit(db, { userId: req.user.id, eventType: 'submission.update', entityType: 'submission', entityId: submission.id });
      res.json({ submission: getSubmission(db, submission.id) });
    })
  );

  router.post(
    '/submissions/:id/issues/:issueId/decision',
    requireRole('creator', 'agency', 'admin'),
    asyncHandler(async (req, res) => {
      const submission = getSubmission(db, req.params.id);
      if (!submission) throw httpError(404, 'Submission not found');
      if (submission.owner_id !== req.user.id && req.user.role !== 'admin') throw httpError(403, 'Only the owner can decide on issues');
      const issue = db.prepare('SELECT * FROM issues WHERE id = ? AND submission_id = ?').get(req.params.issueId, submission.id);
      if (!issue) throw httpError(404, 'Issue not found');
      if (issue.decision !== 'pending') throw httpError(409, 'This issue already has a decision');
      if (['awaiting_review', 'approved', 'ready_to_publish', 'rejected'].includes(submission.status)) {
        throw httpError(409, 'Issues cannot be changed in the current state');
      }
      const decision = asEnum(req.body?.decision, 'Decision', ['accepted', 'edited', 'rejected'], { required: true });
      const editedText = asString(req.body?.editedText, 'Edited text', { max: 5000 });
      const updated = applyDecision(db, submission, issue, { decision, editedText, actor: req.user });
      res.json({ submission: updated, issues: listIssues(db, submission.id) });
    })
  );

  router.post(
    '/submissions/:id/submit',
    requireRole('creator', 'agency', 'admin'),
    asyncHandler(async (req, res) => {
      const submission = getSubmission(db, req.params.id);
      if (!submission) throw httpError(404, 'Submission not found');
      if (submission.owner_id !== req.user.id && req.user.role !== 'admin') throw httpError(403, 'Only the owner can submit this');
      if (submission.status !== 'analysed') throw httpError(409, 'Run the review before submitting');
      const updated = submitForReview(db, submission, req.user);
      res.json({ submission: updated });
    })
  );

  router.post(
    '/submissions/:id/decision',
    requireRole('reviewer', 'admin'),
    asyncHandler(async (req, res) => {
      const submission = getSubmission(db, req.params.id);
      if (!submission) throw httpError(404, 'Submission not found');
      const action = asEnum(req.body?.action, 'Action', ['approve', 'request_changes', 'reject'], { required: true });
      const comment = asString(req.body?.comment, 'Comment', { max: 4000 });
      const updated = reviewerDecision(db, submission, req.user, { action, comment });
      res.json({ submission: updated });
    })
  );

  router.post(
    '/submissions/:id/comments',
    asyncHandler(async (req, res) => {
      const submission = getSubmission(db, req.params.id);
      if (!submission) throw httpError(404, 'Submission not found');
      if (!canAccessSubmission(req.user, submission)) throw httpError(403, 'You cannot comment on this submission');
      const comment = asString(req.body?.comment, 'Comment', { required: true, max: 4000 });
      addComment(db, submission, req.user, comment);
      res.status(201).json({ ok: true });
    })
  );

  router.get(
    '/submissions/:id/file',
    asyncHandler(async (req, res) => {
      const submission = getSubmission(db, req.params.id);
      if (!submission) throw httpError(404, 'Submission not found');
      if (!canAccessSubmission(req.user, submission)) throw httpError(403, 'You cannot view this file');
      if (!submission.file_path || !fs.existsSync(submission.file_path)) throw httpError(404, 'File not found');
      res.sendFile(path.resolve(submission.file_path));
    })
  );

  router.get(
    '/submissions/:id/export',
    asyncHandler(async (req, res) => {
      const submission = getSubmission(db, req.params.id);
      if (!submission) throw httpError(404, 'Submission not found');
      if (!canAccessSubmission(req.user, submission)) throw httpError(403, 'You cannot export this submission');
      if (!['ready_to_publish', 'approved'].includes(submission.status) && !['admin', 'reviewer'].includes(req.user.role)) {
        throw httpError(409, 'Only approved content can be downloaded');
      }
      const format = req.query.format === 'txt' ? 'txt' : 'md';
      const safeTitle = submission.title.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'brandshield-content';
      if (format === 'txt') {
        res.attachment(`${safeTitle}.txt`);
        return res.type('text/plain').send(submission.content);
      }
      const body = [
        `# ${submission.title}`,
        '',
        `Channel: ${submission.channel}`,
        `AI disclosure: ${submission.ai_disclosure}`,
        `Status: ${submission.status}`,
        `Version: ${submission.current_version}`,
        '',
        submission.content,
        '',
        '---',
        'Reviewed with BrandShield.ai by Inkloom AI. Humans made the final decision.',
      ].join('\n');
      res.attachment(`${safeTitle}.md`);
      return res.type('text/markdown').send(body);
    })
  );

  router.delete(
    '/submissions/:id',
    asyncHandler(async (req, res) => {
      const submission = getSubmission(db, req.params.id);
      if (!submission) throw httpError(404, 'Submission not found');
      if (submission.owner_id !== req.user.id && req.user.role !== 'admin') throw httpError(403, 'You cannot delete this submission');
      if (['awaiting_review', 'ready_to_publish'].includes(submission.status) && req.user.role !== 'admin') {
        throw httpError(409, 'Submitted or approved content can only be deleted by an admin');
      }
      await removeFile(submission.file_path);
      db.prepare('DELETE FROM submissions WHERE id = ?').run(submission.id);
      audit(db, { userId: req.user.id, eventType: 'submission.delete', entityType: 'submission', entityId: submission.id, metadata: { retention: true } });
      res.json({ ok: true });
    })
  );

  return router;
}

module.exports = { submissionRouter, issueCounts };
