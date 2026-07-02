const mongoose = require('mongoose');

/**
 * sync_status_by_email – materialized read model for fast non-technical UI.
 * Updated after every event is processed; one document per email.
 */
const syncStatusByEmailSchema = new mongoose.Schema(
  {
    _id:    { type: String },   // email is the primary key
    email:  { type: String, required: true, lowercase: true, trim: true },
    emailDomain: String,
    displayName: String,
    userType:    { type: String, enum: ['staff', 'student', 'family', 'contractor', 'system', 'unknown'] },

    // Latest ingestion activity
    lastSourceSystem:     String,
    lastEventId:          String,
    lastEventTime:        Date,
    lastProcessingStatus: { type: String, enum: ['received', 'validated', 'validation_failed', 'sent_to_midpoint', 'success', 'failed', 'retrying', 'dead_letter'] },
    lastSuccessAt:        Date,
    lastFailureAt:        Date,
    lastError:            String,

    // MidPoint status
    lastMidpointStatus:   String,
    midpointOid:          String,
    midpointLastSyncAt:   Date,

    // Per-source-system summary (CADS/PS/ECM/JSPM contribution timestamps)
    sourceContributions: {
      CADS:       { lastEventAt: Date, lastStatus: String },
      PEOPLESOFT: { lastEventAt: Date, lastStatus: String, psModule: String },
      ECM:        { lastEventAt: Date, lastStatus: String },
      JSPM:       { lastEventAt: Date, lastStatus: String },
    },

    // Quick flags for UI
    activeFlags: {
      hasRecentFailure:   { type: Boolean, default: false },
      hasPendingRetry:    { type: Boolean, default: false },
      isInDeadLetter:     { type: Boolean, default: false },
    },

    // Totals
    totalEventsReceived:  { type: Number, default: 0 },
    totalEventsFailed:    { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'sync_status_by_email' }
);

module.exports = mongoose.model('SyncStatusByEmail', syncStatusByEmailSchema);
