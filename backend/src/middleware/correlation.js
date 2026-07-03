const { v4: uuidv4 } = require('uuid');

/**
 * Correlation middleware.
 * Reads or generates a X-Correlation-Id for every request and attaches it
 * to req.correlationId so all downstream handlers can reference it.
 */
function correlationMiddleware(req, _res, next) {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  next();
}

module.exports = { correlationMiddleware };
