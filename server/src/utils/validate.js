const { HttpError } = require('./http');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asString(value, field, { required = false, max = 5000, min = 0 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, `${field} is required`);
    return undefined;
  }
  const text = String(value).trim();
  if (required && text.length === 0) throw new HttpError(400, `${field} is required`);
  if (text.length < min) throw new HttpError(400, `${field} must be at least ${min} characters`);
  if (text.length > max) throw new HttpError(400, `${field} must be ${max} characters or fewer`);
  return text;
}

function isEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value.trim().toLowerCase());
}

function asEmail(value, field = 'email') {
  const email = asString(value, field, { required: true, max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address');
  return email;
}

function asEnum(value, field, allowed, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `${field} is required`);
    return undefined;
  }
  if (!allowed.includes(value)) throw new HttpError(400, `${field} must be one of: ${allowed.join(', ')}`);
  return value;
}

function asDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new HttpError(400, `${field} must be a valid date (YYYY-MM-DD)`);
  }
  return text;
}

function asStringArray(value, field) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 100);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean).slice(0, 100);
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 100);
    }
  }
  throw new HttpError(400, `${field} must be a list`);
}

function asNumber(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    return undefined;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new HttpError(400, `${field} must be a number between ${min} and ${max}`);
  }
  return number;
}

function asBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return value === 'true' || value === '1' || value === 1;
}

module.exports = { asString, asEmail, asEnum, asDate, asStringArray, asNumber, asBoolean, isEmail };
