const { randomId, hashPassword } = require('../auth/crypto');
const { createSubmission } = require('../services/submissionService');
const { runReview, applyDecision, submitForReview, addComment } = require('../services/reviewService');
const { createInvitation } = require('../services/invitations');
const { nowIso, isoDaysAgo } = require('../utils/time');

const DEMO_USERS = [
  { email: 'admin@northwindlabs.example', name: 'Maya Chen', role: 'admin', team: 'Brand' },
  { email: 'creator@northwindlabs.example', name: 'Theo Martins', role: 'creator', team: 'Marketing' },
  { email: 'reviewer@northwindlabs.example', name: 'Priya Nair', role: 'reviewer', team: 'Brand' },
  {
    email: 'agency@northwindlabs.example',
    name: 'Jules Bennett',
    role: 'agency',
    team: 'Partnerships',
    agencyName: 'Harbor & Finch',
  },
  { email: 'leadership@northwindlabs.example', name: 'Sam Okafor', role: 'leadership', team: 'Executive' },
];

const GUIDELINES = [
  {
    stableId: 'TONE-01',
    title: 'Calm, expert tone',
    category: 'Tone of voice',
    owner: 'Brand team',
    body: `Write like a knowledgeable colleague, not a headline machine. Use short sentences, specific nouns and a calm pace. One exclamation mark is rare; repeated exclamation marks read as shouting. Avoid all-caps emphasis. Warmth comes from clarity and honesty, not from hype.
Examples: "We tested the update with 40 customers and found two clear improvements." Avoid: "MASSIVE news!!"`,
  },
  {
    stableId: 'TONE-02',
    title: 'Plain language and readability',
    category: 'Tone of voice',
    owner: 'Brand team',
    body: `Aim for a reading grade of 10 or below. Prefer everyday words, keep sentences under 25 words where possible, and explain acronyms the first time. Remove vague intensifiers such as "very", "really" and "incredibly" unless they add a fact.
Examples: "We will answer within two working days." Avoid: "We will endeavour to respond in an expedited manner."`,
  },
  {
    stableId: 'TERM-01',
    title: 'Company, product and feature naming',
    category: 'Terminology',
    owner: 'Brand team',
    body: `Always write "Northwind Labs" in full on first mention. Products keep their approved names: Northwind Atlas, Northwind Signal and Northwind Studio. Do not invent short forms. Use the terminology library for preferred terms and alternates.`,
  },
  {
    stableId: 'CLAIM-01',
    title: 'Every claim needs evidence',
    category: 'Claims and facts',
    owner: 'Legal',
    body: `Specific claims about performance, size, savings, rankings or certifications need a current approved fact. Do not use "100%", "guaranteed", "risk-free", "#1" or "market leader" without a documented source. If no approved fact exists, remove the claim or ask the brand team to approve one.`,
  },
  {
    stableId: 'CLAIM-02',
    title: 'Approved facts have an expiry date',
    category: 'Claims and facts',
    owner: 'Legal',
    body: `Check the expiry date on every approved fact before using it. Expired facts must not be published, even if they were accurate when written. Use the successor fact where one exists. If a claim is still important and no current fact covers it, pause and ask the fact owner.`,
  },
  {
    stableId: 'ACC-01',
    title: 'Text alternatives and visual clarity',
    category: 'Accessibility',
    owner: 'Accessibility lead',
    body: `Every image needs alt text that explains what it shows and why it matters. Do not start alt text with "image of". Logos need approved clear space and must not sit on busy imagery. Check contrast between text and background; do not rely on colour alone.`,
  },
  {
    stableId: 'ACC-02',
    title: 'Readable structure and useful links',
    category: 'Accessibility',
    owner: 'Accessibility lead',
    body: `Use one H1 and keep heading levels in order. Link text must make sense out of context: write "Read the 2025 sustainability report", not "click here" or "read more". Break long sections with descriptive headings.`,
  },
  {
    stableId: 'CHAN-01',
    title: 'Channel-aware length limits',
    category: 'Channel',
    owner: 'Brand team',
    body: `LinkedIn posts are limited to 1,500 characters. Website pages should stay under 900 words, email campaigns under 400 words and print pieces under 600 words. If content needs more room, link to a longer page rather than crowding the channel.`,
  },
];

