const express = require('express');
const fs = require('node:fs');
const { randomId } = require('../auth/crypto');
const { requireRole } = require('../auth/middleware');
const { asyncHandler, httpError } = require('../utils/http');
const { asString, asStringArray, asEnum, asDate } = require('../utils/validate');
const { audit } = require('../utils/audit');
const { nowIso } = require('../utils/time');
const { upload } = require('../utils/uploads');

const adminOnly = requireRole('admin');
const STABLE_ID = /^[A-Z]{2,8}-\d{2,3}$/;

function parseJson(value, fallback) {
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
}

function libraryRouter(db) {
  const router = express.Router();

  /* ------------------------------- Guidelines ------------------------------- */

  router.get(
    '/guidelines',
    asyncHandler(async (_req, res) => {
      const rows = db
        .prepare(
          `SELECT g.*, v.body, v.version AS body_version, v.change_note,
                  (SELECT COUNT(*) FROM brand_guideline_versions x WHERE x.guideline_id = g.id) AS version_count
           FROM brand_guidelines g
           LEFT JOIN brand_guideline_versions v ON v.guideline_id = g.id AND v.version = g.current_version
           ORDER BY g.stable_id`
        )
        .all();
      res.json({ guidelines: rows });
    })
  );

  router.get(
    '/guidelines/:id/versions',
    asyncHandler(async (req, res) => {
      const versions = db
        .prepare(
          `SELECT v.*, u.name AS created_by_name FROM brand_guideline_versions v
           LEFT JOIN users u ON u.id = v.created_by
           WHERE v.guideline_id = ? ORDER BY v.version DESC`
        )
        .all(req.params.id);
      res.json({ versions });
    })
  );

  router.post(
    '/guidelines',
    adminOnly,
    asyncHandler(async (req, res) => {
      const stableId = asString(req.body?.stableId, 'Guideline ID', { required: true, max: 20 }).toUpperCase();
      if (!STABLE_ID.test(stableId)) throw httpError(400, 'Guideline ID must look like TONE-02');
      const title = asString(req.body?.title, 'Title', { required: true, max: 200 });
      const category = asString(req.body?.category, 'Category', { required: true, max: 80 });
      const owner = asString(req.body?.owner, 'Owner', { max: 120 }) || null;
      const body = asString(req.body?.body, 'Guideline body', { required: true, max: 20000 });
      const changeNote = asString(req.body?.changeNote, 'Change note', { max: 300 }) || 'Initial version';
      const id = randomId();
      const now = nowIso();
      db.transaction(() => {
        db.prepare(
          `INSERT INTO brand_guidelines (id, stable_id, title, category, owner, status, current_version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'active', 1, ?, ?)`
        ).run(id, stableId, title, category, owner, now, now);
        db.prepare(
          `INSERT INTO brand_guideline_versions (id, guideline_id, version, body, change_note, created_by, created_at)
           VALUES (?, ?, 1, ?, ?, ?, ?)`
        ).run(randomId(), id, body, changeNote, req.user.id, now);
      })();
      audit(db, { userId: req.user.id, eventType: 'library.guideline.create', entityType: 'brand_guideline', entityId: id, metadata: { stableId } });
      res.status(201).json({ id, stableId });
    })
  );

  router.patch(
    '/guidelines/:id',
    adminOnly,
    asyncHandler(async (req, res) => {
      const guideline = db.prepare('SELECT * FROM brand_guidelines WHERE id = ?').get(req.params.id);
      if (!guideline) throw httpError(404, 'Guideline not found');
      const title = asString(req.body?.title, 'Title', { max: 200 });
      const category = asString(req.body?.category, 'Category', { max: 80 });
      const owner = req.body?.owner !== undefined ? asString(req.body?.owner, 'Owner', { max: 120 }) || null : undefined;
      const body = req.body?.body !== undefined ? asString(req.body?.body, 'Guideline body', { required: true, max: 20000 }) : undefined;
      const changeNote = asString(req.body?.changeNote, 'Change note', { max: 300 }) || 'Edited guideline';
      const now = nowIso();
      db.transaction(() => {
        db.prepare('UPDATE brand_guidelines SET title = ?, category = ?, owner = ?, updated_at = ? WHERE id = ?').run(
          title || guideline.title,
          category || guideline.category,
          owner === undefined ? guideline.owner : owner,
          now,
          guideline.id
        );
        if (body !== undefined) {
          const next = guideline.current_version + 1;
          db.prepare(
            `INSERT INTO brand_guideline_versions (id, guideline_id, version, body, change_note, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(randomId(), guideline.id, next, body, changeNote, req.user.id, now);
          db.prepare('UPDATE brand_guidelines SET current_version = ? WHERE id = ?').run(next, guideline.id);
        }
      })();
      audit(db, { userId: req.user.id, eventType: 'library.guideline.update', entityType: 'brand_guideline', entityId: guideline.id, metadata: { stableId: guideline.stable_id, newVersion: body !== undefined } });
      res.json({ ok: true });
    })
  );

  router.post(
    '/guidelines/:id/versions',
    adminOnly,
    asyncHandler(async (req, res) => {
      const guideline = db.prepare('SELECT * FROM brand_guidelines WHERE id = ?').get(req.params.id);
      if (!guideline) throw httpError(404, 'Guideline not found');
      const body = asString(req.body?.body, 'Guideline body', { required: true, max: 20000 });
      const changeNote = asString(req.body?.changeNote, 'Change note', { max: 300 }) || 'New version';
      const next = guideline.current_version + 1;
      const now = nowIso();
      db.transaction(() => {
        db.prepare(
          `INSERT INTO brand_guideline_versions (id, guideline_id, version, body, change_note, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(randomId(), guideline.id, next, body, changeNote, req.user.id, now);
        db.prepare('UPDATE brand_guidelines SET current_version = ?, updated_at = ? WHERE id = ?').run(next, now, guideline.id);
      })();
      audit(db, { userId: req.user.id, eventType: 'library.guideline.version', entityType: 'brand_guideline', entityId: guideline.id, metadata: { stableId: guideline.stable_id, version: next } });
      res.status(201).json({ version: next });
    })
  );

  router.post(
    '/guidelines/:id/deactivate',
    adminOnly,
    asyncHandler(async (req, res) => {
      const now = nowIso();
      db.prepare("UPDATE brand_guidelines SET status = 'inactive', deactivated_at = ?, updated_at = ? WHERE id = ?").run(now, now, req.params.id);
      audit(db, { userId: req.user.id, eventType: 'library.guideline.deactivate', entityType: 'brand_guideline', entityId: req.params.id });
      res.json({ ok: true });
    })
  );

  router.post(
    '/guidelines/:id/reactivate',
    adminOnly,
    asyncHandler(async (req, res) => {
      db.prepare("UPDATE brand_guidelines SET status = 'active', deactivated_at = NULL, updated_at = ? WHERE id = ?").run(nowIso(), req.params.id);
      audit(db, { userId: req.user.id, eventType: 'library.guideline.reactivate', entityType: 'brand_guideline', entityId: req.params.id });
      res.json({ ok: true });
    })
  );

  /* ------------------------------ Approved facts ----------------------------- */

  router.get(
    '/facts',
    asyncHandler(async (_req, res) => {
      const facts = db
        .prepare(
          `SELECT f.*, s.stable_id AS successor_stable_id FROM approved_facts f
           LEFT JOIN approved_facts s ON s.id = f.successor_id
           ORDER BY f.stable_id`
        )
        .all()
        .map((row) => ({ ...row, keywords: parseJson(row.keywords, []) }));
      res.json({ facts });
    })
  );

  router.post(
    '/facts',
    adminOnly,
    asyncHandler(async (req, res) => {
      const stableId = asString(req.body?.stableId, 'Fact ID', { required: true, max: 20 }).toUpperCase();
      if (!/^FACT-\d{2,3}$/.test(stableId)) throw httpError(400, 'Fact ID must look like FACT-01');
      const statement = asString(req.body?.statement, 'Statement', { required: true, max: 1000 });
      const source = asString(req.body?.source, 'Source', { required: true, max: 300 });
      const owner = asString(req.body?.owner, 'Owner', { required: true, max: 120 });
      const effectiveDate = asDate(req.body?.effectiveDate, 'Effective date');
      const expiryDate = asDate(req.body?.expiryDate, 'Expiry date');
      const keywords = asStringArray(req.body?.keywords, 'Keywords');
      const successorStable = asString(req.body?.successorId, 'Successor fact', { max: 20 });
      let successorId = null;
      if (successorStable) {
        const successor = db.prepare('SELECT id FROM approved_facts WHERE stable_id = ?').get(successorStable.toUpperCase());
        if (!successor) throw httpError(400, 'Successor fact does not exist');
        successorId = successor.id;
      }
      const id = randomId();
      const now = nowIso();
      db.prepare(
        `INSERT INTO approved_facts
          (id, stable_id, statement, source, owner, effective_date, expiry_date, keywords, successor_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      ).run(id, stableId, statement, source, owner, effectiveDate, expiryDate, JSON.stringify(keywords), successorId, now, now);
      audit(db, { userId: req.user.id, eventType: 'library.fact.create', entityType: 'approved_fact', entityId: id, metadata: { stableId } });
      res.status(201).json({ id, stableId });
    })
  );

  router.patch(
    '/facts/:id',
    adminOnly,
    asyncHandler(async (req, res) => {
      const fact = db.prepare('SELECT * FROM approved_facts WHERE id = ?').get(req.params.id);
      if (!fact) throw httpError(404, 'Fact not found');
      const statement = asString(req.body?.statement, 'Statement', { max: 1000 });
      const source = asString(req.body?.source, 'Source', { max: 300 });
      const owner = asString(req.body?.owner, 'Owner', { max: 120 });
      const effectiveDate = req.body?.effectiveDate !== undefined ? asDate(req.body.effectiveDate, 'Effective date') : fact.effective_date;
      const expiryDate = req.body?.expiryDate !== undefined ? asDate(req.body.expiryDate, 'Expiry date') : fact.expiry_date;
      const keywords = req.body?.keywords !== undefined ? asStringArray(req.body.keywords, 'Keywords') : parseJson(fact.keywords, []);
      const now = nowIso();
      db.prepare(
        `UPDATE approved_facts SET statement = ?, source = ?, owner = ?, effective_date = ?, expiry_date = ?, keywords = ?, updated_at = ? WHERE id = ?`
      ).run(statement || fact.statement, source || fact.source, owner || fact.owner, effectiveDate, expiryDate, JSON.stringify(keywords), now, fact.id);
      audit(db, { userId: req.user.id, eventType: 'library.fact.update', entityType: 'approved_fact', entityId: fact.id, metadata: { stableId: fact.stable_id } });
      res.json({ ok: true });
    })
  );

  router.post(
    '/facts/:id/deactivate',
    adminOnly,
    asyncHandler(async (req, res) => {
      const now = nowIso();
      db.prepare("UPDATE approved_facts SET status = 'inactive', deactivated_at = ?, updated_at = ? WHERE id = ?").run(now, now, req.params.id);
      audit(db, { userId: req.user.id, eventType: 'library.fact.deactivate', entityType: 'approved_fact', entityId: req.params.id });
      res.json({ ok: true });
    })
  );

  router.post(
    '/facts/:id/reactivate',
    adminOnly,
    asyncHandler(async (req, res) => {
      db.prepare("UPDATE approved_facts SET status = 'active', deactivated_at = NULL, updated_at = ? WHERE id = ?").run(nowIso(), req.params.id);
      audit(db, { userId: req.user.id, eventType: 'library.fact.reactivate', entityType: 'approved_fact', entityId: req.params.id });
      res.json({ ok: true });
    })
  );

  /* ------------------------------- Terminology ------------------------------ */

  router.get(
    '/terminology',
    asyncHandler(async (_req, res) => {
      const entries = db.prepare('SELECT * FROM terminology_entries ORDER BY code').all().map((row) => ({
        ...row,
        banned_terms: parseJson(row.banned_terms, []),
      }));
      res.json({ terminology: entries });
    })
  );

  router.post(
    '/terminology',
    adminOnly,
    asyncHandler(async (req, res) => {
      const code = asString(req.body?.code, 'Term code', { required: true, max: 20 }).toUpperCase();
      if (!/^TERM-\d{2,3}$/.test(code)) throw httpError(400, 'Term code must look like TERM-01');
      const preferredTerm = asString(req.body?.preferredTerm, 'Preferred term', { required: true, max: 120 });
      const bannedTerms = asStringArray(req.body?.bannedTerms, 'Banned terms');
      if (!bannedTerms.length) throw httpError(400, 'Add at least one banned or alternate term');
      const notes = asString(req.body?.notes, 'Notes', { max: 500 }) || null;
      const guidelineRef = asString(req.body?.guidelineRef, 'Guideline reference', { max: 20 }) || null;
      const id = randomId();
      const now = nowIso();
      db.prepare(
        `INSERT INTO terminology_entries (id, code, preferred_term, banned_terms, notes, guideline_ref, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      ).run(id, code, preferredTerm, JSON.stringify(bannedTerms), notes, guidelineRef, now, now);
      audit(db, { userId: req.user.id, eventType: 'library.terminology.create', entityType: 'terminology_entry', entityId: id, metadata: { code } });
      res.status(201).json({ id, code });
    })
  );

  router.patch(
    '/terminology/:id',
    adminOnly,
    asyncHandler(async (req, res) => {
      const entry = db.prepare('SELECT * FROM terminology_entries WHERE id = ?').get(req.params.id);
      if (!entry) throw httpError(404, 'Terminology entry not found');
      const preferredTerm = asString(req.body?.preferredTerm, 'Preferred term', { max: 120 });
      const bannedTerms = req.body?.bannedTerms !== undefined ? asStringArray(req.body.bannedTerms, 'Banned terms') : parseJson(entry.banned_terms, []);
      const notes = req.body?.notes !== undefined ? asString(req.body.notes, 'Notes', { max: 500 }) || null : entry.notes;
      const guidelineRef = req.body?.guidelineRef !== undefined ? asString(req.body.guidelineRef, 'Guideline reference', { max: 20 }) || null : entry.guideline_ref;
      db.prepare(
        'UPDATE terminology_entries SET preferred_term = ?, banned_terms = ?, notes = ?, guideline_ref = ?, updated_at = ? WHERE id = ?'
      ).run(preferredTerm || entry.preferred_term, JSON.stringify(bannedTerms), notes, guidelineRef, nowIso(), entry.id);
      audit(db, { userId: req.user.id, eventType: 'library.terminology.update', entityType: 'terminology_entry', entityId: entry.id, metadata: { code: entry.code } });
      res.json({ ok: true });
    })
  );

  router.post(
    '/terminology/:id/deactivate',
    adminOnly,
    asyncHandler(async (req, res) => {
      const now = nowIso();
      db.prepare("UPDATE terminology_entries SET status = 'inactive', deactivated_at = ?, updated_at = ? WHERE id = ?").run(now, now, req.params.id);
      audit(db, { userId: req.user.id, eventType: 'library.terminology.deactivate', entityType: 'terminology_entry', entityId: req.params.id });
      res.json({ ok: true });
    })
  );

  router.post(
    '/terminology/:id/reactivate',
    adminOnly,
    asyncHandler(async (req, res) => {
      db.prepare("UPDATE terminology_entries SET status = 'active', deactivated_at = NULL, updated_at = ? WHERE id = ?").run(nowIso(), req.params.id);
      audit(db, { userId: req.user.id, eventType: 'library.terminology.reactivate', entityType: 'terminology_entry', entityId: req.params.id });
      res.json({ ok: true });
    })
  );

  /* --------------------------------- Assets --------------------------------- */

  router.get(
    '/assets',
    asyncHandler(async (_req, res) => {
      const assets = db.prepare('SELECT * FROM brand_assets ORDER BY type, name').all();
      res.json({ assets });
    })
  );

  router.get(
    '/assets/:id/file',
    asyncHandler(async (req, res) => {
      const asset = db.prepare('SELECT * FROM brand_assets WHERE id = ?').get(req.params.id);
      if (!asset?.file_path || !fs.existsSync(asset.file_path)) throw httpError(404, 'Asset file not found');
      res.sendFile(asset.file_path);
    })
  );

  router.post(
    '/assets',
    adminOnly,
    upload.single('file'),
    asyncHandler(async (req, res) => {
      const name = asString(req.body?.name, 'Asset name', { required: true, max: 160 });
      const type = asEnum(req.body?.type, 'Asset type', ['logo', 'colour', 'image'], { required: true });
      let value = asString(req.body?.value, 'Asset value', { max: 500 }) || '';
      const description = asString(req.body?.description, 'Description', { max: 800 }) || null;
      if (req.file) value = `/api/library/assets/${'pending'}/file`;
      if (type === 'colour' && !value) throw httpError(400, 'Add one or more hex colours for a colour asset');
      if (!req.file && !value) throw httpError(400, 'Add a value or upload a file');
      const id = randomId();
      if (req.file) value = `/api/library/assets/${id}/file`;
      const now = nowIso();
      db.prepare(
        `INSERT INTO brand_assets (id, name, type, value, file_path, description, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      ).run(id, name, type, value, req.file?.path || null, description, now, now);
      audit(db, { userId: req.user.id, eventType: 'library.asset.create', entityType: 'brand_asset', entityId: id, metadata: { type } });
      res.status(201).json({ id });
    })
  );

  router.patch(
    '/assets/:id',
    adminOnly,
    asyncHandler(async (req, res) => {
      const asset = db.prepare('SELECT * FROM brand_assets WHERE id = ?').get(req.params.id);
      if (!asset) throw httpError(404, 'Asset not found');
      const name = asString(req.body?.name, 'Asset name', { max: 160 });
      const value = asString(req.body?.value, 'Asset value', { max: 500 });
      const description = req.body?.description !== undefined ? asString(req.body.description, 'Description', { max: 800 }) || null : asset.description;
      db.prepare('UPDATE brand_assets SET name = ?, value = ?, description = ?, updated_at = ? WHERE id = ?').run(
        name || asset.name,
        value !== undefined ? value : asset.value,
        description,
        nowIso(),
        asset.id
      );
      audit(db, { userId: req.user.id, eventType: 'library.asset.update', entityType: 'brand_asset', entityId: asset.id });
      res.json({ ok: true });
    })
  );

  router.post(
    '/assets/:id/deactivate',
    adminOnly,
    asyncHandler(async (req, res) => {
      const now = nowIso();
      db.prepare("UPDATE brand_assets SET status = 'inactive', deactivated_at = ?, updated_at = ? WHERE id = ?").run(now, now, req.params.id);
      audit(db, { userId: req.user.id, eventType: 'library.asset.deactivate', entityType: 'brand_asset', entityId: req.params.id });
      res.json({ ok: true });
    })
  );

  router.post(
    '/assets/:id/reactivate',
    adminOnly,
    asyncHandler(async (req, res) => {
      db.prepare("UPDATE brand_assets SET status = 'active', deactivated_at = NULL, updated_at = ? WHERE id = ?").run(nowIso(), req.params.id);
      audit(db, { userId: req.user.id, eventType: 'library.asset.reactivate', entityType: 'brand_asset', entityId: req.params.id });
      res.json({ ok: true });
    })
  );

  return router;
}

module.exports = { libraryRouter };
