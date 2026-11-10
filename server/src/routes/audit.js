const express = require('express');
const crypto = require('node:crypto');
const { requireRole } = require('../auth/middleware');
const { asyncHandler } = require('../utils/http');
const { listAudit } = require('../utils/audit');

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/\r?\n/g, ' ').replace(/"/g, '""');
  return `"${text}"`;
}

function auditRouter(db) {
  const router = express.Router();
  const allowed = requireRole('admin', 'leadership');

  router.get(
    '/audit',
    allowed,
    asyncHandler(async (req, res) => {
      const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
      res.json({ entries: listAudit(db, { limit, eventType: req.query.eventType || null }) });
    })
  );

  router.get(
    '/audit/export',
    allowed,
    asyncHandler(async (_req, res) => {
      const header = ['record_type', 'timestamp', 'submission_id', 'submission_title', 'actor', 'event', 'severity', 'reference', 'provider_version', 'decision', 'comment'];
      const lines = [header.map(csvCell).join(',')];

      const actions = db
        .prepare(
          `SELECT a.created_at, a.submission_id, a.action, a.comment, a.metadata, s.title AS submission_title, s.last_llm_version, u.name AS actor
           FROM review_actions a
           JOIN submissions s ON s.id = a.submission_id
           LEFT JOIN users u ON u.id = a.user_id
           ORDER BY a.created_at DESC`
        )
        .all();
      for (const action of actions) {
        let reference = '';
        try {
          const meta = action.metadata ? JSON.parse(action.metadata) : null;
          reference = meta?.reference || '';
        } catch {
          reference = '';
        }
        lines.push(
          [
            'review_action',
            action.created_at,
            action.submission_id,
            action.submission_title,
            action.actor,
            action.action,
            '',
            reference,
            action.last_llm_version || '',
            '',
            action.comment || '',
          ]
            .map(csvCell)
            .join(',')
        );
      }

      const issues = db
        .prepare(
          `SELECT i.created_at, i.submission_id, i.severity, i.guideline_ref, i.rule_ref, i.fact_ref, i.provider_version,
                  i.decision, i.source, s.title AS submission_title
           FROM issues i JOIN submissions s ON s.id = i.submission_id
           ORDER BY i.created_at DESC`
        )
        .all();
      for (const issue of issues) {
        lines.push(
          [
            'finding',
            issue.created_at,
            issue.submission_id,
            issue.submission_title,
            'BrandShield engine',
            issue.source === 'llm' ? 'llm_finding' : 'rule_finding',
            issue.severity,
            issue.guideline_ref || issue.fact_ref || issue.rule_ref || 'no reference',
            issue.provider_version || '',
            issue.decision,
            '',
          ]
            .map(csvCell)
            .join(',')
        );
      }

      const auditRows = db
        .prepare(
          `SELECT a.created_at, a.event_type, a.entity_type, a.entity_id, a.metadata, u.name AS actor
           FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC`
        )
        .all();
      for (const entry of auditRows) {
        lines.push(
          [
            'audit_event',
            entry.created_at,
            entry.entity_type === 'submission' ? entry.entity_id : '',
            '',
            entry.actor || 'system',
            entry.event_type,
            '',
            entry.entity_type || '',
            '',
            '',
            entry.metadata || '',
          ]
            .map(csvCell)
            .join(',')
        );
      }

      const stamp = new Date().toISOString().slice(0, 10);
      res.attachment(`brandshield-audit-${stamp}.csv`);
      res.type('text/csv');
      res.send(lines.join('\r\n'));
    })
  );

  router.get(
    '/audit/verify',
    allowed,
    asyncHandler(async (_req, res) => {
      // A lightweight integrity signal: append-only tables should never have gaps
      // in submission versions. Review actions are counted for the export.
      const versions = db
        .prepare(
          `SELECT submission_id, GROUP_CONCAT(version, ',') AS versions FROM submission_versions GROUP BY submission_id`
        )
        .all();
      const gaps = [];
      for (const row of versions) {
        const numbers = String(row.versions).split(',').map(Number).sort((a, b) => a - b);
        for (let index = 0; index < numbers.length; index += 1) {
          if (numbers[index] !== index + 1) {
            gaps.push({ submissionId: row.submission_id, versions: numbers });
            break;
          }
        }
      }
      const digest = crypto
        .createHash('sha256')
        .update(JSON.stringify({ actions: db.prepare('SELECT COUNT(*) AS c FROM review_actions').get().c, issues: db.prepare('SELECT COUNT(*) AS c FROM issues').get().c }))
        .digest('hex');
      res.json({ appendOnlyGaps: gaps, digest, generatedAt: new Date().toISOString() });
    })
  );

  return router;
}

module.exports = { auditRouter };
