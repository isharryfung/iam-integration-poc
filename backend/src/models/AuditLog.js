const mongoose = require('mongoose');

/**
 * audit_logs – append-only audit trail for all API operations.
 * Used for compliance and non-repudiation.
 */
const auditLogSchema = new mongoose.Schema(
  {
    auditId:       { type: String, required: true, unique: true },
    correlationId: { type: String, index: true },
    // Who performed the action
    actor: {
      type:      { type: String, enum: ['system', 'api_client', 'user', 'cron'] },
      apiKeyId:  String,   // hashed/truncated API key identifier
      serviceId: String,
      ipAddress: String,
    },
    // What action
    action: {
      type: String,
      enum: [
        'ingest_event', 'ingest_batch', 'query_event_status',
        'query_sync_status', 'query_user_events',
        'replay_event', 'query_access',
        'setup_db', 'system_startup',
      ],
      required: true,
    },
    // Target resource
    resource: {
      type:    String,     // e.g. "inbound_event", "dead_letter"
      id:      String,     // resource ID
      email:   { type: String, lowercase: true, trim: true },
    },
    // Result
    outcome:     { type: String, enum: ['success', 'failure', 'partial'], required: true },
    httpStatus:  Number,
    errorDetail: String,
    durationMs:  Number,
    metadata:    mongoose.Schema.Types.Mixed,
  },
  {
    // Do NOT allow update on audit logs — they are immutable
    timestamps: { createdAt: 'createdAt', updatedAt: false },
    collection: 'audit_logs',
  }
);

// TTL: auto-expire audit logs after 730 days (~2 years)
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 });
auditLogSchema.index({ 'resource.email': 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
