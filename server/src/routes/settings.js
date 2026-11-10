const express = require('express');
const crypto = require('node:crypto');
const { requireRole } = require('../auth/middleware');
const { asyncHandler, httpError } = require('../utils/http');
const { asString, asNumber, asEnum, asBoolean } = require('../utils/validate');
const { audit } = require('../utils/audit');
const { nowIso, isoDaysAgo } = require('../utils/time');
const { removeFile } = require('../utils/uploads');
const { compilePattern } = require('../services/masking');
const { catalog } = require('../services/llm');
const { listSentEmails } = require('../services/email');

const adminOnly = requireRole('admin');
const PROVIDER_IDS = ['auto', 'mock', 'gemini', 'groq', 'openrouter', 'pollinations', 'openai-compatible'];

function readSettings(db) {
  return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((row) => [row.key, row.value]));
}

function settingsRouter(db) {
  const router = express.Router();

  router.get(
    '/settings',
    adminOnly,
    asyncHandler(async (_req, res) => {
      const settings = readSettings(db);
      const patterns = db.prepare('SELECT * FROM confidential_patterns ORDER BY created_at').all();
      const providers = catalog();
      res.json({
        settings: {
          org_name: settings.org_name || 'Northwind Labs',
          retention_days: Number(settings.retention_days || 365),
          external_llm_enabled: settings.external_llm_enabled === 'true',
          default_ai_disclosure: settings.default_ai_disclosure || 'AI-assisted',
          llm_provider: settings.llm_provider || 'auto',
        },
        patterns,
        llm: {
          keyConfigured: providers.some((provider) => provider.requiresKey && provider.configured),
          configuredCount: providers.filter((provider) => provider.configured && provider.id !== 'mock').length,
          model: process.env.BRANDSHIELD_LLM_MODEL || 'gpt-4o-mini',
          providers,
          selected: settings.llm_provider || 'auto',
        },
      });
    })
  );

  router.patch(
    '/settings',
    adminOnly,
    asyncHandler(async (req, res) => {
      const updates = {};
      if (req.body?.retention_days !== undefined) {
        updates.retention_days = String(asNumber(req.body.retention_days, 'Retention days', { min: 1, max: 3650 }));
      }
      if (req.body?.external_llm_enabled !== undefined) {
        updates.external_llm_enabled = asBoolean(req.body.external_llm_enabled) ? 'true' : 'false';
      }
      if (req.body?.default_ai_disclosure !== undefined) {
        updates.default_ai_disclosure = asEnum(req.body.default_ai_disclosure, 'Default AI disclosure', ['none', 'AI-assisted', 'AI-generated'], { required: true });
      }
      if (req.body?.llm_provider !== undefined) {
        updates.llm_provider = asEnum(req.body.llm_provider, 'LLM provider', PROVIDER_IDS, { required: true });
      }
      if (req.body?.org_name !== undefined) {
        updates.org_name = asString(req.body.org_name, 'Organisation name', { required: true, max: 120 });
      }
      if (!Object.keys(updates).length) throw httpError(400, 'No settings to update');
      const now = nowIso();
      db.transaction(() => {
        for (const [key, value] of Object.entries(updates)) {
          db.prepare(
            `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
          ).run(key, value, now);
        }
      })();
      audit(db, {
        userId: req.user.id,
        eventType: 'settings.update',
        entityType: 'settings',
        metadata: { keys: Object.keys(updates) },
      });
      res.json({ settings: readSettings(db) });
    })
  );

  router.post(
    '/settings/retention/purge',
    adminOnly,
    asyncHandler(async (req, res) => {
      const settings = readSettings(db);
      const days = Number(settings.retention_days || 365);
      const cutoff = isoDaysAgo(days);
      const rows = db
        .prepare("SELECT id, file_path FROM submissions WHERE updated_at < ? AND status != 'awaiting_review'")
        .all(cutoff);
      for (const row of rows) {
        await removeFile(row.file_path);
        db.prepare('DELETE FROM submissions WHERE id = ?').run(row.id);
      }
      audit(db, {
        userId: req.user.id,
        eventType: 'retention.purge',
        entityType: 'submission',
        metadata: { deleted: rows.length, retentionDays: days },
      });
      res.json({ deleted: rows.length, retentionDays: days });
    })
  );

  router.get(
    '/settings/patterns',
    adminOnly,
    asyncHandler(async (_req, res) => {
      res.json({ patterns: db.prepare('SELECT * FROM confidential_patterns ORDER BY created_at').all() });
    })
  );

  router.post(
    '/settings/patterns',
    adminOnly,
    asyncHandler(async (req, res) => {
      const name = asString(req.body?.name, 'Pattern name', { required: true, max: 120 });
      const pattern = asString(req.body?.pattern, 'Pattern', { required: true, max: 500 });
      try {
        void compilePattern(pattern);
        // Test the raw pattern too: compilePattern falls back to a literal, but admins
        // should learn about a malformed regex instead of silently masking nothing.
        new RegExp(pattern, 'gi');
      } catch {
        throw httpError(400, 'Pattern must be a valid regular expression');
      }
      const replacement = asString(req.body?.replacement, 'Replacement', { max: 80 }) || '[REDACTED]';
      const id = crypto.randomUUID();
      const now = nowIso();
      db.prepare(
        'INSERT INTO confidential_patterns (id, name, pattern, replacement, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
      ).run(id, name, pattern, replacement, now, now);
      audit(db, { userId: req.user.id, eventType: 'settings.pattern.create', entityType: 'confidential_pattern', entityId: id, metadata: { name } });
      res.status(201).json({ id });
    })
  );

  router.patch(
    '/settings/patterns/:id',
    adminOnly,
    asyncHandler(async (req, res) => {
      const pattern = db.prepare('SELECT * FROM confidential_patterns WHERE id = ?').get(req.params.id);
      if (!pattern) throw httpError(404, 'Pattern not found');
      const name = asString(req.body?.name, 'Pattern name', { max: 120 });
      const rawPattern = asString(req.body?.pattern, 'Pattern', { max: 500 });
      if (rawPattern) {
        try {
          new RegExp(rawPattern, 'gi');
        } catch {
          throw httpError(400, 'Pattern must be a valid regular expression');
        }
      }
      const replacement = asString(req.body?.replacement, 'Replacement', { max: 80 });
      const active = req.body?.active !== undefined ? (asBoolean(req.body.active) ? 1 : 0) : pattern.active;
      db.prepare('UPDATE confidential_patterns SET name = ?, pattern = ?, replacement = ?, active = ?, updated_at = ? WHERE id = ?').run(
        name || pattern.name,
        rawPattern || pattern.pattern,
        replacement || pattern.replacement,
        active,
        nowIso(),
        pattern.id
      );
      audit(db, { userId: req.user.id, eventType: 'settings.pattern.update', entityType: 'confidential_pattern', entityId: pattern.id });
      res.json({ ok: true });
    })
  );

  router.post(
    '/settings/patterns/:id/deactivate',
    adminOnly,
    asyncHandler(async (req, res) => {
      db.prepare('UPDATE confidential_patterns SET active = 0, updated_at = ? WHERE id = ?').run(nowIso(), req.params.id);
      audit(db, { userId: req.user.id, eventType: 'settings.pattern.deactivate', entityType: 'confidential_pattern', entityId: req.params.id });
      res.json({ ok: true });
    })
  );

  router.get(
    '/settings/emails',
    adminOnly,
    asyncHandler(async (req, res) => {
      res.json({ emails: listSentEmails(db, req.query.limit || 50) });
    })
  );

  router.delete(
    '/settings/emails',
    adminOnly,
    asyncHandler(async (req, res) => {
      const result = db.prepare('DELETE FROM email_outbox').run();
      audit(db, {
        userId: req.user.id,
        eventType: 'settings.emails.clear',
        entityType: 'email_outbox',
        metadata: { deleted: result.changes },
      });
      res.json({ deleted: result.changes });
    })
  );

  return router;
}

module.exports = { settingsRouter, readSettings };
