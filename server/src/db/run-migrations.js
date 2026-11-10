const config = require('../config');
const { initDatabase } = require('./index');

const db = initDatabase(config.database.location);
console.log(`[brandshield] Migrations applied to ${config.database.dialect} database.`);
console.log(`[brandshield] Tables: ${db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table'").get().c}`);
db.close();
