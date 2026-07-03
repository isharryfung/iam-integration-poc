const { v4: uuidv4 } = require('uuid');

const columnMapPeoplesoft = {
  Dept: 'entitlement.departmentOrProject',
  'Rank/ Team': 'attributes.rankOrTeam',
  User: 'identity.email',
  'Role Name': 'entitlement.roleName',
  Remarks: 'attributes.remarks',
  'Data Level Security': 'attributes.dataLevelSecurity',
};

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

function parseDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function convertYN(value) {
  const text = normalizeText(value).toUpperCase();
  if (!text) return null;
  if (['Y', 'YES', 'TRUE'].includes(text)) return true;
  if (['N', 'NO', 'FALSE'].includes(text)) return false;
  return null;
}

function normalizeRoleName(value) {
  return normalizeText(value);
}

function normalizeUser(value, defaultDomain) {
  const text = normalizeText(value);
  if (!text) return {};
  if (text.includes('@')) {
    return { email: text.toLowerCase() };
  }
  if (!/\s/.test(text)) {
    return { email: `${text.toLowerCase()}@${defaultDomain}` };
  }
  return { displayName: text };
}

function normalizeDataLevelSecurity(value) {
  const text = normalizeText(value);
  if (!text) return null;

  const lowered = text.toLowerCase();
  if (lowered === 'all students') {
    return { scope: 'ALL_STUDENTS', label: text };
  }
  if (lowered === 'students of their school/dept') {
    return { scope: 'SCHOOL_DEPT_STUDENTS', label: text };
  }
  if (lowered === 'all alumni') {
    return { scope: 'ALL_ALUMNI', label: text };
  }
  if (lowered === 'alumni of their school/dept') {
    return { scope: 'SCHOOL_DEPT_ALUMNI', label: text };
  }
  if (lowered === 'alumni related donations') {
    return { scope: 'ALUMNI_RELATED_DONATIONS', label: text };
  }
  if (lowered.includes('all contacts in cms')) {
    return {
      scope: 'CMS_ALL_CONTACTS',
      access: lowered.includes('read-only') ? 'READ_ONLY_EXTERNAL_UNITS' : 'STANDARD',
      label: text,
    };
  }
  if (lowered === 'y' || lowered === 'n' || lowered === 'yes' || lowered === 'no') {
    return { scope: convertYN(lowered) ? 'ENABLED' : 'DISABLED', label: text };
  }
  return { scope: 'CUSTOM', label: text };
}

function inferApplication(roleName, remarks) {
  const remarkText = normalizeText(remarks);
  const roleText = normalizeRoleName(roleName).toLowerCase();
  const accessMatch = remarkText.match(/access to\s+(.+)$/i);
  if (accessMatch) return normalizeText(accessMatch[1]).toUpperCase();
  if (roleText.includes('alum')) return 'AAS';
  if (roleText.includes('dm ')) return 'DMS';
  if (roleText.includes('stu ') || roleText.includes(' sf ') || roleText.includes(' arro ')) return 'SIS';
  return 'PEOPLESOFT';
}

function buildIdempotencyKey(payload) {
  const identity = payload.identity.email || payload.identity.displayName || 'unknown-user';
  const department = payload.entitlement.departmentOrProject || 'unknown-department';
  const roleName = payload.entitlement.roleName || 'unknown-role';
  return `peoplesoft|${identity}|${department}|${roleName}`;
}

function buildEventId() {
  return `ps-${uuidv4()}`;
}

function transformPeoplesoftRow(row, opts = {}) {
  const defaultDomain = normalizeText(opts.defaultDomain) || 'ust.hk';
  const normalizedRow = {};
  const normalizedMap = Object.fromEntries(
    Object.entries(columnMapPeoplesoft).map(([header, targetPath]) => [normalizeHeader(header), targetPath])
  );

  Object.entries(row || {}).forEach(([header, value]) => {
    normalizedRow[normalizeHeader(header)] = value;
  });

  const payload = {
    meta: {
      eventId: normalizeText(opts.eventId) || buildEventId(),
      eventTime: parseDate(opts.eventTime) || new Date().toISOString(),
      sourceSystem: 'PEOPLESOFT',
      correlationId: normalizeText(opts.correlationId) || null,
      idempotencyKey: normalizeText(opts.idempotencyKey) || null,
      operation: normalizeText(opts.operation) || 'ASSIGN_ENTITLEMENT',
    },
    identity: {},
    entitlement: {},
    attributes: {},
  };

  Object.entries(normalizedMap).forEach(([normalizedHeader, targetPath]) => {
    const rawValue = normalizedRow[normalizedHeader];
    const textValue = normalizeText(rawValue);
    if (!textValue) return;

    if (targetPath === 'identity.email') {
      Object.assign(payload.identity, normalizeUser(rawValue, defaultDomain));
      return;
    }

    if (targetPath === 'entitlement.roleName') {
      payload.entitlement.roleName = normalizeRoleName(rawValue);
      return;
    }

    if (targetPath === 'attributes.dataLevelSecurity') {
      payload.attributes.dataLevelSecurity = normalizeDataLevelSecurity(rawValue);
      return;
    }

    if (targetPath === 'entitlement.departmentOrProject') {
      payload.entitlement.departmentOrProject = textValue;
      return;
    }

    if (targetPath === 'attributes.rankOrTeam') {
      payload.attributes.rankOrTeam = textValue;
      return;
    }

    if (targetPath === 'attributes.remarks') {
      payload.attributes.remarks = textValue;
    }
  });

  payload.identity.userType = normalizeText(opts.userType) || 'staff';
  payload.entitlement.application =
    normalizeText(opts.application) || inferApplication(payload.entitlement.roleName, payload.attributes.remarks);
  payload.entitlement.action = normalizeText(opts.action) || 'provision';
  payload.entitlement.department = payload.entitlement.departmentOrProject || null;
  payload.entitlement.validFrom = parseDate(opts.validFrom);
  payload.entitlement.validUntil = parseDate(opts.validUntil);
  payload.meta.idempotencyKey = payload.meta.idempotencyKey || buildIdempotencyKey(payload);

  const errors = [];
  if (!payload.identity.email && !payload.identity.displayName) {
    errors.push('identity.email or identity.displayName is required');
  }
  if (!payload.entitlement.roleName) {
    errors.push('entitlement.roleName is required');
  }
  if (!payload.entitlement.departmentOrProject) {
    errors.push('entitlement.departmentOrProject is required');
  }

  return {
    sourceSystem: 'PeopleSoft',
    isValid: errors.length === 0,
    errors,
    payload,
  };
}

module.exports = {
  columnMapPeoplesoft,
  transformPeoplesoftRow,
};
