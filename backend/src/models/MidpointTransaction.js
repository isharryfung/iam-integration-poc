const mongoose = require('mongoose');

/**
 * midpoint_transactions – records of calls made TO MidPoint (outbound).
 * Tracks request, response, and retry history.
 */
const midpointTransactionSchema = new mongoose.Schema(
  {
    transactionId:  { type: String, required: true, unique: true },
    inboundEventId: { type: String, required: true, index: true },
    correlationId:  String,
    email:          { type: String, lowercase: true, trim: true, index: true },

    // What operation was sent to MidPoint
    operation: {
      type: String,
      enum: ['add', 'modify', 'delete', 'enable', 'disable', 'assign', 'unassign', 'reconcile'],
      required: true,
    },
    targetResource: String, // e.g. "LDAP", "AD", "SAML"

    // MidPoint REST request/response
    requestPayload:  mongoose.Schema.Types.Mixed,
    responsePayload: mongoose.Schema.Types.Mixed,
    httpStatus:      Number,

    // Processing outcome
    status: {
      type: String,
      enum: ['pending', 'sent', 'accepted', 'rejected', 'timeout', 'error'],
      default: 'pending',
      index: true,
    },
    errorCode:   String,
    errorDetail: String,

    // Retry tracking
    attempt:      { type: Number, default: 1 },
    maxAttempts:  { type: Number, default: 3 },
    nextRetryAt:  Date,
    completedAt:  Date,
  },
  { timestamps: true, collection: 'midpoint_transactions' }
);

module.exports = mongoose.model('MidpointTransaction', midpointTransactionSchema);
