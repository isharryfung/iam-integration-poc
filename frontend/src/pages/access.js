import { useState } from 'react';
import { apiFetch, statusBadge, formatDate } from '../lib/api';

const SERVICES = ['ECM', 'CADS', 'PEOPLESOFT', 'JSPM', 'PORTAL', 'VPN'];

export default function AccessCheck() {
  const [email, setEmail] = useState('');
  const [serviceId, setServiceId] = useState('ECM');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function check(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await apiFetch(
        `/user/access?email=${encodeURIComponent(email)}`,
        { headers: { service_id: serviceId } }
      );
      setResult(data);
    } catch (err) {
      setError(err.error || err.message || 'Access check failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>🔑 Access Check</h1>
      <p style={{ color: '#64748b', marginBottom: 20 }}>
        Verify whether a user has access to a specific service. This simulates what an application
        gateway would call during login or authorization.
      </p>

      <form onSubmit={check} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <input
          type="email"
          placeholder="user@ust.hk"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{ flex: '1 1 260px', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
        />
        <select value={serviceId} onChange={e => setServiceId(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}>
          {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="submit" style={{
          background: '#1e40af', color: 'white', padding: '10px 24px',
          borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 14,
        }}>
          Check Access
        </button>
      </form>

      {loading && <p style={{ color: '#64748b' }}>Checking…</p>}
      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {result && (() => {
        const badge = statusBadge(result.decision);
        return (
          <div style={{
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            overflow: 'hidden',
            maxWidth: 600,
          }}>
            <div style={{
              background: result.decision === 'ALLOW' ? '#065f46' : '#991b1b',
              color: 'white',
              padding: '20px 24px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>
                {result.decision === 'ALLOW' ? '✅' : '❌'}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{result.decision}</div>
              <div style={{ opacity: 0.85, fontSize: 14, marginTop: 4 }}>
                {result.email} → {result.serviceId}
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {[
                  ['Email', result.email],
                  ['Service', result.serviceId],
                  ['Account Status', result.status],
                  ['Access Valid Now', result.validity?.isNowValid ? '✅ Yes' : '❌ No'],
                  ['Valid From', formatDate(result.validity?.start)],
                  ['Valid Until', formatDate(result.validity?.end)],
                  ['Role', result.attributes?.role || '—'],
                  ['Department', result.attributes?.department || '—'],
                  ['Data Security Level', result.attributes?.dataSecurityLevel || '—'],
                  ['Source Systems', (result.sourceSystems || []).join(', ') || '—'],
                  ['Source of Truth', result.sourceOfTruth],
                  ['Checked At', formatDate(result.checkedAt)],
                  ['Correlation ID', result.correlationId],
                ].map(([label, value]) => (
                  <tr key={label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '9px 16px', fontWeight: 600, color: '#475569', width: '40%' }}>{label}</td>
                    <td style={{ padding: '9px 16px', fontFamily: label === 'Correlation ID' ? 'monospace' : 'inherit', fontSize: label === 'Correlation ID' ? 11 : 13 }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      <div style={{ marginTop: 28, background: '#f0f9ff', borderRadius: 10, padding: 16, maxWidth: 600 }}>
        <p style={{ fontWeight: 600, marginBottom: 8 }}>ℹ️ How this works</p>
        <ul style={{ fontSize: 13, color: '#475569', paddingLeft: 20, lineHeight: 1.8 }}>
          <li>This endpoint checks if the user exists in the IAM system (has been ingested).</li>
          <li>Access is <strong>ALLOWED</strong> only when the account is active and has a matching entitlement for the requested service.</li>
          <li>If the user is not found, inactive/suspended, or missing service-specific entitlement, access is <strong>DENIED</strong>.</li>
          <li>System keys are normalized (for example, case/format differences) before matching entitlements.</li>
        </ul>
      </div>
    </div>
  );
}
