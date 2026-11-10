const request = require('supertest');
const { createTestDb } = require('./helpers');
const { createApp } = require('../src/app');
const { resetRateLimits } = require('../src/routes/auth');
const { createInvitation } = require('../src/services/invitations');

const STRONG_PASSWORD = 'Sup3rSecret!';
const WORKSPACE_ID = 'ws-northwind';

let db;
let app;

function signupBody(email, overrides = {}) {
  return {
    type: 'creator',
    name: 'New Person',
    email,
    password: STRONG_PASSWORD,
    confirmPassword: STRONG_PASSWORD,
    termsAccepted: true,
    ...overrides,
  };
}

function latestEmail(db, email, kind = 'verification') {
  return db
    .prepare('SELECT * FROM email_outbox WHERE to_email = ? AND kind = ? ORDER BY rowid DESC LIMIT 1')
    .get(email, kind);
}

function tokenFromEmail(body) {
  const match = String(body).match(/[?&]token=([^\s&]+)/);
  if (!match) throw new Error('No action token found in the mock email');
  return decodeURIComponent(match[1]);
}

beforeEach(async () => {
  resetRateLimits();
  db = await createTestDb();
  app = createApp(db);
});

afterEach(() => {
  db.close();
});

describe('sign-up validation', () => {
  it('rejects an invalid work email with a field-level error', async () => {
    const response = await request(app).post('/api/auth/signup').send(signupBody('not-an-email'));
    expect(response.status).toBe(400);
    const emailDetail = response.body.details.find((detail) => detail.field === 'email');
    expect(emailDetail).toBeTruthy();
  });

  it('rejects a weak password with the failing rules', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send(signupBody('weak@example.com', { password: 'short', confirmPassword: 'short' }));
    expect(response.status).toBe(400);
    const rules = response.body.details.filter((detail) => detail.field === 'password').map((detail) => detail.rule);
    expect(rules).toContain('length');
    expect(rules).toContain('upper');
  });

  it('rejects mismatched passwords and missing terms acceptance', async () => {
    const mismatch = await request(app)
      .post('/api/auth/signup')
      .send(signupBody('mismatch@example.com', { confirmPassword: 'Different!23' }));
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.details.some((detail) => detail.field === 'confirmPassword')).toBe(true);

    const noTerms = await request(app)
      .post('/api/auth/signup')
      .send(signupBody('noterms@example.com', { termsAccepted: false }));
    expect(noTerms.status).toBe(400);
    expect(noTerms.body.details.some((detail) => detail.field === 'termsAccepted')).toBe(true);
  });

  it('rejects duplicate emails and points the person to sign in', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send(signupBody('creator@northwindlabs.example'));
    expect(response.status).toBe(409);
    const detail = response.body.details.find((item) => item.field === 'email');
    expect(detail.message.toLowerCase()).toContain('sign in');
  });

  it('rejects an admin account type injected into the sign-up request', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send(signupBody('sneaky-admin@example.com', { type: 'admin' }));
    expect(response.status).toBe(400);
    expect(response.body.details.some((detail) => detail.field === 'type')).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS count FROM users WHERE email = ?').get('sneaky-admin@example.com').count).toBe(0);
  });
});

