const { findSession, SESSION_COOKIE, CSRF_COOKIE, cookieOptions } = require('./sessions');
const { safeEqual } = require('./crypto');

function attachUser(db) {
  return (req, res, next) => {
    const session = findSession(db, req.cookies?.[SESSION_COOKIE]);
    req.session = session;
    req.user = session ? session.user : null;
    if (session) {
      // Keep the readable CSRF cookie aligned with the server-side session.
      res.cookie(CSRF_COOKIE, session.csrfToken, cookieOptions({ httpOnly: false }));
    }
    next();
  };
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

/**
 * Pending accounts can sign in (so they can verify their email and see the
 * waiting screen) but must not reach workspace data until an admin approves them.
 */
function requireActiveAccount(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.accountState === 'pending') {
    return res.status(403).json({
      error: 'Your account is waiting for administrator approval.',
      details: { code: 'ACCOUNT_PENDING' },
    });
  }
  next();
}


function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to do that' });
    next();
  };
}

function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const header = req.get('x-csrf-token');
  const expected = req.session?.csrfToken || req.cookies?.[CSRF_COOKIE];
  if (!header || !expected || !safeEqual(header, expected)) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token. Refresh and try again.' });
  }
  next();
}

const canReview = requireRole('admin', 'reviewer');
const isAdmin = requireRole('admin');

module.exports = { attachUser, requireAuth, requireActiveAccount, requireRole, requireCsrf, canReview, isAdmin };
