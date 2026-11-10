const request = require('supertest');
const { createTestDb } = require('./helpers');
const { createApp } = require('../src/app');
const { runReview, applyDecision, normaliseFinding, withTimeout } = require('../src/services/reviewService');
const { createSubmission } = require('../src/services/submissionService');

let db;
let app;
let admin;
let creator;
let reviewer;

async function login(agent, email) {
  const response = await agent.post('/api/auth/login').send({ email, password: 'BrandShield!23' });
  expect(response.status).toBe(200);
  return { agent, csrf: response.body.csrfToken, user: response.body.user };
}

beforeAll(async () => {
  db = await createTestDb();
  app = createApp(db);
  admin = await login(request.agent(app), 'admin@northwindlabs.example');
  creator = await login(request.agent(app), 'creator@northwindlabs.example');
  reviewer = await login(request.agent(app), 'reviewer@northwindlabs.example');
});

afterAll(() => {
  db.close();
});

describe('seed data', () => {
  it('creates the Northwind Labs library with 8 guidelines, 6 facts (2 expired) and demo users', () => {
    expect(db.prepare('SELECT COUNT(*) AS c FROM brand_guidelines').get().c).toBe(8);
    expect(db.prepare('SELECT COUNT(*) AS c FROM approved_facts').get().c).toBe(6);
    const expired = db
      .prepare("SELECT COUNT(*) AS c FROM approved_facts WHERE expiry_date IS NOT NULL AND expiry_date < date('now')")
      .get().c;
    expect(expired).toBe(2);
    expect(db.prepare('SELECT COUNT(*) AS c FROM users').get().c).toBe(5);
    expect(db.prepare('SELECT COUNT(*) AS c FROM brand_assets').get().c).toBe(2);
  });

  it('seeds three sample submissions, including a clean one awaiting review', () => {
    expect(db.prepare('SELECT COUNT(*) AS c FROM submissions').get().c).toBe(3);
    const awaiting = db.prepare("SELECT * FROM submissions WHERE status = 'awaiting_review'").get();
    expect(awaiting).toBeTruthy();
    expect(db.prepare('SELECT COUNT(*) AS c FROM issues WHERE submission_id = ?').get(awaiting.id).c).toBe(0);
  });

  it('seeds terminology and outdated-claim findings', () => {
    const terminology = db.prepare("SELECT id FROM submissions WHERE title LIKE 'AI support rollout%'").get();
    const outdated = db.prepare("SELECT id FROM submissions WHERE title LIKE 'Sustainability update%'").get();
    expect(db.prepare("SELECT COUNT(*) AS c FROM issues WHERE submission_id = ? AND category = 'terminology'").get(terminology.id).c).toBeGreaterThan(0);
    expect(db.prepare("SELECT COUNT(*) AS c FROM issues WHERE submission_id = ? AND severity = 'blocker' AND fact_ref IS NOT NULL").get(outdated.id).c).toBe(2);
    const evidence = db
      .prepare("SELECT evidence FROM issues WHERE submission_id = ? AND fact_ref = 'FACT-05'")
      .get(outdated.id);
    const parsed = JSON.parse(evidence.evidence);
    expect(parsed.flaggedFact.expired).toBe(true);
    expect(parsed.nearestFact.stableId).toBe('FACT-06');
  });
});

