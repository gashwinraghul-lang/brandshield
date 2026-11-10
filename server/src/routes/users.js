const express = require('express');
const crypto = require('node:crypto');
const { requireRole } = require('../auth/middleware');
const { asyncHandler, httpError } = require('../utils/http');
const { asString, asEmail, asEnum } = require('../utils/validate');
const { hashPassword } = require('../auth/crypto');
const { passwordProblems } = require('../auth/passwordRules');
const { audit } = require('../utils/audit');
const { nowIso } = require('../utils/time');
const { getWorkspace, assignUserToWorkspace, workspaceIdsForUser } = require('../services/workspaces');

const ROLES = ['admin', 'creator', 'reviewer', 'agency', 'leadership'];
const ACCOUNT_STATES = ['active', 'pending', 'suspended'];
const adminOnly = requireRole('admin');

function assertStrongPassword(password) {
  const problems = passwordProblems(password);
  if (problems.length) {
    throw httpError(
      400,
      'Choose a stronger password.',
      problems.map((problem) => ({ field: 'password', message: problem.message, rule: problem.rule }))
    );
  }
}

function userRouter(db) {
  const router = express.Router();

  router.get(
    '/users',
    adminOnly,
    asyncHandler(async (_req, res) => {
      const users = db
        .prepare(
          `SELECT u.id, u.email, u.name, u.role_key, u.team, u.team_name, u.agency_name,
                  u.account_type, u.account_state, u.email_verified_at, u.created_at, u.deactivated_at,
                  (SELECT COUNT(*) FROM submissions s WHERE s.owner_id = u.id) AS submission_count,
                  (SELECT GROUP_CONCAT(w.name, ', ')
                     FROM brand_workspace_members m
                     JOIN brand_workspaces w ON w.id = m.brand_workspace_id
                    WHERE m.user_id = u.id) AS workspace_names
           FROM users u ORDER BY u.name`
        )
        .all();
      res.json({ users, roles: ROLES });
    })
  );

  router.post(
    '/users',
    adminOnly,
    asyncHandler(async (req, res) => {
      const email = asEmail(req.body?.email);
      const name = asString(req.body?.name, 'Name', { required: true, max: 120 });
      const role = asEnum(req.body?.role, 'Role', ROLES, { required: true });
      const team = asString(req.body?.team, 'Team', { required: true, max: 80 });
      const agencyName = asString(req.body?.agencyName, 'Agency name', { max: 120 }) || null;
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      assertStrongPassword(password);
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existing) throw httpError(409, 'A user with that email already exists');
      const passwordHash = await hashPassword(password);
      const id = crypto.randomUUID();
      const now = nowIso();
      db.prepare(
        `INSERT INTO users
          (id, email, password_hash, name, role_key, team, team_name, agency_name, account_type,
           account_state, email_verified_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
      ).run(id, email, passwordHash, name, role, team, team, agencyName, role, now, now, now);
      audit(db, { userId: req.user.id, eventType: 'user.create', entityType: 'user', entityId: id, metadata: { role, team } });
      res.status(201).json({ id });
    })
  );

  router.patch(
    '/users/:id',
    adminOnly,
    asyncHandler(async (req, res) => {
      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
      if (!target) throw httpError(404, 'User not found');
      const name = asString(req.body?.name, 'Name', { max: 120 });
      const team = asString(req.body?.team, 'Team', { max: 80 });
      const agencyName = asString(req.body?.agencyName, 'Agency name', { max: 120 });
      const role = asEnum(req.body?.role, 'Role', ROLES);
      const accountState = asEnum(req.body?.accountState, 'Account state', ACCOUNT_STATES);
      const password = req.body?.password ? String(req.body.password) : undefined;
      if (password) assertStrongPassword(password);
      const deactivate = req.body?.deactivate !== undefined ? Boolean(req.body.deactivate) : false;
      const reactivate = req.body?.reactivate !== undefined ? Boolean(req.body.reactivate) : false;

      if (role && target.id === req.user.id && role !== target.role_key) {
        throw httpError(409, 'You cannot change your own role. Ask another administrator.');
      }
      if (deactivate && target.id === req.user.id) throw httpError(409, 'You cannot deactivate your own account');
      if ((deactivate || (role && role !== 'admin')) && target.role_key === 'admin') {
        const admins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role_key = 'admin' AND deactivated_at IS NULL").get().count;
        if (admins <= 1) throw httpError(409, 'At least one active admin must remain');
      }
      const now = nowIso();
      const passwordHash = password ? await hashPassword(password) : target.password_hash;
      const nextDeactivated = reactivate ? null : deactivate ? now : target.deactivated_at;
      db.prepare(
        `UPDATE users SET name = ?, team = ?, team_name = ?, agency_name = ?, role_key = ?,
                account_type = ?, account_state = ?, password_hash = ?, deactivated_at = ?, updated_at = ?
          WHERE id = ?`
      ).run(
        name || target.name,
        team || target.team,
        team || target.team_name || target.team,
        agencyName !== undefined ? agencyName : target.agency_name,
        role || target.role_key,
        role || target.account_type || target.role_key,
        accountState || target.account_state || 'active',
        passwordHash,
        nextDeactivated,
        now,
        target.id
      );
      audit(db, {
        userId: req.user.id,
        eventType: reactivate ? 'user.reactivate' : deactivate ? 'user.deactivate' : 'user.update',
        entityType: 'user',
        entityId: target.id,
        metadata: {
          roleChanged: Boolean(role && role !== target.role_key),
          passwordChanged: Boolean(password),
          accountState: accountState || target.account_state,
        },
      });
      res.json({ ok: true });
    })
  );

  router.post(
    '/users/:id/approve',
    adminOnly,
    asyncHandler(async (req, res) => {
      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
      if (!target) throw httpError(404, 'User not found');
      const role = asEnum(req.body?.role, 'Role', ROLES) || target.role_key;
      const workspaceId = asString(req.body?.brandWorkspaceId, 'Workspace', { max: 120 });
      if (workspaceId && !getWorkspace(db, workspaceId)) throw httpError(404, 'Workspace not found');
      const now = nowIso();
      db.prepare(
        "UPDATE users SET account_state = 'active', role_key = ?, account_type = ?, updated_at = ? WHERE id = ?"
      ).run(role, role, now, target.id);
      if (workspaceId) assignUserToWorkspace(db, { userId: target.id, brandWorkspaceId: workspaceId });
      audit(db, {
        userId: req.user.id,
        eventType: 'user.approve',
        entityType: 'user',
        entityId: target.id,
        metadata: { role, workspaceId: workspaceId || null },
      });
      res.json({ ok: true, user: db.prepare('SELECT id, email, name, role_key, account_state FROM users WHERE id = ?').get(target.id) });
    })
  );

  router.get(
    '/users/:id/workspaces',
    adminOnly,
    asyncHandler(async (req, res) => {
      const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
      if (!target) throw httpError(404, 'User not found');
      res.json({ workspaceIds: workspaceIdsForUser(db, target.id) });
    })
  );

  router.post(
    '/users/:id/workspaces',
    adminOnly,
    asyncHandler(async (req, res) => {
      const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
      if (!target) throw httpError(404, 'User not found');
      const single = asString(req.body?.brandWorkspaceId, 'Workspace', { max: 120 });
      const many = Array.isArray(req.body?.brandWorkspaceIds) ? req.body.brandWorkspaceIds : null;
      const ids = many ? many.map((id) => String(id)) : single ? [single] : [];
      if (!ids.length) throw httpError(400, 'Choose at least one workspace');
      for (const id of ids) {
        if (!getWorkspace(db, id)) throw httpError(404, 'Workspace not found');
      }
      db.transaction(() => {
        for (const id of ids) assignUserToWorkspace(db, { userId: target.id, brandWorkspaceId: id });
      })();
      audit(db, {
        userId: req.user.id,
        eventType: 'user.workspace.assign',
        entityType: 'user',
        entityId: target.id,
        metadata: { workspaceIds: ids },
      });
      res.json({ ok: true, workspaceIds: workspaceIdsForUser(db, target.id) });
    })
  );

  router.delete(
    '/users/:id/workspaces/:workspaceId',
    adminOnly,
    asyncHandler(async (req, res) => {
      db.prepare('DELETE FROM brand_workspace_members WHERE user_id = ? AND brand_workspace_id = ?').run(
        req.params.id,
        req.params.workspaceId
      );
      audit(db, {
        userId: req.user.id,
        eventType: 'user.workspace.remove',
        entityType: 'user',
        entityId: req.params.id,
        metadata: { workspaceId: req.params.workspaceId },
      });
      res.json({ ok: true, workspaceIds: workspaceIdsForUser(db, req.params.id) });
    })
  );

  return router;
}

module.exports = { userRouter, ROLES };
