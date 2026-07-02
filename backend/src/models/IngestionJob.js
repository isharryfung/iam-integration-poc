const mongoose = require('mongoose');

/**
 * ingestion_jobs – one record per ingestion call (single or batch).
 * Tracks lifecycle: received → processing → done / partial_failure.
 */
const ingestionJobSchema = new mongoose.Schema(
  {
    jobId:        { type: String, required: true, unique: true },
    jobType:      { type: String, enum: ['single', 'batch'], default: 'single' },
    sourceSystem: { type: String, required: true, uppercase: true },
    correlationId: String,
    idempotencyKey: { type: String, index: true },
    status: {
      type: String,
      enum: ['received', 'processing', 'done', 'partial_failure', 'failed'],
      default: 'received',
    },
    // For batch jobs: summary counts
    totalEvents:    { type: Number, default: 1 },
    acceptedEvents: { type: Number, default: 0 },
    rejectedEvents: { type: Number, default: 0 },
    // IDs of InboundEvent docs created by this job
    eventIds: [String],
    // Errors for rejected events in batch
    errors: [
      {
        index: Number,
        reason: String,
      },
    ],
    completedAt: Date,
    rawPayload: mongoose.Schema.Types.Mixed, // stored for audit/replay
  },
  { timestamps: true, collection: 'ingestion_jobs' }
);

module.exports = mongoose.model('IngestionJob', ingestionJobSchema);
