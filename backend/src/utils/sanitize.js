/**
 * Input sanitization helpers to prevent MongoDB query injection.
 *
 * MongoDB injection risk: a user-supplied value that is an object (e.g. {"$ne": null})
 * passed directly into a query filter can bypass equality checks.
 * Always coerce user inputs to primitive types before using them in queries.
 */

const VALID_SOURCE_SYSTEMS = ['CADS', 'PEOPLESOFT', 'ECM', 'JSPM'];
const VALID_EVENT_STATUSES = [
  'received', 'validated', 'validation_failed',
  'sent_to_midpoint', 'success', 'failed', 'retrying', 'dead_letter',
];

/**
 * Coerce a value to a plain string. Returns null if the value is not a non-empty string.
 * This prevents objects/arrays from being passed into MongoDB queries.
 * @param {*} value
 * @returns {string|null}
 */
function toSafeString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Validate a source system value against the known allowlist.
 * @param {*} value
 * @returns {string|null}
 */
function toSafeSourceSystem(value) {
  const str = toSafeString(value);
  if (!str) return null;
  const upper = str.toUpperCase();
  return VALID_SOURCE_SYSTEMS.includes(upper) ? upper : null;
}

/**
 * Validate an event status value against the known allowlist.
 * @param {*} value
 * @returns {string|null}
 */
function toSafeStatus(value) {
  const str = toSafeString(value);
  if (!str) return null;
  return VALID_EVENT_STATUSES.includes(str) ? str : null;
}

module.exports = { toSafeString, toSafeSourceSystem, toSafeStatus };
