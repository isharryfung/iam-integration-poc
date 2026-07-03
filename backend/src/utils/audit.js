const { v4: uuidv4 } = require('uuid');
const AuditLog = require('../models/AuditLog');

/**
 * Write an entry to audit_logs asynchronously (fire-and-forget for POC).
 */
function normalizeAuditResource(resource) {
  if (resource == null) return '';
  if (typeof resource === 'string') return resource;

  try {
    const serialized = JSON.stringify(resource, (_key, value) => {
      if (value === undefined) return null;
      if (typeof value === 'bigint') return value.toString();
      return value;
    });
    return typeof serialized === 'string' ? serialized : String(serialized);
  } catch (_err) {
    return '[unserializable resource]';
  }
}

async function writeAudit({ correlationId, actor, action, resource, outcome, httpStatus, errorDetail, durationMs, metadata }) {
  const normalizedResource = normalizeAuditResource(resource);

  try {
    await AuditLog.create({
      auditId: uuidv4(),
      correlationId,
      actor: actor || {},
      action,
      resource: normalizedResource,
      outcome,
      httpStatus,
      errorDetail,
      durationMs,
      metadata,
    });
  } catch (err) {
    // Audit write failure must never crash the main request
    console.warn('Audit write failed', {
      correlationId,
      action,
      resource: normalizedResource,
      error: err.message,
    });
  }
}

module.exports = { writeAudit, normalizeAuditResource };
