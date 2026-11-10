const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const config = require('../config');
const { initDatabase, closeDatabase } = require('../db');
const { isEmail } = require('../utils/validate');
const { passwordProblems } = require('../auth/passwordRules');
const { hashPassword, randomId } = require('../auth/crypto');
const { nowIso } = require('../utils/time');

function argValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function prompt(rl, label, fallback) {
  const value = (await rl.question(`${label}${fallback ? ` [${fallback}]` : ''}: `)).trim();
  return value || fallback;
}

async function main() {
  let email = argValue('email') || process.env.BRANDSHIELD_ADMIN_EMAIL || '';
  let name = argValue('name') || process.env.BRANDSHIELD_ADMIN_NAME || '';
  let password = argValue('password') || process.env.BRANDSHIELD_ADMIN_PASSWORD || '';
  let team = argValue('team') || process.env.BRANDSHIELD_ADMIN_TEAM || '';

  let rl;
  if (!email || !name || !password) {
    rl = readline.createInterface({ input, output });
    if (!email) email = await prompt(rl, 'Admin email');
    if (!name) name = await prompt(rl, 'Admin name', 'Administrator');
    if (!team) team = await prompt(rl, 'Team', 'Brand');
    if (!password) password = await prompt(rl, 'Admin password');
  }
  if (!team) team = 'Brand';
  if (rl) rl.close();

  email = String(email).trim().toLowerCase();
  name = String(name).trim();
  team = String(team).trim();

  const problems = [];
  if (!isEmail(email)) problems.push('Enter a valid email address.');
  if (!name) problems.push('Name is required.');
  for (const problem of passwordProblems(String(password))) {
    problems.push(`Password: ${problem.message}.`);
  }
  if (problems.length) {
    console.error('[brandshield] Cannot create admin:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  const db = initDatabase(config.database.location);
  const existing = db.prepare('SELECT id, role_key FROM users WHERE email = ?').get(email);
  if (existing) {
    console.error(`[brandshield] A user with ${email} already exists (${existing.role_key}).`);
    closeDatabase();
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(String(password));
  const id = randomId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO users
      (id, email, password_hash, name, role_key, team, team_name, account_type, account_state,
       email_verified_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'admin', ?, ?, 'admin', 'active', ?, ?, ?)`
  ).run(id, email, passwordHash, name, team, team, now, now, now);

  console.log(`[brandshield] Administrator created: ${email}`);
  console.log('[brandshield] Sign in at /login and create the rest of the team from Settings.');
  closeDatabase();
}

main().catch((error) => {
  console.error('[brandshield] create-admin failed:', error.message);
  process.exit(1);
});
