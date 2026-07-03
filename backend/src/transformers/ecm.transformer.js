/**
 * ECM combined payload transformer
 *
 * Merges two ECM source datasets into a single canonical combined payload per user:
 *   1) usergroup-user rows     { USERGROUPNAME, USERNAME }
 *   2) usergroup-doctype rows  { USERGROUPNAME, ITEMTYPENAME, Dept, Team, "Function/ Role?" }
 *
 * Usage:
 *   const { buildEcmCombinedPayloads } = require('./ecm.transformer');
 *   const results = buildEcmCombinedPayloads(membershipRows, groupItemRows, { defaultDomain: 'ust.hk' });
 *   // results: [{ username, isValid, errors, payload }, ...]
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

// ── Column normalization helpers ──────────────────────────────────────────────

function normalizeHeader(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

// ── Membership row transformer ─────────────────────────────────────────────────

/**
 * Transform a single usergroup-user row into a validated membership record.
 * Accepted column names (case/whitespace-insensitive):
 *   USERGROUPNAME  → groupName
 *   USERNAME       → username
 *
 * @param {Object} row - Raw row object
 * @returns {{ isValid: boolean, errors: string[], groupName: string, username: string }}
 */
function transformEcmMembershipRow(row) {
  const norm = {};
  for (const k of Object.keys(row || {})) {
    norm[normalizeHeader(k)] = row[k];
  }

  const groupName = normalizeText(norm['usergroupname']);
  const username  = normalizeText(norm['username']);

  const errors = [];
  if (!groupName) errors.push('USERGROUPNAME is required');
  if (!username)  errors.push('USERNAME is required');

  return { isValid: errors.length === 0, errors, groupName, username };
}

// ── Group-item (doctype) row transformer ──────────────────────────────────────

/**
 * Transform a single usergroup-doctype row into a validated group-item record.
 * Accepted column names (case/whitespace-insensitive):
 *   USERGROUPNAME      → groupName
 *   ITEMTYPENAME       → resourceName
 *   Dept               → dept
 *   Team               → team
 *   "Function/ Role?"  → functionOrRole
 *
 * @param {Object} row - Raw row object
 * @returns {{ isValid: boolean, errors: string[], groupName: string, resourceName: string, dept, team, functionOrRole }}
 */
function transformEcmGroupItemRow(row) {
  const norm = {};
  for (const k of Object.keys(row || {})) {
    norm[normalizeHeader(k)] = row[k];
  }

  const groupName    = normalizeText(norm['usergroupname']);
  const resourceName = normalizeText(norm['itemtypename']);
  const dept         = normalizeText(norm['dept']) || null;
  const team         = normalizeText(norm['team']) || null;
  // "Function/ Role?" normalises to "function role"
  const functionOrRole =
    normalizeText(norm['function role'] || norm['function role '] || norm['function  role']) || null;

  const errors = [];
  if (!groupName)    errors.push('USERGROUPNAME is required');
  if (!resourceName) errors.push('ITEMTYPENAME is required');

  return { isValid: errors.length === 0, errors, groupName, resourceName, dept, team, functionOrRole };
}

// ── Combined payload builder ──────────────────────────────────────────────────

/**
 * Build one combined ECM payload per unique USERNAME, merging:
 *   - group memberships from membershipRows
 *   - group-doctype entitlements from groupItemRows (resolved via shared USERGROUPNAME)
 *
 * Rows with missing required fields are silently skipped; any row-level errors
 * are collected in `diagnostics` on each result.
 *
 * @param {Object[]} membershipRows  - Raw usergroup-user rows
 * @param {Object[]} groupItemRows   - Raw usergroup-doctype rows
 * @param {Object}   [opts]
 * @param {string}   [opts.defaultDomain='ust.hk']
 * @param {string}   [opts.correlationId]
 * @param {string}   [opts.eventTime]   - ISO string; defaults to now
 *
 * @returns {Array<{
 *   username: string,
 *   isValid: boolean,
 *   errors: string[],
 *   diagnostics: string[],
 *   payload: Object
 * }>}
 */
function buildEcmCombinedPayloads(membershipRows, groupItemRows, opts = {}) {
  const defaultDomain = opts.defaultDomain || 'ust.hk';
  const eventTime     = opts.eventTime || new Date().toISOString();

  // 1. Parse and index group-item rows by groupName (skip invalid)
  const groupItemsByGroup = new Map(); // groupName → groupItem[]
  const groupItemDiagnostics = [];

  for (const raw of (groupItemRows || [])) {
    const r = transformEcmGroupItemRow(raw);
    if (!r.isValid) {
      groupItemDiagnostics.push(...r.errors.map(e => `group-item row skipped: ${e}`));
      continue;
    }
    if (!groupItemsByGroup.has(r.groupName)) groupItemsByGroup.set(r.groupName, []);
    groupItemsByGroup.get(r.groupName).push(r);
  }

  // 2. Parse membership rows; group by username (skip invalid)
  const membershipsByUser = new Map(); // username → { groups: Set<string>, diagnostics: string[] }
  const membershipDiagnostics = [];

  for (const raw of (membershipRows || [])) {
    const r = transformEcmMembershipRow(raw);
    if (!r.isValid) {
      membershipDiagnostics.push(...r.errors.map(e => `membership row skipped: ${e}`));
      continue;
    }
    if (!membershipsByUser.has(r.username)) {
      membershipsByUser.set(r.username, { groups: new Set(), diagnostics: [] });
    }
    membershipsByUser.get(r.username).groups.add(r.groupName);
  }

  // 3. Build one combined payload per user
  const results = [];

  for (const [username, { groups, diagnostics: userDiag }] of membershipsByUser.entries()) {
    const memberships = Array.from(groups).map(g => ({ groupName: g }));

    // Resolve group entitlements for all groups this user belongs to
    const groupEntitlements = [];
    for (const groupName of groups) {
      const items = groupItemsByGroup.get(groupName) || [];
      for (const item of items) {
        groupEntitlements.push({
          groupName:    item.groupName,
          resourceType: 'DOCUMENT_TYPE',
          resourceName: item.resourceName,
          dept:         item.dept,
          team:         item.team,
          functionOrRole: item.functionOrRole,
        });
      }
    }

    const idempotencyKey = `ECM|COMBINED|${username}`;
    const eventId = `ECM-COMBINED-${username}-${eventTime}`;
    const email = `${username.toLowerCase()}@${defaultDomain}`;

    const payload = {
      meta: {
        eventId,
        eventTime,
        sourceSystem:   'ECM',
        correlationId:  opts.correlationId || null,
        idempotencyKey,
        operation:      'UPSERT_USER_EFFECTIVE_ACCESS',
      },
      identity: {
        externalUserId: username,
        email,
      },
      entitlement: {
        application: 'ECM',
      },
      attributes: {
        memberships,
        groupEntitlements,
        effectiveAccessSummary: {
          totalGroups:   memberships.length,
          totalDocTypes: groupEntitlements.length,
        },
      },
    };

    const errors = [];
    if (memberships.length === 0) errors.push('No valid group memberships found for user');

    results.push({
      username,
      isValid:     errors.length === 0,
      errors,
      diagnostics: [...userDiag, ...groupItemDiagnostics, ...membershipDiagnostics],
      payload,
    });
  }

  return results;
}

module.exports = {
  transformEcmMembershipRow,
  transformEcmGroupItemRow,
  buildEcmCombinedPayloads,
};
