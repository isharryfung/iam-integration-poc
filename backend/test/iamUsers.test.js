/**
 * Tests for the IAM Users route (/api/iam/users).
 * Uses node:test (built-in) without a running MongoDB — tests the route logic
 * and mock reporting-line helper directly.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const routePath = path.resolve(__dirname, '../src/routes/iamUsers.js');

test.beforeEach(() => {
  delete require.cache[routePath];
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function makeReq(params = {}, query = {}, body = {}) {
  return {
    params,
    query,
    body,
    correlationId: 'test-corr',
    apiKeyId: 'test-key',
  };
}

// ── _getMockReportingLine ──────────────────────────────────────────────────────

test('_getMockReportingLine returns 2 approvers for annual_leave', () => {
  const { _getMockReportingLine } = require(routePath);
  const user = { userId: 'U001', emplid: '90001001', email: 'alice@ust.hk' };
  const result = _getMockReportingLine(user, 'annual_leave');
  assert.ok(Array.isArray(result.approvers));
  assert.equal(result.approvers.length, 2);
  assert.equal(result.approvers[0].level, 1);
  assert.ok(result.audit.ruleId);
});

test('_getMockReportingLine returns 1 approver for sick_leave', () => {
  const { _getMockReportingLine } = require(routePath);
  const user = { userId: 'U001', emplid: '90001001', email: 'alice@ust.hk' };
  const result = _getMockReportingLine(user, 'sick_leave');
  assert.equal(result.approvers.length, 1);
});

test('_getMockReportingLine returns 2 approvers for epdr', () => {
  const { _getMockReportingLine } = require(routePath);
  const user = { userId: 'U001', emplid: '90001001', email: 'alice@ust.hk' };
  const result = _getMockReportingLine(user, 'epdr');
  assert.equal(result.approvers.length, 2);
  assert.equal(result.approvers[0].role, 'primary_approver');
  assert.equal(result.approvers[1].role, 'secondary_approver');
});

test('_getMockReportingLine returns empty approvers for unknown action', () => {
  const { _getMockReportingLine } = require(routePath);
  const user = { userId: 'U001', emplid: '90001001', email: 'alice@ust.hk' };
  const result = _getMockReportingLine(user, 'totally_unknown_action_xyz');
  assert.ok(Array.isArray(result.approvers));
  assert.equal(result.approvers.length, 0);
  assert.equal(result.audit.ruleId, 'DEFAULT_FALLBACK');
});

// ── PUT /api/iam/users/:userId/permissions (handler unit tests) ───────────────
// We test the route handler logic by mocking the IamUser model.

test('PUT permissions returns 400 when roles is not an array', async () => {
  // Patch mongoose model before loading the route
  const mongoose = require('mongoose');
  const origModel = mongoose.model.bind(mongoose);

  // We only need to validate the pre-model-call path (roles check)
  // Load the route module; the handler checks roles before touching the DB
  const router = require(routePath);

  // Find the PUT /:userId/permissions handler
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/:userId/permissions' && l.route.methods.put
  );
  assert.ok(layer, 'expected PUT /:userId/permissions route to exist');
  // Get the last handler in the stack (after rate-limiter middleware)
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;

  const req = makeReq({ userId: 'U001' }, {}, { roles: 'not-an-array' });
  const res = createMockResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /roles must be an array/);
});

test('PUT permissions returns 400 when roles field is missing', async () => {
  const router = require(routePath);

  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/:userId/permissions' && l.route.methods.put
  );
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;

  const req = makeReq({ userId: 'U001' }, {}, {});
  const res = createMockResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /roles must be an array/);
});

test('PUT permissions returns 400 for invalid userId', async () => {
  const router = require(routePath);

  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/:userId/permissions' && l.route.methods.put
  );
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;

  // Empty userId (toSafeString will return null for empty string)
  const req = makeReq({ userId: '   ' }, {}, { roles: ['VIEWER'] });
  const res = createMockResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Invalid userId/);
});

// ── GET /api/iam/users/:userId/reporting-line ─────────────────────────────────

test('GET reporting-line returns 400 when action query param is missing', async () => {
  const router = require(routePath);

  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/:userId/reporting-line' && l.route.methods.get
  );
  assert.ok(layer, 'expected GET /:userId/reporting-line route to exist');
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;

  const req = makeReq({ userId: 'U001' }, {}, {});
  const res = createMockResponse();
  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /action query parameter/);
});

test('GET reporting-line returns 400 for invalid userId', async () => {
  const router = require(routePath);

  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/:userId/reporting-line' && l.route.methods.get
  );
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;

  const req = makeReq({ userId: '' }, { action: 'epdr' }, {});
  const res = createMockResponse();
  await handler(req, res);

  // toSafeString('') returns null → 400
  assert.equal(res.statusCode, 400);
});
