const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  transformEcmMembershipRow,
  transformEcmGroupItemRow,
  buildEcmCombinedPayloads,
} = require('../src/transformers/ecm.transformer');

// ── transformEcmMembershipRow ─────────────────────────────────────────────────

test('transformEcmMembershipRow: valid row is accepted', () => {
  const result = transformEcmMembershipRow({ USERGROUPNAME: 'AR_All_Docs', USERNAME: 'ARIVY' });
  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.groupName, 'AR_All_Docs');
  assert.equal(result.username, 'ARIVY');
});

test('transformEcmMembershipRow: blank USERGROUPNAME is rejected', () => {
  const result = transformEcmMembershipRow({ USERGROUPNAME: '', USERNAME: 'ARIVY' });
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some(e => e.includes('USERGROUPNAME')));
});

test('transformEcmMembershipRow: blank USERNAME is rejected', () => {
  const result = transformEcmMembershipRow({ USERGROUPNAME: 'AR_All_Docs', USERNAME: '   ' });
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some(e => e.includes('USERNAME')));
});

test('transformEcmMembershipRow: both blank fields return two errors', () => {
  const result = transformEcmMembershipRow({});
  assert.equal(result.isValid, false);
  assert.equal(result.errors.length, 2);
});

test('transformEcmMembershipRow: case-insensitive headers are normalized', () => {
  const result = transformEcmMembershipRow({ usergroupname: 'GRP', username: 'USER1' });
  assert.equal(result.isValid, true);
  assert.equal(result.groupName, 'GRP');
  assert.equal(result.username, 'USER1');
});

// ── transformEcmGroupItemRow ──────────────────────────────────────────────────

test('transformEcmGroupItemRow: valid row is accepted', () => {
  const result = transformEcmGroupItemRow({
    USERGROUPNAME: 'AR_All_Docs',
    ITEMTYPENAME:  'AR: Academic Transcript',
    Dept:          'ARO',
    Team:          null,
    'Function/ Role?': null,
  });
  assert.equal(result.isValid, true);
  assert.equal(result.groupName, 'AR_All_Docs');
  assert.equal(result.resourceName, 'AR: Academic Transcript');
  assert.equal(result.dept, 'ARO');
  assert.equal(result.team, null);
  assert.equal(result.functionOrRole, null);
});

test('transformEcmGroupItemRow: blank USERGROUPNAME is rejected', () => {
  const result = transformEcmGroupItemRow({ USERGROUPNAME: '', ITEMTYPENAME: 'SomeDoc' });
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some(e => e.includes('USERGROUPNAME')));
});

test('transformEcmGroupItemRow: blank ITEMTYPENAME is rejected', () => {
  const result = transformEcmGroupItemRow({ USERGROUPNAME: 'GRP', ITEMTYPENAME: '' });
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some(e => e.includes('ITEMTYPENAME')));
});

// ── buildEcmCombinedPayloads ──────────────────────────────────────────────────

const sampleMembershipRows = [
  { USERGROUPNAME: 'AR_All_Docs', USERNAME: 'ARIVY' },
  { USERGROUPNAME: 'AR_RS_MGT',   USERNAME: 'ARIVY' },
  { USERGROUPNAME: 'AR_All_Docs', USERNAME: 'BWONG' },
];

const sampleGroupItemRows = [
  { USERGROUPNAME: 'AR_All_Docs', ITEMTYPENAME: 'AR: Academic Transcript', Dept: 'ARO' },
  { USERGROUPNAME: 'AR_All_Docs', ITEMTYPENAME: 'AR: Degree Diploma',      Dept: 'ARO' },
  { USERGROUPNAME: 'AR_RS_MGT',   ITEMTYPENAME: 'AR: Confidential Doc',    Dept: 'ARO' },
];

test('buildEcmCombinedPayloads: returns one result per unique username', () => {
  const results = buildEcmCombinedPayloads(sampleMembershipRows, sampleGroupItemRows);
  assert.equal(results.length, 2);
  const usernames = results.map(r => r.username).sort();
  assert.deepEqual(usernames, ['ARIVY', 'BWONG']);
});

