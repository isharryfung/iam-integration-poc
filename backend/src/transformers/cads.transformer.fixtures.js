/**
 * CADS transformer — example fixtures and assertions.
 *
 * Run with:  node backend/src/transformers/cads.transformer.fixtures.js
 *
 * These cover the core normalisation helpers and the full row transformation.
 */

'use strict';

const {
  parseYN,
  parseAmount,
  parseDateToYMD,
  normalizeEmail,
  transformCadsRow,
} = require('./cads.transformer');

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── parseYN ───────────────────────────────────────────────────────────────────
console.log('\nparseYN');
assert('Y → true',        parseYN('Y'),  true);
assert('y → true',        parseYN('y'),  true);
assert('N → false',       parseYN('N'),  false);
assert('n → false',       parseYN('n'),  false);
assert('blank → false',   parseYN(''),   false);
assert('null → false',    parseYN(null), false);

// ── parseAmount ───────────────────────────────────────────────────────────────
console.log('\nparseAmount');
assert('numeric string',  parseAmount('5000'),      5000);
assert('comma-formatted', parseAmount('1,000,000'), 1000000);
assert('Unlimited',       parseAmount('Unlimited'), null);
assert('unlimited lc',    parseAmount('unlimited'), null);
assert('blank',           parseAmount(''),          null);

// ── parseDateToYMD ────────────────────────────────────────────────────────────
console.log('\nparseDateToYMD');
assert('DD/MM/YYYY',      parseDateToYMD('31/12/2099'), '2099-12-31');
assert('YYYY-MM-DD',      parseDateToYMD('2025-01-07'), '2025-01-07');
assert('D/M/YYYY short',  parseDateToYMD('7/1/2025'),   '2025-01-07');
assert('blank',           parseDateToYMD(''),            null);

// ── normalizeEmail ────────────────────────────────────────────────────────────
console.log('\nnormalizeEmail');
assert('already has @',   normalizeEmail('user@ust.hk'),     'user@ust.hk');
assert('no @ → append',   normalizeEmail('user_a'),          'user_a@ust.hk');
assert('uppercase →lc',   normalizeEmail('USER@UST.HK'),     'user@ust.hk');
assert('blank',           normalizeEmail(''),                 '');
assert('custom domain',   normalizeEmail('user_b', 'connect.ust.hk'), 'user_b@connect.ust.hk');

// ── transformCadsRow — full row ───────────────────────────────────────────────
console.log('\ntransformCadsRow — user_a BCO row');
const sampleRow = {
  'User Email':                     'user_a',
  'Role':                           'BCO',
  'Department / Project':           '16500',
  '(1)\nEnquire REQ/PO/\nReceipt ': 'Y',
  '(2)\nRecord Receipt of Goods/\nServices': 'Y',
  '(3)\nCertify Receipt for Payment':        'Y',
  '(4)\nCertify Receipt for Payment Max. Amount (HKD)': 'Unlimited',
  'Allow Further Delegation ':       'Y',
  '(I)\nEnquire BR - General (FMS)': 'Y',
  '(II)\nEnquire BR - Staffing related (HRMS)': 'Y',
  '(III)\nEnquire BR - Student related (SIS)':  'Y',
  'Allow Further Delegation':        'Y',
  '(A)\nApprove / Enquire Budget Commitment in ALL Systems': 'Y',
  'Approve Budget Commitment Max. Amount (HKD) in ALL Systems': 'Unlimited',
  'Valid From': '2025-01-07',
  'Valid To':   '31/12/2099',
};

const result = transformCadsRow(sampleRow, { defaultDomain: 'ust.hk' });

assert('isValid',                   result.isValid, true);
assert('errors empty',              result.errors, []);
assert('email domain appended',     result.payload.identity.email, 'user_a@ust.hk');
assert('roleName',                  result.payload.entitlement.roleName, 'BCO');
assert('departmentOrProject',       result.payload.entitlement.departmentOrProject, '16500');
assert('validFrom normalised',      result.payload.entitlement.validFrom, '2025-01-07');
assert('validTo DD/MM/YYYY→YMD',   result.payload.entitlement.validTo, '2099-12-31');
assert('enquireReqPoReceipt true',  result.payload.attributes.permissions.enquireReqPoReceipt, true);
assert('certifyReceiptMaxNull',
  result.payload.attributes.limits.certifyReceiptForPaymentMaxAmountHkd, null);
assert('procurementDelegation',
  result.payload.attributes.delegation.procurement.allowFurtherDelegation, true);
assert('meta.sourceSystem',         result.payload.meta.sourceSystem, 'CADS');
assert('meta.operation',            result.payload.meta.operation, 'ASSIGN_ENTITLEMENT');

// ── transformCadsRow — missing required fields ────────────────────────────────
console.log('\ntransformCadsRow — missing required fields');
const emptyResult = transformCadsRow({});
assert('isValid false',             emptyResult.isValid, false);
assert('errors contains email',     emptyResult.errors.includes('identity.email is required'), true);
assert('errors contains roleName',  emptyResult.errors.includes('entitlement.roleName is required'), true);
assert('errors contains dept',
  emptyResult.errors.includes('entitlement.departmentOrProject is required'), true);
assert('errors contains validFrom', emptyResult.errors.includes('entitlement.validFrom is required'), true);
assert('errors contains validTo',   emptyResult.errors.includes('entitlement.validTo is required'), true);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
