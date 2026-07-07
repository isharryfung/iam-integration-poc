const { normalizePayload } = require('./ingestHelper');
const { validateEmailDomain } = require('./emailValidation');
const { transformPeoplesoftRow } = require('../transformers/peoplesoft.transformer');

const SUPPORTED_SOURCE_SYSTEMS = ['CADS', 'PEOPLESOFT', 'ECM', 'JSPM'];
const VALID_OPERATIONS = [
  'CREATE_OR_UPDATE_IDENTITY',
  'ASSIGN_ENTITLEMENT',
  'REMOVE_ENTITLEMENT',
  'SYNC_PROJECT_MEMBERSHIP',
];

class MidpointTransformError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MidpointTransformError';
  }
}

function toIsoString(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function compactObject(value) {
  if (Array.isArray(value)) {
    return value.map(compactObject);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .map(([key, nested]) => [key, compactObject(nested)])
  );
}

function mapOperation(sourceSystem, sourceAction) {
  const action = typeof sourceAction === 'string' ? sourceAction.toLowerCase().trim() : '';

  if (action === 'deprovision') return 'REMOVE_ENTITLEMENT';
  if (sourceSystem === 'JSPM') return 'SYNC_PROJECT_MEMBERSHIP';
  if (sourceSystem === 'ECM' || action === 'provision') return 'ASSIGN_ENTITLEMENT';
  return 'CREATE_OR_UPDATE_IDENTITY';
}

function resolveSourceAction(event, normalized) {
  if (event.rawPayload && typeof event.rawPayload.action === 'string') {
    return event.rawPayload.action;
  }

  if (event.entitlement && typeof event.entitlement.action === 'string') {
    return event.entitlement.action;
  }

  return normalized.entitlement.action;
}

function isCanonicalPayload(payload) {
  return Boolean(payload && typeof payload === 'object' && payload.meta && payload.identity && payload.entitlement);
}

function normalizePeopleSoftPreviewPayload(event) {
  if (isCanonicalPayload(event.rawPayload)) {
    return event.rawPayload;
  }

  return transformPeoplesoftRow(event.rawPayload, {
    correlationId: event.correlationId,
    idempotencyKey: event.idempotencyKey,
    eventId: event.eventId,
    eventTime: toIsoString(event.createdAt),
  }).payload;
}

function isMissingRequiredIdentity(sourceSystem, email, displayName) {
  if (sourceSystem === 'PEOPLESOFT') {
    return !email && !displayName;
  }
  return !email;
}

function buildMidpointInput(event) {
  if (!event || !event.rawPayload || !event.sourceSystem) {
    throw new MidpointTransformError('Event is missing source payload or source system');
  }

  const sourceSystem = String(event.sourceSystem).toUpperCase();
  if (!SUPPORTED_SOURCE_SYSTEMS.includes(sourceSystem)) {
    throw new MidpointTransformError(`Unsupported source system '${sourceSystem}'`);
  }

  if (sourceSystem === 'PEOPLESOFT') {
    const transformed = normalizePeopleSoftPreviewPayload(event);
    const identity = transformed.identity || {};
    const entitlement = transformed.entitlement || {};

    return compactObject({
      meta: {
        eventId: event.eventId || transformed.meta.eventId || null,
        eventTime: toIsoString(event.createdAt) || transformed.meta.eventTime || null,
        sourceSystem,
        correlationId: event.correlationId || transformed.meta.correlationId || null,
        idempotencyKey: event.idempotencyKey || transformed.meta.idempotencyKey || null,
        operation: transformed.meta.operation || 'ASSIGN_ENTITLEMENT',
      },
      identity: {
        email: identity.email || null,
        displayName: identity.displayName || null,
        userType: identity.userType || 'staff',
        staffId: identity.staffId || null,
        studentId: identity.studentId || null,
      },
      entitlement: {
        application: entitlement.application || 'PEOPLESOFT',
        action: entitlement.action || null,
        roleName: entitlement.roleName || null,
        departmentOrProject: entitlement.departmentOrProject || entitlement.department || null,
        department: entitlement.department || entitlement.departmentOrProject || null,
        validFrom: toIsoString(entitlement.validFrom),
        validUntil: toIsoString(entitlement.validUntil),
      },
      attributes: transformed.attributes || {},
    });
  }

  const normalized = normalizePayload(
    event.rawPayload,
    sourceSystem,
    event.correlationId,
    event.idempotencyKey
  );
  const sourceAction = resolveSourceAction(event, normalized);

  return compactObject({
    meta: {
      eventId: event.eventId || null,
      eventTime: toIsoString(event.createdAt),
      sourceSystem,
      correlationId: event.correlationId || null,
      idempotencyKey: event.idempotencyKey || null,
      operation: mapOperation(sourceSystem, sourceAction),
    },
    identity: {
      email: normalized.identity.email || null,
      displayName: normalized.identity.displayName || null,
      userType: normalized.identity.userType || 'unknown',
      staffId: normalized.identity.staffId || null,
      studentId: normalized.identity.studentId || null,
    },
    entitlement: {
      application: sourceSystem,
      action: normalized.entitlement.action || null,
      roleName: normalized.entitlement.role || null,
      department: normalized.entitlement.department || null,
      validFrom: toIsoString(normalized.entitlement.validFrom),
      validUntil: toIsoString(normalized.entitlement.validUntil),
      documentClass: normalized.sourceData.ecmDocumentClass || null,
      projectCode: normalized.sourceData.jspmProjectCode || null,
    },
    // Include CADS-specific permissions/limits when present
    attributes: (sourceSystem === 'CADS' && normalized.sourceData.cadsAttributes)
      ? normalized.sourceData.cadsAttributes
      : undefined,
  });
}

function validateMidpointInput(midpointInput) {
  const missingFields = [];
  const invalidFields = [];
  const errors = [];

  function addIssue(kind, field, message) {
    errors.push({ field, type: kind, message });
    if (kind === 'missing') missingFields.push(field);
    if (kind === 'invalid') invalidFields.push(field);
  }

  function requireValue(value, field, label) {
    if (typeof value !== 'string' || !value.trim()) {
      addIssue('missing', field, `${label} is required`);
      return null;
    }
    return value.trim();
  }

  const eventId = requireValue(midpointInput.meta && midpointInput.meta.eventId, 'meta.eventId', 'Event ID');
  const eventTime = requireValue(midpointInput.meta && midpointInput.meta.eventTime, 'meta.eventTime', 'Event time');
  const sourceSystem = requireValue(midpointInput.meta && midpointInput.meta.sourceSystem, 'meta.sourceSystem', 'Source system');
  const operation = requireValue(midpointInput.meta && midpointInput.meta.operation, 'meta.operation', 'MidPoint operation');
  const email = midpointInput.identity && typeof midpointInput.identity.email === 'string'
    ? midpointInput.identity.email.trim()
    : '';
  const displayName = midpointInput.identity && typeof midpointInput.identity.displayName === 'string'
    ? midpointInput.identity.displayName.trim()
    : '';
  const application = requireValue(midpointInput.entitlement && midpointInput.entitlement.application, 'entitlement.application', 'Target application');
  const roleName = requireValue(midpointInput.entitlement && midpointInput.entitlement.roleName, 'entitlement.roleName', 'Role name');
  if (isMissingRequiredIdentity(sourceSystem, email, displayName)) {
    addIssue(
      'missing',
      'identity.email',
      sourceSystem === 'PEOPLESOFT'
        ? 'Identity email or displayName is required for PeopleSoft events'
        : 'Identity email is required'
    );
  }

  if (eventTime && Number.isNaN(new Date(eventTime).getTime())) {
    addIssue('invalid', 'meta.eventTime', 'Event time must be a valid ISO timestamp');
  }

  if (sourceSystem && !SUPPORTED_SOURCE_SYSTEMS.includes(sourceSystem)) {
    addIssue('invalid', 'meta.sourceSystem', `Unsupported source system '${sourceSystem}'`);
  }

  if (operation && !VALID_OPERATIONS.includes(operation)) {
    addIssue('invalid', 'meta.operation', `Unsupported MidPoint operation '${operation}'`);
  }

  if (email) {
    const { valid, reason } = validateEmailDomain(email);
    if (!valid) addIssue('invalid', 'identity.email', reason);
  }

  const hasGroupEntitlements =
    midpointInput.attributes &&
    Array.isArray(midpointInput.attributes.groupEntitlements) &&
    midpointInput.attributes.groupEntitlements.length > 0;
  if (sourceSystem === 'ECM' && !hasGroupEntitlements && (!midpointInput.entitlement || !midpointInput.entitlement.documentClass)) {
    addIssue('missing', 'entitlement.documentClass', 'Document class is required for ECM events');
  }

  if (sourceSystem === 'JSPM' && (!midpointInput.entitlement || !midpointInput.entitlement.projectCode)) {
    addIssue('missing', 'entitlement.projectCode', 'Project code is required for JSPM events');
  }

  return {
    isValid: errors.length === 0,
    status: errors.length === 0 ? 'pass' : 'fail',
    missingFields,
    invalidFields,
    errors,
  };
}

function buildPreviewResponse(event) {
  const midpointInput = buildMidpointInput(event);
  const validation = validateMidpointInput(midpointInput);
  return {
    eventId: event.eventId,
    sourceSystem: event.sourceSystem,
    email: event.identity && event.identity.email ? event.identity.email : midpointInput.identity.email,
    status: event.status,
    receivedAt: toIsoString(event.createdAt),
    processedAt: toIsoString(event.processedAt),
    transformStatus: validation.isValid ? 'success' : 'validation_failed',
    sourcePayload: event.rawPayload,
    midpointInput,
    validation,
  };
}

module.exports = {
  MidpointTransformError,
  buildMidpointInput,
  validateMidpointInput,
  buildPreviewResponse,
};
