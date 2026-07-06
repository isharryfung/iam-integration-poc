/**
 * IAM User management routes (mock).
 *
 * GET  /api/iam/users               – list all IAM users
 * GET  /api/iam/users/:userId        – get a single user (details + roles)
 * PUT  /api/iam/users/:userId/permissions – replace user's roles (add/remove)
 * GET  /api/iam/users/:userId/reporting-line?action=<action>
 *                                   – get mock reporting-line approvers for a user + action
 */
const router = require('express').Router();
const IamUser = require('../models/IamUser');
const { toSafeString } = require('../utils/sanitize');
const { writeAudit } = require('../utils/audit');
const { queryLimiter, ingestLimiter } = require('../middleware/rateLimiter');

// ── Mock reporting-line data ─────────────────────────────────────────────────
// For the POC the real Reporting Line service may not be available, so we
// return realistic static mock data keyed by action.

const MOCK_REPORTING_LINE = {
  annual_leave: (user) => ({
    approvers: [
      {
        emplid: '80010001',
        email: 'direct.manager@ust.hk',
        name: 'Direct Manager',
        role: 'primary_approver',
        level: 1,
        source: 'reporting_line',
      },
      {
        emplid: '80010050',
        email: 'hr.officer@ust.hk',
        name: 'HR Officer',
        role: 'secondary_approver',
        level: 2,
        source: 'action_config',
      },
    ],
    audit: {
      ruleId: 'ANNUAL_LEAVE_RULE_V2',
      ruleVersion: '2.1.0',
      orgSnapshotId: `ORG_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_080000`,
    },
  }),
  sick_leave: (user) => ({
    approvers: [
      {
        emplid: '80010001',
        email: 'direct.manager@ust.hk',
        name: 'Direct Manager',
        role: 'primary_approver',
        level: 1,
        source: 'reporting_line',
      },
    ],
    audit: {
      ruleId: 'SICK_LEAVE_RULE_V1',
      ruleVersion: '1.0.0',
      orgSnapshotId: `ORG_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_080000`,
    },
  }),
  epdr: (user) => ({
    approvers: [
      {
        emplid: '80010001',
        email: 'direct.manager@ust.hk',
        name: 'Direct Manager',
        role: 'primary_approver',
        level: 1,
        source: 'reporting_line',
      },
      {
        emplid: '80010088',
        email: 'division.head@ust.hk',
        name: 'Division Head',
        role: 'secondary_approver',
        level: 2,
        source: 'action_config',
      },
    ],
    audit: {
      ruleId: 'EPDR_RULE_V3',
      ruleVersion: '3.2.0',
      orgSnapshotId: `ORG_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_080000`,
    },
  }),
};

function getMockReportingLine(user, action) {
  const factory = MOCK_REPORTING_LINE[action];
  if (factory) return factory(user);
  // Unknown action — return empty approvers (matches real API contract)
  return {
    approvers: [],
    audit: {
      ruleId: 'DEFAULT_FALLBACK',
      ruleVersion: '1.0.0',
      orgSnapshotId: `ORG_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_080000`,
    },
  };
}

// ── GET /api/iam/users ──────────────────────────────────────────────────────

/**
 * Returns all IAM users (summary fields only).
 */
router.get('/', queryLimiter, async (req, res) => {
  const users = await IamUser.find({})
    .select('userId displayName email department jobcode roles lifecycleState')
    .sort({ displayName: 1 })
    .lean();

  await writeAudit({
    correlationId: req.correlationId,
    actor: { type: 'api_client', apiKeyId: req.apiKeyId },
    action: 'list_iam_users',
    resource: { type: 'iam_user' },
    outcome: 'success',
    httpStatus: 200,
    metadata: { count: users.length },
  });

  return res.json({ users, total: users.length });
});

// ── GET /api/iam/users/:userId ───────────────────────────────────────────────

/**
 * Returns full details for a single IAM user.
 */
router.get('/:userId', queryLimiter, async (req, res) => {
  const userId = toSafeString(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid userId parameter' });

  const user = await IamUser.findOne({ userId: String(userId) }).lean();
  if (!user) return res.status(404).json({ error: 'User not found', userId });

  await writeAudit({
    correlationId: req.correlationId,
    actor: { type: 'api_client', apiKeyId: req.apiKeyId },
    action: 'get_iam_user',
    resource: { type: 'iam_user', userId },
    outcome: 'success',
    httpStatus: 200,
  });

  return res.json(user);
});

// ── PUT /api/iam/users/:userId/permissions ───────────────────────────────────

/**
 * Replaces the user's roles array.
 * Body: { roles: string[] }
 * Only the roles field is updated; other fields are untouched.
 */
router.put('/:userId/permissions', ingestLimiter, async (req, res) => {
  const userId = toSafeString(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid userId parameter' });

  const { roles } = req.body || {};

  if (!Array.isArray(roles)) {
    return res.status(400).json({ error: 'roles must be an array of strings' });
  }

  // Sanitize: ensure every entry is a non-empty string
  const sanitizedRoles = roles
    .map((r) => toSafeString(String(r)))
    .filter(Boolean);

  const user = await IamUser.findOneAndUpdate(
    { userId: String(userId) },
    { $set: { roles: sanitizedRoles } },
    { new: true, runValidators: true }
  ).lean();

  if (!user) return res.status(404).json({ error: 'User not found', userId });

  await writeAudit({
    correlationId: req.correlationId,
    actor: { type: 'api_client', apiKeyId: req.apiKeyId },
    action: 'update_iam_user_permissions',
    resource: { type: 'iam_user', userId },
    outcome: 'success',
    httpStatus: 200,
    metadata: { roles: sanitizedRoles },
  });

  return res.json({ userId, roles: user.roles, updatedAt: user.updatedAt });
});

// ── GET /api/iam/users/:userId/reporting-line ────────────────────────────────

/**
 * Returns the mock reporting-line (approver chain) for a user + action.
 * Query param: action (required)
 */
router.get('/:userId/reporting-line', queryLimiter, async (req, res) => {
  const userId = toSafeString(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid userId parameter' });

  const action = toSafeString(req.query.action);
  if (!action) return res.status(400).json({ error: 'action query parameter is required' });

  const user = await IamUser.findOne({ userId: String(userId) }).lean();
  if (!user) return res.status(404).json({ error: 'User not found', userId });

  const { approvers, audit } = getMockReportingLine(user, action);

  await writeAudit({
    correlationId: req.correlationId,
    actor: { type: 'api_client', apiKeyId: req.apiKeyId },
    action: 'get_reporting_line',
    resource: { type: 'iam_user', userId },
    outcome: 'success',
    httpStatus: 200,
    metadata: { action, approverCount: approvers.length },
  });

  return res.json({
    userId,
    action,
    requester: { emplid: user.emplid || null, email: user.email },
    resolvedAt: new Date().toISOString(),
    approvers,
    audit,
  });
});

module.exports = router;
// Exported for testing
module.exports._getMockReportingLine = getMockReportingLine;
