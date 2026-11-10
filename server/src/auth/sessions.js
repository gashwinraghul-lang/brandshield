const config = require('../config');
const { randomToken, sha256 } = require('./crypto');

const SESSION_COOKIE = 'brandshield_session';
const CSRF_COOKIE = 'brandshield_csrf';

function createSession(db, userId) {
  const token = randomToken();
  const csrfToken = randomToken(24);
  const now = new Date();
  const expires = new Date(now.getTime() + config.sessionDays * 24 * 60 * 60 * 1000);
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run(sha256(token), userId, csrfToken, now.toISOString(), expires.toISOString());
  return { token, csrfToken, expires };
}

function findSession(db, token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.token_hash, s.csrf_token, s.expires_at, u.id, u.email, u.name, u.role_key, u.team,
              u.deactivated_at, u.account_type, u.account_state, u.email_verified_at, u.team_name, u.agency_name
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(sha256(token));
  if (!row) return null;
  if (
    new Date(row.expires_at).getTime() < Date.now() ||
    row.deactivated_at ||
    row.account_state === 'suspended'
  ) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(row.token_hash);
    return null;
  }
  const workspaceIds = db
    .prepare('SELECT brand_workspace_id FROM brand_workspace_members WHERE user_id = ?')
    .all(row.id)
    .map((membership) => membership.brand_workspace_id);
  return {
    csrfToken: row.csrf_token,
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role_key,
      accountType: row.account_type || row.role_key,
      accountState: row.account_state || 'active',
      emailVerified: Boolean(row.email_verified_at),
      emailVerifiedAt: row.email_verified_at || null,
      team: row.team_name || row.team,
      agencyName: row.agency_name || null,
      workspaceIds,
    },
  };
}

function deleteSession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

function cookieOptions(extra = {}) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
    ...extra,
  };
}

function setSessionCookies(res, session) {
  res.cookie(SESSION_COOKIE, session.token, cookieOptions({ expires: session.expires }));
  res.cookie(CSRF_COOKIE, session.csrfToken, cookieOptions({ httpOnly: false, expires: session.expires }));
}

function clearSessionCookies(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.clearCookie(CSRF_COOKIE, { ...cookieOptions(), httpOnly: false });
}

module.exports = {
  SESSION_COOKIE,
  CSRF_COOKIE,
  createSession,
  findSession,
  deleteSession,
  setSessionCookies,
  clearSessionCookies,
  cookieOptions,
};