describe('review API (MOCK provider)', () => {
  it('logs in and exposes the brand palette from library assets', async () => {
    const response = await admin.agent.get('/api/auth/me');
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('admin');
    expect(response.body.org.palette).toHaveLength(4);
  });

  it('rejects mutating requests without a CSRF token', async () => {
    const response = await creator.agent
      .post('/api/submissions')
      .send({ title: 'No token', channel: 'LinkedIn', aiDisclosure: 'none', content: 'Northwind Labs' });
    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/CSRF/i);
  });

  it('creates a submission, runs the rule engine and mock LLM, and stores findings', async () => {
    const create = await creator.agent
      .post('/api/submissions')
      .set('x-csrf-token', creator.csrf)
      .send({
        title: 'Integration demo post',
        channel: 'LinkedIn',
        aiDisclosure: 'AI-assisted',
        content: 'Our chatbot is world-class!! Northwind Labs is the market leader.',
      });
    expect(create.status).toBe(201);
    const id = create.body.submission.id;

    const analyse = await creator.agent
      .post(`/api/submissions/${id}/analyse`)
      .set('x-csrf-token', creator.csrf)
      .send({});
    expect(analyse.status).toBe(200);
    expect(analyse.body.meta.externalAI).toBe(false);
    expect(analyse.body.meta.provider).toBe('mock');
    expect(analyse.body.meta.llmStatus).toBe('ok');

    const rules = analyse.body.issues.map((issue) => issue.rule_ref || issue.guideline_ref);
    expect(rules).toContain('TERM-02');
    expect(rules).toContain('RULE-BANNED-01');
    expect(analyse.body.issues.some((issue) => issue.rule_ref === 'RULE-CLAIM-01' && issue.severity === 'blocker')).toBe(true);
    expect(analyse.body.issues.every((issue) => issue.guideline_ref || issue.rule_ref || issue.fact_ref)).toBe(true);

    const detail = await creator.agent.get(`/api/submissions/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.can.submit).toBe(true);
    expect(detail.body.submission.status).toBe('analysed');
  });

  it('blocks submission until blockers are resolved, then allows submit and reviewer approval', async () => {
    const create = await creator.agent
      .post('/api/submissions')
      .set('x-csrf-token', creator.csrf)
      .send({
        title: 'Workflow demo',
        channel: 'website',
        aiDisclosure: 'none',
        content: 'Northwind Labs is the market leader in customer support.',
      });
    const id = create.body.submission.id;
    const analyse = await creator.agent.post(`/api/submissions/${id}/analyse`).set('x-csrf-token', creator.csrf).send({});
    const blocker = analyse.body.issues.find((issue) => issue.severity === 'blocker');
    expect(blocker).toBeTruthy();

    const blocked = await creator.agent.post(`/api/submissions/${id}/submit`).set('x-csrf-token', creator.csrf).send({});
    expect(blocked.status).toBe(409);
    expect(blocked.body.details.blockers).toBeGreaterThan(0);

    const accept = await creator.agent
      .post(`/api/submissions/${id}/issues/${blocker.id}/decision`)
      .set('x-csrf-token', creator.csrf)
      .send({ decision: 'accepted' });
    expect(accept.status).toBe(200);
    expect(accept.body.issues.find((issue) => issue.id === blocker.id).decision).toBe('accepted');

    const submit = await creator.agent.post(`/api/submissions/${id}/submit`).set('x-csrf-token', creator.csrf).send({});
    expect(submit.status).toBe(200);
    expect(submit.body.submission.status).toBe('awaiting_review');

    const queue = await reviewer.agent.get('/api/queue');
    expect(queue.status).toBe(200);
    expect(queue.body.queue.some((item) => item.id === id)).toBe(true);

    const approve = await reviewer.agent
      .post(`/api/submissions/${id}/decision`)
      .set('x-csrf-token', reviewer.csrf)
      .send({ action: 'approve', comment: 'Approved for demo.' });
    expect(approve.status).toBe(200);
    expect(approve.body.submission.status).toBe('ready_to_publish');

    const history = await creator.agent.get(`/api/submissions/${id}`);
    const actions = history.body.actions.map((action) => action.action);
    expect(actions).toContain('submit');
    expect(actions).toContain('approve');
    expect(history.body.versions.length).toBeGreaterThan(1);
  });

  it('enforces role-based access to other creators submissions', async () => {
    const other = db
      .prepare("SELECT s.id FROM submissions s JOIN users u ON u.id = s.owner_id WHERE u.account_type = 'agency' LIMIT 1")
      .get();
    expect(other).toBeTruthy();
    const denied = await creator.agent.get(`/api/submissions/${other.id}`);
    expect(denied.status).toBe(403);
    const allowed = await reviewer.agent.get(`/api/submissions/${other.id}`);
    expect(allowed.status).toBe(200);
  });

  it('does not expose submission content in audit logs', async () => {
    const logs = db.prepare('SELECT metadata FROM audit_log').all().map((row) => row.metadata || '').join(' ');
    expect(logs).not.toContain('market leader');
    expect(logs).not.toContain('chatbot');
  });

  it('requires a comment to request changes and records reviewer feedback', async () => {
    const create = await creator.agent
      .post('/api/submissions')
      .set('x-csrf-token', creator.csrf)
      .send({ title: 'Feedback demo', channel: 'email', aiDisclosure: 'none', content: 'Northwind Labs is opening a Leeds studio.' });
    const id = create.body.submission.id;
    await creator.agent.post(`/api/submissions/${id}/analyse`).set('x-csrf-token', creator.csrf).send({});
    await creator.agent.post(`/api/submissions/${id}/submit`).set('x-csrf-token', creator.csrf).send({});

    const noComment = await reviewer.agent
      .post(`/api/submissions/${id}/decision`)
      .set('x-csrf-token', reviewer.csrf)
      .send({ action: 'request_changes' });
    expect(noComment.status).toBe(400);

    const requestChanges = await reviewer.agent
      .post(`/api/submissions/${id}/decision`)
      .set('x-csrf-token', reviewer.csrf)
      .send({ action: 'request_changes', comment: 'Please add the approved opening date.' });
    expect(requestChanges.status).toBe(200);
    expect(requestChanges.body.submission.status).toBe('changes_requested');
    const action = db
      .prepare("SELECT comment FROM review_actions WHERE submission_id = ? AND action = 'request_changes'")
      .get(id);
    expect(action.comment).toContain('approved opening date');
  });
});

describe('safety rules', () => {
  it('downgrades an unreferenced blocker to a suggestion', () => {
    const normalised = normaliseFinding(
      { category: 'tone', severity: 'blocker', explanation: 'Sounds wrong.', suggestion: 'Rewrite.', source: 'llm' },
      { content: 'Hello world', guidelineIds: new Set(), factIds: new Set(), ruleCodes: new Set() }
    );
    expect(normalised.severity).toBe('suggestion');
    expect(normalised.explanation).toMatch(/suggestion only/i);
  });

  it('downgrades findings that cite a guideline that does not exist', () => {
    const normalised = normaliseFinding(
      { category: 'tone', severity: 'warning', guidelineRef: 'FAKE-99', explanation: 'x' },
      { content: 'Hello', guidelineIds: new Set(['TONE-01']), factIds: new Set(), ruleCodes: new Set() }
    );
    expect(normalised.severity).toBe('suggestion');
    expect(normalised.guidelineRef).toBeNull();
  });

  it('enforces at the database level that an unreferenced issue is never an error', () => {
    const submission = db.prepare('SELECT * FROM submissions LIMIT 1').get();
    const version = db.prepare('SELECT id FROM submission_versions WHERE submission_id = ?').get(submission.id);
    const statement = db.prepare(
      `INSERT INTO issues (id, submission_id, submission_version_id, category, severity, span_start, span_end, quote, explanation, created_at)
       VALUES ('unsafe-test', ?, ?, 'tone', 'blocker', 0, 0, '', 'unsafe', ?)`
    );
    expect(() => statement.run(submission.id, version.id, new Date().toISOString())).toThrow(/CHECK/i);
  });

  it('never applies a suggestion without an explicit accept action', async () => {
    const user = db.prepare("SELECT * FROM users WHERE email = 'creator@northwindlabs.example'").get();
    const submission = createSubmission(db, {
      title: 'Suggestion safety',
      channel: 'email',
      type: 'text',
      content: 'Our chatbot is ready.',
      aiDisclosure: 'none',
      owner: { id: user.id, team: user.team },
    });
    await runReview(db, submission, { actorId: user.id });
    const before = db.prepare('SELECT * FROM submissions WHERE id = ?').get(submission.id);
    expect(before.content).toBe('Our chatbot is ready.');
    const issue = db.prepare("SELECT * FROM issues WHERE submission_id = ? AND rule_ref = 'TERM-02'").get(submission.id);
    expect(issue.decision).toBe('pending');

    // Rejecting leaves content untouched.
    const rejected = applyDecision(db, before, issue, { decision: 'rejected', actor: user });
    expect(rejected.content).toBe('Our chatbot is ready.');

    // Accepting is explicit and applies the replacement.
    const second = db.prepare("SELECT * FROM issues WHERE submission_id = ? AND rule_ref = 'TERM-02'").get(submission.id);
    db.prepare("UPDATE issues SET decision = 'pending' WHERE id = ?").run(second.id);
    const fresh = db.prepare('SELECT * FROM submissions WHERE id = ?').get(submission.id);
    const accepted = applyDecision(db, fresh, second, { decision: 'accepted', actor: user });
    expect(accepted.content).toBe('Our AI assistant is ready.');
  });

  it('keeps later finding spans aligned after an accepted replacement changes the content length', async () => {
    const user = db.prepare("SELECT * FROM users WHERE email = 'creator@northwindlabs.example'").get();
    const submission = createSubmission(db, {
      title: 'Span alignment',
      channel: 'email',
      type: 'text',
      content: 'Our chatbot and virtual agent are ready.',
      aiDisclosure: 'none',
      owner: { id: user.id, team: user.team },
    });
    await runReview(db, submission, { actorId: user.id });
    const issues = db
      .prepare("SELECT * FROM issues WHERE submission_id = ? AND rule_ref = 'TERM-02' ORDER BY span_start")
      .all(submission.id);
    expect(issues).toHaveLength(2);

    const fresh = db.prepare('SELECT * FROM submissions WHERE id = ?').get(submission.id);
    const updated = applyDecision(db, fresh, issues[0], { decision: 'accepted', actor: user });
    expect(updated.content).toBe('Our AI assistant and virtual agent are ready.');

    const sibling = db.prepare('SELECT * FROM issues WHERE id = ?').get(issues[1].id);
    expect(sibling.span_end - sibling.span_start).toBe('virtual agent'.length);
    expect(updated.content.slice(sibling.span_start, sibling.span_end)).toBe(sibling.quote);
    expect(sibling.quote).toBe('virtual agent');
  });

  it('keeps rule-engine results when the LLM times out', async () => {
    const user = db.prepare("SELECT * FROM users WHERE email = 'creator@northwindlabs.example'").get();
    const submission = createSubmission(db, {
      title: 'Timeout demo',
      channel: 'email',
      type: 'text',
      content: 'Northwind Labs is world-class.',
      aiDisclosure: 'none',
      owner: { id: user.id, team: user.team },
    });
    const slowProvider = {
      name: 'slow-test-provider',
      version: 'test-1',
      external: false,
      review: () => new Promise((resolve) => setTimeout(() => resolve({ status: 'ok', findings: [] }), 200)),
    };
    const result = await runReview(db, submission, { actorId: user.id, provider: slowProvider, timeoutMs: 10 });
    expect(result.meta.llmStatus).toBe('timeout');
    expect(result.meta.llmNotice).toMatch(/incomplete/i);
    expect(result.issues.some((issue) => issue.rule_ref === 'RULE-BANNED-01')).toBe(true);

    // The timeout helper rejects promptly.
    await expect(withTimeout(new Promise(() => {}), 5)).rejects.toMatchObject({ code: 'LLM_TIMEOUT' });
  });
});
