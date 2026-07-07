const router = require('express').Router();
const IdentityLink = require('../models/IdentityLink');
const InboundEvent = require('../models/InboundEvent');
const { validateEmailDomain } = require('../utils/emailValidation');
const { toSafeString } = require('../utils/sanitize');
const { writeAudit } = require('../utils/audit');
const { queryLimiter } = require('../middleware/rateLimiter');

const SERVICE_KEY_ALIASES = {
  'PEOPLE SOFT': 'PEOPLESOFT',
  'PEOPLE-SOFT': 'PEOPLESOFT',
  PEOPLE_SOFT: 'PEOPLESOFT',
};

const ENTITLEMENT_SCOPE_BY_SERVICE = {
  ECM: ['ECM'],
  CADS: ['CADS'],
  JSPM: ['JSPM'],
  PEOPLESOFT: ['PEOPLESOFT', 'SIS', 'FMS', 'HRMS'],
};

const ALLOW_ACTIONS = new Set(['provision', 'update', 'sync']);

function normalizeSystemKey(value) {
  const safe = toSafeString(value);
  if (!safe) return null;
  const upper = safe.toUpperCase();
  return SERVICE_KEY_ALIASES[upper] || upper;
}

function getEntitlementScope(serviceId) {
  return ENTITLEMENT_SCOPE_BY_SERVICE[serviceId] || [serviceId];
}

function isWithinValidityRange(entitlement, now = new Date()) {
  if (!entitlement) return false;
  const { validFrom, validUntil } = entitlement;
  const start = validFrom ? new Date(validFrom) : null;
  const end = validUntil ? new Date(validUntil) : null;
  if (start && Number.isNaN(start.getTime())) return false;
  if (end && Number.isNaN(end.getTime())) return false;
  if (start && start > now) return false;
  if (end && end < now) return false;
  return true;
}

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
  // Normalize serviceId to canonical key
  const rawServiceId = req.headers['service_id'] || req.headers['x-service-id'] || req.query.serviceId;
  const serviceId = normalizeSystemKey(rawServiceId);

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

  // Get the most recent successful event for this user that matches the requested service scope.
  const scope = getEntitlementScope(serviceId);
  const scopedEvent = await InboundEvent.findOne(
    {
      'identity.email': String(email),
      status: 'success',
      'entitlement.targetSystem': { $in: scope },
    },
    null,
    { sort: { createdAt: -1 } }
  );

  // Build access decision with strict service-scoped entitlement checks.
  const isActive = identity.lifecycleState === 'active';
  const entitlementAction = scopedEvent && scopedEvent.entitlement ? scopedEvent.entitlement.action : null;
  const hasScopedEntitlement = Boolean(scopedEvent && ALLOW_ACTIONS.has(entitlementAction));
  const entitlementIsValidNow = hasScopedEntitlement && isWithinValidityRange(scopedEvent.entitlement);
  const decision = isActive && entitlementIsValidNow ? 'ALLOW' : 'DENY';
  const attributes = scopedEvent
    ? {
        role: scopedEvent.entitlement.role || 'VIEWER',
        department: scopedEvent.entitlement.department,
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
      start: scopedEvent && scopedEvent.entitlement.validFrom ? scopedEvent.entitlement.validFrom : null,
      end:   scopedEvent && scopedEvent.entitlement.validUntil ? scopedEvent.entitlement.validUntil : null,
      isNowValid: entitlementIsValidNow,
    },
    attributes,
    sourceOfTruth: 'IAM_POC',
    sourceSystems: identity.sourceSystems,
    checkedAt: new Date().toISOString(),
    correlationId,
  });
});

module.exports = router;
