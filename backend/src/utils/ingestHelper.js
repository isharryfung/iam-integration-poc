const { v4: uuidv4 } = require('uuid');
const InboundEvent = require('../models/InboundEvent');
const IngestionJob = require('../models/IngestionJob');
const IdentityLink = require('../models/IdentityLink');
const { validateEmailDomain, extractDomain } = require('./emailValidation');
const { refreshSyncStatus } = require('./syncStatus');

/**
 * Map raw source payload into an InboundEvent document.
 * Handles CADS, PeopleSoft (SIS/FMS/HRMS), ECM, JSPM payloads.
 */
function normalizePayload(raw, sourceSystem, correlationId, idempotencyKey) {
  const src = sourceSystem.toUpperCase();

  // --- Common identity extraction (best-effort per source) ---
  let email, displayName, staffId, studentId, userType;
  let cadsEmployeeId, cadsOrgUnit;
  let psModule, psRecordType, psEmplid;
  let ecmUserId, ecmDocumentClass;
  let jspmProjectCode, jspmRole;
  let action = 'sync';
  let role, department, targetSystem, validFrom, validUntil;

  if (src === 'CADS') {
    email       = raw.email || raw.employeeEmail;
    displayName = raw.displayName || raw.name || raw.employeeName;
    staffId     = raw.employeeId || raw.staffId;
    userType    = 'staff';
    cadsEmployeeId = raw.employeeId;
    cadsOrgUnit    = raw.orgUnit || raw.department;
    action      = raw.action || 'sync';
    role        = raw.role || raw.jobTitle;
    department  = raw.department || raw.orgUnit;
    targetSystem = 'CADS';
  } else if (src === 'PEOPLESOFT') {
    // PeopleSoft can be SIS (student), FMS (finance), HRMS (HR)
    psModule    = (raw.module || raw.psModule || 'UNKNOWN').toUpperCase();
    psRecordType = raw.recordType;
    psEmplid    = raw.emplid || raw.employeeId;
    email       = raw.email || raw.emailAddress;
    displayName = raw.name || raw.displayName;
    staffId     = ['FMS', 'HRMS'].includes(psModule) ? psEmplid : undefined;
    studentId   = psModule === 'SIS' ? raw.studentId || psEmplid : undefined;
    userType    = psModule === 'SIS' ? 'student' : 'staff';
    action      = raw.action || 'sync';
    role        = raw.role || raw.jobCode;
    department  = raw.department || raw.deptId;
    targetSystem = 'PEOPLESOFT';
  } else if (src === 'ECM') {
    ecmUserId       = raw.userId || raw.ecmUserId;
    ecmDocumentClass = raw.documentClass;
    email           = raw.email || raw.userEmail;
    displayName     = raw.displayName || raw.userName;
    userType        = 'staff';
    action          = raw.action || 'provision';
    role            = raw.role || raw.accessLevel;
    targetSystem    = 'ECM';
  } else if (src === 'JSPM') {
    jspmProjectCode = raw.projectCode;
    jspmRole        = raw.projectRole;
    email           = raw.email || raw.userEmail;
    displayName     = raw.displayName || raw.userName;
    userType        = 'staff';
    action          = raw.action || 'assign';
    role            = raw.projectRole;
    targetSystem    = 'JSPM';
  }

  // Normalise action enum
  const validActions = ['provision', 'deprovision', 'update', 'sync', 'unknown'];
  if (!validActions.includes(action)) action = 'sync';

  const emailDomain = extractDomain(email);

  return {
    eventId:       uuidv4(),
    sourceSystem:  src,
    correlationId,
    idempotencyKey,
    identity: {
      email:       email ? email.toLowerCase().trim() : undefined,
      emailDomain: emailDomain || undefined,
      staffId,
      studentId,
      displayName,
      userType,
    },
    entitlement: {
      action,
      targetSystem,
      role,
      department,
      validFrom:   raw.validFrom  ? new Date(raw.validFrom)  : undefined,
      validUntil:  raw.validUntil ? new Date(raw.validUntil) : undefined,
    },
    sourceData: {
      cadsEmployeeId, cadsOrgUnit,
      psModule, psRecordType, psEmplid,
      ecmUserId, ecmDocumentClass,
      jspmProjectCode, jspmRole,
    },
    rawPayload: raw,
    status: 'received',
  };
}

