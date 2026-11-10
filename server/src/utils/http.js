class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function httpError(status, message, details) {
  return new HttpError(status, message, details);
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err?.status && Number.isInteger(err.status)) {
    return res.status(err.status).json({ error: err.message || 'Request failed', details: err.details });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File is larger than the allowed upload size' });
  }
  if (err?.code === 'SQLITE_CONSTRAINT_CHECK' || err?.code === 'SQLITE_CONSTRAINT_TRIGGER') {
    return res.status(400).json({ error: 'The record did not pass a safety check' });
  }
  if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'A record with that identifier already exists' });
  }
  // Never log full submission content or API keys.
  console.error('[brandshield] request failed', {
    type: err?.name,
    message: err?.message,
    path: req.path,
    method: req.method,
  });
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

module.exports = { HttpError, httpError, asyncHandler, errorHandler };
