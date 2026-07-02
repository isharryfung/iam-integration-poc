const mongoose = require('mongoose');

/**
 * inbound_events – immutable record of every event received from source systems.
 * Lifecycle: received → validated → sent_to_midpoint → success / failed / retrying / dead_letter
 */
const inboundEventSchema = new mongoose.Schema(
  {
    eventId:       { type: String, required: true, unique: true },
    jobId:         { type: String, index: true },       // parent ingestion job
    sourceSystem:  { type: String, required: true, uppercase: true },
    correlationId: { type: String, index: true },
    idempotencyKey: { type: String, index: true },

    // Canonical identity block (normalized from any source)
    identity: {
      email:      { type: String, lowercase: true, trim: true },
      emailDomain: String,
      staffId:    String,
      studentId:  String,
      displayName: String,
      userType:   { type: String, enum: ['staff', 'student', 'family', 'contractor', 'system', 'unknown'], default: 'unknown' },
    },

    // Entitlement / role block
    entitlement: {
      action:       { type: String, enum: ['provision', 'deprovision', 'update', 'sync', 'unknown'], default: 'unknown' },
      targetSystem: String,
      role:         String,
      department:   String,
      validFrom:    Date,
      validUntil:   Date,
    },

    // Raw payload from source system (kept for replay)
    rawPayload: mongoose.Schema.Types.Mixed,

    // Source-specific parsed data
    sourceData: {
      // CADS fields
      cadsEmployeeId: String,
      cadsOrgUnit: String,
      // PeopleSoft – which module this came from
      psModule: { type: String, enum: ['SIS', 'FMS', 'HRMS', 'UNKNOWN'] },
      psRecordType: String,
      psEmplid: String,
      // ECM fields
      ecmUserId: String,
      ecmDocumentClass: String,
      // JSPM fields
      jspmProjectCode: String,
      jspmRole: String,
    },

    // Processing status
    status: {
      type: String,
      enum: ['received', 'validated', 'validation_failed', 'sent_to_midpoint', 'success', 'failed', 'retrying', 'dead_letter'],
      default: 'received',
      index: true,
    },
    validationErrors: [String],
    retryCount:   { type: Number, default: 0 },
    lastError:    String,
    processedAt:  Date,
    midpointTransactionId: String,
  },
  { timestamps: true, collection: 'inbound_events' }
);

// Compound index for email-based lookups
inboundEventSchema.index({ 'identity.email': 1, createdAt: -1 });
inboundEventSchema.index({ sourceSystem: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('InboundEvent', inboundEventSchema);
