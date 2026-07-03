const { v4: uuidv4 } = require('uuid');
const InboundEvent = require('../models/InboundEvent');
const IngestionJob = require('../models/IngestionJob');
const IdentityLink = require('../models/IdentityLink');
const { validateEmailDomain, extractDomain } = require('./emailValidation');
const { refreshSyncStatus } = require('./syncStatus');
const { transformPeoplesoftRow } = require('../transformers/peoplesoft.transformer');

function parseDateValue(value) {
  if (!value) return undefined;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function mapMidpointOperationToAction(operation) {
  const normalized = normalizeString(operation).toUpperCase();
  if (normalized === 'REMOVE_ENTITLEMENT') return 'deprovision';
  if (normalized === 'ASSIGN_ENTITLEMENT') return 'provision';
  if (normalized === 'CREATE_OR_UPDATE_IDENTITY') return 'update';
  if (normalized === 'SYNC_PROJECT_MEMBERSHIP') return 'sync';
  return 'sync';
}

function isCanonicalPayload(raw) {
  return Boolean(raw && typeof raw === 'object' && raw.meta && raw.identity && raw.entitlement);
}

function toPeopleSoftModule(value) {
  const normalized = normalizeString(value).toUpperCase();
  return ['SIS', 'FMS', 'HRMS'].includes(normalized) ? normalized : 'UNKNOWN';
}

function buildPeopleSoftIdempotencyKey(identity, department, role) {
  const principal = normalizeString(identity.email || identity.displayName) || 'unknown-user';
  const scope = normalizeString(department) || 'unknown-department';
  const roleName = normalizeString(role) || 'unknown-role';
  return `peoplesoft|${principal}|${scope}|${roleName}`;
}

function normalizePeopleSoftCanonical(payload, correlationId, idempotencyKey, rawPayload, transformErrors = []) {
  const meta = payload.meta || {};
  const identity = payload.identity || {};
  const entitlement = payload.entitlement || {};
  const email = normalizeString(identity.email).toLowerCase();
  const displayName = normalizeString(identity.displayName) || undefined;
  const staffId = normalizeString(identity.staffId) || undefined;
  const studentId = normalizeString(identity.studentId) || undefined;
  const userType = normalizeString(identity.userType) || 'staff';
  const targetSystem = normalizeString(entitlement.application) || 'PEOPLESOFT';
  const department = normalizeString(entitlement.departmentOrProject || entitlement.department) || undefined;
  const role = normalizeString(entitlement.roleName) || undefined;
  const moduleFromSource = payload.sourceData && payload.sourceData.psModule;
  const moduleFromApplication = targetSystem;

  return {
    eventId: normalizeString(meta.eventId) || uuidv4(),
    sourceSystem: 'PEOPLESOFT',
    correlationId: normalizeString(meta.correlationId) || correlationId,
    idempotencyKey:
      normalizeString(meta.idempotencyKey) ||
      idempotencyKey ||
      buildPeopleSoftIdempotencyKey(identity, department, role),
    identity: {
      email: email || undefined,
      emailDomain: email ? extractDomain(email) || undefined : undefined,
      staffId,
      studentId,
      displayName,
      userType,
    },
    entitlement: {
      action: normalizeString(entitlement.action) || mapMidpointOperationToAction(meta.operation),
      targetSystem,
      role,
      department,
      validFrom: parseDateValue(entitlement.validFrom),
      validUntil: parseDateValue(entitlement.validUntil),
    },
    sourceData: {
      psModule: toPeopleSoftModule(moduleFromSource || moduleFromApplication),
      psRecordType: payload.sourceData && payload.sourceData.psRecordType,
      psEmplid:
        (payload.sourceData && payload.sourceData.psEmplid) ||
        staffId ||
        studentId ||
        undefined,
    },
    rawPayload,
    status: 'received',
    transformErrors,
  };
}

/**
 * Convert a date value (string or Date) to a Date object, falling back to
 * a raw fallback value from the source payload. Returns undefined if absent.
 */
function toEntitlementDate(primary, fallback) {
  if (primary) return new Date(primary);
  if (fallback) return new Date(fallback);
  return undefined;
}

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
    // Support both legacy flat CADS payload and canonical transformer output
    if (raw.identity && raw.entitlement) {
      // Canonical format (from transformCadsRow)
      email          = raw.identity.email;
      displayName    = raw.identity.displayName || null;
      staffId        = raw.identity.staffId || null;
      userType       = 'staff';
      cadsEmployeeId = staffId;
      cadsOrgUnit    = raw.entitlement.departmentOrProject || null;
      action         = raw.entitlement.action || 'sync';
      role           = raw.entitlement.roleName;
      department     = raw.entitlement.departmentOrProject;
      validFrom      = raw.entitlement.validFrom  ? raw.entitlement.validFrom  : undefined;
      validUntil     = raw.entitlement.validTo    ? raw.entitlement.validTo    : undefined;
      targetSystem   = 'CADS';
    } else {
      // Legacy flat format
      email          = raw.email || raw.employeeEmail;
      displayName    = raw.displayName || raw.name || raw.employeeName;
      staffId        = raw.employeeId || raw.staffId;
      userType       = 'staff';
      cadsEmployeeId = raw.employeeId;
      cadsOrgUnit    = raw.orgUnit || raw.department;
      action         = raw.action || 'sync';
      role           = raw.role || raw.jobTitle;
      department     = raw.department || raw.orgUnit;
      targetSystem   = 'CADS';
    }
  } else if (src === 'PEOPLESOFT') {
    if (isCanonicalPayload(raw)) {
      return normalizePeopleSoftCanonical(raw, correlationId, idempotencyKey, raw);
    }

    const transformed = transformPeoplesoftRow(raw, { correlationId, idempotencyKey });
    return normalizePeopleSoftCanonical(
      transformed.payload,
      correlationId,
      idempotencyKey || transformed.payload.meta.idempotencyKey,
      raw,
      transformed.errors
    );
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
      validFrom:  toEntitlementDate(validFrom, raw.validFrom),
      validUntil: toEntitlementDate(validUntil, raw.validUntil),
    },
    sourceData: {
      cadsEmployeeId, cadsOrgUnit,
      cadsAttributes: (src === 'CADS' && raw.attributes) ? raw.attributes : undefined,
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
  const transformErrors = Array.isArray(normalized.transformErrors) ? normalized.transformErrors : [];
  const errors = [];

  function addError(message) {
    if (message && !errors.includes(message)) errors.push(message);
  }

  transformErrors.forEach(addError);

  if (normalized.sourceSystem === 'PEOPLESOFT') {
    if (!normalized.identity.email && !normalized.identity.displayName) {
      addError('Missing email or displayName in payload');
    }
  } else if (!normalized.identity.email) {
    addError('Missing email in payload');
  }

  if (normalized.identity.email) {
    const { valid, reason } = validateEmailDomain(normalized.identity.email);
    if (!valid) addError(reason);
  }
  if (!normalized.sourceSystem) addError('Missing sourceSystem');
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
