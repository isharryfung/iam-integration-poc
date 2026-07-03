const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const InboundEvent = require('../models/InboundEvent');
const IngestionJob = require('../models/IngestionJob');
const { ingestEvent } = require('../utils/ingestHelper');
const { transformPeoplesoftRow } = require('../transformers/peoplesoft.transformer');
const { writeAudit } = require('../utils/audit');
const { ingestLimiter, queryLimiter } = require('../middleware/rateLimiter');
const { transformCadsRow, cadsIdentifierKeys } = require('../transformers/cads.transformer');
const { buildEcmCombinedPayloads } = require('../transformers/ecm.transformer');

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

/**
 * POST /api/v1/inbound/peoplesoft/preview
 * Returns transformed canonical payload preview without ingesting.
 */
router.post('/peoplesoft/preview', queryLimiter, async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  const transformed = transformPeoplesoftRow(req.body || {}, {
    correlationId: req.correlationId,
    idempotencyKey,
  });

  return res.json({
    sourceSystem: 'PEOPLESOFT',
    isValid: transformed.isValid,
    errors: transformed.errors,
    mappedPayload: transformed.payload,
  });
});

/**
 * POST /api/v1/inbound/ecm/preview
 * Merges ECM usergroup-user + usergroup-doctype rows into combined canonical
 * payloads (one per user) and returns them without persisting anything.
 *
 * Request body:
 *   { membershipRows: [...], groupItemRows: [...] }
 * or a pre-built combined canonical ECM payload:
 *   { meta: { sourceSystem: 'ECM', operation: 'UPSERT_USER_EFFECTIVE_ACCESS' }, ... }
 */
router.post('/ecm/preview', queryLimiter, async (req, res) => {
  const body = req.body || {};

  // Accept a pre-built combined canonical payload directly
  if (body.meta && body.meta.sourceSystem === 'ECM') {
    return res.json({
      sourceSystem: 'ECM',
      isValid: true,
      errors: [],
      combined: [{ username: (body.identity && body.identity.externalUserId) || 'unknown', isValid: true, errors: [], diagnostics: [], payload: body }],
    });
  }

  const membershipRows = body.membershipRows;
  const groupItemRows  = body.groupItemRows;

  if (!Array.isArray(membershipRows) || !Array.isArray(groupItemRows)) {
    return res.status(400).json({
      error: 'Request body must contain "membershipRows" and "groupItemRows" arrays, or a pre-built ECM canonical payload',
    });
  }

  if (membershipRows.length === 0 && groupItemRows.length === 0) {
    return res.status(400).json({ error: '"membershipRows" or "groupItemRows" must be non-empty' });
  }

  const { combined, diagnostics } = buildEcmCombinedPayloads(membershipRows, groupItemRows, {
    correlationId: req.correlationId,
  });

  const allValid = combined.every(r => r.isValid);

  return res.json({
    sourceSystem: 'ECM',
    isValid: allValid,
    errors: allValid ? [] : combined.filter(r => !r.isValid).map(r => `${r.username}: ${r.errors.join('; ')}`),
    diagnostics,
    combined,
  });
});

// ── Source-specific alias routes (all route to the same ingest handler) ──────
router.post('/cads',       ingestLimiter, setSource('CADS'),       handleCadsIngest);
router.post('/peoplesoft', ingestLimiter, setSource('PEOPLESOFT'), handleSingleIngest);
router.post('/ecm',        ingestLimiter, setSource('ECM'),        handleSingleIngest);
router.post('/jspm',       ingestLimiter, setSource('JSPM'),       handleSingleIngest);

/**
 * POST /api/v1/inbound/cads/transform
 * Dry-run: transform a raw CADS table row into canonical JSON without persisting.
 * Returns { isValid, errors, payload } so callers can preview the mapping.
 */
router.post('/cads/transform', ingestLimiter, async (req, res) => {
  const row = req.body;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return res.status(400).json({ error: 'Request body must be a JSON object (CADS row)' });
  }

  const result = transformCadsRow(row, {
    correlationId: req.correlationId,
  });

  if (!result.isValid) {
    return res.status(422).json({
      error: 'CADS row failed validation',
      isValid: false,
      errors: result.errors,
      payload: result.payload,
    });
  }

  return res.status(200).json({
    isValid: true,
    errors: [],
    payload: result.payload,
  });
});

function setSource(system) {
  return (req, _res, next) => {
    req.headers['x-source-system'] = system;
    next();
  };
}

/**
 * Detect whether a request body looks like a raw CADS table row
 * (has CADS-specific column headers) rather than a canonical JSON payload.
 * Canonical payloads have top-level `meta`, `identity`, or `entitlement` keys.
 *
 * Requires at least two of the core CADS column markers (from cadsIdentifierKeys)
 * to reduce false-positive risk from generic payloads.
 */
function isCadsRawRow(body) {
  if (!body || typeof body !== 'object') return false;
  if (body.meta || body.identity || body.entitlement) return false;
  const normalizedKeys = Object.keys(body).map((k) => String(k).trim());
  const hits = cadsIdentifierKeys.filter((marker) => normalizedKeys.includes(marker));
  return hits.length >= 2;
}

/**
 * CADS-specific ingestion handler.
 * Accepts either:
 *   a) Raw CADS table row  → transformed via transformCadsRow before ingest.
 *   b) Canonical JSON      → passed through unchanged (same as handleSingleIngest).
 */
async function handleCadsIngest(req, res) {
  const start = Date.now();
  const correlationId = req.correlationId;
  const sourceSystem = req.headers['x-source-system'];
  const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  const jobId = uuidv4();

  let body = req.body;

  // Transform raw CADS row into canonical payload before ingesting
  if (isCadsRawRow(body)) {
    const transformed = transformCadsRow(body, {
      correlationId,
    });

    if (!transformed.isValid) {
      return res.status(422).json({
        error: 'CADS row failed transformation validation',
        errors: transformed.errors,
      });
    }

    // Use canonical payload for ingest; prefer transformer-generated idempotency key
    body = transformed.payload;
  }

  const job = await IngestionJob.create({
    jobId,
    jobType: 'single',
    sourceSystem,
    correlationId,
    idempotencyKey,
    // Store the original request body (raw row or canonical) for audit/replay traceability.
    // The InboundEvent will store the canonical payload that was actually processed.
    rawPayload: req.body,
  });

  const { event, duplicate } = await ingestEvent(body, sourceSystem, correlationId, idempotencyKey, jobId);

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
