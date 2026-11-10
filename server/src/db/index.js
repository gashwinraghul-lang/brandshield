const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Opens a SQLite database. The app is demoed on SQLite; the schema avoids
 * SQLite-only features so it can be ported to PostgreSQL.
 */
function openDatabase(location) {
  if (location !== ':memory:') fs.mkdirSync(path.dirname(location), { recursive: true });
  const db = new Database(location);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((row) => row.name));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
    });
    apply();
  }
  return db;
}

let singleton = null;

function initDatabase(location) {
  if (singleton) return singleton;
  singleton = runMigrations(openDatabase(location));
  return singleton;
}

function getDatabase() {
  if (!singleton) throw new Error('Database has not been initialised');
  return singleton;
}

function closeDatabase() {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}

module.exports = { openDatabase, runMigrations, initDatabase, getDatabase, closeDatabase };
