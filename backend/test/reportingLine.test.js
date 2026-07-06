const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const routePath = path.resolve(__dirname, '../src/routes/reportingLine.js');

// ── Helpers ────────────────────────────────────────────────────────────────────

function freshModule(envOverrides = {}) {
  // Temporarily set env vars
  const origEnv = {};
  for (const [k, v] of Object.entries(envOverrides)) {
    origEnv[k] = process.env[k];
    process.env[k] = v;
  }

  // Unload cached module so it re-reads env
  delete require.cache[routePath];
  const mod = require(routePath);

  // Restore env
  for (const [k, v] of Object.entries(origEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  return mod;
}

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function makeReq(body, extra = {}) {
  return { body, correlationId: 'corr-test', apiKeyId: 'test-key...', ...extra };
}

// ── Validation tests ────────────────────────────────────────────────────────────

test('_validate returns null for a valid minimal request (emplid only)', () => {
  const { _validate } = freshModule();
  const result = _validate({
    requestId: 'uuid-1',
    idempotencyKey: 'key-1',
    action: 'epdr',
    requester: { emplid: '90012345' },
    asOfTime: '2026-07-06T10:30:00+08:00',
    timezone: 'Asia/Hong_Kong',
  });
  assert.equal(result, null);
});

test('_validate returns null for a valid request with email only', () => {
  const { _validate } = freshModule();
  const result = _validate({
    requestId: 'uuid-2',
    idempotencyKey: 'key-2',
    action: 'annual_leave',
    requester: { email: 'user@ust.hk' },
    asOfTime: '2026-07-06T10:30:00+08:00',
    timezone: 'Asia/Hong_Kong',
  });
  assert.equal(result, null);
});

test('_validate returns null for a valid request with both emplid and email', () => {
  const { _validate } = freshModule();
  const result = _validate({
    requestId: 'uuid-3',
    idempotencyKey: 'key-3',
    action: 'sick_leave',
    requester: { emplid: '90012345', email: 'user@ust.hk' },
    asOfTime: '2026-07-06T10:30:00+08:00',
    timezone: 'Asia/Hong_Kong',
  });
  assert.equal(result, null);
});

test('_validate returns 400 when requestId is missing', () => {
  const { _validate } = freshModule();
  const result = _validate({
    idempotencyKey: 'k', action: 'epdr',
    requester: { emplid: '123' }, asOfTime: '2026-01-01T00:00:00Z', timezone: 'Asia/Hong_Kong',
  });
  assert.ok(result);
  assert.equal(result.status, 400);
  assert.equal(result.code, 'MISSING_FIELD');
});

test('_validate returns 400 when idempotencyKey is missing', () => {
  const { _validate } = freshModule();
  const result = _validate({
    requestId: 'r', action: 'epdr',
    requester: { emplid: '123' }, asOfTime: '2026-01-01T00:00:00Z', timezone: 'Asia/Hong_Kong',
  });
  assert.ok(result);
  assert.equal(result.status, 400);
  assert.equal(result.code, 'MISSING_FIELD');
});

test('_validate returns 400 when action is empty string', () => {
  const { _validate } = freshModule();
  const result = _validate({
    requestId: 'r', idempotencyKey: 'k', action: '   ',
    requester: { emplid: '123' }, asOfTime: '2026-01-01T00:00:00Z', timezone: 'Asia/Hong_Kong',
  });
  assert.ok(result);
  assert.equal(result.status, 400);
  assert.equal(result.code, 'MISSING_FIELD');
});

test('_validate accepts unknown action strings', () => {
  const { _validate } = freshModule();
  const result = _validate({
    requestId: 'r', idempotencyKey: 'k', action: 'totally_unknown_action_xyz',
    requester: { emplid: '123' }, asOfTime: '2026-01-01T00:00:00Z', timezone: 'Asia/Hong_Kong',
  });
  assert.equal(result, null);
});

test('_validate returns 422 when requester has neither emplid nor email', () => {
  const { _validate } = freshModule();
  const result = _validate({
    requestId: 'r', idempotencyKey: 'k', action: 'epdr',
    requester: {}, asOfTime: '2026-01-01T00:00:00Z', timezone: 'Asia/Hong_Kong',
  });
  assert.ok(result);
  assert.equal(result.status, 422);
  assert.equal(result.code, 'MISSING_REQUESTER_IDENTITY');
});

test('_validate returns 422 when requester is missing entirely', () => {
  const { _validate } = freshModule();
  const result = _validate({
    requestId: 'r', idempotencyKey: 'k', action: 'epdr',
    asOfTime: '2026-01-01T00:00:00Z', timezone: 'Asia/Hong_Kong',
  });
  assert.ok(result);
  assert.equal(result.status, 422);
});

test('_validate returns 400 when asOfTime is missing', () => {
  const { _validate } = freshModule();
  const result = _validate({
    requestId: 'r', idempotencyKey: 'k', action: 'epdr',
    requester: { emplid: '123' }, timezone: 'Asia/Hong_Kong',
  });
  assert.ok(result);
  assert.equal(result.status, 400);
});

test('_validate returns 400 when timezone is missing', () => {
  const { _validate } = freshModule();
  const result = _validate({
    requestId: 'r', idempotencyKey: 'k', action: 'epdr',
    requester: { emplid: '123' }, asOfTime: '2026-01-01T00:00:00Z',
  });
  assert.ok(result);
  assert.equal(result.status, 400);
});

// ── Route handler tests ────────────────────────────────────────────────────────

test('POST /resolve returns 503 when REPORTING_LINE_API_BASE_URL is not configured', async () => {
  // Ensure the env var is empty
  const saved = process.env.REPORTING_LINE_API_BASE_URL;
  process.env.REPORTING_LINE_API_BASE_URL = '';

  delete require.cache[routePath];
  const router = require(routePath);

  process.env.REPORTING_LINE_API_BASE_URL = saved;

  // Find the /resolve route handler
  const layer = router.stack.find((l) => l.route && l.route.path === '/resolve');
  assert.ok(layer, 'expected /resolve route to exist');
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;

  const req = makeReq({
    requestId: 'uuid-test',
    idempotencyKey: 'key-test',
    action: 'epdr',
    requester: { emplid: '90012345' },
    asOfTime: '2026-07-06T10:30:00+08:00',
    timezone: 'Asia/Hong_Kong',
  });
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error.code, 'INTEGRATION_NOT_CONFIGURED');
  assert.equal(res.body.requestId, 'uuid-test');
});

test('POST /resolve returns 400 for missing requestId', async () => {
  delete require.cache[routePath];
  const router = require(routePath);

  const layer = router.stack.find((l) => l.route && l.route.path === '/resolve');
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;

  const req = makeReq({
    idempotencyKey: 'k', action: 'epdr',
    requester: { emplid: '123' }, asOfTime: '2026-01-01T00:00:00Z', timezone: 'Asia/Hong_Kong',
  });
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'MISSING_FIELD');
});

test('POST /resolve returns 422 for missing requester identity', async () => {
  delete require.cache[routePath];
  const router = require(routePath);

  const layer = router.stack.find((l) => l.route && l.route.path === '/resolve');
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;

  const req = makeReq({
    requestId: 'uuid-1', idempotencyKey: 'k', action: 'epdr',
    requester: {}, asOfTime: '2026-01-01T00:00:00Z', timezone: 'Asia/Hong_Kong',
  });
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 422);
  assert.equal(res.body.error.code, 'MISSING_REQUESTER_IDENTITY');
});
