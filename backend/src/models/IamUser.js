const mongoose = require('mongoose');

/**
 * iam_users – mock IAM user registry for the POC.
 * Stores user identity details and their current role assignments (permissions).
 */
const iamUserSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    emplid: { type: String, trim: true },
    department: { type: String, trim: true },
    jobcode: { type: String, trim: true },
    roles: { type: [String], default: [] },
    lifecycleState: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
    },
  },
  { timestamps: true, collection: 'iam_users' }
);

module.exports = mongoose.model('IamUser', iamUserSchema);
