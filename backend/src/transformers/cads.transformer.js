/**
 * CADS table-row → Canonical MidPoint JSON transformer
 *
 * Usage:
 *   const { transformCadsRow } = require('./cads.transformer');
 *   const result = transformCadsRow(row, { defaultDomain: 'ust.hk' });
 *   // result: { sourceSystem, isValid, errors, payload }
 */

'use strict';

// ── Column map: raw CADS header → canonical JSON path ────────────────────────

const columnMap = {
  'User Email':                  'identity.email',
  'Role':                        'entitlement.roleName',
  'Department / Project':        'entitlement.departmentOrProject',

  // Procurement block
  '(1)\nEnquire REQ/PO/\nReceipt ': 'attributes.permissions.enquireReqPoReceipt',
  '(2)\nRecord Receipt of Goods/\nServices':
    'attributes.permissions.recordReceiptGoodsServices',
  '(3)\nCertify Receipt for Payment':
    'attributes.permissions.certifyReceiptForPayment',
  '(4)\nCertify Receipt for Payment Max. Amount (HKD)':
    'attributes.limits.certifyReceiptForPaymentMaxAmountHkd',
  'Allow Further Delegation ':
    'attributes.delegation.procurement.allowFurtherDelegation',

  // Budget enquiry block
  '(I)\nEnquire BR - General (FMS)':
    'attributes.permissions.enquireBrGeneralFms',
  '(II)\nEnquire BR - Staffing related (HRMS)':
    'attributes.permissions.enquireBrStaffingHrms',
  '(III)\nEnquire BR - Student related (SIS)':
    'attributes.permissions.enquireBrStudentSis',
  'Allow Further Delegation':
    'attributes.delegation.budget.allowFurtherDelegation',

  // Budget approval block
  '(A)\nApprove / Enquire Budget Commitment in ALL Systems':
    'attributes.permissions.approveEnquireBudgetCommitmentAllSystems',
  'Approve Budget Commitment Max. Amount (HKD) in ALL Systems':
    'attributes.limits.approveBudgetCommitmentAllSystemsMaxAmountHkd',
  '(B)\nEnquire Budget Position/ Financial Info.':
    'attributes.permissions.enquireBudgetPositionFinancialInfo',
  '(C) Approve Budget Commitment in ePro REQ':
    'attributes.permissions.approveBudgetCommitmentEproReq',
  'Approve ePro REQ Max. Amount (HKD)':
    'attributes.limits.approveEproReqMaxAmountHkd',
  '(D) Approve Budget Commitment in PCard':
    'attributes.permissions.approveBudgetCommitmentPcard',
  'Approve PCard Max. Amount (HKD)':
    'attributes.limits.approvePcardMaxAmountHkd',
  '(E) Approve Budget Commitment in Expense':
    'attributes.permissions.approveBudgetCommitmentExpense',
  'Approve Expense Max. Amount (HKD)':
    'attributes.limits.approveExpenseMaxAmountHkd',
  '(F) Approve Budget Commitment in Student Helper Timesheet':
    'attributes.permissions.approveBudgetCommitmentStudentHelperTimesheet',
  'Approve Student Helper Timesheet Max. Amount (HKD)':
    'attributes.limits.approveStudentHelperTimesheetMaxAmountHkd',
  '(G) Approve Budget Commitment in Student Award Budget Request':
    'attributes.permissions.approveBudgetCommitmentStudentAwardBudgetRequest',
  'Approve Student Award Budget Request Max. Amount (HKD)':
    'attributes.limits.approveStudentAwardBudgetRequestMaxAmountHkd',
  '(H) Approve Budget Commitment in Catering Booking':
    'attributes.permissions.approveBudgetCommitmentCateringBooking',
  'Approve Catering Booking Max. Amount (HKD)':
    'attributes.limits.approveCateringBookingMaxAmountHkd',
  '(J) Approve Budget Commitment in FO e-Forms':
    'attributes.permissions.approveBudgetCommitmentFoEforms',
  'Approve FO e-Forms Max. Amount (HKD)':
    'attributes.limits.approveFoEformsMaxAmountHkd',

  // Standalone approvals
  'Approve Student Award Budget Request':
    'attributes.permissions.approveStudentAwardBudgetRequest',
  'Approve Budget Commitment in Staff Budget Request e-Form':
    'attributes.permissions.approveBudgetCommitmentStaffBudgetRequestEform',
  'Approve Staff Budget Request e-Form Max. Amount (HKD)':
    'attributes.limits.approveStaffBudgetRequestEformMaxAmountHkd',

  // Salary enquiry
  'Enquire Block Grant Salary - Account View':
    'attributes.permissions.enquireBlockGrantSalaryAccountView',
  'Enquire Block Grant Salary - Staff View':
    'attributes.permissions.enquireBlockGrantSalaryStaffView',

  // Validity
  'Valid From': 'entitlement.validFrom',
  'Valid To':   'entitlement.validTo',
};

