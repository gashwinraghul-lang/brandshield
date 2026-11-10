/**
 * Vercel serverless entry point.
 * Exports the Express app instead of calling .listen().
 * Vercel's Express framework adapter picks up this default export.
 */
const config = require('../src/config');
const { initDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { seedDatabase } = require('../src/db/seed');

const db = initDatabase(config.database.location);

// Auto-seed demo data on cold starts so the demo is always functional.
// seedDatabase is async but we fire-and-forget; the app can serve requests
// while seeding completes (migrations are synchronous and already ran above).
seedDatabase(db, { demoPassword: config.demoPassword }).catch(() => {
  // Seed may fail if data already exists; that's fine.
});

const app = createApp(db);

module.exports = app;
