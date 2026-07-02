const router = require('express').Router({ mergeParams: true });
const { v4: uuidv4 } = require('uuid');
const InboundEvent = require('../models/InboundEvent');
const DeadLetter = require('../models/DeadLetter');
const SyncStatusByEmail = require('../models/SyncStatusByEmail');
const { validateEmailDomain } = require('../utils/emailValidation');
const { toSafeString, toSafeSourceSystem, toSafeStatus } = require('../utils/sanitize');
const { ingestEvent } = require('../utils/ingestHelper');
const { writeAudit } = require('../utils/audit');
const { queryLimiter, ingestLimiter } = require('../middleware/rateLimiter');

/**
 * GET /api/v1/users/:email/sync-status
 * Returns the latest sync & provisioning summary for a user.
 */
router.get('/:email/sync-status', queryLimiter, async (req, res) => {
  const email = toSafeString(req.params.email);
  if (!email) return res.status(400).json({ error: 'Invalid email parameter' });
  const normalizedEmail = email.toLowerCase();
  const { valid, reason } = validateEmailDomain(normalizedEmail);
  if (!valid) return res.status(400).json({ error: reason });

  const doc = await SyncStatusByEmail.findById(normalizedEmail);
  if (!doc) {
    return res.status(404).json({ error: 'No sync status found for this user', email: normalizedEmail });
  }

  await writeAudit({
    correlationId: req.correlationId,
    actor: { type: 'api_client', apiKeyId: req.apiKeyId },
    action: 'query_sync_status',
    resource: { type: 'sync_status_by_email', email: normalizedEmail },
    outcome: 'success',
    httpStatus: 200,
  });

  return res.json(doc.toObject());
});

/**
 * GET /api/v1/users/:email/events
 * Returns event history for a user. Supports ?limit, ?sourceSystem, ?status, ?page.
 */
router.get('/:email/events', queryLimiter, async (req, res) => {
  const rawEmail = toSafeString(req.params.email);
  if (!rawEmail) return res.status(400).json({ error: 'Invalid email parameter' });
  const email = rawEmail.toLowerCase();
  const { valid, reason } = validateEmailDomain(email);
  if (!valid) return res.status(400).json({ error: reason });

  const limit  = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const page   = Math.max(parseInt(req.query.page  || '1',  10), 1);
  const skip   = (page - 1) * limit;

  // Sanitize filter inputs to prevent MongoDB query injection
  const filter = { 'identity.email': String(email) };
  const safeSourceSystem = toSafeSourceSystem(req.query.sourceSystem);
  const safeStatus = toSafeStatus(req.query.status);
  if (safeSourceSystem) filter.sourceSystem = safeSourceSystem;
  if (safeStatus)       filter.status = safeStatus;

  const [events, total] = await Promise.all([
    InboundEvent.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-rawPayload -__v'),
    InboundEvent.countDocuments(filter),
  ]);

  await writeAudit({
    correlationId: req.correlationId,
    actor: { type: 'api_client', apiKeyId: req.apiKeyId },
    action: 'query_user_events',
    resource: { type: 'inbound_event', email },
    outcome: 'success',
    httpStatus: 200,
    metadata: { total, returned: events.length },
  });

  return res.json({ email, total, page, limit, events });
});

/**
 * POST /api/v1/users/:email/replay
 * Replays the last failed/dead-letter event for a user (admin use).
 * Optionally accepts { eventId } in body to replay a specific event.
 */
router.post('/:email/replay', ingestLimiter, async (req, res) => {
  const rawEmail = toSafeString(req.params.email);
  if (!rawEmail) return res.status(400).json({ error: 'Invalid email parameter' });
  const email = rawEmail.toLowerCase();
  const { valid, reason } = validateEmailDomain(email);
  if (!valid) return res.status(400).json({ error: reason });

  let sourceEvent;

  // Sanitize eventId from body to a plain string
  const bodyEventId = toSafeString(req.body && req.body.eventId);

  if (bodyEventId) {
    sourceEvent = await InboundEvent.findOne({
      eventId: String(bodyEventId),
      'identity.email': String(email),
    });
    if (!sourceEvent) return res.status(404).json({ error: 'Event not found for this user', eventId: bodyEventId });
  } else {
    // Find the most recent dead_letter or failed event for this user
    sourceEvent = await InboundEvent.findOne(
      { 'identity.email': String(email), status: { $in: ['failed', 'dead_letter', 'validation_failed'] } },
      null,
      { sort: { createdAt: -1 } }
    );
    if (!sourceEvent) {
      return res.status(404).json({ error: 'No replayable event found for this user', email });
    }
  }

  // Update any dead_letter record as replaying
  await DeadLetter.findOneAndUpdate(
    { inboundEventId: sourceEvent.eventId },
    { $set: { status: 'replaying' } }
  );

  // Create a fresh event from the original raw payload
  const correlationId = req.correlationId;
  const idempotencyKey = `replay-${sourceEvent.eventId}-${Date.now()}`;

  const { event: replayEvent } = await ingestEvent(
    sourceEvent.rawPayload,
    sourceEvent.sourceSystem,
    correlationId,
    idempotencyKey,
    null
  );

  await DeadLetter.findOneAndUpdate(
    { inboundEventId: sourceEvent.eventId },
    { $set: { status: 'resolved', resolvedAt: new Date(), replayEventId: replayEvent.eventId } }
  );

  await writeAudit({
    correlationId,
    actor: { type: 'api_client', apiKeyId: req.apiKeyId },
    action: 'replay_event',
    resource: { type: 'inbound_event', id: sourceEvent.eventId, email },
    outcome: 'success',
    httpStatus: 202,
    metadata: { replayEventId: replayEvent.eventId },
  });

  return res.status(202).json({
    message: 'Replay initiated',
    originalEventId: sourceEvent.eventId,
    replayEventId: replayEvent.eventId,
    status: replayEvent.status,
    correlationId,
  });
});

module.exports = router;
