const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for ingestion endpoints (write-heavy, but still bounded).
 */
const ingestLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 200,               // max 200 ingest calls per minute per IP (generous for POC)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later.' },
});

/**
 * Rate limiter for query/read endpoints.
 */
const queryLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 300,               // max 300 read calls per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later.' },
});

module.exports = { ingestLimiter, queryLimiter };
