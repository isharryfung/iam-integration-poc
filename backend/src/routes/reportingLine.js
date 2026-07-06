/**
 * Reporting Line Resolver proxy route.
 *
 * Exposes POST /api/v1/approvals/resolve as an internal IAM endpoint.
 * Validates the incoming request, obtains an OAuth2 client credentials token
 * server-side, then proxies the request to the downstream Reporting Line service.
 * Credentials are never exposed to the frontend.
 */
const router = require('express').Router();
const { writeAudit } = require('../utils/audit');

// ── Configuration (from environment) ─────────────────────────────────────────
const REPORTING_LINE_API_BASE_URL = (process.env.REPORTING_LINE_API_BASE_URL || '').replace(/\/$/, '');
const REPORTING_LINE_TOKEN_URL = process.env.REPORTING_LINE_TOKEN_URL || '';
const REPORTING_LINE_CLIENT_ID = process.env.REPORTING_LINE_CLIENT_ID || '';
const REPORTING_LINE_CLIENT_SECRET = process.env.REPORTING_LINE_CLIENT_SECRET || '';
const REPORTING_LINE_SCOPE = process.env.REPORTING_LINE_SCOPE || 'approver.resolve';

// ── OAuth2 token cache ────────────────────────────────────────────────────────
let _tokenCache = { token: null, expiresAt: 0 };

/**
 * Obtains (or returns cached) OAuth2 client credentials access token.
 * Refreshes 30 s before expiry.
 */
async function getAccessToken() {
  const now = Date.now();
  if (_tokenCache.token && _tokenCache.expiresAt > now + 30_000) {
    return _tokenCache.token;
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: REPORTING_LINE_CLIENT_ID,
    client_secret: REPORTING_LINE_CLIENT_SECRET,
    scope: REPORTING_LINE_SCOPE,
  });

  const res = await fetch(REPORTING_LINE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OAuth2 token request failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  _tokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600) * 1000,
  };
  return _tokenCache.token;
}

// ── Validation helper ─────────────────────────────────────────────────────────
function validate(body) {
  const { requestId, idempotencyKey, action, requester, asOfTime, timezone } = body || {};

  if (!requestId) {
    return { status: 400, code: 'MISSING_FIELD', message: 'requestId is required' };
  }
  if (!idempotencyKey) {
    return { status: 400, code: 'MISSING_FIELD', message: 'idempotencyKey is required' };
  }
  if (!action || typeof action !== 'string' || action.trim() === '') {
    return { status: 400, code: 'MISSING_FIELD', message: 'action must be a non-empty string' };
  }
  if (!requester || (!requester.emplid && !requester.email)) {
    return { status: 422, code: 'MISSING_REQUESTER_IDENTITY', message: 'requester.emplid or requester.email is required' };
  }
  if (!asOfTime) {
    return { status: 400, code: 'MISSING_FIELD', message: 'asOfTime is required' };
  }
  if (!timezone) {
    return { status: 400, code: 'MISSING_FIELD', message: 'timezone is required' };
  }
  return null;
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/approvals/resolve
 *
 * Proxies to the downstream Reporting Line service after obtaining an OAuth2
 * client credentials token server-side. The frontend never sees the credentials.
 *
 * Request body fields:
 *   requestId        — UUID, required
 *   idempotencyKey   — string, required
 *   action           — any non-empty string (unknown actions accepted)
 *   requester        — { emplid?, email? } — at least one required
 *   context          — { department?, jobcode? } — optional
 *   asOfTime         — ISO-8601 date-time, required
 *   timezone         — e.g. "Asia/Hong_Kong", required
 */
router.post('/resolve', async (req, res) => {
  const requestId = (req.body || {}).requestId || null;

  // 1) Validate input
  const validationError = validate(req.body);
  if (validationError) {
    return res.status(validationError.status).json({
      error: { code: validationError.code, message: validationError.message },
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  const { action } = req.body;

  // 2) Check configuration
  if (!REPORTING_LINE_API_BASE_URL) {
    return res.status(503).json({
      error: {
        code: 'INTEGRATION_NOT_CONFIGURED',
        message: 'Reporting Line integration is not configured (REPORTING_LINE_API_BASE_URL missing)',
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    // 3) Obtain OAuth2 token (server-side only)
    const token = await getAccessToken();

    // 4) Proxy request downstream
    const downstreamUrl = `${REPORTING_LINE_API_BASE_URL}/api/v1/approvals/resolve`;
    const downstreamRes = await fetch(downstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        'X-Request-Id': requestId,
        'X-Idempotency-Key': req.body.idempotencyKey,
      },
      body: JSON.stringify(req.body),
    });

    let downstreamBody;
    try {
      downstreamBody = await downstreamRes.json();
    } catch {
      downstreamBody = { error: { code: 'INVALID_DOWNSTREAM_RESPONSE', message: 'Non-JSON response from Reporting Line service' } };
    }

    // 5) Audit log
    try {
      await writeAudit({
        correlationId: req.correlationId,
        actor: { type: 'api_client', apiKeyId: req.apiKeyId },
        action: 'resolve_approvers',
        resource: { type: 'approval_resolution', requestId, action },
        outcome: downstreamRes.ok ? 'success' : 'failure',
        httpStatus: downstreamRes.status,
        metadata: { approverCount: Array.isArray(downstreamBody.approvers) ? downstreamBody.approvers.length : undefined },
      });
    } catch (auditErr) {
      console.warn('Audit write failed', { action: 'resolve_approvers', error: auditErr.message });
    }

    // 6) Return downstream status and body
    return res.status(downstreamRes.status).json(downstreamBody);
  } catch (err) {
    console.error('Reporting Line proxy error:', err.message);
    return res.status(502).json({
      error: {
        code: 'UPSTREAM_ERROR',
        message: 'Failed to reach Reporting Line service',
        detail: err.message,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
// Exported for testing
module.exports._validate = validate;
module.exports._getAccessToken = getAccessToken;
module.exports._setTokenCache = (cache) => { _tokenCache = cache; };
