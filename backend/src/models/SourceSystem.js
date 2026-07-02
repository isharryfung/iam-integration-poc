const mongoose = require('mongoose');

/**
 * source_systems – registered upstream systems (CADS, PeopleSoft, ECM, JSPM).
 */
const sourceSystemSchema = new mongoose.Schema(
  {
    systemId:    { type: String, required: true, unique: true, uppercase: true, trim: true },
    displayName: { type: String, required: true },
    description: String,
    contactEmail: String,
    // Is this system currently allowed to push events?
    active: { type: Boolean, default: true },
    // Expected event schema version this system sends
    schemaVersion: { type: String, default: 'v1' },
    // Optional webhook URL for bidirectional callbacks
    callbackUrl: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true, collection: 'source_systems' }
);

module.exports = mongoose.model('SourceSystem', sourceSystemSchema);