const FACTS = [
  {
    stableId: 'FACT-01',
    statement: 'Northwind Labs was founded in 2016.',
    source: 'Companies House incorporation filing, 2016',
    owner: 'Legal',
    effectiveDate: '2016-03-01',
    expiryDate: null,
    keywords: ['founded in 2016', 'since 2016'],
  },
  {
    stableId: 'FACT-02',
    statement: 'Northwind Labs is headquartered in Leeds, United Kingdom.',
    source: 'Registered office record',
    owner: 'Operations',
    effectiveDate: '2023-01-01',
    expiryDate: null,
    keywords: ['Leeds', 'headquartered'],
  },
  {
    stableId: 'FACT-03',
    statement: 'Northwind Labs employs 240 people.',
    source: 'People team census, June 2024',
    owner: 'People team',
    effectiveDate: '2024-01-01',
    expiryDate: '2025-06-30',
    keywords: ['240 employees', '240 staff', '240 people'],
    successor: 'FACT-04',
  },
  {
    stableId: 'FACT-04',
    statement: 'Northwind Labs employs 310 people across Leeds and Manchester.',
    source: 'People team census, July 2025',
    owner: 'People team',
    effectiveDate: '2025-07-01',
    expiryDate: null,
    keywords: ['310 employees', '310 staff', '310 people'],
  },
  {
    stableId: 'FACT-05',
    statement: 'Northwind Labs is ISO 27001 certified.',
    source: 'ISO certificate IS 774211',
    owner: 'Security',
    effectiveDate: '2022-04-01',
    expiryDate: '2025-03-31',
    keywords: ['ISO 27001 certified', 'ISO 27001', 'ISO27001'],
    successor: 'FACT-06',
  },
  {
    stableId: 'FACT-06',
    statement: 'Northwind Labs is renewing its ISO 27001 certification, expected in 2026.',
    source: 'Security team statement, April 2025',
    owner: 'Security',
    effectiveDate: '2025-04-01',
    expiryDate: null,
    keywords: ['ISO 27001 renewal', 'renewing its ISO 27001', 'ISO 27001 certification'],
  },
];

const TERMINOLOGY = [
  { code: 'TERM-01', preferred: 'Northwind Labs', banned: ['North Wind', 'NWL', 'Northwind Labs Ltd'], guidelineRef: 'TERM-01', notes: 'Use the full company name on first mention.' },
  { code: 'TERM-02', preferred: 'AI assistant', banned: ['chatbot', 'chat bot', 'virtual agent'], guidelineRef: 'TERM-01', notes: 'We describe the product capability, not a sci-fi character.' },
  { code: 'TERM-03', preferred: 'sign in', banned: ['login', 'log in', 'signin'], guidelineRef: 'TERM-01', notes: 'Two words, no hyphen, verb form.' },
  { code: 'TERM-04', preferred: 'data centre', banned: ['datacenter', 'data-center'], guidelineRef: 'TERM-01', notes: 'UK spelling, two words.' },
  { code: 'TERM-05', preferred: 'sustainability report', banned: ['green report', 'eco report'], guidelineRef: 'TERM-01', notes: 'The formal report has a fixed name.' },
];

