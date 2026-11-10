const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 11;

function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function randomId() {
  return crypto.randomUUID();
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = { hashPassword, verifyPassword, randomId, randomToken, sha256, safeEqual };
