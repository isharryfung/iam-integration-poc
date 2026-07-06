/**
 * Shared UI helpers used across IAM user pages.
 */

export const STATE_BADGE_STYLES = {
  active:    { bg: '#dcfce7', color: '#166534' },
  inactive:  { bg: '#fee2e2', color: '#991b1b' },
  suspended: { bg: '#fef9c3', color: '#854d0e' },
};

export const PERMISSION_SYSTEMS = [
  { key: 'CADS', label: 'CADS' },
  { key: 'PEOPLESOFT', label: 'PeopleSoft' },
  { key: 'ECM', label: 'ECM' },
  { key: 'JSPM', label: 'JSPM' },
];

const PERMISSION_SYSTEM_KEYS = new Set(PERMISSION_SYSTEMS.map((system) => system.key));

function unique(values = []) {
  return [...new Set(values)];
}

export function normalizePermission(value) {
  // Mock IAM permissions are displayed and stored in uppercase for a consistent POC format.
  return String(value || '').trim().toUpperCase();
}

export function groupRolesBySystem(roles = []) {
  const grouped = {
    CADS: [],
    PEOPLESOFT: [],
    ECM: [],
    JSPM: [],
    OTHER: [],
  };

  roles.forEach((value) => {
    const role = String(value || '').trim();
    if (!role) return;

    const [prefix, ...rest] = role.split(':');
    const systemKey = prefix ? prefix.trim().toUpperCase() : '';
    const permission = normalizePermission(rest.join(':'));

    if (PERMISSION_SYSTEM_KEYS.has(systemKey) && permission) {
      grouped[systemKey].push(permission);
      return;
    }

    grouped.OTHER.push(normalizePermission(role));
  });

  return Object.fromEntries(
    Object.entries(grouped).map(([key, values]) => [key, unique(values)])
  );
}

export function flattenPermissionGroups(grouped = {}) {
  const scopedPermissions = PERMISSION_SYSTEMS.flatMap(({ key }) =>
    (grouped[key] || [])
      .map((permission) => normalizePermission(permission))
      .filter(Boolean)
      .map((permission) => `${key}:${permission}`)
  );

  const legacyPermissions = (grouped.OTHER || [])
    .map((permission) => normalizePermission(permission))
    .filter(Boolean);

  return unique([...scopedPermissions, ...legacyPermissions]);
}

export function StateBadge({ state }) {
  const style = STATE_BADGE_STYLES[state] || { bg: '#f1f5f9', color: '#475569' };
  return (
    <span style={{
      background: style.bg, color: style.color,
      padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
    }}>
      {state}
    </span>
  );
}