const RULES = [
  {
    code: 'RULE-BANNED-01',
    name: 'Banned brand phrases',
    type: 'banned_phrase',
    severity: 'warning',
    guidelineRef: 'TONE-02',
    config: {
      phrases: ['world-class', 'best-in-class', 'synergy', 'leverage', 'cutting-edge', 'guaranteed'],
      replacements: { 'world-class': 'high quality', 'best-in-class': 'leading', synergy: 'teamwork', leverage: 'use', 'cutting-edge': 'new', guaranteed: 'designed to' },
      rationale: 'Brand guidance asks for specific, plain claims instead of stock marketing phrases.',
    },
  },
  {
    code: 'RULE-REQ-01',
    name: 'LinkedIn first mention',
    type: 'required_term',
    severity: 'warning',
    guidelineRef: 'TERM-01',
    channel: 'LinkedIn',
    config: { term: 'Northwind Labs', minCount: 1 },
  },
  {
    code: 'RULE-CLAIM-01',
    name: 'Absolute and ranking claims',
    type: 'claim',
    severity: 'blocker',
    guidelineRef: 'CLAIM-01',
    config: { phrases: ['100%', 'risk-free', 'number one', '#1', 'market leader'], rationale: 'Absolute claims need a current approved fact.' },
  },
  { code: 'RULE-LEN-LI', name: 'LinkedIn length', type: 'length', severity: 'warning', guidelineRef: 'CHAN-01', channel: 'LinkedIn', config: { unit: 'characters', max: 1500 } },
  { code: 'RULE-LEN-WEB', name: 'Website length', type: 'length', severity: 'warning', guidelineRef: 'CHAN-01', channel: 'website', config: { unit: 'words', max: 900 } },
  { code: 'RULE-LEN-EMAIL', name: 'Email length', type: 'length', severity: 'warning', guidelineRef: 'CHAN-01', channel: 'email', config: { unit: 'words', max: 400 } },
  { code: 'RULE-LEN-PRINT', name: 'Print length', type: 'length', severity: 'warning', guidelineRef: 'CHAN-01', channel: 'print', config: { unit: 'words', max: 600 } },
  { code: 'RULE-ALT-01', name: 'Images need alt text', type: 'alt_text', severity: 'blocker', guidelineRef: 'ACC-01', config: {} },
  { code: 'RULE-READ-01', name: 'Reading grade limit', type: 'reading_level', severity: 'warning', guidelineRef: 'TONE-02', config: { maxGrade: 10 } },
  { code: 'RULE-HEAD-01', name: 'Heading order', type: 'heading_order', severity: 'warning', guidelineRef: 'ACC-02', config: {} },
  { code: 'RULE-LINK-01', name: 'Descriptive link text', type: 'link_text', severity: 'warning', guidelineRef: 'ACC-02', config: { banned: ['click here', 'read more', 'learn more'], example: '2025 sustainability report' } },
  { code: 'RULE-CONTRAST-01', name: 'Contrast check note', type: 'contrast', severity: 'suggestion', guidelineRef: 'ACC-01', config: { note: 'Check text over imagery and logo clear space against the approved palette.' } },
];

function nowMinusDays(days) {
  return isoDaysAgo(days);
}

