const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const accessRoutePath = path.resolve(__dirname, '../src/routes/access.js');

function loadModuleWithMocks(modulePath, mocks) {
  const originalEntries = new Map();

  for (const [request, mockExports] of Object.entries(mocks)) {
    const resolved = require.resolve(request, { paths: [path.dirname(modulePath)] });
    originalEntries.set(resolved, require.cache[resolved]);
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports: mockExports,
    };
  }

  delete require.cache[modulePath];

  try {
    return require(modulePath);
  } finally {
    delete require.cache[modulePath];

    for (const [resolved, originalEntry] of originalEntries.entries()) {
      if (originalEntry) {
        require.cache[resolved] = originalEntry;
      } else {
        delete require.cache[resolved];
      }
    }
  }
}

function getRouteHandler(router, routePath) {
  const layer = router.stack.find((entry) => entry.route && entry.route.path === routePath);
  assert.ok(layer, `expected route ${routePath} to exist`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createMockRequest(email, serviceId) {
  return {
    headers: { service_id: serviceId },
    query: { email },
    correlationId: `corr-${serviceId.toLowerCase()}`,
    apiKeyId: 'test-key',
  };
}

function matchesQueryBranch(event, branch) {
  const scoped = branch['entitlement.targetSystem'] && branch['entitlement.targetSystem'].$in;
  if (Array.isArray(scoped) && scoped.includes(event.entitlement.targetSystem)) return true;
  if (branch.sourceSystem) return event.sourceSystem === branch.sourceSystem;
  return false;
}

function createAccessHandler({ identities, events }) {
  const router = loadModuleWithMocks(accessRoutePath, {
    '../models/IdentityLink': {
      findOne: async ({ canonicalEmail }) => identities[canonicalEmail] || null,
    },
    '../models/InboundEvent': {
      findOne: async (query) => {
        const email = query['identity.email'];
        const byEmail = events
          .filter((event) => event.identity.email === email && event.status === query.status);
        if (Array.isArray(query.$or)) {
          return byEmail.find((event) => query.$or.some((branch) => matchesQueryBranch(event, branch))) || null;
        }
        const scope = query['entitlement.targetSystem'] && query['entitlement.targetSystem'].$in;
        if (!Array.isArray(scope)) return byEmail[0] || null;
        return byEmail.find((event) => scope.includes(event.entitlement.targetSystem)) || null;
      },
    },
    '../utils/audit': {
      writeAudit: async () => {},
    },
  });

  return getRouteHandler(router, '/access');
}

test('regression: users from any source system are denied for unrelated target systems', async () => {
  const identities = {
    'ps.user@ust.hk': { canonicalEmail: 'ps.user@ust.hk', lifecycleState: 'active', sourceSystems: ['PEOPLESOFT'] },
    'ecm.user@ust.hk': { canonicalEmail: 'ecm.user@ust.hk', lifecycleState: 'active', sourceSystems: ['ECM'] },
    'cads.user@ust.hk': { canonicalEmail: 'cads.user@ust.hk', lifecycleState: 'active', sourceSystems: ['CADS'] },
    'jspm.user@ust.hk': { canonicalEmail: 'jspm.user@ust.hk', lifecycleState: 'active', sourceSystems: ['JSPM'] },
  };

  const events = [
    { status: 'success', identity: { email: 'ps.user@ust.hk' }, entitlement: { targetSystem: 'PEOPLESOFT', action: 'provision', role: 'PS_USER' } },
    { status: 'success', identity: { email: 'ecm.user@ust.hk' }, entitlement: { targetSystem: 'ECM', action: 'provision', role: 'ECM_USER' } },
    { status: 'success', identity: { email: 'cads.user@ust.hk' }, entitlement: { targetSystem: 'CADS', action: 'provision', role: 'CADS_USER' } },
    { status: 'success', identity: { email: 'jspm.user@ust.hk' }, entitlement: { targetSystem: 'JSPM', action: 'provision', role: 'JSPM_USER' } },
  ];

  const handler = createAccessHandler({ identities, events });
  const checks = [
    ['ps.user@ust.hk', 'ECM'],
    ['ecm.user@ust.hk', 'CADS'],
    ['cads.user@ust.hk', 'JSPM'],
    ['jspm.user@ust.hk', 'PEOPLESOFT'],
  ];

  for (const [email, serviceId] of checks) {
    const res = createMockResponse();
    await handler(createMockRequest(email, serviceId), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.decision, 'DENY');
    assert.equal(res.body.validity.isNowValid, false);
  }
});

test('PeopleSoft-only entitlements cannot access ECM, CADS, or JSPM', async () => {
  const identities = {
    'ps.only@ust.hk': { canonicalEmail: 'ps.only@ust.hk', lifecycleState: 'active', sourceSystems: ['PEOPLESOFT'] },
  };
  const events = [
    { status: 'success', identity: { email: 'ps.only@ust.hk' }, entitlement: { targetSystem: 'PEOPLESOFT', action: 'provision', role: 'PS_USER' } },
  ];

  const handler = createAccessHandler({ identities, events });
  const deniedServices = ['ECM', 'CADS', 'JSPM'];

  for (const serviceId of deniedServices) {
    const res = createMockResponse();
    await handler(createMockRequest('ps.only@ust.hk', serviceId), res);
    assert.equal(res.body.decision, 'DENY');
  }
});

test('ECM-only entitlements cannot access PEOPLESOFT, CADS, or JSPM', async () => {
  const identities = {
    'ecm.only@ust.hk': { canonicalEmail: 'ecm.only@ust.hk', lifecycleState: 'active', sourceSystems: ['ECM'] },
  };
  const events = [
    { status: 'success', identity: { email: 'ecm.only@ust.hk' }, entitlement: { targetSystem: 'ECM', action: 'provision', role: 'ECM_USER' } },
  ];

  const handler = createAccessHandler({ identities, events });
  const deniedServices = ['PEOPLESOFT', 'CADS', 'JSPM'];

  for (const serviceId of deniedServices) {
    const res = createMockResponse();
    await handler(createMockRequest('ecm.only@ust.hk', serviceId), res);
    assert.equal(res.body.decision, 'DENY');
  }
});

test('allows access only when requested system has matching entitlement (with safe key normalization)', async () => {
  const identities = {
    'ecm.allow@ust.hk': { canonicalEmail: 'ecm.allow@ust.hk', lifecycleState: 'active', sourceSystems: ['ECM'] },
    'ecm.update@ust.hk': { canonicalEmail: 'ecm.update@ust.hk', lifecycleState: 'active', sourceSystems: ['ECM'] },
    'ps.module@ust.hk': { canonicalEmail: 'ps.module@ust.hk', lifecycleState: 'active', sourceSystems: ['PEOPLESOFT'] },
  };
  const events = [
    { status: 'success', identity: { email: 'ecm.allow@ust.hk' }, entitlement: { targetSystem: 'ECM', action: 'provision', role: 'ECM_ADMIN' } },
    { status: 'success', identity: { email: 'ecm.update@ust.hk' }, entitlement: { targetSystem: 'ECM', action: 'update', role: 'ECM_UPDATER' } },
    // FMS is treated as a PeopleSoft module and is allowed when requesting PEOPLESOFT.
    { status: 'success', identity: { email: 'ps.module@ust.hk' }, entitlement: { targetSystem: 'FMS', action: 'sync', role: 'FMS_USER' } },
  ];

  const handler = createAccessHandler({ identities, events });

  const ecmRes = createMockResponse();
  await handler(createMockRequest('ecm.allow@ust.hk', 'eCm'), ecmRes);
  assert.equal(ecmRes.body.decision, 'ALLOW');
  assert.equal(ecmRes.body.serviceId, 'ECM');
  assert.equal(ecmRes.body.attributes.role, 'ECM_ADMIN');

  const ecmUpdateRes = createMockResponse();
  await handler(createMockRequest('ecm.update@ust.hk', 'ECM'), ecmUpdateRes);
  assert.equal(ecmUpdateRes.body.decision, 'ALLOW');
  assert.equal(ecmUpdateRes.body.attributes.role, 'ECM_UPDATER');

  const peopleSoftRes = createMockResponse();
  await handler(createMockRequest('ps.module@ust.hk', 'people-soft'), peopleSoftRes);
  assert.equal(peopleSoftRes.body.decision, 'ALLOW');
  assert.equal(peopleSoftRes.body.serviceId, 'PEOPLESOFT');
  assert.equal(peopleSoftRes.body.attributes.role, 'FMS_USER');
});

test('PEOPLESOFT access allows PeopleSoft-sourced AAS entitlement records', async () => {
  const identities = {
    'dao.alumni.manager@ust.hk': {
      canonicalEmail: 'dao.alumni.manager@ust.hk',
      lifecycleState: 'active',
      sourceSystems: ['PEOPLESOFT'],
    },
  };
  const events = [
    {
      status: 'success',
      sourceSystem: 'PEOPLESOFT',
      identity: { email: 'dao.alumni.manager@ust.hk' },
      entitlement: { targetSystem: 'AAS', action: 'provision', role: 'HKUST ALUM ADMIN DOWNLOAD DATA' },
    },
  ];

  const handler = createAccessHandler({ identities, events });
  const res = createMockResponse();
  await handler(createMockRequest('dao.alumni.manager@ust.hk', 'PEOPLESOFT'), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.decision, 'ALLOW');
  assert.equal(res.body.serviceId, 'PEOPLESOFT');
  assert.equal(res.body.attributes.role, 'HKUST ALUM ADMIN DOWNLOAD DATA');
});

test('returns 400 for unknown service_id values', async () => {
  const identities = {
    'known.user@ust.hk': { canonicalEmail: 'known.user@ust.hk', lifecycleState: 'active', sourceSystems: ['ECM'] },
  };
  const events = [
    { status: 'success', identity: { email: 'known.user@ust.hk' }, entitlement: { targetSystem: 'ECM', action: 'provision', role: 'ECM_USER' } },
  ];

  const handler = createAccessHandler({ identities, events });
  const res = createMockResponse();
  await handler(createMockRequest('known.user@ust.hk', 'unknown-system'), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /invalid service_id/i);
});

test('returns 400 when using PeopleSoft module key directly as service_id', async () => {
  const identities = {
    'ps.module@ust.hk': { canonicalEmail: 'ps.module@ust.hk', lifecycleState: 'active', sourceSystems: ['PEOPLESOFT'] },
  };
  const events = [
    { status: 'success', sourceSystem: 'PEOPLESOFT', identity: { email: 'ps.module@ust.hk' }, entitlement: { targetSystem: 'FMS', action: 'provision', role: 'FMS_USER' } },
  ];

  const handler = createAccessHandler({ identities, events });
  const res = createMockResponse();
  await handler(createMockRequest('ps.module@ust.hk', 'FMS'), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /invalid service_id/i);
});

test('normalizes service key formats for PEOPLESOFT variants', async () => {
  const identities = {
    'ps.variant@ust.hk': { canonicalEmail: 'ps.variant@ust.hk', lifecycleState: 'active', sourceSystems: ['PEOPLESOFT'] },
  };
  const events = [
    { status: 'success', identity: { email: 'ps.variant@ust.hk' }, entitlement: { targetSystem: 'FMS', action: 'provision', role: 'FMS_USER' } },
  ];

  const handler = createAccessHandler({ identities, events });
  const variants = ['people-soft', 'People Soft', 'PEOPLE.SOFT'];
  for (const variant of variants) {
    const res = createMockResponse();
    await handler(createMockRequest('ps.variant@ust.hk', variant), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.serviceId, 'PEOPLESOFT');
    assert.equal(res.body.decision, 'ALLOW');
  }
});

test('denies access when entitlement validFrom is in the future', async () => {
  const identities = {
    'future.user@ust.hk': { canonicalEmail: 'future.user@ust.hk', lifecycleState: 'active', sourceSystems: ['ECM'] },
  };
  const events = [
    {
      status: 'success',
      identity: { email: 'future.user@ust.hk' },
      entitlement: { targetSystem: 'ECM', action: 'provision', role: 'ECM_USER', validFrom: '2999-01-01T00:00:00.000Z' },
    },
  ];

  const handler = createAccessHandler({ identities, events });
  const res = createMockResponse();
  await handler(createMockRequest('future.user@ust.hk', 'ECM'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.decision, 'DENY');
  assert.equal(res.body.validity.isNowValid, false);
});

test('denies access when entitlement validUntil is in the past', async () => {
  const identities = {
    'expired.user@ust.hk': { canonicalEmail: 'expired.user@ust.hk', lifecycleState: 'active', sourceSystems: ['ECM'] },
  };
  const events = [
    {
      status: 'success',
      identity: { email: 'expired.user@ust.hk' },
      entitlement: { targetSystem: 'ECM', action: 'provision', role: 'ECM_USER', validUntil: '2000-01-01T00:00:00.000Z' },
    },
  ];

  const handler = createAccessHandler({ identities, events });
  const res = createMockResponse();
  await handler(createMockRequest('expired.user@ust.hk', 'ECM'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.decision, 'DENY');
  assert.equal(res.body.validity.isNowValid, false);
});

test('denies access when entitlement validity dates are invalid', async () => {
  const identities = {
    'invalid.date@ust.hk': { canonicalEmail: 'invalid.date@ust.hk', lifecycleState: 'active', sourceSystems: ['ECM'] },
  };
  const events = [
    {
      status: 'success',
      identity: { email: 'invalid.date@ust.hk' },
      entitlement: { targetSystem: 'ECM', action: 'provision', role: 'ECM_USER', validFrom: 'not-a-date' },
    },
  ];

  const handler = createAccessHandler({ identities, events });
  const res = createMockResponse();
  await handler(createMockRequest('invalid.date@ust.hk', 'ECM'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.decision, 'DENY');
  assert.equal(res.body.validity.isNowValid, false);
});

test('allows access when entitlement has no validity window', async () => {
  const identities = {
    'open.validity@ust.hk': { canonicalEmail: 'open.validity@ust.hk', lifecycleState: 'active', sourceSystems: ['ECM'] },
  };
  const events = [
    {
      status: 'success',
      identity: { email: 'open.validity@ust.hk' },
      entitlement: { targetSystem: 'ECM', action: 'provision', role: 'ECM_USER', validFrom: null, validUntil: null },
    },
  ];

  const handler = createAccessHandler({ identities, events });
  const res = createMockResponse();
  await handler(createMockRequest('open.validity@ust.hk', 'ECM'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.decision, 'ALLOW');
  assert.equal(res.body.validity.isNowValid, true);
});
