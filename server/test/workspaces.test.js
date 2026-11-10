const request = require('supertest');
const { createTestDb, login } = require('./helpers');
const { createApp } = require('../src/app');
const { resetRateLimits } = require('../src/routes/auth');
const { createInvitation, validateInvitation, redeemInvitation } = require('../src/services/invitations');
const { createWorkspace } = require('../src/services/workspaces');

const WORKSPACE_ID = 'ws-northwind';
const STRONG_PASSWORD = 'Sup3rSecret!';

let db;
let app;

function latestVerificationToken(email) {
  const row = db
    .prepare("SELECT body FROM email_outbox WHERE to_email = ? AND kind = 'verification' ORDER BY rowid DESC LIMIT 1")
    .get(email);
  const match = String(row.body).match(/[?&]token=([^\s&]+)/);
  return decodeURIComponent(match[1]);
}

async function signupAgency({ email, code }) {
  return request(app)
    .post('/api/auth/signup')
    .send({
      type: 'agency',
      name: 'Avery Stone',
      email,
      password: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD,
      termsAccepted: true,
      agencyName: 'Harbor & Finch',
      invitationCode: code,
    });
}

beforeEach(async () => {
  resetRateLimits();
  db = await createTestDb();
  app = createApp(db);
});

afterEach(() => {
  db.close();
});

describe('invitation validation', () => {
  it('reports missing, unknown, expired and used codes', () => {
    expect(validateInvitation(db, '').reason).toBe('missing');
    expect(validateInvitation(db, 'BS-DOES-NOT-EXIST').reason).toBe('unknown');

    const valid = createInvitation(db, { brandWorkspaceId: WORKSPACE_ID, expiresInDays: 5 });
    const accepted = validateInvitation(db, valid.code);
    expect(accepted.valid).toBe(true);
    expect(accepted.workspaceId).toBe(WORKSPACE_ID);

    const expired = createInvitation(db, { brandWorkspaceId: WORKSPACE_ID, expiresInDays: 1 });
    db.prepare('UPDATE invitations SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', expired.id);
    expect(validateInvitation(db, expired.code).reason).toBe('expired');

    const used = createInvitation(db, { brandWorkspaceId: WORKSPACE_ID });
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const redeemed = redeemInvitation(db, { code: used.code, userId: user.id });
    expect(redeemed.valid).toBe(true);
    expect(validateInvitation(db, used.code).reason).toBe('used');
  });

  it('normalises invitation codes before matching', () => {
    const invitation = createInvitation(db, { brandWorkspaceId: WORKSPACE_ID });
    const spaced = ` ${invitation.code.toLowerCase().replace(/-/g, ' - ')} `;
    expect(validateInvitation(db, spaced).valid).toBe(true);
  });
});

describe('workspace administration', () => {
  it('lets an admin create a workspace and issue a redeemable invitation', async () => {
    const admin = await login(app, 'admin@northwindlabs.example');

    const created = await admin.agent
      .post('/api/workspaces')
      .set('x-csrf-token', admin.csrf)
      .send({ name: 'Acme partner workspace' });
    expect(created.status).toBe(201);
    const workspaceId = created.body.workspace.id;

    const invitation = await admin.agent
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('x-csrf-token', admin.csrf)
      .send({ expiresInDays: 10 });
    expect(invitation.status).toBe(201);
    expect(invitation.body.invitation.code).toMatch(/^BS-[0-9A-F]{8}-[0-9A-F]{8}$/);

    const listed = await admin.agent.get(`/api/workspaces/invitations?workspaceId=${workspaceId}`);
    expect(listed.status).toBe(200);
    expect(listed.body.invitations.some((row) => row.id === invitation.body.invitation.id)).toBe(true);

    const signup = await signupAgency({ email: 'agency.acme@example.com', code: invitation.body.invitation.code });
    expect(signup.status).toBe(201);
    expect(signup.body.accountState).toBe('active');
    expect(signup.body.user.workspaceIds).toContain(workspaceId);
  });

  it('only lets admins create workspaces and invitations', async () => {
    const reviewer = await login(app, 'reviewer@northwindlabs.example');
    const response = await reviewer.agent
      .post(`/api/workspaces/${WORKSPACE_ID}/invitations`)
      .set('x-csrf-token', reviewer.csrf)
      .send({});
    expect(response.status).toBe(403);
  });

  it('lets an admin approve a pending agency account into a workspace', async () => {
    const signup = await signupAgency({ email: 'agency.pending@example.com', code: null });
    expect(signup.status).toBe(201);
    expect(signup.body.accountState).toBe('pending');

    const pending = db.prepare('SELECT * FROM users WHERE email = ?').get('agency.pending@example.com');
    const admin = await login(app, 'admin@northwindlabs.example');
    const approve = await admin.agent
      .post(`/api/users/${pending.id}/approve`)
      .set('x-csrf-token', admin.csrf)
      .send({ role: 'agency', brandWorkspaceId: WORKSPACE_ID });
    expect(approve.status).toBe(200);

    const approved = db.prepare('SELECT * FROM users WHERE id = ?').get(pending.id);
    expect(approved.account_state).toBe('active');
    expect(approved.role_key).toBe('agency');
    const membership = db
      .prepare('SELECT * FROM brand_workspace_members WHERE user_id = ? AND brand_workspace_id = ?')
      .get(pending.id, WORKSPACE_ID);
    expect(membership).toBeTruthy();
  });
});

describe('agency workspace scoping', () => {
  it('keeps agency submissions inside assigned workspaces', async () => {
    const otherWorkspace = createWorkspace(db, { name: 'Unrelated workspace' });
    const invitation = createInvitation(db, { brandWorkspaceId: WORKSPACE_ID });

    const agent = request.agent(app);
    const signup = await agent
      .post('/api/auth/signup')
      .send({
        type: 'agency',
        name: 'Avery Stone',
        email: 'agency.scoped@example.com',
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
        termsAccepted: true,
        agencyName: 'Harbor & Finch',
        invitationCode: invitation.code,
      });
    expect(signup.status).toBe(201);

    const token = latestVerificationToken('agency.scoped@example.com');
    const verify = await agent.post('/api/auth/verify-email').send({ token });
    expect(verify.status).toBe(200);
    const csrf = verify.body.csrfToken;

    const allowed = await agent
      .post('/api/submissions')
      .set('x-csrf-token', csrf)
      .send({
        title: 'Agency scoped draft',
        channel: 'LinkedIn',
        aiDisclosure: 'none',
        content: 'Northwind Labs is opening its Leeds studio to customers.',
        brandWorkspaceId: WORKSPACE_ID,
      });
    expect(allowed.status).toBe(201);
    expect(allowed.body.submission.brand_workspace_id).toBe(WORKSPACE_ID);

    const denied = await agent
      .post('/api/submissions')
      .set('x-csrf-token', csrf)
      .send({
        title: 'Agency out-of-scope draft',
        channel: 'LinkedIn',
        aiDisclosure: 'none',
        content: 'A draft for a workspace we cannot see.',
        brandWorkspaceId: otherWorkspace.id,
      });
    expect(denied.status).toBe(403);

    const list = await agent.get('/api/submissions');
    expect(list.status).toBe(200);
    expect(list.body.submissions.length).toBeGreaterThan(0);
    for (const submission of list.body.submissions) {
      expect(submission.owner_email).toBe('agency.scoped@example.com');
      expect(submission.brand_workspace_id).toBe(WORKSPACE_ID);
    }
  });
});
