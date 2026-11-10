const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('node:path');
const fs = require('node:fs');
const config = require('./config');
const { attachUser, requireAuth, requireActiveAccount, requireCsrf } = require('./auth/middleware');
const { authRouter } = require('./routes/auth');
const { libraryRouter } = require('./routes/library');
const { submissionRouter } = require('./routes/submissions');
const { dashboardRouter } = require('./routes/dashboard');
const { settingsRouter } = require('./routes/settings');
const { userRouter } = require('./routes/users');
const { workspaceRouter } = require('./routes/workspaces');
const { auditRouter } = require('./routes/audit');
const { errorHandler } = require('./utils/http');

function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    if (config.nodeEnv === 'production') {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
      );
    }
    next();
  });

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '2mb' }));
  app.use(cookieParser());
  app.use(attachUser(db));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, product: 'BrandShield.ai', by: 'Inkloom AI' });
  });

  app.use('/api/auth', authRouter(db));

  const api = express.Router();
  api.use(requireAuth, requireActiveAccount, requireCsrf);
  api.use('/library', libraryRouter(db));
  api.use(submissionRouter(db));
  api.use(dashboardRouter(db));
  api.use(settingsRouter(db));
  api.use(userRouter(db));
  api.use(workspaceRouter(db));
  api.use(auditRouter(db));
  app.use('/api', api);

  // Serve the built client in production or when a build is present.
  const clientDist = path.join(config.rootDir, 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      return res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
