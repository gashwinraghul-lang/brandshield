const crypto = require('node:crypto');
const { randomId, sha256 } = require('../auth/crypto');
const { nowIso } = require('../utils/time');

const INVITATION_DAYS = 14;

function normaliseInvitationCode(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

function hashInvitationCode(code) {
  return sha256(normaliseInvitationCode(code));
}

function generateInvitationCode() {
  const left = crypto.randomBytes(4).toString('hex').toUpperCase();
  const right = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `BS-${left}-${right}`;
}

function createInvitation(db, { brandWorkspaceId, createdBy = null, expiresInDays = INVITATION_DAYS }) {
  const code = generateInvitationCode();
  const id = randomId();
  const now = new Date();
  const expires = new Date(now.getTime() + Math.max(1, Number(expiresInDays) || INVITATION_DAYS) * 24 * 60 * 60 * 1000);
  db.prepare(
    `INSERT INTO invitations (id, brand_workspace_id, code_hash, expires_at, used_by_user_id, created_by, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`
  ).run(id, brandWorkspaceId, hashInvitationCode(code), expires.toISOString(), createdBy, now.toISOString());
  return { id, code, expiresAt: expires.toISOString(), brandWorkspaceId };
}

function validateInvitation(db, code) {
  const normalised = normaliseInvitationCode(code);
  if (!normalised) return { valid: false, reason: 'missing' };
  const row = db
    .prepare(
      `SELECT i.*, w.name AS workspace_name
       FROM invitations i JOIN brand_workspaces w ON w.id = i.brand_workspace_id
       WHERE i.code_hash = ?`
    )
    .get(hashInvitationCode(normalised));
  if (!row) return { valid: false, reason: 'unknown' };
  if (row.used_by_user_id) return { valid: false, reason: 'used' };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { valid: false, reason: 'expired' };
  return { valid: true, invitation: row, workspaceId: row.brand_workspace_id, workspaceName: row.workspace_name };
}

function addWorkspaceMember(db, { userId, brandWorkspaceId }) {
  db.prepare(
    `INSERT OR IGNORE INTO brand_workspace_members (user_id, brand_workspace_id, created_at)
     VALUES (?, ?, ?)`
  ).run(userId, brandWorkspaceId, nowIso());
}

function redeemInvitation(db, { code, userId }) {
  return db.transaction(() => {
    const validation = validateInvitation(db, code);
    if (!validation.valid) return validation;
    db.prepare('UPDATE invitations SET used_by_user_id = ? WHERE id = ?').run(userId, validation.invitation.id);
    addWorkspaceMember(db, { userId, brandWorkspaceId: validation.workspaceId });
    return validation;
  })();
}

function listInvitations(db, brandWorkspaceId = null) {
  const sql = `SELECT i.id, i.brand_workspace_id, i.expires_at, i.used_by_user_id, i.created_by, i.created_at,
                      w.name AS workspace_name, u.name AS used_by_name, u.email AS used_by_email
               FROM invitations i
               JOIN brand_workspaces w ON w.id = i.brand_workspace_id
               LEFT JOIN users u ON u.id = i.used_by_user_id
               ${brandWorkspaceId ? 'WHERE i.brand_workspace_id = ?' : ''}
               ORDER BY i.created_at DESC LIMIT 100`;
  return brandWorkspaceId ? db.prepare(sql).all(brandWorkspaceId) : db.prepare(sql).all();
}

module.exports = {
  INVITATION_DAYS,
  normaliseInvitationCode,
  hashInvitationCode,
  generateInvitationCode,
  createInvitation,
  validateInvitation,
  redeemInvitation,
  addWorkspaceMember,
  listInvitations,
};
