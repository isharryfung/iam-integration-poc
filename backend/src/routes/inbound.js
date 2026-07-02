const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const InboundEvent = require('../models/InboundEvent');
const IngestionJob = require('../models/IngestionJob');
const { ingestEvent } = require('../utils/ingestHelper');
const { writeAudit } = require('../utils/audit');
const { ingestLimiter, queryLimiter } = require('../middleware/rateLimiter');

/**
 * POST /api/v1/inbound/events
 * Unified single-event ingestion for CADS / PeopleSoft / ECM / JSPM.
 */
router.post('/events', ingestLimiter, async (req, res) => {
  const start = Date.now();
  const correlationId = req.correlationId;
  const sourceSystem = (req.headers['x-source-system'] || req.body.sourceSystem || 'UNKNOWN').toUpperCase();
  const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  const jobId = uuidv4();

  // Create a tracking job
  const job = await IngestionJob.create({
    jobId,
    jobType: 'single',
    sourceSystem,
    correlationId,
    idempotencyKey,
    rawPayload: req.body,
  });

  try {
    const { event, duplicate } = await ingestEvent(
      req.body,
      sourceSystem,
      correlationId,
      idempotencyKey,
      jobId
    );

    await IngestionJob.findByIdAndUpdate(job._id, {
      $set: {
        status: duplicate ? 'done' : 'done',
        acceptedEvents: 1,
        eventIds: [event.eventId],
        completedAt: new Date(),
      },
    });

    await writeAudit({
      correlationId,
      actor: { type: 'api_client', apiKeyId: req.apiKeyId },
      action: 'ingest_event',
      resource: { type: 'inbound_event', id: event.eventId, email: event.identity && event.identity.email },
      outcome: 'success',
      httpStatus: duplicate ? 200 : 202,
      durationMs: Date.now() - start,
    });

    if (duplicate) {
      return res.status(200).json({
        message: 'Duplicate event — already processed',
        eventId: event.eventId,
        status: event.status,
        correlationId,
      });
    }

    return res.status(202).json({
      message: 'Event accepted',
      eventId: event.eventId,
      jobId,
      status: event.status,
      correlationId,
    });
  } catch (err) {
    await IngestionJob.findByIdAndUpdate(job._id, {
      $set: { status: 'failed', completedAt: new Date() },
    });
    await writeAudit({
      correlationId,
      actor: { type: 'api_client', apiKeyId: req.apiKeyId },
      action: 'ingest_event',
      resource: { type: 'inbound_event' },
      outcome: 'failure',
      httpStatus: 500,
      errorDetail: err.message,
      durationMs: Date.now() - start,
    });
    throw err;
  }
});

/**
 * POST /api/v1/inbound/events:batch
 * Batch ingestion — accepts { events: [...] }.
 */
router.post('/events\\:batch', ingestLimiter, async (req, res) => {
  const start = Date.now();
  const correlationId = req.correlationId;
  const sourceSystem = (req.headers['x-source-system'] || req.body.sourceSystem || 'UNKNOWN').toUpperCase();
  const events = req.body.events;

  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'Body must contain a non-empty "events" array' });
  }

  const jobId = uuidv4();
  const job = await IngestionJob.create({
    jobId,
    jobType: 'batch',
    sourceSystem,
    correlationId,
    totalEvents: events.length,
    rawPayload: req.body,
  });

  const accepted = [];
  const rejected = [];

  for (let i = 0; i < events.length; i++) {
    const raw = events[i];
    const idempotencyKey = raw._idempotencyKey;
    try {
      const { event, duplicate } = await ingestEvent(raw, sourceSystem, correlationId, idempotencyKey, jobId);
      accepted.push({ index: i, eventId: event.eventId, duplicate });
    } catch (err) {
      rejected.push({ index: i, reason: err.message });
    }
  }

  await IngestionJob.findByIdAndUpdate(job._id, {
    $set: {
      status: rejected.length > 0 ? 'partial_failure' : 'done',
      acceptedEvents: accepted.length,
      rejectedEvents: rejected.length,
      eventIds: accepted.map((a) => a.eventId),
      errors: rejected,
      completedAt: new Date(),
    },
  });

  await writeAudit({
    correlationId,
    actor: { type: 'api_client', apiKeyId: req.apiKeyId },
    action: 'ingest_batch',
    resource: { type: 'ingestion_job', id: jobId },
    outcome: rejected.length === events.length ? 'failure' : rejected.length > 0 ? 'partial' : 'success',
    httpStatus: 202,
    durationMs: Date.now() - start,
    metadata: { total: events.length, accepted: accepted.length, rejected: rejected.length },
  });

  return res.status(202).json({
    message: 'Batch accepted',
    jobId,
    correlationId,
    summary: { total: events.length, accepted: accepted.length, rejected: rejected.length },
    accepted,
    rejected,
  });
});

