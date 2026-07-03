const mongoose = require('mongoose');

/**
 * identity_links – maps the same real-world person across different source system IDs.
 * Enables cross-system identity correlation.
 */
const identityLinkSchema = new mongoose.Schema(
  {
    // Primary canonical key
    canonicalEmail: { type: String, required: true, unique: true, lowercase: true, trim: true },
    emailDomain:    String,
    userType:       { type: String, enum: ['staff', 'student', 'family', 'contractor', 'system', 'unknown'], default: 'unknown' },
    displayName:    String,

    // Cross-system identifiers
    identifiers: {
      cadsEmployeeId: String,
      psEmplid:       String,    // PeopleSoft Emplid (common across SIS/FMS/HRMS)
      ecmUserId:      String,
      jspmUserId:     String,
      midpointOid:    String,    // MidPoint object OID once provisioned
      ldapDn:         String,
    },

    // Current lifecycle state
    lifecycleState: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'deleted'],
      default: 'active',
    },

    // Which source systems have contributed to this identity
    sourceSystems: [String],

    lastSeenAt:   Date,
    metadata:     mongoose.Schema.Types.Mixed,
  },
  { timestamps: true, collection: 'identity_links' }
);

module.exports = mongoose.model('IdentityLink', identityLinkSchema);
