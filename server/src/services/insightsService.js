const { isExpired, ageInDays } = require('../utils/time');

function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getUTCDay();
  const diff = (day + 6) % 7; // Monday start
  copy.setUTCHours(0, 0, 0, 0);
  copy.setUTCDate(copy.getUTCDate() - diff);
  return copy;
}

function weekKey(date) {
  return startOfWeek(new Date(date)).toISOString().slice(0, 10);
}

function weeklyBuckets(count, rows, valueFn) {
  const buckets = [];
  const now = new Date();
  const current = startOfWeek(now);
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(current);
    date.setUTCDate(date.getUTCDate() - index * 7);
    buckets.push({ week: date.toISOString().slice(0, 10), blockers: 0, warnings: 0, suggestions: 0, resolved: 0, submissions: 0 });
  }
  const byWeek = new Map(buckets.map((bucket) => [bucket.week, bucket]));
  for (const row of rows) {
    const bucket = byWeek.get(weekKey(valueFn(row)));
    if (!bucket) continue;
    if (row.severity === 'blocker') bucket.blockers += 1;
    if (row.severity === 'warning') bucket.warnings += 1;
    if (row.severity === 'suggestion') bucket.suggestions += 1;
    if (row.decision === 'accepted' || row.decision === 'edited') bucket.resolved += 1;
  }
  return buckets;
}

function scopeClause(user) {
  if (user.role === 'creator') return { sql: ' AND s.owner_id = ?', params: [user.id] };
  if (user.role === 'agency') {
    const memberships = user.workspaceIds || [];
    if (!memberships.length) return { sql: ' AND 1=0', params: [] };
    return {
      sql: ` AND s.owner_id = ? AND s.brand_workspace_id IN (${memberships.map(() => '?').join(', ')})`,
      params: [user.id, ...memberships],
    };
  }
  return { sql: '', params: [] };
}

function brandPulse(db, user) {
  const scope = scopeClause(user);
  const rows = db
    .prepare(
      `SELECT i.severity, i.decision, i.created_at, i.decision_at, s.team, s.id AS submission_id
       FROM issues i JOIN submissions s ON s.id = i.submission_id
       WHERE 1=1 ${scope.sql}`
    )
    .all(...scope.params);
  const totals = {
    blockers: rows.filter((row) => row.severity === 'blocker').length,
    warnings: rows.filter((row) => row.severity === 'warning').length,
    suggestions: rows.filter((row) => row.severity === 'suggestion').length,
    resolved: rows.filter((row) => row.decision === 'accepted' || row.decision === 'edited').length,
  };
  const trend = weeklyBuckets(8, rows, (row) => row.created_at);
  const teams = [...new Set(rows.map((row) => row.team))].sort();
  const byTeam = teams.map((team) => {
    const teamRows = rows.filter((row) => row.team === team);
    return {
      team,
      blockers: teamRows.filter((row) => row.severity === 'blocker' && row.decision === 'pending').length,
      warnings: teamRows.filter((row) => row.severity === 'warning' && row.decision === 'pending').length,
      resolved: teamRows.filter((row) => row.decision === 'accepted' || row.decision === 'edited').length,
    };
  });
  return { ...totals, trend, byTeam };
}

