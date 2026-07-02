const { v4: uuidv4 } = require('uuid');
const AuditLog = require('../models/AuditLog');

/**
 * Write an entry to audit_logs asynchronously (fire-and-forget for POC).
 */
async function writeAudit({ correlationId, actor, action, resource, outcome, httpStatus, errorDetail, durationMs, metadata }) {
  try {
    await AuditLog.create({
      auditId: uuidv4(),
      correlationId,
      actor: actor || {},
      action,
      resource: resource || {},
      outcome,
      httpStatus,
      errorDetail,
      durationMs,
      metadata,
    });
  } catch (err) {
    // Audit write failure must never crash the main request
    console.error('Audit write failed:', err.message);
  }
}

module.exports = { writeAudit };