test('buildEcmCombinedPayloads: ARIVY has two memberships and three doc-type entitlements', () => {
  const results = buildEcmCombinedPayloads(sampleMembershipRows, sampleGroupItemRows);
  const arivy = results.find(r => r.username === 'ARIVY');
  assert.ok(arivy);
  assert.equal(arivy.isValid, true);
  assert.equal(arivy.payload.attributes.memberships.length, 2);
  assert.equal(arivy.payload.attributes.groupEntitlements.length, 3);
  assert.equal(arivy.payload.attributes.effectiveAccessSummary.totalGroups, 2);
  assert.equal(arivy.payload.attributes.effectiveAccessSummary.totalDocTypes, 3);
});

test('buildEcmCombinedPayloads: BWONG has one membership and two doc-type entitlements', () => {
  const results = buildEcmCombinedPayloads(sampleMembershipRows, sampleGroupItemRows);
  const bwong = results.find(r => r.username === 'BWONG');
  assert.ok(bwong);
  assert.equal(bwong.payload.attributes.memberships.length, 1);
  assert.equal(bwong.payload.attributes.groupEntitlements.length, 2);
});

test('buildEcmCombinedPayloads: canonical payload shape is correct', () => {
  const results = buildEcmCombinedPayloads(sampleMembershipRows, sampleGroupItemRows, { defaultDomain: 'ust.hk' });
  const arivy = results.find(r => r.username === 'ARIVY');
  const p = arivy.payload;

  assert.equal(p.meta.sourceSystem, 'ECM');
  assert.equal(p.meta.operation, 'UPSERT_USER_EFFECTIVE_ACCESS');
  assert.equal(p.meta.idempotencyKey, 'ECM|COMBINED|ARIVY');
  assert.equal(p.identity.externalUserId, 'ARIVY');
  assert.equal(p.identity.email, 'arivy@ust.hk');
  assert.equal(p.entitlement.application, 'ECM');
});

test('buildEcmCombinedPayloads: blank membership rows are skipped silently', () => {
  const rows = [
    { USERGROUPNAME: 'GRP', USERNAME: 'ALICE' },
    { USERGROUPNAME: '',    USERNAME: 'ALICE' }, // blank — should be skipped
    { USERGROUPNAME: 'GRP', USERNAME: ''      }, // blank — should be skipped
  ];
  const results = buildEcmCombinedPayloads(rows, []);
  // Only ALICE with valid GRP membership should produce a result
  assert.equal(results.length, 1);
  assert.equal(results[0].username, 'ALICE');
});

test('buildEcmCombinedPayloads: blank group-item rows are skipped silently', () => {
  const memberRows = [{ USERGROUPNAME: 'GRP', USERNAME: 'ALICE' }];
  const itemRows   = [
    { USERGROUPNAME: 'GRP', ITEMTYPENAME: 'ValidDoc' },
    { USERGROUPNAME: '',    ITEMTYPENAME: 'MissingGroup' }, // blank — skipped
    { USERGROUPNAME: 'GRP', ITEMTYPENAME: ''            }, // blank — skipped
  ];
  const results = buildEcmCombinedPayloads(memberRows, itemRows);
  assert.equal(results.length, 1);
  assert.equal(results[0].payload.attributes.groupEntitlements.length, 1);
  assert.equal(results[0].payload.attributes.groupEntitlements[0].resourceName, 'ValidDoc');
});

test('buildEcmCombinedPayloads: empty inputs return empty array', () => {
  const results = buildEcmCombinedPayloads([], []);
  assert.deepEqual(results, []);
});

test('buildEcmCombinedPayloads: user with no matching group items has empty groupEntitlements', () => {
  const memberRows = [{ USERGROUPNAME: 'UNKNOWN_GRP', USERNAME: 'ZETA' }];
  const results = buildEcmCombinedPayloads(memberRows, sampleGroupItemRows);
  assert.equal(results[0].payload.attributes.groupEntitlements.length, 0);
  assert.equal(results[0].payload.attributes.effectiveAccessSummary.totalDocTypes, 0);
});
