import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../lib/api';
import {
  flattenPermissionGroups,
  groupRolesBySystem,
  normalizePermission,
  PERMISSION_SYSTEMS,
  StateBadge,
} from '../lib/iamUserHelpers';

export default function IamUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingUserId, setEditingUserId] = useState('');
  const [editPermissions, setEditPermissions] = useState(groupRolesBySystem([]));
  const [newPermissions, setNewPermissions] = useState({});
  const [savingUserId, setSavingUserId] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');

  async function loadUsers() {
    const data = await apiFetch('/api/iam/users');
    setUsers(data.users || []);
  }

  useEffect(() => {
    loadUsers()
      .catch((err) => setError(err.error?.message || err.message || 'Failed to load users'))
      .finally(() => setLoading(false));
  }, []);

  function handleStartEdit(user) {
    setEditingUserId(user.userId);
    setEditPermissions(groupRolesBySystem(user.roles || []));
    setNewPermissions({});
    setSaveSuccess('');
    setSaveError('');
  }

  function handleCancelEdit() {
    setEditingUserId('');
    setEditPermissions(groupRolesBySystem([]));
    setNewPermissions({});
  }

  function handleAddPermission(systemKey) {
    const permission = normalizePermission(newPermissions[systemKey]);
    if (!permission) return;

    setEditPermissions((current) => {
      if ((current[systemKey] || []).includes(permission)) return current;
      return {
        ...current,
        [systemKey]: [...(current[systemKey] || []), permission],
      };
    });
    setNewPermissions((current) => ({ ...current, [systemKey]: '' }));
  }

  function handleRemovePermission(systemKey, permission) {
    setEditPermissions((current) => ({
      ...current,
      [systemKey]: (current[systemKey] || []).filter((value) => value !== permission),
    }));
  }

  async function handleSavePermissions(userId) {
    setSavingUserId(userId);
    setSaveSuccess('');
    setSaveError('');
    try {
      await apiFetch(`/api/iam/users/${encodeURIComponent(userId)}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: flattenPermissionGroups(editPermissions) }),
      });
      await loadUsers();
      setEditingUserId('');
      setSaveSuccess(`Permissions saved for ${userId}.`);
    } catch (err) {
      setSaveError(err.error?.message || err.message || 'Failed to save permissions');
    } finally {
      setSavingUserId('');
    }
  }

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
                  {['User ID', 'Name', 'Email', 'Department', 'Roles', 'State', 'Actions'].map((h) => (
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
                    <>
                      <tr key={u.userId} style={{ borderBottom: editingUserId === u.userId ? 'none' : '1px solid #f1f5f9' }}>
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
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              onClick={() => handleStartEdit(u)}
                              style={{
                                background: '#e2e8f0', color: '#334155',
                                padding: '5px 12px', borderRadius: 6, border: 'none',
                                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              }}
                            >
                              Set permissions
                            </button>
                            <Link href={`/iam-users/${u.userId}`} style={{
                              background: '#1e40af', color: 'white',
                              padding: '5px 12px', borderRadius: 6,
                              fontSize: 12, fontWeight: 600, textDecoration: 'none',
                              whiteSpace: 'nowrap',
                            }}>
                              View →
                            </Link>
                          </div>
                        </td>
                      </tr>

                      {editingUserId === u.userId && (
                        <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                          <td colSpan={7} style={{ padding: 14 }}>
                            <div style={{ fontWeight: 700, color: '#1e3a8a', marginBottom: 10, fontSize: 13 }}>
                              Edit permissions for {u.displayName}
                            </div>

                            <div style={{ display: 'grid', gap: 10 }}>
                              {PERMISSION_SYSTEMS.map((system) => (
                                <div key={system.key} style={{
                                  background: 'white',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: 10,
                                  padding: 12,
                                }}>
                                  <div style={{ fontWeight: 700, fontSize: 12, color: '#1e3a8a', marginBottom: 8 }}>
                                    {system.label}
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                    {(editPermissions[system.key] || []).length === 0 && (
                                      <span style={{ color: '#94a3b8', fontSize: 11 }}>No permissions assigned.</span>
                                    )}
                                    {(editPermissions[system.key] || []).map((permission) => (
                                      <span key={`${system.key}:${permission}`} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        background: '#dbeafe', color: '#1e40af',
                                        padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                                      }}>
                                        {permission}
                                        <button
                                          onClick={() => handleRemovePermission(system.key, permission)}
                                          title={`Remove ${permission}`}
                                          style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: '#1e40af', fontSize: 12, lineHeight: 1, padding: 0,
                                          }}
                                        >
                                          ✕
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <input
                                      value={newPermissions[system.key] || ''}
                                      onChange={(e) => setNewPermissions((current) => ({ ...current, [system.key]: e.target.value }))}
                                      onKeyDown={(e) => e.key === 'Enter' && handleAddPermission(system.key)}
                                      placeholder={`New ${system.label} permission`}
                                      style={{
                                        flex: 1, padding: '7px 10px', borderRadius: 8,
                                        border: '1px solid #cbd5e1', fontSize: 12,
                                      }}
                                    />
                                    <button
                                      onClick={() => handleAddPermission(system.key)}
                                      style={{
                                        background: '#e2e8f0', color: '#334155',
                                        padding: '7px 12px', borderRadius: 8, border: 'none',
                                        fontWeight: 600, fontSize: 12, cursor: 'pointer',
                                      }}
                                    >
                                      + Add
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {(editPermissions.OTHER || []).length > 0 && (
                              <div style={{
                                marginTop: 10,
                                background: '#fefce8',
                                border: '1px solid #fde68a',
                                borderRadius: 10,
                                padding: 10,
                              }}>
                                <div style={{ fontWeight: 700, fontSize: 12, color: '#854d0e', marginBottom: 8 }}>
                                  Legacy permissions
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {editPermissions.OTHER.map((permission) => (
                                    <span key={permission} style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 6,
                                      background: '#fef3c7', color: '#92400e',
                                      padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                                    }}>
                                      {permission}
                                      <button
                                        onClick={() => handleRemovePermission('OTHER', permission)}
                                        title={`Remove ${permission}`}
                                        style={{
                                          background: 'none', border: 'none', cursor: 'pointer',
                                          color: '#92400e', fontSize: 12, lineHeight: 1, padding: 0,
                                        }}
                                      >
                                        ✕
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                              <button
                                onClick={() => handleSavePermissions(u.userId)}
                                disabled={savingUserId === u.userId}
                                style={{
                                  background: savingUserId === u.userId ? '#94a3b8' : '#1e40af',
                                  color: 'white',
                                  padding: '7px 14px',
                                  borderRadius: 8,
                                  border: 'none',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: savingUserId === u.userId ? 'default' : 'pointer',
                                }}
                              >
                                {savingUserId === u.userId ? 'Saving…' : 'Save permissions'}
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                style={{
                                  background: '#e2e8f0', color: '#334155',
                                  padding: '7px 14px', borderRadius: 8, border: 'none',
                                  fontWeight: 600, fontSize: 12, cursor: 'pointer',
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {saveSuccess && (
        <div style={{
          marginTop: 12, background: '#dcfce7', color: '#166534',
          padding: '8px 14px', borderRadius: 8, fontSize: 12,
        }}>
          ✅ {saveSuccess}
        </div>
      )}
      {saveError && (
        <div style={{
          marginTop: 12, background: '#fee2e2', color: '#991b1b',
          padding: '8px 14px', borderRadius: 8, fontSize: 12,
        }}>
          ⚠️ {saveError}
        </div>
      )}
    </div>
  );
}
