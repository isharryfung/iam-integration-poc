const router = require('express').Router();
const InboundEvent = require('../models/InboundEvent');
const { queryLimiter } = require('../middleware/rateLimiter');
const { writeAudit } = require('../utils/audit');
const { validateEmailDomain } = require('../utils/emailValidation');
const { toSafeString, toSafeSourceSystem } = require('../utils/sanitize');
const { buildPreviewResponse, MidpointTransformError } = require('../utils/midpointPreview');

function handleTransformError(res, error) {
  if (error instanceof MidpointTransformError) {
    return res.status(422).json({ error: 'Transform failed', detail: error.message });
  }
  throw error;
}

router.get('/preview', queryLimiter, async (req, res, next) => {
  try {
    const eventId = toSafeString(req.query.eventId);
    if (!eventId) return res.status(400).json({ error: 'eventId query parameter is required' });

    const event = await InboundEvent.findOne({ eventId });
    if (!event) return res.status(404).json({ error: 'Event not found', eventId });

    const preview = buildPreviewResponse(event);

    await writeAudit({
      correlationId: req.correlationId,
      actor: { type: 'api_client', apiKeyId: req.apiKeyId },
      action: 'query_midpoint_preview',
      resource: { type: 'inbound_event', id: eventId, email: preview.email },
      outcome: 'success',
      httpStatus: 200,
    });

    return res.json(preview);
  } catch (error) {
    try {
      return handleTransformError(res, error);
    } catch (unexpected) {
      return next(unexpected);
    }
  }
});

router.get('/preview/by-email', queryLimiter, async (req, res, next) => {
  try {
    const rawEmail = toSafeString(req.query.email);
    if (!rawEmail) return res.status(400).json({ error: 'email query parameter is required' });

    const email = rawEmail.toLowerCase();
    const { valid, reason } = validateEmailDomain(email);
    if (!valid) return res.status(400).json({ error: reason });

    if (req.query.sourceSystem && !toSafeSourceSystem(req.query.sourceSystem)) {
      return res.status(400).json({ error: 'Invalid sourceSystem query parameter' });
    }
    const eventId = toSafeString(req.query.eventId);
    const sourceSystem = toSafeSourceSystem(req.query.sourceSystem);
    const latest = String(req.query.latest || 'true').toLowerCase() !== 'false';

    const filter = { 'identity.email': email };
    if (eventId) filter.eventId = eventId;
    if (sourceSystem) filter.sourceSystem = sourceSystem;

    const event = await InboundEvent.findOne(filter).sort(eventId ? {} : { createdAt: latest ? -1 : 1 });
    if (!event) {
      return res.status(404).json({ error: 'Event not found for this user', email, eventId: eventId || undefined });
    }

    const preview = buildPreviewResponse(event);

    await writeAudit({
      correlationId: req.correlationId,
      actor: { type: 'api_client', apiKeyId: req.apiKeyId },
      action: 'query_midpoint_preview_by_email',
      resource: { type: 'inbound_event', id: event.eventId, email },
      outcome: 'success',
      httpStatus: 200,
    });

    return res.json(preview);
  } catch (error) {
    try {
      return handleTransformError(res, error);
    } catch (unexpected) {
      return next(unexpected);
    }
  }
});

router.get('/events', queryLimiter, async (req, res) => {
  const rawEmail = toSafeString(req.query.email);
  const eventId = toSafeString(req.query.eventId);
  if (req.query.sourceSystem && !toSafeSourceSystem(req.query.sourceSystem)) {
    return res.status(400).json({ error: 'Invalid sourceSystem query parameter' });
  }
  const sourceSystem = toSafeSourceSystem(req.query.sourceSystem);
  const rawLimit = parseInt(req.query.limit || '20', 10);
  if (Number.isNaN(rawLimit) || rawLimit < 1) {
    return res.status(400).json({ error: 'limit query parameter must be a positive integer' });
  }
  const limit = Math.min(rawLimit, 100);

  if (rawEmail) {
    const { valid, reason } = validateEmailDomain(rawEmail.toLowerCase());
    if (!valid) return res.status(400).json({ error: reason });
  }

  const filter = {};
  if (rawEmail) filter['identity.email'] = rawEmail.toLowerCase();
  if (eventId) filter.eventId = eventId;
  if (sourceSystem) filter.sourceSystem = sourceSystem;

  const [events, total] = await Promise.all([
    InboundEvent.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('eventId sourceSystem status identity.email entitlement.action entitlement.role createdAt processedAt'),
    InboundEvent.countDocuments(filter),
  ]);

  await writeAudit({
    correlationId: req.correlationId,
    actor: { type: 'api_client', apiKeyId: req.apiKeyId },
    action: 'query_midpoint_events',
    resource: { type: 'inbound_event', email: rawEmail ? rawEmail.toLowerCase() : undefined },
    outcome: 'success',
    httpStatus: 200,
    metadata: { total, returned: events.length, sourceSystem: sourceSystem || 'ALL' },
  });

  return res.json({
    total,
    limit,
    events: events.map((event) => ({
      eventId: event.eventId,
      sourceSystem: event.sourceSystem,
      email: event.identity && event.identity.email,
      status: event.status,
      action: event.entitlement && event.entitlement.action,
      role: event.entitlement && event.entitlement.role,
      receivedAt: event.createdAt,
      processedAt: event.processedAt,
    })),
  });
});

module.exports = router;
