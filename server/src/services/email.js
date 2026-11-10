const { randomId } = require('../auth/crypto');
const { nowIso } = require('../utils/time');
const config = require('../config');

function sendEmail(db, { to, subject, body, kind = 'transactional' }) {
  const id = randomId();
  const createdAt = nowIso();
  db.prepare(
    'INSERT INTO email_outbox (id, to_email, subject, body, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, to, subject, body, kind, createdAt);
  // MOCK email provider: the full message (including the action link) is
  // written to the server console so the flow works without an SMTP service.
  console.log(`[brandshield:mock-email] to=${to} subject=${subject}`);
  console.log(body);
  return { id, to, subject, body, kind, created_at: createdAt };
}

function sendVerificationEmail(db, { user, token }) {
  const link = `${config.publicUrl}/verify-email?token=${encodeURIComponent(token)}`;
  return sendEmail(db, {
    to: user.email,
    subject: 'Verify your BrandShield.ai email address',
    body: `Hello ${user.name},\n\nVerify your email address to submit content for review:\n${link}\n\nThis link expires in 24 hours. If you did not create this account, ignore this message.`,
    kind: 'verification',
  });
}

function sendPasswordResetEmail(db, { user, token }) {
  const link = `${config.publicUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return sendEmail(db, {
    to: user.email,
    subject: 'Reset your BrandShield.ai password',
    body: `Hello ${user.name},\n\nReset your password using this link:\n${link}\n\nThis link expires in one hour and can be used once. If you did not request a reset, ignore this message.`,
    kind: 'password_reset',
  });
}

function listSentEmails(db, limit = 50) {
  return db
    .prepare('SELECT * FROM email_outbox ORDER BY created_at DESC LIMIT ?')
    .all(Math.min(Math.max(Number(limit) || 50, 1), 200));
}

module.exports = { sendEmail, sendVerificationEmail, sendPasswordResetEmail, listSentEmails };
