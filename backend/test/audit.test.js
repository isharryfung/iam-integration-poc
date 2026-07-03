const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const auditModulePath = path.resolve(__dirname, '../src/utils/audit.js');
const inboundRoutePath = path.resolve(__dirname, '../src/routes/inbound.js');

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

test('normalizeAuditResource keeps strings unchanged and falls back to empty string for nullish values', () => {
  const { normalizeAuditResource } = require('../src/utils/audit');

  assert.equal(normalizeAuditResource('inbound_event:123'), 'inbound_event:123');
  assert.equal(normalizeAuditResource(null), '');
  assert.equal(normalizeAuditResource(undefined), '');
});

test('writeAudit persists object resource as a string and tolerates undefined fields', async () => {
  const created = [];
  const { writeAudit } = loadModuleWithMocks(auditModulePath, {
    '../models/AuditLog': {
      create: async (doc) => {
        created.push(doc);
        return doc;
      },
    },
  });

  await writeAudit({
    correlationId: 'corr-audit-1',
    action: 'ingest_event',
    resource: { type: 'inbound_event', id: 'evt-123', email: undefined },
    outcome: 'success',
    httpStatus: 202,
  });

  assert.equal(created.length, 1);
  assert.equal(typeof created[0].resource, 'string');
  assert.equal(created[0].resource, '{"type":"inbound_event","id":"evt-123","email":null}');
});

test('submit handlers stay successful when audit persistence fails for CADS, PEOPLESOFT, ECM, and JSPM', async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);

  try {
    const router = loadModuleWithMocks(inboundRoutePath, {
      '../utils/ingestHelper': {
        ingestEvent: async () => ({
          event: {
            eventId: 'evt-123',
            status: 'validated',
            identity: { email: 'john.doe@ust.hk' },
          },
          duplicate: false,
        }),
      },
      '../models/IngestionJob': {
        create: async () => ({ _id: 'job-db-id' }),
        findByIdAndUpdate: async () => null,
      },
      '../models/AuditLog': {
        create: async () => {
          throw new Error('AuditLog validation failed');
        },
      },
    });

    const canonicalBody = {
      meta: { sourceSystem: 'TEST', eventId: 'evt-123' },
      identity: { email: 'john.doe@ust.hk' },
      entitlement: { application: 'TEST', roleName: 'User', departmentOrProject: 'ITS' },
    };

    for (const routePath of ['/cads', '/peoplesoft', '/ecm', '/jspm']) {
      const handler = getRouteHandler(router, routePath);
      const req = {
        body: canonicalBody,
        headers: { 'x-source-system': routePath.slice(1).toUpperCase() },
        correlationId: `corr-${routePath.slice(1)}`,
        apiKeyId: 'dev-key',
      };
      const res = createMockResponse();

      await handler(req, res);

      assert.equal(res.statusCode, 202, `${routePath} should still return accepted`);
      assert.equal(res.body.message, 'Event accepted');
      assert.equal(res.body.eventId, 'evt-123');
      assert.equal(res.body.correlationId, req.correlationId);
    }

    assert.equal(warnings.length, 4);
    for (const [, context] of warnings) {
      assert.equal(context.action, 'ingest_event');
      assert.equal(context.error, 'AuditLog validation failed');
      assert.equal(
        context.resource,
        '{"type":"inbound_event","id":"evt-123","email":"john.doe@ust.hk"}'
      );
    }
  } finally {
    console.warn = originalWarn;
  }
});
