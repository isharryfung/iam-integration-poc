/**
 * JSPM (Java Source Permission Management) row → Canonical JSON transformer
 *
 * Maps raw role_group_user_data CSV rows into the canonical MidPoint event
 * payload format used by the IAM Integration Platform.
 *
 * Usage:
 *   const { transformJspmRow, columnMap } = require('./jspm.transformer');
 *   const result = transformJspmRow(row, { defaultDomain: 'ust.hk' });
 *   // result: { sourceSystem, isValid, errors, payload }
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

// ── Column map: raw JSPM CSV header → canonical JSON path ─────────────────────

const columnMap = {
  ROLE_GROUP_DESC:  'entitlement.roleName',
  USER_NAM:         'identity.externalUserId',
  ROLE_GROUP_ID_1:  'entitlement.roleGroupId',
  SETID_DEPT:       'attributes.setIdDept',
  DEPTID:           'entitlement.departmentOrProject',
  ZR_TEAM_UNIT_CDE: 'attributes.teamUnitCode',
};

// ── Normalization helpers ─────────────────────────────────────────────────────

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeHeader(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function buildIdempotencyKey(payload) {
  const userId    = normalizeText(payload.identity.externalUserId) || 'unknown-user';
  const roleGroup = normalizeText(payload.entitlement.roleGroupId) || 'unknown-group';
  const dept      = normalizeText(payload.entitlement.departmentOrProject) || 'unknown-dept';
  return `JSPM|${roleGroup}|${userId}|${dept}`;
}

function buildEventId(payload, eventTime) {
  const roleGroup = normalizeText(payload.entitlement.roleGroupId) || uuidv4();
  const userId    = normalizeText(payload.identity.externalUserId) || 'unknown';
  return `JSPM-${roleGroup}-${userId}-${eventTime}`;
}

// ── Transformer ───────────────────────────────────────────────────────────────

/**
 * Transform a single JSPM CSV row into a canonical event payload.
 *
 * @param {Object} row   - Raw JSPM CSV row (keys are column headers)
 * @param {Object} [opts]
 * @param {string} [opts.defaultDomain='ust.hk']
 * @param {string} [opts.correlationId]
 * @param {string} [opts.idempotencyKey]
 * @param {string} [opts.eventTime]  - ISO string; defaults to now
 * @param {string} [opts.operation]  - defaults to 'ASSIGN_ENTITLEMENT'
 *
 * @returns {{ sourceSystem: string, isValid: boolean, errors: string[], payload: Object }}
 */
function transformJspmRow(row, opts = {}) {
  const defaultDomain = normalizeText(opts.defaultDomain) || 'ust.hk';
  const eventTime     = normalizeText(opts.eventTime) || new Date().toISOString();

  // Normalize incoming row headers for case/whitespace tolerance
  const normalizedRow = {};
  for (const k of Object.keys(row || {})) {
    normalizedRow[normalizeHeader(k)] = row[k];
  }

  // Extract fields via column map
  const roleName            = normalizeText(normalizedRow['ROLE_GROUP_DESC']);
  const externalUserId      = normalizeText(normalizedRow['USER_NAM']);
  const roleGroupId         = normalizeText(normalizedRow['ROLE_GROUP_ID_1']);
  const setIdDept           = normalizeText(normalizedRow['SETID_DEPT']) || null;
  const deptId              = normalizeText(normalizedRow['DEPTID']);
  const teamUnitCode        = normalizeText(normalizedRow['ZR_TEAM_UNIT_CDE']) || null;

  const departmentOrProject = deptId || null;

  // Build email from userId + domain
  const email = externalUserId
    ? `${externalUserId.toLowerCase()}@${defaultDomain}`
    : null;

  const payload = {
    meta: {
      eventId:        null, // filled below
      eventTime,
      sourceSystem:   'JSPM',
      correlationId:  normalizeText(opts.correlationId) || null,
      idempotencyKey: normalizeText(opts.idempotencyKey) || null,
      operation:      normalizeText(opts.operation) || 'ASSIGN_ENTITLEMENT',
    },
    identity: {
      externalUserId: externalUserId || null,
      email,
    },
    entitlement: {
      application:         'JSPM',
      roleName:            roleName || null,
      roleGroupId:         roleGroupId || null,
      departmentOrProject,
    },
    attributes: {
      setIdDept,
      deptId:       departmentOrProject,
      teamUnitCode,
    },
  };

  payload.meta.eventId        = buildEventId(payload, eventTime);
  payload.meta.idempotencyKey = payload.meta.idempotencyKey || buildIdempotencyKey(payload);

  // Validation
  const errors = [];
  if (!payload.identity.externalUserId) errors.push('USER_NAM (identity.externalUserId) is required');
  if (!payload.entitlement.roleName)    errors.push('ROLE_GROUP_DESC (entitlement.roleName) is required');
  if (!payload.entitlement.roleGroupId) errors.push('ROLE_GROUP_ID_1 (entitlement.roleGroupId) is required');
  if (!payload.entitlement.departmentOrProject) errors.push('DEPTID (entitlement.departmentOrProject) is required');

  return {
    sourceSystem: 'JSPM',
    isValid:      errors.length === 0,
    errors,
    payload,
  };
}

// ── Raw-row identifier keys (used by the ingestion layer) ─────────────────────

/**
 * Minimum set of JSPM column headers that must be present for a request body
 * to be recognised as a raw JSPM CSV row (rather than a canonical payload).
 */
const jspmIdentifierKeys = ['ROLE_GROUP_DESC', 'USER_NAM', 'ROLE_GROUP_ID_1', 'DEPTID'];

module.exports = {
  columnMap,
  jspmIdentifierKeys,
  transformJspmRow,
};
