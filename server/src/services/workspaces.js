const { randomId } = require('../auth/crypto');
const { nowIso } = require('../utils/time');
const { addWorkspaceMember } = require('./invitations');

const DEFAULT_WORKSPACE_ID = 'ws-default';

function listWorkspaces(db, userId = null) {
  const rows = db
    .prepare(
      `SELECT w.*,
              (SELECT COUNT(*) FROM brand_workspace_members m WHERE m.brand_workspace_id = w.id) AS member_count,
              (SELECT COUNT(*) FROM submissions s WHERE s.brand_workspace_id = w.id) AS submission_count
       FROM brand_workspaces w
       ORDER BY w.created_at`
    )
    .all();
  if (!userId) return rows;
  const memberships = new Set(
    db.prepare('SELECT brand_workspace_id FROM brand_workspace_members WHERE user_id = ?').all(userId).map((row) => row.brand_workspace_id)
  );
  return rows.map((row) => ({ ...row, member: memberships.has(row.id) }));
}

function getWorkspace(db, id) {
  return db.prepare('SELECT * FROM brand_workspaces WHERE id = ?').get(id);
}

function createWorkspace(db, { name }) {
  const id = randomId();
  db.prepare('INSERT INTO brand_workspaces (id, name, created_at) VALUES (?, ?, ?)').run(id, name, nowIso());
  return getWorkspace(db, id);
}

function defaultWorkspaceId(db) {
  const existing = db.prepare('SELECT id FROM brand_workspaces ORDER BY created_at LIMIT 1').get();
  if (existing) return existing.id;
  db.prepare('INSERT INTO brand_workspaces (id, name, created_at) VALUES (?, ?, ?)').run(
    DEFAULT_WORKSPACE_ID,
    'Default workspace',
    nowIso()
  );
  return DEFAULT_WORKSPACE_ID;
}

function workspaceIdsForUser(db, userId) {
  return db
    .prepare('SELECT brand_workspace_id FROM brand_workspace_members WHERE user_id = ?')
    .all(userId)
    .map((row) => row.brand_workspace_id);
}

function assignUserToWorkspace(db, { userId, brandWorkspaceId }) {
  addWorkspaceMember(db, { userId, brandWorkspaceId });
}

module.exports = {
  DEFAULT_WORKSPACE_ID,
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  defaultWorkspaceId,
  workspaceIdsForUser,
  assignUserToWorkspace,
};
