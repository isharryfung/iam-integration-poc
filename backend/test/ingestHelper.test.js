/**
 * Tests for normalizePayload and validateEvent in ingestHelper.
 *
 * These are pure-logic tests that do not require a database connection.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');

const { normalizePayload, validateEvent } = require('../src/utils/ingestHelper');

// ── ECM canonical combined payload (output of buildEcmCombinedPayloads) ────────

const ecmCombinedPayload = {
  meta: {
    eventId:        'ECM-COMBINED-ARIVY-2025-01-01T00:00:00.000Z',
    eventTime:      '2025-01-01T00:00:00.000Z',
    sourceSystem:   'ECM',
    correlationId:  'corr-001',
    idempotencyKey: 'ECM|COMBINED|ARIVY',
    operation:      'UPSERT_USER_EFFECTIVE_ACCESS',
  },
  identity: {
    externalUserId: 'ARIVY',
    email:          'arivy@ust.hk',
  },
  entitlement: {
    application: 'ECM',
  },
  attributes: {
    memberships:     [{ groupName: 'AR_All_Docs' }],
    groupEntitlements: [],
    effectiveAccessSummary: { totalGroups: 1, totalDocTypes: 0 },
  },
};

test('normalizePayload ECM: canonical combined payload extracts email correctly', () => {
  const result = normalizePayload(ecmCombinedPayload, 'ECM', 'corr-001', 'idem-001');
  assert.equal(result.identity.email, 'arivy@ust.hk');
  assert.equal(result.identity.emailDomain, 'ust.hk');
  assert.equal(result.sourceSystem, 'ECM');
  assert.equal(result.identity.userType, 'staff');
  assert.equal(result.entitlement.targetSystem, 'ECM');
});

test('normalizePayload ECM: canonical combined payload passes validation', () => {
  const result = normalizePayload(ecmCombinedPayload, 'ECM', 'corr-001', 'idem-001');
  const errors = validateEvent(result);
  assert.deepEqual(errors, []);
});

test('normalizePayload ECM: unknown meta.operation is normalised to sync', () => {
  const result = normalizePayload(ecmCombinedPayload, 'ECM', 'corr-001', 'idem-001');
  // 'UPSERT_USER_EFFECTIVE_ACCESS' is not in the valid-action enum, so it falls back to 'sync'
  assert.equal(result.entitlement.action, 'sync');
});

// ── ECM raw batch payload ({ membershipRows, groupItemRows }) ──────────────────

const ecmRawBatch = {
  membershipRows: [
    { USERGROUPNAME: 'AR_All_Docs', USERNAME: 'BWONG' },
  ],
  groupItemRows: [
    { USERGROUPNAME: 'AR_All_Docs', ITEMTYPENAME: 'AR: Academic Transcript', Dept: 'ARO' },
  ],
};

test('normalizePayload ECM: raw batch payload has no email (validation must fail)', () => {
  // The raw { membershipRows, groupItemRows } format cannot be directly normalised —
  // it must be transformed by buildEcmCombinedPayloads first (handled by handleEcmIngest).
  const result = normalizePayload(ecmRawBatch, 'ECM', 'corr-002', 'idem-002');
  // email field should be absent/undefined
  assert.equal(result.identity.email, undefined);
  const errors = validateEvent(result);
  assert.ok(errors.some(e => e.includes('email')),
    `Expected a missing-email validation error, got: ${JSON.stringify(errors)}`);
});

// ── ECM flat single-user payload ({ email, userId, … }) ───────────────────────

const ecmFlatPayload = {
  userId:    'bwong',
  userEmail: 'bwong@ust.hk',
  action:    'provision',
  accessLevel: 'ReadOnly',
};

test('normalizePayload ECM: flat single-user payload extracts email from userEmail', () => {
  const result = normalizePayload(ecmFlatPayload, 'ECM', 'corr-003', 'idem-003');
  assert.equal(result.identity.email, 'bwong@ust.hk');
  assert.equal(result.identity.emailDomain, 'ust.hk');
  assert.equal(result.sourceSystem, 'ECM');
});

test('normalizePayload ECM: flat single-user payload passes validation', () => {
  const result = normalizePayload(ecmFlatPayload, 'ECM', 'corr-003', 'idem-003');
  const errors = validateEvent(result);
  assert.deepEqual(errors, []);
});

// ── CADS canonical payload – regression ───────────────────────────────────────

const cadsCanonicalPayload = {
  identity: {
    email:       'john.doe@ust.hk',
    displayName: 'John Doe',
    staffId:     'S001',
  },
  entitlement: {
    action:               'provision',
    roleName:             'BCO',
    departmentOrProject:  'Finance',
    validFrom:            '2025-01-01',
    validTo:              '2099-12-31',
  },
};

test('normalizePayload CADS: canonical payload extracts email correctly', () => {
  const result = normalizePayload(cadsCanonicalPayload, 'CADS', 'corr-cads', null);
  assert.equal(result.identity.email, 'john.doe@ust.hk');
  assert.equal(result.identity.emailDomain, 'ust.hk');
  assert.equal(result.sourceSystem, 'CADS');
  const errors = validateEvent(result);
  assert.deepEqual(errors, []);
});

// ── JSPM canonical payload – regression ───────────────────────────────────────

const jspmCanonicalPayload = {
  meta: {
    sourceSystem:   'JSPM',
    operation:      'SYNC_PROJECT_MEMBERSHIP',
    idempotencyKey: 'jspm|pmshr|22000|Dept Salary Plan Owner',
  },
  identity: {
    email:       'pmshr@ust.hk',
    displayName: 'pmshr',
    userType:    'staff',
  },
  entitlement: {
    action:             'assign',
    application:        'JSPM',
    roleName:           'Dept Salary Plan Owner',
    departmentOrProject: '22000',
  },
};

test('normalizePayload JSPM: canonical payload extracts email correctly', () => {
  const result = normalizePayload(jspmCanonicalPayload, 'JSPM', 'corr-jspm', null);
  assert.equal(result.identity.email, 'pmshr@ust.hk');
  assert.equal(result.identity.emailDomain, 'ust.hk');
  assert.equal(result.sourceSystem, 'JSPM');
  const errors = validateEvent(result);
  assert.deepEqual(errors, []);
});

// ── validateMidpointInput (midpointPreview) ───────────────────────────────────

const { buildMidpointInput, validateMidpointInput } = require('../src/utils/midpointPreview');

test('buildMidpointInput ECM: combined payload preserves attributes.groupEntitlements for preview validation', () => {
  const input = buildMidpointInput({
    eventId: 'ef277952-5034-4382-9a8b-4eb071474992',
    sourceSystem: 'ECM',
    correlationId: 'b65819d0-1ef0-4e8c-ac99-f8b6dd0fd5c2',
    idempotencyKey: 'ui-1783390249887|ARIVY',
    createdAt: '2026-07-07T02:10:49.936Z',
    rawPayload: ecmCombinedPayload,
  });

  assert.ok(Array.isArray(input.attributes.groupEntitlements));
  assert.equal(input.attributes.groupEntitlements.length, 0);
});

test('validateMidpointInput ECM: combined payload with groupEntitlements passes without documentClass', () => {
  const input = {
    meta: {
      eventId:        'ECM-COMBINED-ARIVY-2025-01-01T00:00:00.000Z',
      eventTime:      '2025-01-01T00:00:00.000Z',
      sourceSystem:   'ECM',
      correlationId:  'corr-001',
      idempotencyKey: 'ECM|COMBINED|ARIVY',
      operation:      'ASSIGN_ENTITLEMENT',
    },
    identity: {
      email:       'arivy@ust.hk',
      displayName: 'ARIVY',
      userType:    'staff',
      staffId:     null,
      studentId:   null,
    },
    entitlement: {
      application: 'ECM',
      action:      'sync',
      roleName:    'ECM',
      documentClass: null,
    },
    attributes: {
      groupEntitlements: [
        { groupName: 'AR_All_Docs', resourceType: 'DOCUMENT_TYPE', resourceName: 'AR: Academic Transcript' },
      ],
    },
  };
  const result = validateMidpointInput(input);
  assert.equal(result.isValid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
  assert.equal(result.status, 'pass');
  assert.ok(!result.errors.some(e => e.field === 'entitlement.documentClass'));
});

test('validateMidpointInput ECM: combined payload built from preview event passes without documentClass', () => {
  const input = buildMidpointInput({
    eventId: 'ef277952-5034-4382-9a8b-4eb071474992',
    sourceSystem: 'ECM',
    correlationId: 'b65819d0-1ef0-4e8c-ac99-f8b6dd0fd5c2',
    idempotencyKey: 'ui-1783390249887|ARIVY',
    createdAt: '2026-07-07T02:10:49.936Z',
    rawPayload: {
      ...ecmCombinedPayload,
      attributes: {
        memberships: [{ groupName: 'AR_All_Docs' }, { groupName: 'AR_RS_MGT' }],
        groupEntitlements: [
          { groupName: 'AR_All_Docs', resourceType: 'DOCUMENT_TYPE', resourceName: 'AR: Academic Transcript' },
        ],
      },
    },
  });

  const result = validateMidpointInput(input);
  assert.equal(result.isValid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
  assert.ok(!result.errors.some(e => e.field === 'entitlement.documentClass'));
});

test('validateMidpointInput ECM: single-document payload without documentClass still fails', () => {
  const input = {
    meta: {
      eventId:        'EVT-001',
      eventTime:      '2025-01-01T00:00:00.000Z',
      sourceSystem:   'ECM',
      correlationId:  null,
      idempotencyKey: null,
      operation:      'ASSIGN_ENTITLEMENT',
    },
    identity: {
      email:       'user@ust.hk',
      displayName: null,
      userType:    'staff',
      staffId:     null,
      studentId:   null,
    },
    entitlement: {
      application:   'ECM',
      action:        'provision',
      roleName:      'DocReader',
      documentClass: null,
    },
  };
  const result = validateMidpointInput(input);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some(e => e.field === 'entitlement.documentClass'));
});