async function seedDatabase(db, { demoPassword = 'BrandShield!23' } = {}) {
  const passwordHash = await hashPassword(demoPassword);

  db.transaction(() => {
    db.prepare('UPDATE approved_facts SET successor_id = NULL').run();
    db.prepare('DELETE FROM review_actions').run();
    db.prepare('DELETE FROM issues').run();
    db.prepare('DELETE FROM submission_versions').run();
    db.prepare('DELETE FROM submissions').run();
    db.prepare('DELETE FROM audit_log').run();
    db.prepare('DELETE FROM brand_workspace_members').run();
    db.prepare('DELETE FROM invitations').run();
    db.prepare('DELETE FROM email_outbox').run();
    db.prepare('DELETE FROM sessions').run();
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM roles').run();
    db.prepare('DELETE FROM brand_workspaces').run();
    db.prepare('DELETE FROM brand_guideline_versions').run();
    db.prepare('DELETE FROM brand_guidelines').run();
    db.prepare('DELETE FROM approved_facts').run();
    db.prepare('DELETE FROM terminology_entries').run();
    db.prepare('DELETE FROM brand_assets').run();
    db.prepare('DELETE FROM rules').run();
    db.prepare('DELETE FROM confidential_patterns').run();
    db.prepare('DELETE FROM settings').run();
  })();

  const now = nowIso();
  const roleRows = [
    ['admin', 'Admin', 'Manages the brand library and users'],
    ['creator', 'Creator', 'Submits content and decides on suggestions'],
    ['reviewer', 'Reviewer / Brand Manager', 'Approves, requests changes or rejects'],
    ['agency', 'Agency or partner', 'Creates content for assigned brand workspaces only'],
    ['leadership', 'Leadership', 'Read-only dashboards and trend reports'],
  ];
  for (const [key, name, description] of roleRows) {
    db.prepare('INSERT INTO roles (key, name, description) VALUES (?, ?, ?)').run(key, name, description);
  }

  const workspaceId = 'ws-northwind';
  db.prepare('INSERT INTO brand_workspaces (id, name, created_at) VALUES (?, ?, ?)').run(
    workspaceId,
    'Northwind Labs brand workspace',
    now
  );

  const users = {};
  for (const demo of DEMO_USERS) {
    const id = randomId();
    db.prepare(
      `INSERT INTO users
        (id, email, password_hash, name, role_key, team, team_name, agency_name, account_type,
         account_state, email_verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
    ).run(
      id,
      demo.email,
      passwordHash,
      demo.name,
      demo.role,
      demo.team,
      demo.team,
      demo.agencyName || null,
      demo.role,
      now,
      now,
      now
    );
    users[demo.email] = { id, brandWorkspaceId: workspaceId, ...demo };
    db.prepare('INSERT INTO brand_workspace_members (user_id, brand_workspace_id, created_at) VALUES (?, ?, ?)').run(
      id,
      workspaceId,
      now
    );
  }

  for (const guideline of GUIDELINES) {
    const id = randomId();
    db.prepare(
      `INSERT INTO brand_guidelines (id, stable_id, title, category, owner, status, current_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', 1, ?, ?)`
    ).run(id, guideline.stableId, guideline.title, guideline.category, guideline.owner, now, now);
    db.prepare(
      `INSERT INTO brand_guideline_versions (id, guideline_id, version, body, change_note, created_by, created_at)
       VALUES (?, ?, 1, ?, 'Seed version', ?, ?)`
    ).run(randomId(), id, guideline.body, users['admin@northwindlabs.example'].id, now);
  }

  const factIds = {};
  for (const fact of FACTS) {
    factIds[fact.stableId] = randomId();
  }
  for (const fact of FACTS) {
    db.prepare(
      `INSERT INTO approved_facts
        (id, stable_id, statement, source, owner, effective_date, expiry_date, keywords, successor_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'active', ?, ?)`
    ).run(
      factIds[fact.stableId],
      fact.stableId,
      fact.statement,
      fact.source,
      fact.owner,
      fact.effectiveDate,
      fact.expiryDate,
      JSON.stringify(fact.keywords || []),
      now,
      now
    );
  }
  for (const fact of FACTS) {
    if (!fact.successor) continue;
    db.prepare('UPDATE approved_facts SET successor_id = ? WHERE id = ?').run(factIds[fact.successor], factIds[fact.stableId]);
  }

  for (const entry of TERMINOLOGY) {
    db.prepare(
      `INSERT INTO terminology_entries (id, code, preferred_term, banned_terms, notes, guideline_ref, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    ).run(randomId(), entry.code, entry.preferred, JSON.stringify(entry.banned), entry.notes, entry.guidelineRef, now, now);
  }

  db.prepare(
    `INSERT INTO brand_assets (id, name, type, value, description, status, created_at, updated_at)
     VALUES (?, ?, 'logo', ?, ?, 'active', ?, ?)`
  ).run(
    randomId(),
    'Northwind Labs wordmark',
    'Northwind Labs wordmark, minimum clear space = cap height',
    'Approved logo for all channels. Use the SVG master from the brand folder.',
    now,
    now
  );
  db.prepare(
    `INSERT INTO brand_assets (id, name, type, value, description, status, created_at, updated_at)
     VALUES (?, ?, 'colour', ?, ?, 'active', ?, ?)`
  ).run(
    randomId(),
    'Northwind core palette',
    '#1F6F6B,#E8845B,#F2E8DC,#12232E',
    'Teal, coral, parchment and ink. Coral is an accent only, never body text.',
    now,
    now
  );

  for (const rule of RULES) {
    db.prepare(
      `INSERT INTO rules (id, code, name, type, config, severity, guideline_ref, channel, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(randomId(), rule.code, rule.name, rule.type, JSON.stringify(rule.config), rule.severity, rule.guidelineRef, rule.channel || null, now, now);
  }

  const settings = {
    org_name: 'Northwind Labs',
    retention_days: '365',
    external_llm_enabled: 'false',
    default_ai_disclosure: 'AI-assisted',
    llm_provider: 'auto',
  };
  for (const [key, value] of Object.entries(settings)) {
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, now);
  }

  db.prepare(
    'INSERT INTO confidential_patterns (id, name, pattern, replacement, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
  ).run(
    randomId(),
    'Internal project codenames',
    'Project\\s+(Aurora|Meridian|Keystone)',
    '[REDACTED PROJECT]',
    now,
    now
  );
  db.prepare(
    'INSERT INTO confidential_patterns (id, name, pattern, replacement, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
  ).run(randomId(), 'Staff email addresses', '[a-z0-9._%+-]+@northwindlabs\\.example', '[REDACTED EMAIL]', now, now);

  const creator = users['creator@northwindlabs.example'];
  const agency = users['agency@northwindlabs.example'];
  const reviewer = users['reviewer@northwindlabs.example'];

  const clean = createSubmission(db, {
    title: 'Northwind Labs opens its Leeds studio to customers',
    channel: 'LinkedIn',
    type: 'text',
    content:
      'Northwind Labs is opening its Leeds studio to customers on 14 November. The space is designed for small working sessions, product testing and honest feedback.\n\nVisitors will meet the team behind Northwind Atlas and see how customer research shapes each release.\n\nPlaces are limited to 20 people per session. Sign in to the customer portal to request a place.',
    aiDisclosure: 'AI-assisted',
    owner: creator,
    brandWorkspaceId: workspaceId,
  });
  const terminology = createSubmission(db, {
    title: 'AI support rollout for customers',
    channel: 'email',
    type: 'text',
    content:
      'Hi team,\n\nOur new chatbot is live for all users!! It is a world-class tool that will leverage AI to transform support.\n\nCustomers can login to try it. We are guaranteed to save 100 hours a week.\n\nThanks,\nThe Northwind team',
    aiDisclosure: 'AI-generated',
    owner: creator,
    brandWorkspaceId: workspaceId,
  });
  const outdated = createSubmission(db, {
    title: 'Sustainability update: certification and team growth',
    channel: 'website',
    type: 'text',
    content:
      '# Our 2025 update\n\nNorthwind Labs is ISO 27001 certified and employs 240 people. This makes us a market leader in responsible AI support.\n\n## What changed\n\nWe have invested in the Leeds studio and our customer research programme. [Read more](https://northwindlabs.example/sustainability) about our approach.\n\n## What is next\n\nWe will publish our sustainability report in the spring and share progress against our targets.',
    aiDisclosure: 'none',
    owner: agency,
    brandWorkspaceId: workspaceId,
  });

  // Analyse with the MOCK provider so the demo has realistic findings offline.
  const cleanReview = await runReview(db, clean, { actorId: creator.id });
  await runReview(db, terminology, { actorId: creator.id });
  await runReview(db, outdated, { actorId: agency.id });

  // Give the terminology submission a resolved decision and history.
  const loginIssue = db
    .prepare("SELECT * FROM issues WHERE submission_id = ? AND rule_ref = 'TERM-03' LIMIT 1")
    .get(terminology.id);
  if (loginIssue) {
    const current = db.prepare('SELECT * FROM submissions WHERE id = ?').get(terminology.id);
    applyDecision(db, current, loginIssue, {
      decision: 'accepted',
      actor: creator,
    });
  }
  addComment(db, outdated, agency, 'Flagged for the demo: the certification line needs a current fact before this can be submitted.');
  addComment(db, terminology, reviewer, 'Marketing asked for a quick turnaround. Please keep the tone calm and use approved terms.');

  // Spread the demo across weeks so insights and brand pulse have a trend.
  const spread = [
    { submission: clean, days: 2, issuesDays: 2 },
    { submission: terminology, days: 9, issuesDays: 9 },
    { submission: outdated, days: 16, issuesDays: 16 },
  ];
  for (const item of spread) {
    const stamp = nowMinusDays(item.days);
    db.prepare('UPDATE submissions SET created_at = ?, updated_at = ? WHERE id = ?').run(stamp, stamp, item.submission.id);
    db.prepare('UPDATE issues SET created_at = ? WHERE submission_id = ?').run(nowMinusDays(item.issuesDays), item.submission.id);
    db.prepare('UPDATE submission_versions SET created_at = ? WHERE submission_id = ?').run(stamp, item.submission.id);
    db.prepare('UPDATE review_actions SET created_at = ? WHERE submission_id = ?').run(stamp, item.submission.id);
  }

  // The clean submission is waiting for the reviewer.
  if (cleanReview.issues.length === 0) {
    const current = db.prepare('SELECT * FROM submissions WHERE id = ?').get(clean.id);
    submitForReview(db, current, creator);
    db.prepare('UPDATE submissions SET submitted_at = ?, updated_at = ? WHERE id = ?').run(nowMinusDays(2), nowMinusDays(2), clean.id);
    db.prepare("UPDATE review_actions SET created_at = ? WHERE submission_id = ? AND action = 'submit'").run(nowMinusDays(2), clean.id);
  }

  db.prepare("UPDATE submissions SET status = 'analysed' WHERE id IN (?, ?)").run(terminology.id, outdated.id);

  const demoInvitation = createInvitation(db, {
    brandWorkspaceId: workspaceId,
    createdBy: users['admin@northwindlabs.example'].id,
    expiresInDays: 30,
  });

  return {
    users: DEMO_USERS,
    workspaceId,
    invitationCode: demoInvitation.code,
    counts: {
      guidelines: GUIDELINES.length,
      facts: FACTS.length,
      terminology: TERMINOLOGY.length,
      rules: RULES.length,
      submissions: [clean, terminology, outdated].length,
      assumptions: cleanReview.issues.length,
    },
  };
}

module.exports = { seedDatabase, DEMO_USERS };
