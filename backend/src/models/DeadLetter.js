const mongoose = require('mongoose');

/**
 * dead_letters – events that have exhausted all retry attempts and cannot be processed.
 * Ops staff can review these and trigger manual replay.
 */
const deadLetterSchema = new mongoose.Schema(
  {
    deadLetterId:   { type: String, required: true, unique: true },
    inboundEventId: { type: String, required: true, index: true },
    jobId:          String,
    sourceSystem:   { type: String, required: true, uppercase: true },
    correlationId:  String,
    email:          { type: String, lowercase: true, trim: true, index: true },

    // Why did it land here?
    failureReason:  { type: String, required: true },
    failureCode:    String,
    lastError:      String,
    totalAttempts:  Number,

    // Full snapshot of the event for replay
    eventSnapshot:  mongoose.Schema.Types.Mixed,

    // Resolution tracking
    status: {
      type: String,
      enum: ['pending', 'replaying', 'resolved', 'discarded'],
      default: 'pending',
      index: true,
    },
    resolvedBy:  String,
    resolvedAt:  Date,
    replayEventId: String,  // new InboundEvent created by replay
    notes:       String,
  },
  { timestamps: true, collection: 'dead_letters' }
);

module.exports = mongoose.model('DeadLetter', deadLetterSchema);