/**
 * GET /api/v1/inbound/events/:eventId/status
 * Returns the current processing status of a single event.
 */
router.get('/events/:eventId/status', queryLimiter, async (req, res) => {
  // Sanitize eventId to a plain string to prevent query injection
  const eventId = typeof req.params.eventId === 'string' ? req.params.eventId.trim() : null;
  if (!eventId) {
    return res.status(400).json({ error: 'Invalid eventId' });
  }
  const event = await InboundEvent.findOne({ eventId: String(eventId) });
  if (!event) {
    return res.status(404).json({ error: 'Event not found', eventId });
  }

  await writeAudit({
    correlationId: req.correlationId,
    actor: { type: 'api_client', apiKeyId: req.apiKeyId },
    action: 'query_event_status',
    resource: { type: 'inbound_event', id: eventId },
    outcome: 'success',
    httpStatus: 200,
  });

  return res.json({
    eventId: event.eventId,
    jobId: event.jobId,
    sourceSystem: event.sourceSystem,
    status: event.status,
    correlationId: event.correlationId,
    identity: event.identity,
    validationErrors: event.validationErrors,
    retryCount: event.retryCount,
    lastError: event.lastError,
    receivedAt: event.createdAt,
    processedAt: event.processedAt,
  });
});

// ── Source-specific alias routes (all route to the same ingest handler) ──────
router.post('/cads',       ingestLimiter, setSource('CADS'),       handleSingleIngest);
router.post('/peoplesoft', ingestLimiter, setSource('PEOPLESOFT'), handleSingleIngest);
router.post('/ecm',        ingestLimiter, setSource('ECM'),        handleSingleIngest);
router.post('/jspm',       ingestLimiter, setSource('JSPM'),       handleSingleIngest);

function setSource(system) {
  return (req, _res, next) => {
    req.headers['x-source-system'] = system;
    next();
  };
}

async function handleSingleIngest(req, res) {
  const start = Date.now();
  const correlationId = req.correlationId;
  const sourceSystem = req.headers['x-source-system'];
  const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  const jobId = uuidv4();

  const job = await IngestionJob.create({
    jobId,
    jobType: 'single',
    sourceSystem,
    correlationId,
    idempotencyKey,
    rawPayload: req.body,
  });

  const { event, duplicate } = await ingestEvent(req.body, sourceSystem, correlationId, idempotencyKey, jobId);

  await IngestionJob.findByIdAndUpdate(job._id, {
    $set: { status: 'done', acceptedEvents: 1, eventIds: [event.eventId], completedAt: new Date() },
  });

  await writeAudit({
    correlationId,
    actor: { type: 'api_client', apiKeyId: req.apiKeyId },
    action: 'ingest_event',
    resource: { type: 'inbound_event', id: event.eventId, email: event.identity && event.identity.email },
    outcome: 'success',
    httpStatus: duplicate ? 200 : 202,
    durationMs: Date.now() - start,
  });

  return res.status(duplicate ? 200 : 202).json({
    message: duplicate ? 'Duplicate event — already processed' : 'Event accepted',
    eventId: event.eventId,
    jobId,
    status: event.status,
    correlationId,
  });
}

module.exports = router;
