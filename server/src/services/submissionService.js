const { randomId } = require('../auth/crypto');
const { nowIso } = require('../utils/time');

function createSubmission(
  db,
  {
    title,
    channel,
    type = 'text',
    content = '',
    altText = null,
    filePath = null,
    fileName = null,
    aiDisclosure = 'none',
    owner,
    brandWorkspaceId = null,
    note = 'Created',
  }
) {
  const id = randomId();
  const createdAt = nowIso();
  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO submissions
        (id, title, channel, type, content, alt_text, file_path, file_name, ai_disclosure, status, owner_id, team,
         brand_workspace_id, current_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, 1, ?, ?)`
    ).run(
      id,
      title,
      channel,
      type,
      content,
      altText,
      filePath,
      fileName,
      aiDisclosure,
      owner.id,
      owner.team,
      brandWorkspaceId,
      createdAt,
      createdAt
    );
    db.prepare(
      `INSERT INTO submission_versions (id, submission_id, version, title, content, alt_text, file_name, created_by, note, created_at)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
    ).run(randomId(), id, title, content, altText, fileName, owner.id, note, createdAt);
  });
  insert();
  return db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
}

function addVersion(db, submission, actorId, note = 'Updated') {
  const nextVersion = submission.current_version + 1;
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO submission_versions (id, submission_id, version, title, content, alt_text, file_name, created_by, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(randomId(), submission.id, nextVersion, submission.title, submission.content, submission.alt_text, submission.file_name, actorId, note, createdAt);
  db.prepare('UPDATE submissions SET current_version = ?, updated_at = ? WHERE id = ?').run(nextVersion, createdAt, submission.id);
  return db.prepare('SELECT * FROM submissions WHERE id = ?').get(submission.id);
}

function getSubmission(db, id) {
  return db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
}

function canAccessSubmission(user, submission) {
  if (!user || !submission) return false;
  if (user.role === 'admin' || user.role === 'reviewer' || user.role === 'leadership') return true;
  if (submission.owner_id !== user.id) return false;
  if (user.role !== 'agency') return true;
  // Agency users can only see their own work inside a workspace they belong to.
  return Boolean(submission.brand_workspace_id) && (user.workspaceIds || []).includes(submission.brand_workspace_id);
}

function canEditSubmission(user, submission) {
  if (!user || !submission) return false;
  if (submission.owner_id !== user.id && user.role !== 'admin') return false;
  if (user.role === 'agency' && !(user.workspaceIds || []).includes(submission.brand_workspace_id)) return false;
  return !['awaiting_review', 'approved', 'ready_to_publish', 'rejected'].includes(submission.status);
}

module.exports = { createSubmission, addVersion, getSubmission, canAccessSubmission, canEditSubmission };
