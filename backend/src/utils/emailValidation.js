/**
 * Email domain validation.
 * ALLOWED_EMAIL_DOMAINS env var is a comma-separated list of domains.
 * Default: ust.hk only.
 * Future expansion: add connect.ust.hk, family.ust.hk via env config.
 */
const ALLOWED_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || 'ust.hk')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

/**
 * Returns the domain portion of an email address (lowercase).
 * @param {string} email
 * @returns {string|null}
 */
function extractDomain(email) {
  if (!email || typeof email !== 'string') return null;
  const parts = email.toLowerCase().trim().split('@');
  return parts.length === 2 ? parts[1] : null;
}

/**
 * Validates that the email domain is in the allowed list.
 * @param {string} email
 * @returns {{ valid: boolean, domain: string|null, reason?: string }}
 */
function validateEmailDomain(email) {
  const domain = extractDomain(email);
  if (!domain) {
    return { valid: false, domain: null, reason: 'Invalid email format' };
  }
  if (!ALLOWED_DOMAINS.includes(domain)) {
    return {
      valid: false,
      domain,
      reason: `Email domain '${domain}' is not in the allowed list. Allowed: ${ALLOWED_DOMAINS.join(', ')}`,
    };
  }
  return { valid: true, domain };
}

module.exports = { validateEmailDomain, extractDomain, ALLOWED_DOMAINS };
