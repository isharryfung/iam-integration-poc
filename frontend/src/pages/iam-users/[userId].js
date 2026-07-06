import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';

const FIXED_ACTIONS = ['annual_leave', 'sick_leave', 'epdr'];

const STATE_BADGE = {
  active:    { bg: '#dcfce7', color: '#166534' },
  inactive:  { bg: '#fee2e2', color: '#991b1b' },
  suspended: { bg: '#fef9c3', color: '#854d0e' },
};

function StateBadge({ state }) {
  const style = STATE_BADGE[state] || { bg: '#f1f5f9', color: '#475569' };
  return (
    <span style={{
      background: style.bg, color: style.color,
      padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
    }}>
      {state}
    </span>
  );
}

const CARD_STYLE = {
  background: '#f8fafc',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  padding: 20,
  marginBottom: 20,
};

const SECTION_HEADER = {
  fontWeight: 700, marginBottom: 14, color: '#1e40af', fontSize: 15,
};

export default function IamUserDetail() {
  const router = useRouter();
  const { userId } = router.query;

  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [userError, setUserError] = useState('');

  // Permissions editing
  const [editRoles, setEditRoles] = useState([]);
  const [newRole, setNewRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');

  // Reporting line
  const [selectedAction, setSelectedAction] = useState('annual_leave');
  const [customAction, setCustomAction] = useState('');
  const [rlLoading, setRlLoading] = useState(false);
  const [rlResult, setRlResult] = useState(null);
  const [rlError, setRlError] = useState('');

  useEffect(() => {
    if (!userId) return;
    setLoadingUser(true);
    apiFetch(`/api/iam/users/${encodeURIComponent(userId)}`)
      .then((data) => {
        setUser(data);
        setEditRoles(data.roles || []);
      })
      .catch((err) => setUserError(err.error?.message || err.message || 'Failed to load user'))
      .finally(() => setLoadingUser(false));
  }, [userId]);

  // ── Permissions ─────────────────────────────────────────────────────────────

  function handleAddRole() {
    const role = newRole.trim().toUpperCase();
    if (!role) return;
    if (editRoles.includes(role)) {
      setNewRole('');
      return;
    }
    setEditRoles([...editRoles, role]);
    setNewRole('');
  }

  function handleRemoveRole(role) {
    setEditRoles(editRoles.filter((r) => r !== role));
  }

  async function handleSavePermissions() {
    setSaving(true);
    setSaveSuccess('');
    setSaveError('');
    try {
      await apiFetch(`/api/iam/users/${encodeURIComponent(userId)}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: editRoles }),
      });
      setSaveSuccess('Permissions saved successfully.');
      // Refresh user data
      const updated = await apiFetch(`/api/iam/users/${encodeURIComponent(userId)}`);
      setUser(updated);
      setEditRoles(updated.roles || []);
    } catch (err) {
      setSaveError(err.error?.message || err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // ── Reporting Line ───────────────────────────────────────────────────────────

  async function handleResolveReportingLine() {
    const action = customAction.trim() || selectedAction;
    if (!action) return;
    setRlLoading(true);
    setRlResult(null);
    setRlError('');
    try {
      const data = await apiFetch(
        `/api/iam/users/${encodeURIComponent(userId)}/reporting-line?action=${encodeURIComponent(action)}`
      );
      setRlResult(data);
    } catch (err) {
      setRlError(err.error?.message || err.message || 'Failed to load reporting line');
    } finally {
      setRlLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loadingUser) return <p style={{ color: '#64748b', marginTop: 24 }}>Loading user…</p>;

  if (userError) {
    return (
      <div>
        <Link href="/iam-users" style={{ color: '#1e40af', fontSize: 13 }}>← Back to Users</Link>
        <div style={{
          background: '#fee2e2', color: '#991b1b',
          padding: 14, borderRadius: 10, marginTop: 16, fontSize: 13,
        }}>
          ⚠️ {userError}
        </div>
      </div>
    );
  }

  if (!user) return null;

  const effectiveAction = customAction.trim() || selectedAction;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/iam-users" style={{ color: '#1e40af', fontSize: 13 }}>← Back to Users</Link>
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        👤 {user.displayName}
      </h1>
      <p style={{ color: '#64748b', marginBottom: 24, fontSize: 13 }}>
        User ID: <code>{user.userId}</code> · Emplid: <code>{user.emplid || '—'}</code> · {user.email}
      </p>

      {/* ── User Info ── */}
      <div style={CARD_STYLE}>
        <div style={SECTION_HEADER}>🪪 User Information</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 13 }}>
          <div><strong>Department:</strong> {user.department || '—'}</div>
          <div><strong>Job Code:</strong> {user.jobcode || '—'}</div>
          <div><strong>Email:</strong> {user.email}</div>
          <div>
            <strong>State: </strong>
            <StateBadge state={user.lifecycleState} />
          </div>
        </div>
      </div>

      {/* ── Permissions ── */}
      <div style={CARD_STYLE}>
        <div style={SECTION_HEADER}>🔑 Permissions (Roles)</div>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
          Add or remove roles. Click <strong>Save</strong> to persist the changes.
        </p>

        {/* Current roles */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {editRoles.length === 0 && (
            <span style={{ color: '#94a3b8', fontSize: 12 }}>No roles assigned.</span>
          )}
          {editRoles.map((role) => (
            <span key={role} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#dbeafe', color: '#1e40af',
              padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
            }}>
              {role}
              <button
                onClick={() => handleRemoveRole(role)}
                title={`Remove ${role}`}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#1e40af', fontSize: 13, lineHeight: 1, padding: 0,
                }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>

        {/* Add role */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddRole()}
            placeholder="New role (e.g. ADMIN)"
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              border: '1px solid #cbd5e1', fontSize: 13,
            }}
          />
          <button
            onClick={handleAddRole}
            style={{
              background: '#e2e8f0', color: '#334155',
              padding: '8px 16px', borderRadius: 8, border: 'none',
              fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}
          >
            + Add
          </button>
        </div>

        {/* Save button */}
        <button
          onClick={handleSavePermissions}
          disabled={saving}
          style={{
            background: saving ? '#94a3b8' : '#1e40af', color: 'white',
            padding: '9px 20px', borderRadius: 8, border: 'none',
            fontWeight: 700, fontSize: 13, cursor: saving ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : '💾 Save Permissions'}
        </button>

        {saveSuccess && (
          <div style={{
            marginTop: 10, background: '#dcfce7', color: '#166534',
            padding: '8px 14px', borderRadius: 8, fontSize: 12,
          }}>
            ✅ {saveSuccess}
          </div>
        )}
        {saveError && (
          <div style={{
            marginTop: 10, background: '#fee2e2', color: '#991b1b',
            padding: '8px 14px', borderRadius: 8, fontSize: 12,
          }}>
            ⚠️ {saveError}
          </div>
        )}
      </div>

      {/* ── Reporting Line ── */}
      <div style={CARD_STYLE}>
        <div style={SECTION_HEADER}>📋 Reporting Line (Read-only)</div>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
          Select an action to view the approver chain. The reporting line data is read-only.
        </p>

        {/* Action selector */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: '#475569', marginBottom: 6 }}>
            Fixed Actions
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {FIXED_ACTIONS.map((a) => (
              <button
                key={a}
                onClick={() => { setSelectedAction(a); setCustomAction(''); }}
                style={{
                  padding: '6px 14px', borderRadius: 8,
                  border: '2px solid',
                  borderColor: selectedAction === a && !customAction.trim() ? '#1e40af' : '#cbd5e1',
                  background: selectedAction === a && !customAction.trim() ? '#dbeafe' : 'white',
                  color: selectedAction === a && !customAction.trim() ? '#1e40af' : '#475569',
                  fontWeight: 600, fontSize: 12, cursor: 'pointer',
                }}
              >
                {a}
              </button>
            ))}
          </div>

          <div style={{ fontWeight: 600, fontSize: 12, color: '#475569', marginBottom: 6 }}>
            Custom Action (for unknown-action testing)
          </div>
          <input
            value={customAction}
            onChange={(e) => setCustomAction(e.target.value)}
            placeholder="e.g. contract_renewal"
            style={{
              width: '100%', maxWidth: 320, padding: '8px 12px',
              borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13,
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          onClick={handleResolveReportingLine}
          disabled={rlLoading}
          style={{
            background: rlLoading ? '#94a3b8' : '#0f172a', color: 'white',
            padding: '9px 20px', borderRadius: 8, border: 'none',
            fontWeight: 700, fontSize: 13, cursor: rlLoading ? 'default' : 'pointer',
            marginBottom: 16,
          }}
        >
          {rlLoading ? 'Loading…' : `🔍 View for "${effectiveAction}"`}
        </button>

        {rlError && (
          <div style={{
            background: '#fee2e2', color: '#991b1b',
            padding: '8px 14px', borderRadius: 8, fontSize: 12, marginBottom: 12,
          }}>
            ⚠️ {rlError}
          </div>
        )}

        {rlResult && (
          <div>
            <div style={{
              background: 'white', borderRadius: 10,
              border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 12,
            }}>
              <div style={{
                background: '#0f172a', color: 'white',
                padding: '10px 14px', fontWeight: 700, fontSize: 13,
              }}>
                Approvers for <code style={{ fontWeight: 400 }}>{rlResult.action}</code>
                {' '}({rlResult.approvers.length})
              </div>

              {rlResult.approvers.length === 0 && (
                <div style={{ padding: 14, color: '#64748b', fontSize: 13 }}>
                  No approvers found for this action (unknown action fallback).
                </div>
              )}

              {rlResult.approvers.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['Level', 'Emplid', 'Email', 'Name', 'Role', 'Source'].map((h) => (
                          <th key={h} style={{
                            padding: '8px 12px', textAlign: 'left',
                            fontWeight: 600, color: '#475569',
                            borderBottom: '1px solid #e2e8f0',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rlResult.approvers.map((a, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1e40af' }}>{a.level}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{a.emplid}</td>
                          <td style={{ padding: '8px 12px' }}>{a.email}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{a.name}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{
                              background: '#dbeafe', color: '#1e40af',
                              padding: '2px 8px', borderRadius: 10, fontSize: 11,
                            }}>{a.role}</span>
                          </td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>{a.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {rlResult.audit && (
                <div style={{
                  padding: '8px 14px', background: '#f8fafc',
                  borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#64748b',
                }}>
                  <strong>Audit:</strong> rule {rlResult.audit.ruleId} v{rlResult.audit.ruleVersion} · snapshot {rlResult.audit.orgSnapshotId}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