// ── Normalisation helpers ─────────────────────────────────────────────────────

/**
 * Collapse whitespace/newlines in a header string for fuzzy matching.
 */
function normalizeHeader(h) {
  return String(h || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Convert Y/N cell value to boolean.
 * Y → true; N or blank → false.
 */
function parseYN(v) {
  const s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'Y';
}

/**
 * Parse an amount cell.
 * 'Unlimited' (case-insensitive) → null (sentinel for unlimited).
 * Numeric string → number; blank → null.
 */
function parseAmount(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  if (/^unlimited$/i.test(s)) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalise date strings to YYYY-MM-DD.
 * Accepts DD/MM/YYYY and YYYY-MM-DD; falls back to Date.UTC parsing.
 * All parsing is done in UTC to avoid timezone-dependent date shifts.
 */
function parseDateToYMD(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd   = m[1].padStart(2, '0');
    const mm   = m[2].padStart(2, '0');
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // Fallback: try to parse; if it looks like a bare date (no time component),
  // append 'T00:00:00Z' to force UTC and avoid timezone-dependent date shifts.
  const looksLikeBareDate = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s) ||
                            /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(s);
  const parseable = looksLikeBareDate ? s.replace(/\//g, '-') + 'T00:00:00Z' : s;
  const utcMs = Date.parse(parseable);
  if (!Number.isNaN(utcMs)) {
    return new Date(utcMs).toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Normalise an email value: lowercase, append defaultDomain if no '@'.
 */
function normalizeEmail(emailRaw, defaultDomain = 'ust.hk') {
  const v = String(emailRaw == null ? '' : emailRaw).trim().toLowerCase();
  if (!v) return '';
  return v.includes('@') ? v : `${v}@${defaultDomain}`;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function setDeep(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    // Guard against prototype pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
    cur = cur[key];
  }
  const lastKey = keys[keys.length - 1];
  if (lastKey !== '__proto__' && lastKey !== 'constructor' && lastKey !== 'prototype') {
    cur[lastKey] = value;
  }
}

function transformValue(targetPath, raw) {
  if (
    targetPath.startsWith('attributes.permissions.') ||
    targetPath.endsWith('.allowFurtherDelegation')
  ) {
    return parseYN(raw);
  }
  if (targetPath.startsWith('attributes.limits.')) {
    return parseAmount(raw);
  }
  if (targetPath === 'entitlement.validFrom' || targetPath === 'entitlement.validTo') {
    return parseDateToYMD(raw);
  }
  // Default: plain string
  const s = String(raw == null ? '' : raw).trim();
  return s || null;
}

function inferApplication(attributes) {
  const p = (attributes && attributes.permissions) || {};
  if (p.enquireBrStudentSis)                          return 'SIS';
  if (p.enquireBrStaffingHrms)                        return 'HRMS';
  if (p.enquireBrGeneralFms)                          return 'FMS';
  if (p.approveEnquireBudgetCommitmentAllSystems)      return 'ALL';
  return 'FMS';
}

function makeIdempotencyKey(payload) {
  const email = (payload.identity && payload.identity.email) || 'unknown';
  const dept  = (payload.entitlement && payload.entitlement.departmentOrProject) || 'unknown';
  const role  = (payload.entitlement && payload.entitlement.roleName) || 'unknown';
  const vf    = (payload.entitlement && payload.entitlement.validFrom) || 'unknown';
  return `CADS|${email}|${dept}|${role}|${vf}`;
}

function makeEventId(payload) {
  const email = ((payload.identity && payload.identity.email) || 'unknown').replace(/@/g, '_');
  const dept  = (payload.entitlement && payload.entitlement.departmentOrProject) || 'unknown';
  const vf    = (payload.entitlement && payload.entitlement.validFrom) || 'unknown';
  return `CADS-${email}-${dept}-${vf}`;
}

// ── Main transformer ──────────────────────────────────────────────────────────

/**
 * Transform a raw CADS table row object into a canonical MidPoint payload.
 *
 * @param {Object}  row            - Raw CADS row with original column headers as keys.
 * @param {Object}  [opts]
 * @param {string}  [opts.defaultDomain='ust.hk'] - Domain appended when email has no '@'.
 * @param {string}  [opts.correlationId]
 * @param {string}  [opts.operation='ASSIGN_ENTITLEMENT']
 * @param {string}  [opts.eventId]        - Override auto-generated eventId.
 * @param {string}  [opts.idempotencyKey] - Override auto-generated idempotency key.
 * @param {string}  [opts.application]    - Override inferred application.
 *
 * @returns {{ sourceSystem: string, isValid: boolean, errors: string[], payload: Object }}
 */
function transformCadsRow(row, opts = {}) {
  const defaultDomain = opts.defaultDomain || 'ust.hk';
  const nowIso = new Date().toISOString();

  // Normalise incoming row keys once (collapse whitespace for fuzzy match)
  const rowNorm = {};
  for (const k of Object.keys(row || {})) {
    rowNorm[normalizeHeader(k)] = row[k];
  }

  const payload = {
    meta: {
      eventId:        '',
      eventTime:      nowIso,
      sourceSystem:   'CADS',
      correlationId:  opts.correlationId || '',
      idempotencyKey: '',
      operation:      opts.operation || 'ASSIGN_ENTITLEMENT',
    },
    identity:    {},
    entitlement: {},
    attributes: {
      permissions: {},
      limits:      {},
      delegation: {
        procurement: {},
        budget:      {},
      },
    },
  };

  // Map all defined columns
  for (const [rawHeader, targetPath] of Object.entries(columnMap)) {
    const key      = normalizeHeader(rawHeader);
    const rawValue = rowNorm[key];

    if (typeof rawValue === 'undefined') continue;

    if (targetPath === 'identity.email') {
      const v = normalizeEmail(rawValue, defaultDomain);
      if (v) setDeep(payload, targetPath, v);
      continue;
    }

    const v = transformValue(targetPath, rawValue);

    // Keep explicit null for date fields and limit fields (null = unlimited / not set)
    // Drop nulls for everything else (keeps payload clean)
    if (v === null &&
        !targetPath.startsWith('entitlement.valid') &&
        !targetPath.startsWith('attributes.limits.')) continue;

    setDeep(payload, targetPath, v);
  }

  // Derived / generated fields
  payload.entitlement.application = opts.application || inferApplication(payload.attributes);
  payload.meta.eventId        = opts.eventId        || makeEventId(payload);
  payload.meta.idempotencyKey = opts.idempotencyKey || makeIdempotencyKey(payload);

  // Validation
  const errors = [];
  if (!payload.identity.email)                    errors.push('identity.email is required');
  if (!payload.entitlement.roleName)              errors.push('entitlement.roleName is required');
  if (!payload.entitlement.departmentOrProject)   errors.push('entitlement.departmentOrProject is required');
  if (!payload.entitlement.validFrom)             errors.push('entitlement.validFrom is required');
  if (!payload.entitlement.validTo)               errors.push('entitlement.validTo is required');

  return {
    sourceSystem: 'CADS',
    isValid:      errors.length === 0,
    errors,
    payload,
  };
}

module.exports = {
  columnMap,
  /** Core CADS column header names used to identify raw CADS table rows. */
  cadsIdentifierKeys: ['User Email', 'Role', 'Department / Project', 'Valid From', 'Valid To'],
  normalizeHeader,
  parseYN,
  parseAmount,
  parseDateToYMD,
  normalizeEmail,
  transformCadsRow,
};
