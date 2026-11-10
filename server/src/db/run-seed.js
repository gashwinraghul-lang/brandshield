const config = require('../config');
const { initDatabase } = require('./index');
const { seedDatabase } = require('./seed');

async function main() {
  const db = initDatabase(config.database.location);
  const result = await seedDatabase(db, { demoPassword: config.demoPassword });
  console.log('[brandshield] Seed complete for Northwind Labs.');
  console.log(`[brandshield] Users: ${result.users.map((user) => `${user.email} (${user.role})`).join(', ')}`);
  console.log(`[brandshield] Demo password: ${config.demoPassword}`);
  console.log(`[brandshield] Demo agency invitation code (single use, 30 days): ${result.invitationCode}`);
  console.log(`[brandshield] Workspace: ${result.workspaceId}`);
  console.log(`[brandshield] Library: ${result.counts.guidelines} guidelines, ${result.counts.facts} facts, ${result.counts.terminology} terminology entries, ${result.counts.rules} rules.`);
  if (result.counts.assumptions > 0) {
    console.warn(`[brandshield] Note: the "clean" demo submission produced ${result.counts.assumptions} issue(s). It is left for the creator to resolve.`);
  }
  console.log(`[brandshield] Seed data written to ${config.database.dialect} database.`);
  db.close();
}

main().catch((error) => {
  console.error('[brandshield] Seed failed:', error.message);
  process.exit(1);
});