describe('sign-up account types and states', () => {
  it('creates an active, unverified creator account immediately', async () => {
    const response = await request(app).post('/api/auth/signup').send(signupBody('creator.new@example.com'));
    expect(response.status).toBe(201);
    expect(response.body.accountState).toBe('active');
    expect(response.body.user.role).toBe('creator');
    expect(response.body.user.accountType).toBe('creator');
    expect(response.body.user.emailVerified).toBe(false);

    const row = db.prepare('SELECT * FROM users WHERE email = ?').get('creator.new@example.com');
    expect(row.account_state).toBe('active');
    expect(row.role_key).toBe('creator');
    expect(row.email_verified_at).toBeNull();
    expect(latestEmail(db, 'creator.new@example.com')).toBeTruthy();
  });

  it('assigns the matching role to reviewer and leadership sign-ups', async () => {
    const reviewer = await request(app)
      .post('/api/auth/signup')
      .send(signupBody('reviewer.new@example.com', { type: 'reviewer', team: 'Brand' }));
    expect(reviewer.status).toBe(201);
    expect(reviewer.body.user.role).toBe('reviewer');
    expect(reviewer.body.accountState).toBe('active');

    const leadership = await request(app)
      .post('/api/auth/signup')
      .send(signupBody('leadership.new@example.com', { type: 'leadership' }));
    expect(leadership.status).toBe(201);
    expect(leadership.body.user.role).toBe('leadership');
    expect(leadership.body.user.emailVerified).toBe(false);
  });

  it('leaves an agency account pending when no invitation code is supplied', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send(signupBody('agency.pending@example.com', { type: 'agency', agencyName: 'Harbor & Finch' }));
    expect(response.status).toBe(201);
    expect(response.body.accountState).toBe('pending');
    expect(response.body.user.accountState).toBe('pending');
    expect(response.body.user.workspaceIds).toEqual([]);

    const row = db.prepare('SELECT * FROM users WHERE email = ?').get('agency.pending@example.com');
    expect(row.account_state).toBe('pending');
    expect(row.agency_name).toBe('Harbor & Finch');

    // Pending accounts can still sign in; the client shows the waiting screen.
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'agency.pending@example.com', password: STRONG_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user.accountState).toBe('pending');

    // Pending accounts cannot reach workspace data until approved.
    const blocked = await agent.get('/api/submissions');
    expect(blocked.status).toBe(403);
    expect(blocked.body.details?.code).toBe('ACCOUNT_PENDING');
  });

  it('rejects an agency sign-up without an agency name', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send(signupBody('agency.noname@example.com', { type: 'agency' }));
    expect(response.status).toBe(400);
    expect(response.body.details.some((detail) => detail.field === 'agencyName')).toBe(true);
  });

  it('activates an agency account with a valid code and links it to the workspace', async () => {
    const invitation = createInvitation(db, { brandWorkspaceId: WORKSPACE_ID });
    const response = await request(app)
      .post('/api/auth/signup')
      .send(
        signupBody('agency.invited@example.com', {
          type: 'agency',
          agencyName: 'Harbor & Finch',
          invitationCode: invitation.code,
        })
      );
    expect(response.status).toBe(201);
    expect(response.body.accountState).toBe('active');
    expect(response.body.invitation.valid).toBe(true);
    expect(response.body.user.workspaceIds).toContain(WORKSPACE_ID);
    expect(response.body.user.accountState).toBe('active');

    const row = db.prepare('SELECT * FROM users WHERE email = ?').get('agency.invited@example.com');
    const redeemed = db.prepare('SELECT * FROM invitations WHERE id = ?').get(invitation.id);
    expect(redeemed.used_by_user_id).toBe(row.id);
    const membership = db
      .prepare('SELECT * FROM brand_workspace_members WHERE user_id = ? AND brand_workspace_id = ?')
      .get(row.id, WORKSPACE_ID);
    expect(membership).toBeTruthy();
  });
});

describe('email verification', () => {
  it('takes a creator from sign-up through verification to the dashboard', async () => {
    const agent = request.agent(app);
    const signup = await agent
      .post('/api/auth/signup')
      .send(signupBody('verify.flow@example.com'));
    expect(signup.status).toBe(201);

    const email = latestEmail(db, 'verify.flow@example.com');
    expect(email.subject.toLowerCase()).toContain('verify');
    const token = tokenFromEmail(email.body);

    const verify = await agent.post('/api/auth/verify-email').send({ token });
    expect(verify.status).toBe(200);
    expect(verify.body.user.emailVerified).toBe(true);

    const dashboard = await agent.get('/api/dashboard');
    expect(dashboard.status).toBe(200);
  });

  it('rejects an invalid verification token', async () => {
    const response = await request(app).post('/api/auth/verify-email').send({ token: 'not-a-real-token' });
    expect(response.status).toBe(400);
  });

  it('blocks unverified accounts from creating submissions', async () => {
    const agent = request.agent(app);
    const signup = await agent.post('/api/auth/signup').send(signupBody('unverified@example.com'));
    expect(signup.status).toBe(201);

    const login = await agent.post('/api/auth/login').send({ email: 'unverified@example.com', password: STRONG_PASSWORD });
    expect(login.status).toBe(200);

    const response = await agent
      .post('/api/submissions')
      .set('x-csrf-token', login.body.csrfToken)
      .send({ title: 'Should not be created', channel: 'LinkedIn', aiDisclosure: 'none', content: 'A draft.' });
    expect(response.status).toBe(403);
    expect(response.body.details?.code).toBe('EMAIL_UNVERIFIED');
    expect(db.prepare('SELECT COUNT(*) AS count FROM submissions WHERE title = ?').get('Should not be created').count).toBe(0);
  });
});
