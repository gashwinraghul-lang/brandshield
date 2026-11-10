const config = require('./config');
const { initDatabase } = require('./db');
const { createApp } = require('./app');

const db = initDatabase(config.database.location);
const app = createApp(db);

const server = app.listen(config.port, () => {
  // Log identifiers only - never keys or content.
  console.log(`[brandshield] BrandShield.ai API listening on http://localhost:${config.port}`);
  if (config.database.dialect !== 'sqlite') {
    console.warn('[brandshield] Non-SQLite database URL detected. Install a compatible driver to use it; the demo runs on SQLite.');
  }
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
