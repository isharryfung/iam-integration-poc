const router = require('express').Router();
const IdentityLink = require('../models/IdentityLink');
const InboundEvent = require('../models/InboundEvent');
const { validateEmailDomain } = require('../utils/emailValidation');
const { toSafeString } = require('../utils/sanitize');
const { writeAudit } = require('../utils/audit');
const { queryLimiter } = require('../middleware/rateLimiter');

/**
 * GET /user/access
 * GET /user/access?email={email}
 *
 * Real-time access decision endpoint.
 * Headers: api_key (required), service_id (required), x-user-email (used if no ?email param)
 */
router.get('/access', queryLimiter, async (req, res) => {
  const start = Date.now();
  const correlationId = req.correlationId;
  // Sanitize serviceId to a plain string
  const rawServiceId = req.headers['service_id'] || req.headers['x-service-id'] || req.query.serviceId;
  const serviceId = toSafeString(rawServiceId);

  if (!serviceId) {
    return res.status(400).json({ error: 'Missing service_id header or query parameter' });
  }

  // Resolve email: query param > header — sanitize to plain string
  const rawEmail = toSafeString(req.query.email || req.headers['x-user-email'] || '');
  const email = rawEmail ? rawEmail.toLowerCase() : null;
  if (!email) {
    return res.status(400).json({ error: 'Missing email (provide ?email= or x-user-email header)' });
  }

  const { valid, reason } = validateEmailDomain(email);
  if (!valid) return res.status(400).json({ error: reason });

  // Look up the identity link for this user — use String() to prevent injection
  const identity = await IdentityLink.findOne({ canonicalEmail: String(email) });
  if (!identity) {
    return res.status(404).json({ error: 'User not found in IAM system', email });
  }

  // Get the most recent successful event for this user (provides role/department attributes)
  const lastEvent = await InboundEvent.findOne(
    { 'identity.email': String(email), status: 'success' },
    null,
    { sort: { createdAt: -1 } }
  );

  // Build access decision (POC: allow all active users in the system)
  const isActive = identity.lifecycleState === 'active';
  const decision = isActive ? 'ALLOW' : 'DENY';
  const attributes = lastEvent
    ? {
        role: lastEvent.entitlement.role || 'VIEWER',
        department: lastEvent.entitlement.department,
        dataSecurityLevel: 'L1', // POC default
      }
    : {};

  await writeAudit({
    correlationId,
    actor: { type: 'api_client', apiKeyId: req.apiKeyId, serviceId },
    action: 'query_access',
    resource: { type: 'identity_link', email },
    outcome: 'success',
    httpStatus: 200,
    durationMs: Date.now() - start,
  });

  return res.json({
    email,
    serviceId,
    decision,
    status: identity.lifecycleState.toUpperCase(),
    validity: {
      start: lastEvent && lastEvent.entitlement.validFrom ? lastEvent.entitlement.validFrom : null,
      end:   lastEvent && lastEvent.entitlement.validUntil ? lastEvent.entitlement.validUntil : null,
      isNowValid: isActive,
    },
    attributes,
    sourceOfTruth: 'IAM_POC',
    sourceSystems: identity.sourceSystems,
    checkedAt: new Date().toISOString(),
    correlationId,
  });
});

module.exports = router;