/**
 * Validate a normalized event and return validation errors (if any).
 */
function validateEvent(normalized) {
  const errors = [];
  if (!normalized.identity.email) {
    errors.push('Missing email in payload');
  } else {
    const { valid, reason } = validateEmailDomain(normalized.identity.email);
    if (!valid) errors.push(reason);
  }
  if (!normalized.sourceSystem) errors.push('Missing sourceSystem');
  return errors;
}

/**
 * Main ingest handler — normalises, validates, persists, updates sync status.
 * Returns the saved InboundEvent document.
 */
async function ingestEvent(raw, sourceSystem, correlationId, idempotencyKey, jobId) {
  // Idempotency check — coerce to string to prevent MongoDB query injection
  if (idempotencyKey) {
    const safeKey = typeof idempotencyKey === 'string' ? idempotencyKey : String(idempotencyKey);
    const existing = await InboundEvent.findOne({ idempotencyKey: safeKey });
    if (existing) {
      return { event: existing, duplicate: true };
    }
  }

  const normalized = normalizePayload(raw, sourceSystem, correlationId, idempotencyKey);
  normalized.jobId = jobId;

  const validationErrors = validateEvent(normalized);
  if (validationErrors.length > 0) {
    normalized.status = 'validation_failed';
    normalized.validationErrors = validationErrors;
  } else {
    normalized.status = 'validated';
  }

  const event = await InboundEvent.create(normalized);

  // Upsert identity_links
  if (event.identity && event.identity.email && normalized.status === 'validated') {
    await upsertIdentityLink(event);
    // Simulate sending to MidPoint (POC: mark success immediately)
    await simulateMidpointProcessing(event);
  }

  // Update materialized sync status
  await refreshSyncStatus(event);

  return { event, duplicate: false };
}

/**
 * Upsert an IdentityLink for the canonical email.
 */
async function upsertIdentityLink(event) {
  const { email, emailDomain, displayName, userType, staffId, studentId } = event.identity;
  const idFields = {};
  if (event.sourceSystem === 'CADS' && event.sourceData.cadsEmployeeId) idFields.cadsEmployeeId = event.sourceData.cadsEmployeeId;
  if (event.sourceSystem === 'PEOPLESOFT' && event.sourceData.psEmplid) idFields.psEmplid = event.sourceData.psEmplid;
  if (event.sourceSystem === 'ECM' && event.sourceData.ecmUserId) idFields.ecmUserId = event.sourceData.ecmUserId;
  if (event.sourceSystem === 'JSPM' && event.sourceData.jspmUserId) idFields.jspmUserId = event.sourceData.jspmUserId;

  await IdentityLink.findOneAndUpdate(
    { canonicalEmail: email },
    {
      $set: {
        canonicalEmail: email,
        emailDomain,
        displayName,
        userType,
        lastSeenAt: new Date(),
        ...Object.fromEntries(Object.entries(idFields).map(([k, v]) => [`identifiers.${k}`, v])),
      },
      $addToSet: { sourceSystems: event.sourceSystem },
    },
    { upsert: true }
  );
}

/**
 * POC simulation: mark event as sent_to_midpoint → success after a brief delay.
 * In production this would publish to a queue/call MidPoint REST API.
 */
async function simulateMidpointProcessing(event) {
  // Immediately mark as sent_to_midpoint
  await InboundEvent.findByIdAndUpdate(event._id, {
    $set: { status: 'sent_to_midpoint', processedAt: new Date() },
  });

  // Simulate async processing — in POC we resolve immediately
  setImmediate(async () => {
    try {
      const updatedEvent = await InboundEvent.findByIdAndUpdate(
        event._id,
        { $set: { status: 'success', processedAt: new Date() } },
        { new: true }
      );
      if (updatedEvent) await refreshSyncStatus(updatedEvent);
    } catch (err) {
      console.error('Simulated MidPoint processing error:', err.message);
    }
  });
}

module.exports = { ingestEvent, normalizePayload, validateEvent };
