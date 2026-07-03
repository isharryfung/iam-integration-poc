const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  transformJspmRow,
  columnMap,
  jspmIdentifierKeys,
} = require('../src/transformers/jspm.transformer');

// ── columnMap ─────────────────────────────────────────────────────────────────

test('columnMap: contains all required JSPM field mappings', () => {
  assert.equal(columnMap.ROLE_GROUP_DESC,  'entitlement.roleName');
  assert.equal(columnMap.USER_NAM,         'identity.externalUserId');
  assert.equal(columnMap.ROLE_GROUP_ID_1,  'entitlement.roleGroupId');
  assert.equal(columnMap.SETID_DEPT,       'attributes.setIdDept');
  assert.equal(columnMap.DEPTID,           'entitlement.departmentOrProject');
  assert.equal(columnMap.ZR_TEAM_UNIT_CDE, 'attributes.teamUnitCode');
});

// ── jspmIdentifierKeys ────────────────────────────────────────────────────────

test('jspmIdentifierKeys: includes the core required columns', () => {
  assert.ok(jspmIdentifierKeys.includes('USER_NAM'));
  assert.ok(jspmIdentifierKeys.includes('ROLE_GROUP_DESC'));
  assert.ok(jspmIdentifierKeys.includes('ROLE_GROUP_ID_1'));
  assert.ok(jspmIdentifierKeys.includes('DEPTID'));
});

// ── transformJspmRow: happy path ──────────────────────────────────────────────

const sampleRow = {
  ROLE_GROUP_DESC:  'Dept Salary Plan Owner',
  USER_NAM:         'pmshr',
  ROLE_GROUP_ID_1:  '2019120201000000000005',
  SETID_DEPT:       'HKUST',
  DEPTID:           '22000',
  ZR_TEAM_UNIT_CDE: '',
};

test('transformJspmRow: valid row produces isValid=true with no errors', () => {
  const result = transformJspmRow(sampleRow);
  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.sourceSystem, 'JSPM');
});

test('transformJspmRow: maps ROLE_GROUP_DESC to entitlement.roleName', () => {
  const result = transformJspmRow(sampleRow);
  assert.equal(result.payload.entitlement.roleName, 'Dept Salary Plan Owner');
});

test('transformJspmRow: maps USER_NAM to identity.externalUserId', () => {
  const result = transformJspmRow(sampleRow);
  assert.equal(result.payload.identity.externalUserId, 'pmshr');
});

test('transformJspmRow: maps ROLE_GROUP_ID_1 to entitlement.roleGroupId', () => {
  const result = transformJspmRow(sampleRow);
  assert.equal(result.payload.entitlement.roleGroupId, '2019120201000000000005');
});

test('transformJspmRow: maps DEPTID to entitlement.departmentOrProject', () => {
  const result = transformJspmRow(sampleRow);
  assert.equal(result.payload.entitlement.departmentOrProject, '22000');
});

test('transformJspmRow: maps SETID_DEPT to attributes.setIdDept', () => {
  const result = transformJspmRow(sampleRow);
  assert.equal(result.payload.attributes.setIdDept, 'HKUST');
});

test('transformJspmRow: blank ZR_TEAM_UNIT_CDE maps to null teamUnitCode', () => {
  const result = transformJspmRow(sampleRow);
  assert.equal(result.payload.attributes.teamUnitCode, null);
});

test('transformJspmRow: non-blank ZR_TEAM_UNIT_CDE maps to attributes.teamUnitCode', () => {
  const result = transformJspmRow({ ...sampleRow, ZR_TEAM_UNIT_CDE: 'HR-UNIT-01' });
  assert.equal(result.payload.attributes.teamUnitCode, 'HR-UNIT-01');
});

test('transformJspmRow: email is generated from USER_NAM + default domain', () => {
  const result = transformJspmRow(sampleRow, { defaultDomain: 'ust.hk' });
  assert.equal(result.payload.identity.email, 'pmshr@ust.hk');
});

test('transformJspmRow: meta.sourceSystem is JSPM', () => {
  const result = transformJspmRow(sampleRow);
  assert.equal(result.payload.meta.sourceSystem, 'JSPM');
});

test('transformJspmRow: meta.operation defaults to ASSIGN_ENTITLEMENT', () => {
  const result = transformJspmRow(sampleRow);
  assert.equal(result.payload.meta.operation, 'ASSIGN_ENTITLEMENT');
});

test('transformJspmRow: meta.eventId is generated and includes role group and user', () => {
  const result = transformJspmRow(sampleRow);
  assert.ok(result.payload.meta.eventId.includes('2019120201000000000005'));
  assert.ok(result.payload.meta.eventId.includes('pmshr'));
});

test('transformJspmRow: meta.idempotencyKey encodes role group, user, and dept', () => {
  const result = transformJspmRow(sampleRow);
  assert.ok(result.payload.meta.idempotencyKey.startsWith('JSPM|'));
  assert.ok(result.payload.meta.idempotencyKey.includes('2019120201000000000005'));
  assert.ok(result.payload.meta.idempotencyKey.includes('pmshr'));
  assert.ok(result.payload.meta.idempotencyKey.includes('22000'));
});

test('transformJspmRow: caller-supplied idempotencyKey overrides generated key', () => {
  const result = transformJspmRow(sampleRow, { idempotencyKey: 'custom-key-123' });
  assert.equal(result.payload.meta.idempotencyKey, 'custom-key-123');
});

test('transformJspmRow: entitlement.application is always JSPM', () => {
  const result = transformJspmRow(sampleRow);
  assert.equal(result.payload.entitlement.application, 'JSPM');
});

// ── transformJspmRow: validation errors ───────────────────────────────────────

test('transformJspmRow: missing USER_NAM produces error', () => {
  const row = { ...sampleRow, USER_NAM: '' };
  const result = transformJspmRow(row);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some(e => e.includes('USER_NAM')));
});

test('transformJspmRow: missing ROLE_GROUP_DESC produces error', () => {
  const row = { ...sampleRow, ROLE_GROUP_DESC: '   ' };
  const result = transformJspmRow(row);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some(e => e.includes('ROLE_GROUP_DESC')));
});

test('transformJspmRow: missing ROLE_GROUP_ID_1 produces error', () => {
  const row = { ...sampleRow, ROLE_GROUP_ID_1: null };
  const result = transformJspmRow(row);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some(e => e.includes('ROLE_GROUP_ID_1')));
});

test('transformJspmRow: missing DEPTID produces error', () => {
  const row = { ...sampleRow, DEPTID: '' };
  const result = transformJspmRow(row);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some(e => e.includes('DEPTID')));
});

test('transformJspmRow: empty row produces four errors', () => {
  const result = transformJspmRow({});
  assert.equal(result.isValid, false);
  assert.equal(result.errors.length, 4);
});

// ── transformJspmRow: header normalization ────────────────────────────────────

test('transformJspmRow: lowercase headers are normalized and accepted', () => {
  const row = {
    role_group_desc:  'My Role',
    user_nam:         'jdoe',
    role_group_id_1:  'RG-001',
    setid_dept:       'HKUST',
    deptid:           '10000',
  };
  const result = transformJspmRow(row);
  assert.equal(result.isValid, true);
  assert.equal(result.payload.entitlement.roleName, 'My Role');
  assert.equal(result.payload.identity.externalUserId, 'jdoe');
});
