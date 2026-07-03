/**
 * API Key middleware.
 * Validates the `api_key` header against configured allowed keys.
 * Skips validation for /health endpoint.
 */
const VALID_API_KEYS = (process.env.API_KEYS || 'poc-dev-key-1234')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

function apiKeyMiddleware(req, res, next) {
  // Public endpoints skip auth
  if (req.path === '/health') return next();

  const key = req.headers['api_key'] || req.headers['x-api-key'];
  if (!key) {
    return res.status(401).json({ error: 'Missing api_key header' });
  }
  if (!VALID_API_KEYS.includes(key)) {
    return res.status(401).json({ error: 'Invalid api_key' });
  }
  // Attach a truncated key identifier for audit logs
  req.apiKeyId = key.slice(0, 8) + '...';
  next();
}

module.exports = { apiKeyMiddleware };
