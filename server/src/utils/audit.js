const { randomId } = require('../auth/crypto');

/** Logs event types and IDs only - never submission content or API keys. */
function audit(db, { userId = null, eventType, entityType = null, entityId = null, metadata = null }) {
  db.prepare(
    `INSERT INTO audit_log (id, user_id, event_type, entity_type, entity_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomId(),
    userId,
    eventType,
    entityType,
    entityId,
    metadata ? JSON.stringify(metadata) : null,
    new Date().toISOString()
  );
}

function listAudit(db, { limit = 200, eventType = null } = {}) {
  const rows = eventType
    ? db
        .prepare(
          `SELECT a.*, u.name AS user_name, u.email AS user_email
           FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
           WHERE a.event_type = ? ORDER BY a.created_at DESC LIMIT ?`
        )
        .all(eventType, limit)
    : db
        .prepare(
          `SELECT a.*, u.name AS user_name, u.email AS user_email
           FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
           ORDER BY a.created_at DESC LIMIT ?`
        )
        .all(limit);
  return rows.map((row) => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  }));
}

module.exports = { audit, listAudit };
