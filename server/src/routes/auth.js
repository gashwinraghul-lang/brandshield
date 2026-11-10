const express = require('express');
const { asString, asEmail } = require('../utils/validate');
const { verifyPassword, hashPassword } = require('../auth/crypto');
const { createSession, deleteSession, setSessionCookies, clearSessionCookies, SESSION_COOKIE } = require('../auth/sessions');
const { requireAuth, requireCsrf } = require('../auth/middleware');
const { asyncHandler, httpError } = require('../utils/http');
const { audit } = require('../utils/audit');
const { getSettings } = require('../services/reviewService');
const {
  createSignupAccount,
  issueVerificationToken,
  createPasswordResetToken,
  findUserByVerificationToken,
  findUserByResetToken,
  serializeUser,
} = require('../auth/accounts');
const { passwordProblems } = require('../auth/passwordRules');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/email');
const { listWorkspaces } = require('../services/workspaces');

const attempts = new Map();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

function rateLimited(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { first: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

/** Clears in-memory rate-limit counters. Used to isolate tests. */
function resetRateLimits() {
  attempts.clear();
}

function sessionPayload(db, user) {
  return serializeUser(db, user);
}

function authRouter(db) {
  const router = express.Router();

  // ---------------------------------------------------------------- Sign up
  router.post(
    '/signup',
    asyncHandler(async (req, res) => {
      if (rateLimited(`signup:${req.ip}`)) {
        return res.status(429).json({ error: 'Too many sign-up attempts. Wait 15 minutes and try again.' });
      }
      const result = await createSignupAccount(db, req.body);
      const email = sendVerificationEmail(db, { user: result.user, token: result.verification.token });
      audit(db, {
        userId: result.user.id,
        eventType: 'auth.signup',
        entityType: 'user',
        entityId: result.user.id,
        metadata: {
          accountType: result.user.account_type,
          accountState: result.accountState,
          invitationUsed: result.invitation.valid,
        },
      });
      return res.status(201).json({
        user: sessionPayload(db, result.user),
        accountState: result.accountState,
        invitation: result.invitation,
        verification: { sent: true, email: result.user.email, expiresAt: email.created_at },
      });
    })
  );

  // -------------------------------------------------------- Email verification
  router.post(
    '/verify-email',
    asyncHandler(async (req, res) => {
      const token = asString(req.body?.token, 'Verification token', { required: true, max: 500 });
      const user = findUserByVerificationToken(db, token);
      if (!user) {
        return res.status(400).json({ error: 'This verification link is invalid or has expired. Request a new one.' });
      }
      db.prepare(
        'UPDATE users SET email_verified_at = ?, email_verification_token_hash = NULL, email_verification_expires_at = NULL, updated_at = ? WHERE id = ?'
      ).run(new Date().toISOString(), new Date().toISOString(), user.id);
      const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      const session = createSession(db, user.id);
      setSessionCookies(res, session);
      audit(db, { userId: user.id, eventType: 'auth.email.verified', entityType: 'user', entityId: user.id });
      return res.json({ user: sessionPayload(db, fresh), csrfToken: session.csrfToken });
    })
  );

  router.post(
    '/resend-verification',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      if (!user) return res.status(401).json({ error: 'Authentication required' });
      if (user.email_verified_at) return res.json({ ok: true, alreadyVerified: true });
      const verification = issueVerificationToken(db, user.id);
      sendVerificationEmail(db, { user, token: verification.token });
      audit(db, { userId: user.id, eventType: 'auth.email.resend', entityType: 'user', entityId: user.id });
      return res.json({ ok: true, alreadyVerified: false, email: user.email });
    })
  );

  // ------------------------------------------------------------ Password reset
  router.post(
    '/forgot-password',
    asyncHandler(async (req, res) => {
      if (rateLimited(`reset:${req.ip}`)) {
        return res.status(429).json({ error: 'Too many reset requests. Wait 15 minutes and try again.' });
      }
      const email = asEmail(req.body?.email);
      const user = db.prepare('SELECT * FROM users WHERE email = ? AND deactivated_at IS NULL').get(email);
      if (user) {
        const reset = createPasswordResetToken(db, user);
        sendPasswordResetEmail(db, { user, token: reset.token });
        audit(db, { userId: user.id, eventType: 'auth.password.reset.request', entityType: 'user', entityId: user.id });
      }
      // The response is identical whether or not the account exists.
      return res.json({
        ok: true,
        message: 'If an account exists for that email, a password reset link has been sent.',
      });
    })
  );

  router.post(
    '/reset-password',
    asyncHandler(async (req, res) => {
      const token = asString(req.body?.token, 'Reset token', { required: true, max: 500 });
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const problems = passwordProblems(password);
      if (problems.length) {
        return res.status(400).json({
          error: 'Choose a stronger password.',
          details: problems.map((problem) => ({ field: 'password', message: problem.message, rule: problem.rule })),
        });
      }
      if (req.body?.confirmPassword !== undefined && req.body.confirmPassword !== password) {
        return res.status(400).json({
          error: 'Passwords do not match.',
          details: [{ field: 'confirmPassword', message: 'Passwords do not match' }],
        });
      }
      const user = findUserByResetToken(db, token);
      if (!user) {
        return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
      }
      const passwordHash = await hashPassword(password);
      const now = new Date().toISOString();
      db.transaction(() => {
        db.prepare(
          'UPDATE users SET password_hash = ?, password_reset_token_hash = NULL, password_reset_expires_at = NULL, updated_at = ? WHERE id = ?'
        ).run(passwordHash, now, user.id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
      })();
      audit(db, { userId: user.id, eventType: 'auth.password.reset', entityType: 'user', entityId: user.id });
      return res.json({ ok: true });
    })
  );

  // ------------------------------------------------------------------- Login
  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const email = asEmail(req.body?.email);
      const password = asString(req.body?.password, 'password', { required: true, max: 200 });
      const key = `${req.ip}:${email}`;
      if (rateLimited(key)) return res.status(429).json({ error: 'Too many sign-in attempts. Wait 15 minutes and try again.' });

      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      const valid = user && !user.deactivated_at ? await verifyPassword(password, user.password_hash) : false;
      if (!valid) return res.status(401).json({ error: 'Email or password is incorrect' });
      if (user.account_state === 'suspended') {
        return res.status(403).json({ error: 'This account is suspended. Contact your administrator.' });
      }

      const session = createSession(db, user.id);
      setSessionCookies(res, session);
      audit(db, { userId: user.id, eventType: 'auth.login', entityType: 'user', entityId: user.id });
      attempts.delete(key);
      return res.json({ user: sessionPayload(db, user), csrfToken: session.csrfToken });
    })
  );

  router.post(
    '/logout',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      deleteSession(db, req.cookies?.[SESSION_COOKIE]);
      clearSessionCookies(res);
      audit(db, { userId: req.user.id, eventType: 'auth.logout', entityType: 'user', entityId: req.user.id });
      res.json({ ok: true });
    })
  );

  router.get(
    '/me',
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });
      const settings = getSettings(db);
      const paletteRow = db
        .prepare("SELECT value FROM brand_assets WHERE type = 'colour' AND status = 'active' ORDER BY created_at LIMIT 1")
        .get();
      const palette = paletteRow?.value
        ? paletteRow.value.split(',').map((item) => item.trim()).filter(Boolean)
        : ['#1F6F6B', '#E8845B', '#F2E8DC', '#12232E'];
      res.json({
        user: { ...req.user, email: req.user.email },
        csrfToken: req.session?.csrfToken,
        org: { name: settings.org_name || 'BrandShield.ai', palette },
        privacy: {
          externalAI: settings.external_llm_enabled === 'true',
          defaultDisclosure: settings.default_ai_disclosure || 'AI-assisted',
          retentionDays: Number(settings.retention_days || 365),
        },
        workspaces: listWorkspaces(db, req.user.id),
      });
    })
  );

  return router;
}

module.exports = { authRouter, resetRateLimits };
