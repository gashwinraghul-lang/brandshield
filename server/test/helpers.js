const { openDatabase, runMigrations } = require('../src/db');
const { seedDatabase } = require('../src/db/seed');
const { createApp } = require('../src/app');
const request = require('supertest');

async function createTestDb({ seeded = true } = {}) {
  const db = runMigrations(openDatabase(':memory:'));
  if (seeded) await seedDatabase(db, { demoPassword: 'BrandShield!23' });
  return db;
}

async function login(app, email, password = 'BrandShield!23') {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password });
  if (response.status !== 200) throw new Error(`Login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`);
  return { agent, csrf: response.body.csrfToken, user: response.body.user };
}

function createTestApp(db) {
  return createApp(db);
}

module.exports = { createTestDb, createTestApp, login };
