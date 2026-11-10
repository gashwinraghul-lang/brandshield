const { HttpError } = require('../utils/http');
const { isEmail } = require('../utils/validate');
const { hashPassword, randomId, randomToken, sha256 } = require('./crypto');
const { passwordProblems } = require('./passwordRules');
const { nowIso } = require('../utils/time');
const { validateInvitation, redeemInvitation } = require('../services/invitations');
const { workspaceIdsForUser } = require('../services/workspaces');

const SIGNUP_TYPES = ['creator', 'reviewer', 'agency', 'leadership'];
const ALL_ACCOUNT_TYPES = [...SIGNUP_TYPES, 'admin'];
const ACCOUNT_STATES = ['active', 'pending', 'suspended'];
const VERIFICATION_HOURS = 24;
const RESET_HOURS = 1;

function roleForAccountType(accountType) {
  if (!SIGNUP_TYPES.includes(accountType)) {
    throw new HttpError(400, 'Choose a valid account type.', [
      { field: 'type', message: 'Unknown account type' },
    ]);
  }
  return accountType;
}

function validateSignupInput(body = {}) {
  const details = [];
  const type = String(body.type || '').trim().toLowerCase();
  if (!SIGNUP_TYPES.includes(type)) details.push({ field: 'type', message: 'Choose a valid account type' });

  const name = String(body.name || '').trim();
  if (!name) details.push({ field: 'name', message: 'Full name is required' });
  else if (name.length > 120) details.push({ field: 'name', message: 'Name must be 120 characters or fewer' });

  const email = String(body.email || '').trim().toLowerCase();
  if (!isEmail(email)) details.push({ field: 'email', message: 'Enter a valid work email address' });

  const password = typeof body.password === 'string' ? body.password : '';
  for (const problem of passwordProblems(password)) {
    details.push({ field: 'password', message: problem.message, rule: problem.rule });
  }

  if (body.confirmPassword !== undefined && body.confirmPassword !== password) {
    details.push({ field: 'confirmPassword', message: 'Passwords do not match' });
  }

  if (body.termsAccepted !== true && body.termsAccepted !== 'true') {
    details.push({ field: 'termsAccepted', message: 'Accept the terms and privacy notice to continue' });
  }

  const team = String(body.team || '').trim();
  if (team.length > 80) details.push({ field: 'team', message: 'Team must be 80 characters or fewer' });

  const agencyName = String(body.agencyName || '').trim();
  if (type === 'agency' && !agencyName) details.push({ field: 'agencyName', message: 'Agency name is required' });
  if (agencyName.length > 120) details.push({ field: 'agencyName', message: 'Agency name must be 120 characters or fewer' });

  const invitationCode = String(body.invitationCode || '').trim();
  if (invitationCode.length > 120) details.push({ field: 'invitationCode', message: 'Invitation code is too long' });

  if (details.length) {
    throw new HttpError(400, 'Please correct the highlighted fields.', details);
  }
  return { type, name, email, password, team, agencyName, invitationCode };
}

function issueVerificationToken(db, userId) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + VERIFICATION_HOURS * 60 * 60 * 1000);
  db.prepare('UPDATE users SET email_verification_token_hash = ?, email_verification_expires_at = ? WHERE id = ?').run(
    sha256(token),
    expires.toISOString(),
    userId
  );
  return { token, expires };
}

function createPasswordResetToken(db, user) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + RESET_HOURS * 60 * 60 * 1000);
  db.prepare('UPDATE users SET password_reset_token_hash = ?, password_reset_expires_at = ? WHERE id = ?').run(
    sha256(token),
    expires.toISOString(),
    user.id
  );
  return { token, expires };
}

async function createSignupAccount(db, body) {
  const input = validateSignupInput(body);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(input.email);
  if (existing) {
    throw new HttpError(409, 'An account with that email already exists.', [
      { field: 'email', message: 'This email is already registered. Sign in instead.' },
    ]);
  }

  let invitation = { valid: false, reason: input.type === 'agency' ? 'missing' : null };
  if (input.type === 'agency' && input.invitationCode) {
    invitation = validateInvitation(db, input.invitationCode);
  }

  const state = input.type === 'agency' && !invitation.valid ? 'pending' : 'active';
  const passwordHash = await hashPassword(input.password);
  const id = randomId();
  const now = nowIso();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO users
        (id, email, password_hash, name, role_key, team, account_type, account_state,
         email_verified_at, team_name, agency_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`
    ).run(
      id,
      input.email,
      passwordHash,
      input.name,
      roleForAccountType(input.type),
      input.team || 'General',
      input.type,
      state,
      input.team || null,
      input.agencyName || null,
      now,
      now
    );

    if (invitation.valid) {
      const redeemed = redeemInvitation(db, { code: input.invitationCode, userId: id });
      if (!redeemed.valid) {
        throw new HttpError(400, 'The invitation code could not be used.', [
          { field: 'invitationCode', message: 'Invitation is no longer valid' },
        ]);
      }
    }
  })();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const verification = issueVerificationToken(db, id);
  return {
    user,
    accountState: state,
    invitation: invitation.valid
      ? { valid: true, workspaceId: invitation.workspaceId, workspaceName: invitation.workspaceName }
      : { valid: false, reason: invitation.reason || 'missing' },
    verification,
  };
}

function findUserByVerificationToken(db, token) {
  if (!token) return null;
  return db
    .prepare('SELECT * FROM users WHERE email_verification_token_hash = ? AND email_verification_expires_at > ?')
    .get(sha256(token), nowIso());
}

function findUserByResetToken(db, token) {
  if (!token) return null;
  return db
    .prepare('SELECT * FROM users WHERE password_reset_token_hash = ? AND password_reset_expires_at > ?')
    .get(sha256(token), nowIso());
}

function serializeUser(db, row) {
  return {
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
    workspaceIds: workspaceIdsForUser(db, row.id),
  };
}

module.exports = {
  SIGNUP_TYPES,
  ALL_ACCOUNT_TYPES,
  ACCOUNT_STATES,
  VERIFICATION_HOURS,
  RESET_HOURS,
  roleForAccountType,
  validateSignupInput,
  createSignupAccount,
  issueVerificationToken,
  createPasswordResetToken,
  findUserByVerificationToken,
  findUserByResetToken,
  serializeUser,
  publicUser: serializeUser,
};