function dashboard(db, user) {
  const scope = scopeClause(user);
  const statusRows = db
    .prepare(`SELECT s.status, COUNT(*) AS count FROM submissions s WHERE 1=1 ${scope.sql} GROUP BY s.status`)
    .all(...scope.params);
  const statusCounts = Object.fromEntries(statusRows.map((row) => [row.status, row.count]));
  const mySubmissions = db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM issues i WHERE i.submission_id = s.id AND i.severity = 'blocker' AND i.decision = 'pending') AS blockers
       FROM submissions s WHERE s.owner_id = ? ORDER BY s.updated_at DESC LIMIT 8`
    )
    .all(user.id)
    .map((row) => ({ ...row, ageDays: ageInDays(row.submitted_at || row.created_at) }));
  const pendingReviews =
    ['creator', 'agency'].includes(user.role)
      ? db
          .prepare("SELECT s.* FROM submissions s WHERE s.owner_id = ? AND s.status IN ('changes_requested', 'awaiting_review') ORDER BY s.updated_at DESC LIMIT 8")
          .all(user.id)
      : db
          .prepare("SELECT s.*, u.name AS owner_name FROM submissions s JOIN users u ON u.id = s.owner_id WHERE s.status = 'awaiting_review' ORDER BY s.submitted_at ASC LIMIT 8")
          .all();
  const facts = db.prepare('SELECT * FROM approved_facts WHERE status = ?').all('active');
  const expiringFacts = facts
    .filter((fact) => fact.expiry_date)
    .map((fact) => ({ ...fact, expired: isExpired(fact.expiry_date) }))
    .sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)))
    .slice(0, 4);
  const recentIssues = db
    .prepare(
      `SELECT i.guideline_ref, i.severity, i.decision, i.created_at FROM issues i
       JOIN submissions s ON s.id = i.submission_id WHERE 1=1 ${scope.sql} ORDER BY i.created_at DESC LIMIT 200`
    )
    .all(...scope.params);
  const guidelineCounts = new Map();
  for (const issue of recentIssues) {
    const key = issue.guideline_ref || 'No reference';
    guidelineCounts.set(key, (guidelineCounts.get(key) || 0) + 1);
  }
  const recurring = [...guidelineCounts.entries()]
    .map(([reference, count]) => ({ reference, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  return {
    role: user.role,
    statusCounts,
    mySubmissions,
    pendingReviews,
    brandPulse: brandPulse(db, user),
    expiringFacts,
    recurring,
  };
}

function insights(db /* , filters */) {
  const issues = db
    .prepare(
      `SELECT i.*, s.team, s.channel, s.title AS submission_title, s.status AS submission_status
       FROM issues i JOIN submissions s ON s.id = i.submission_id
       ORDER BY i.created_at ASC`
    )
    .all();
  const guidelines = db
    .prepare('SELECT id, stable_id, title, category, current_version FROM brand_guidelines ORDER BY stable_id')
    .all();
  const titleByRef = new Map(guidelines.map((guideline) => [guideline.stable_id, guideline]));
  const teams = [...new Set(issues.map((issue) => issue.team))].sort();
  const channels = [...new Set(issues.map((issue) => issue.channel))].sort();

  const byGuideline = new Map();
  for (const issue of issues) {
    if (!issue.guideline_ref) continue;
    const current = byGuideline.get(issue.guideline_ref) || {
      reference: issue.guideline_ref,
      id: titleByRef.get(issue.guideline_ref)?.id || null,
      title: titleByRef.get(issue.guideline_ref)?.title || 'Unknown guideline',
      total: 0,
      open: 0,
      teams: {},
      channels: {},
    };
    current.total += 1;
    if (issue.decision === 'pending') current.open += 1;
    current.teams[issue.team] = (current.teams[issue.team] || 0) + 1;
    current.channels[issue.channel] = (current.channels[issue.channel] || 0) + 1;
    byGuideline.set(issue.guideline_ref, current);
  }
  const recurring = [...byGuideline.values()].sort((a, b) => b.total - a.total);
  const needsClarity = recurring.filter((item) => item.total >= 2).slice(0, 8);

  const heatmap = guidelines
    .filter((guideline) => byGuideline.has(guideline.stable_id))
    .map((guideline) => {
      const entry = byGuideline.get(guideline.stable_id);
      return {
        reference: guideline.stable_id,
        title: guideline.title,
        cells: teams.map((team) => ({ team, count: entry.teams[team] || 0 })),
        total: entry.total,
      };
    });

  const byChannel = channels.map((channel) => ({
    channel,
    total: issues.filter((issue) => issue.channel === channel).length,
    blockers: issues.filter((issue) => issue.channel === channel && issue.severity === 'blocker').length,
  }));

  const trend = weeklyBuckets(12, issues, (issue) => issue.created_at);

  const rules = db.prepare('SELECT code, type, severity, guideline_ref FROM rules').all();

  return {
    teams,
    channels,
    recurring,
    needsClarity,
    heatmap,
    byChannel,
    trend,
    pulse: brandPulse(db, { role: 'admin', id: null }),
    totals: {
      issues: issues.length,
      blockers: issues.filter((issue) => issue.severity === 'blocker').length,
      warnings: issues.filter((issue) => issue.severity === 'warning').length,
      suggestions: issues.filter((issue) => issue.severity === 'suggestion').length,
      resolved: issues.filter((issue) => ['accepted', 'edited'].includes(issue.decision)).length,
      submissions: db.prepare('SELECT COUNT(*) AS count FROM submissions').get().count,
    },
    rulesets: rules,
  };
}

module.exports = { dashboard, insights, brandPulse, weeklyBuckets, startOfWeek };
