const router = require('express').Router({ mergeParams: true });
const { v4: uuidv4 } = require('uuid');
const InboundEvent = require('../models/InboundEvent');
const DeadLetter = require('../models/DeadLetter');
const SyncStatusByEmail = require('../models/SyncStatusByEmail');
const { validateEmailDomain } = require('../utils/emailValidation');
const { ingestEvent } = require('../utils/ingestHelper');
const { writeAudit } = require('../utils/audit');

/**
 * GET /api/v1/users/:email/sync-status
 * Returns the latest sync & provisioning summary for a user.
 */
router.get('/:email/sync-status', async (req, res) => {
  const email = req.params.email.toLowerCase().trim();
  const { valid, reason } = validateEmailDomain(email);
  if (!valid) return res.status(400).json({ error: reason });

  const doc = await SyncStatusByEmail.findById(email);
  if (!doc) {
    return res.status(404).json({ error: 'No sync status found for this user', email });
  }

  await writeAudit({
    correlationId: req.correlationId,
    actor: { type: 'api_client', apiKeyId: req.apiKeyId },
    action: 'query_sync_status',
    resource: { type: 'sync_status_by_email', email },
    outcome: 'success',
    httpStatus: 200,
  });

  return res.json(doc.toObject());
});

/**
 * GET /api/v1/users/:email/events
 * Returns event history for a user. Supports ?limit, ?sourceSystem, ?status, ?page.
 */
router.get('/:email/events', async (req, res) => {
  const email = req.params.email.toLowerCase().trim();
  const { valid, reason } = validateEmailDomain(email);
  if (!valid) return res.status(400).json({ error: reason });

  const limit  = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const page   = Math.max(parseInt(req.query.page  || '1',  10), 1);
  const skip   = (page - 1) * limit;

  const filter = { 'identity.email': email };
  if (req.query.sourceSystem) filter.sourceSystem = req.query.sourceSystem.toUpperCase();
  if (req.query.status)       filter.status = req.query.status;

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
router.post('/:email/replay', async (req, res) => {
  const email = req.params.email.toLowerCase().trim();
  const { valid, reason } = validateEmailDomain(email);
  if (!valid) return res.status(400).json({ error: reason });

  let sourceEvent;

  if (req.body.eventId) {
    sourceEvent = await InboundEvent.findOne({ eventId: req.body.eventId, 'identity.email': email });
    if (!sourceEvent) return res.status(404).json({ error: 'Event not found for this user', eventId: req.body.eventId });
  } else {
    // Find the most recent dead_letter or failed event for this user
    sourceEvent = await InboundEvent.findOne(
      { 'identity.email': email, status: { $in: ['failed', 'dead_letter', 'validation_failed'] } },
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
