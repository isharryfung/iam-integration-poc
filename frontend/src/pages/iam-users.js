import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../lib/api';
import { groupRolesBySystem, PERMISSION_SYSTEMS, StateBadge } from '../lib/iamUserHelpers';

export default function IamUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/iam/users')
      .then((data) => setUsers(data.users || []))
      .catch((err) => setError(err.error?.message || err.message || 'Failed to load users'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 960 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
        👥 IAM Users
      </h1>
      <p style={{ color: '#64748b', marginBottom: 24, fontSize: 14 }}>
        Browse all users in the IAM system. Click a user to view their permissions
        and reporting line.
      </p>

      {loading && <p style={{ color: '#64748b' }}>Loading users…</p>}

      {error && (
        <div style={{
          background: '#fee2e2', color: '#991b1b',
          padding: 14, borderRadius: 10, marginBottom: 16, fontSize: 13,
        }}>
          ⚠️ {error}
        </div>
      )}

      {!loading && !error && users.length === 0 && (
        <div style={{
          background: '#f0f9ff', borderRadius: 12,
          border: '1px solid #bae6fd', padding: 20, fontSize: 13, color: '#0369a1',
        }}>
          No users found. Run <code>node db/setup.js</code> in the backend to seed mock data.
        </div>
      )}

      {!loading && users.length > 0 && (
        <div style={{
          background: 'white', borderRadius: 12,
          border: '1px solid #e2e8f0', overflow: 'hidden',
        }}>
          <div style={{
            background: '#1e40af', color: 'white',
            padding: '12px 16px', fontWeight: 700, fontSize: 14,
          }}>
            👥 Users ({users.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['User ID', 'Name', 'Email', 'Department', 'Roles', 'State', ''].map((h) => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left',
                      fontWeight: 600, color: '#475569',
                      borderBottom: '1px solid #e2e8f0',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const grouped = groupRolesBySystem(u.roles || []);
                  const scopedCounts = PERMISSION_SYSTEMS
                    .map((system) => ({
                      key: system.key,
                      label: system.label,
                      count: grouped[system.key]?.length || 0,
                    }))
                    .filter((system) => system.count > 0);
                  const legacyCount = grouped.OTHER?.length || 0;

                  return (
                    <tr key={u.userId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#1e40af', fontWeight: 600 }}>
                      {u.userId}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{u.displayName}</td>
                    <td style={{ padding: '10px 14px', color: '#475569' }}>{u.email}</td>
                    <td style={{ padding: '10px 14px', color: '#475569' }}>{u.department || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {scopedCounts.map((system) => (
                          <span key={system.key} style={{
                            background: '#dbeafe', color: '#1e40af',
                            padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                          }}>{system.label} ({system.count})</span>
                        ))}
                        {legacyCount > 0 && (
                          <span style={{
                            background: '#fef3c7', color: '#92400e',
                            padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                          }}>Legacy ({legacyCount})</span>
                        )}
                        {scopedCounts.length === 0 && legacyCount === 0 && (
                          <span style={{ color: '#94a3b8', fontSize: 11 }}>no roles</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <StateBadge state={u.lifecycleState} />
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <Link href={`/iam-users/${u.userId}`} style={{
                        background: '#1e40af', color: 'white',
                        padding: '5px 12px', borderRadius: 6,
                        fontSize: 12, fontWeight: 600, textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}>
                        View →
                      </Link>
                    </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
