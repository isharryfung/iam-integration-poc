const test = require('node:test');
const assert = require('node:assert/strict');

const fixture = require('./fixtures/peoplesoft-row.json');
const { transformPeoplesoftRow } = require('../src/transformers/peoplesoft.transformer');
const { buildMidpointInput, validateMidpointInput } = require('../src/utils/midpointPreview');

test('transformPeoplesoftRow normalizes headers, default email domain, and data security scope', () => {
  const result = transformPeoplesoftRow(fixture, { correlationId: 'corr-123' });

  assert.equal(result.sourceSystem, 'PeopleSoft');
  assert.equal(result.isValid, true);
  assert.equal(result.payload.identity.email, 'school.admin@ust.hk');
  assert.equal(result.payload.entitlement.application, 'SIS');
  assert.equal(result.payload.entitlement.departmentOrProject, 'School/Dept');
  assert.equal(result.payload.attributes.rankOrTeam, 'Admin users');
  assert.deepEqual(result.payload.attributes.dataLevelSecurity, {
    scope: 'SCHOOL_DEPT_STUDENTS',
    label: 'students of their school/dept',
  });
  assert.equal(result.payload.meta.correlationId, 'corr-123');
  assert.match(result.payload.meta.eventId, /^ps-/);
  assert.match(result.payload.meta.idempotencyKey, /^peoplesoft\|school\.admin@ust\.hk\|School\/Dept\|HKUST DEPT Reports$/);
});

test('transformPeoplesoftRow reports validation errors for incomplete rows', () => {
  const result = transformPeoplesoftRow({
    Remarks: 'Access to AAS',
  });

  assert.equal(result.isValid, false);
  assert.deepEqual(result.errors, [
    'identity.email or identity.displayName is required',
    'entitlement.roleName is required',
    'entitlement.departmentOrProject is required',
  ]);
});

test('MidPoint preview preserves PeopleSoft source row and transformed attributes', () => {
  const midpointInput = buildMidpointInput({
    eventId: 'ps-preview-1',
    sourceSystem: 'PEOPLESOFT',
    correlationId: 'corr-preview',
    idempotencyKey: 'preview-key',
    createdAt: '2026-07-03T03:00:00.000Z',
    rawPayload: fixture,
  });

  assert.equal(midpointInput.meta.sourceSystem, 'PEOPLESOFT');
  assert.equal(midpointInput.entitlement.departmentOrProject, 'School/Dept');
  assert.equal(midpointInput.attributes.remarks, 'Access to SIS');
  assert.equal(midpointInput.attributes.dataLevelSecurity.scope, 'SCHOOL_DEPT_STUDENTS');

  const validation = validateMidpointInput(midpointInput);
  assert.equal(validation.isValid, true);
});
