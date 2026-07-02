import { useState } from 'react';
import { apiFetch, statusBadge, formatDate } from '../lib/api';

export default function SyncStatus() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayResult, setReplayResult] = useState(null);

  async function search(e) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    setResult(null);
    setReplayResult(null);
    try {
      const data = await apiFetch(`/api/v1/users/${encodeURIComponent(email)}/sync-status`);
      setResult(data);
    } catch (err) {
      setError(err.error || err.message || 'User not found or error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function triggerReplay() {
    setReplayLoading(true);
    setReplayResult(null);
    try {
      const data = await apiFetch(`/api/v1/users/${encodeURIComponent(email)}/replay`, { method: 'POST', body: '{}' });
      setReplayResult(data);
    } catch (err) {
      setReplayResult({ error: err.error || err.message || 'Replay failed' });
    } finally {
      setReplayLoading(false);
    }
  }

  const StatusRow = ({ label, value, highlight }) => (
    <tr style={{ background: highlight ? '#fffbeb' : 'transparent' }}>
      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#475569', width: '40%' }}>{label}</td>
      <td style={{ padding: '8px 12px' }}>{value || '—'}</td>
    </tr>
  );

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>🔄 Sync Status Viewer</h1>
      <p style={{ color: '#64748b', marginBottom: 20 }}>
        Check the current identity sync and provisioning status for any user by email.
      </p>

      <form onSubmit={search} style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <input
          type="email"
          placeholder="user@ust.hk"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{ flex: '1 1 280px', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
        />
        <button type="submit" style={{
          background: '#1e40af', color: 'white', padding: '10px 24px',
          borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 14,
        }}>
          Check Status
        </button>
      </form>

      {loading && <p style={{ color: '#64748b' }}>Loading…</p>}
      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {result && (
        <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ background: '#1e40af', color: 'white', padding: '14px 20px' }}>
            <span style={{ fontWeight: 700, fontSize: 18 }}>{result.email}</span>
            <span style={{ marginLeft: 12, fontSize: 13, opacity: 0.8 }}>
              {result.displayName || ''} • {result.userType || ''} • {result.emailDomain || ''}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            <div>
              <div style={{ padding: '12px 16px', background: '#f8fafc', fontWeight: 700, color: '#1e3a8a', borderBottom: '1px solid #e2e8f0' }}>
                Latest Processing Status
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  <StatusRow label="Last Source System" value={result.lastSourceSystem} />
                  <StatusRow label="Last Event Time" value={formatDate(result.lastEventTime)} />
                  {(() => {
                    const badge = statusBadge(result.lastProcessingStatus);
                    return (
                      <tr>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#475569' }}>Processing Status</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ background: badge.bg, color: badge.color, padding: '3px 10px', borderRadius: 12, fontWeight: 600, fontSize: 12 }}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })()}
                  <StatusRow label="Last Success" value={formatDate(result.lastSuccessAt)} />
                  <StatusRow label="Last Failure" value={formatDate(result.lastFailureAt)} highlight={!!result.lastFailureAt} />
                  <StatusRow label="Last Error" value={result.lastError} highlight={!!result.lastError} />
                </tbody>
              </table>
            </div>

            <div style={{ borderLeft: '1px solid #e2e8f0' }}>
              <div style={{ padding: '12px 16px', background: '#f8fafc', fontWeight: 700, color: '#1e3a8a', borderBottom: '1px solid #e2e8f0' }}>
                Activity Summary
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  <StatusRow label="Total Events Received" value={result.totalEventsReceived} />
                  <StatusRow label="Total Events Failed" value={result.totalEventsFailed} highlight={result.totalEventsFailed > 0} />
                  <StatusRow label="Has Recent Failure" value={result.activeFlags?.hasRecentFailure ? '⚠️ Yes' : '✅ No'} highlight={result.activeFlags?.hasRecentFailure} />
                  <StatusRow label="Pending Retry" value={result.activeFlags?.hasPendingRetry ? '🔄 Yes' : 'No'} />
                  <StatusRow label="In Dead Letter" value={result.activeFlags?.isInDeadLetter ? '💀 Yes' : 'No'} highlight={result.activeFlags?.isInDeadLetter} />
                </tbody>
              </table>
            </div>
          </div>

          {/* Source Contributions */}
          {result.sourceContributions && (
            <div style={{ borderTop: '1px solid #e2e8f0' }}>
              <div style={{ padding: '12px 16px', background: '#f8fafc', fontWeight: 700, color: '#1e3a8a' }}>
                Source System Contributions
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 16 }}>
                {Object.entries(result.sourceContributions).map(([sys, info]) => {
                  if (!info || !info.lastEventAt) return null;
                  const badge = statusBadge(info.lastStatus);
                  return (
                    <div key={sys} style={{
                      background: '#f0f9ff', borderRadius: 10, padding: '10px 16px',
                      borderLeft: '4px solid #3b82f6', minWidth: 180,
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{sys}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Last: {formatDate(info.lastEventAt)}</div>
                      <span style={{ background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, marginTop: 4, display: 'inline-block' }}>
                        {badge.label}
                      </span>
                      {info.psModule && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Module: {info.psModule}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Replay button if there are failures */}
          {(result.activeFlags?.hasRecentFailure || result.activeFlags?.isInDeadLetter) && (
            <div style={{ borderTop: '1px solid #e2e8f0', padding: 16, background: '#fffbeb' }}>
              <p style={{ fontSize: 13, color: '#92400e', marginBottom: 10 }}>
                ⚠️ This user has failed events. You can replay the latest failed event:
              </p>
              <button
                onClick={triggerReplay}
                disabled={replayLoading}
                style={{
                  background: replayLoading ? '#94a3b8' : '#d97706',
                  color: 'white', padding: '8px 20px', borderRadius: 8,
                  border: 'none', fontWeight: 600, fontSize: 13,
                }}
              >
                {replayLoading ? 'Replaying…' : '🔄 Replay Last Failed Event'}
              </button>
              {replayResult && (
                <div style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 8,
                  background: replayResult.error ? '#fee2e2' : '#d1fae5',
                  color: replayResult.error ? '#991b1b' : '#065f46',
                  fontSize: 13,
                }}>
                  {replayResult.error
                    ? `❌ ${replayResult.error}`
                    : `✅ Replay initiated — new Event ID: ${replayResult.replayEventId}`
                  }
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
