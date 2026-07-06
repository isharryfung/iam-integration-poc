import { useState } from 'react';
import { apiFetch } from '../lib/api';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function generateIdempotencyKey(action, emplid) {
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `IAM|${action || 'resolve'}|${ts}|${emplid || 'unknown'}`;
}

const FIELD_STYLE = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: 13,
  boxSizing: 'border-box',
};

const LABEL_STYLE = {
  display: 'block',
  fontWeight: 600,
  fontSize: 12,
  color: '#475569',
  marginBottom: 4,
};

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={LABEL_STYLE}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{hint}</div>}
      {children}
    </div>
  );
}

export default function TestReportingLine() {
  const [requestId, setRequestId] = useState(generateUUID());
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [action, setAction] = useState('epdr');
  const [emplid, setEmplid] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [jobcode, setJobcode] = useState('');
  const [asOfTime, setAsOfTime] = useState(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [timezone, setTimezone] = useState('Asia/Hong_Kong');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  function handleRefreshIds() {
    const newId = generateUUID();
    setRequestId(newId);
    setIdempotencyKey(generateIdempotencyKey(action, emplid));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    const body = {
      requestId,
      idempotencyKey: idempotencyKey || generateIdempotencyKey(action, emplid),
      action,
      requester: {},
      asOfTime: new Date(asOfTime).toISOString(),
      timezone,
    };
    if (emplid) body.requester.emplid = emplid;
    if (email) body.requester.email = email;
    if (department || jobcode) {
      body.context = {};
      if (department) body.context.department = department;
      if (jobcode) body.context.jobcode = jobcode;
    }

    try {
      const data = await apiFetch('/api/v1/approvals/resolve', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setResult({ ok: true, data });
    } catch (err) {
      setResult({ ok: false, data: err });
      setError(err.error?.message || err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  const approvers = result?.ok ? (result.data.approvers || []) : [];
  const audit = result?.ok ? result.data.audit : null;

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
        🔗 Test Reporting Line Resolver
      </h1>
      <p style={{ color: '#64748b', marginBottom: 24, fontSize: 14 }}>
        Resolve the approver chain for a workforce action. The IAM backend proxies this
        to the Reporting Line service using OAuth2 client credentials — credentials are
        never exposed here.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        {/* ── Form ── */}
        <form onSubmit={handleSubmit}>
          <div style={{
            background: '#f8fafc',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            padding: 20,
            marginBottom: 16,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 14, color: '#1e40af' }}>
              🪪 Tracing
            </div>

            <Field label="Request ID" hint="Auto-generated UUID — identifies this call">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={requestId}
                  onChange={(e) => setRequestId(e.target.value)}
                  style={{ ...FIELD_STYLE, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleRefreshIds}
                  title="Generate new IDs"
                  style={{
                    padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1',
                    background: 'white', cursor: 'pointer', fontSize: 14,
                  }}
                >
                  🔄
                </button>
              </div>
            </Field>

            <Field label="Idempotency Key" hint="Stable key for dedup/retry protection">
              <input
                value={idempotencyKey}
                onChange={(e) => setIdempotencyKey(e.target.value)}
                placeholder={generateIdempotencyKey(action, emplid)}
                style={FIELD_STYLE}
              />
            </Field>
          </div>

          <div style={{
            background: '#f8fafc',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            padding: 20,
            marginBottom: 16,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 14, color: '#1e40af' }}>
              ⚙️ Action
            </div>

            <Field label="Action" hint="Any string accepted. Unknown actions may return empty approvers.">
              <input
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="e.g. epdr, annual_leave, sick_leave"
                required
                style={FIELD_STYLE}
              />
            </Field>
          </div>

          <div style={{
            background: '#f8fafc',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            padding: 20,
            marginBottom: 16,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 14, color: '#1e40af' }}>
              👤 Requester Identity
            </div>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
              Provide at least one of emplid or email.
              If both are given and they mismatch in the HR system a 422 is returned.
            </p>

            <Field label="Employee ID (emplid)">
              <input
                value={emplid}
                onChange={(e) => setEmplid(e.target.value)}
                placeholder="e.g. 90012345"
                style={FIELD_STYLE}
              />
            </Field>

            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. user@ust.hk"
                style={FIELD_STYLE}
              />
            </Field>
          </div>

          <div style={{
            background: '#f8fafc',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            padding: 20,
            marginBottom: 16,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 14, color: '#1e40af' }}>
              🏢 Context (optional)
            </div>

            <Field label="Department">
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. ISD"
                style={FIELD_STYLE}
              />
            </Field>

            <Field label="Job Code">
              <input
                value={jobcode}
                onChange={(e) => setJobcode(e.target.value)}
                placeholder="e.g. ITMGR"
                style={FIELD_STYLE}
              />
            </Field>
          </div>

          <div style={{
            background: '#f8fafc',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            padding: 20,
            marginBottom: 16,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 14, color: '#1e40af' }}>
              🕐 Time
            </div>

            <Field label="As-of Time" hint="Resolve approvers as of this point in time">
              <input
                type="datetime-local"
                value={asOfTime}
                onChange={(e) => setAsOfTime(e.target.value)}
                required
                style={FIELD_STYLE}
              />
            </Field>

            <Field label="Timezone">
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                style={FIELD_STYLE}
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? '#94a3b8' : '#1e40af',
              color: 'white',
              padding: '12px 24px',
              borderRadius: 8,
              border: 'none',
              fontWeight: 700,
              fontSize: 14,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Resolving…' : '🔍 Resolve Approvers'}
          </button>
        </form>

        {/* ── Results ── */}
        <div>
          {error && (
            <div style={{
              background: '#fee2e2', color: '#991b1b',
              padding: 14, borderRadius: 10, marginBottom: 16, fontSize: 13,
            }}>
              ⚠️ {error}
            </div>
          )}

          {result && (
            <>
              {/* Approver table */}
              <div style={{
                background: 'white', borderRadius: 12,
                border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 16,
              }}>
                <div style={{
                  background: result.ok ? '#1e40af' : '#991b1b',
                  color: 'white', padding: '12px 16px', fontWeight: 700, fontSize: 14,
                }}>
                  {result.ok
                    ? `✅ Approvers (${approvers.length})`
                    : '❌ Error Response'}
                </div>

                {result.ok && approvers.length === 0 && (
                  <div style={{ padding: 16, color: '#64748b', fontSize: 13 }}>
                    No approvers found for this action / requester combination.
                  </div>
                )}

                {result.ok && approvers.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9' }}>
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
                        {approvers.map((a, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1e40af' }}>{a.level}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{a.emplid}</td>
                            <td style={{ padding: '8px 12px' }}>{a.email}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>{a.name}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{
                                background: '#dbeafe', color: '#1e40af',
                                padding: '2px 8px', borderRadius: 12, fontSize: 11,
                              }}>{a.role}</span>
                            </td>
                            <td style={{ padding: '8px 12px', color: '#64748b' }}>{a.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {result.ok && audit && (
                  <div style={{ padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>
                    <strong>Audit:</strong> rule {audit.ruleId} v{audit.ruleVersion} · org snapshot {audit.orgSnapshotId}
                  </div>
                )}
              </div>

              {/* Raw JSON */}
              <div style={{
                background: '#0f172a', borderRadius: 12,
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '10px 16px', color: '#94a3b8',
                  fontSize: 12, fontWeight: 600, borderBottom: '1px solid #1e293b',
                }}>
                  📋 Raw JSON Response
                </div>
                <pre style={{
                  margin: 0, padding: 16,
                  color: '#e2e8f0', fontSize: 11,
                  overflowX: 'auto', whiteSpace: 'pre-wrap',
                  maxHeight: 400, overflowY: 'auto',
                }}>
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              </div>
            </>
          )}

          {!result && !loading && (
            <div style={{
              background: '#f0f9ff', borderRadius: 12,
              border: '1px solid #bae6fd', padding: 20, fontSize: 13, color: '#0369a1',
            }}>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>ℹ️ How this works</p>
              <ul style={{ paddingLeft: 18, lineHeight: 1.8 }}>
                <li>Fill in the form and click <strong>Resolve Approvers</strong>.</li>
                <li>The IAM backend calls the Reporting Line service using OAuth2 client
                  credentials — no credentials are sent to the browser.</li>
                <li>Known actions: <code>annual_leave</code>, <code>sick_leave</code>, <code>epdr</code>.</li>
                <li>Unknown actions are accepted and typically return an empty approvers list.</li>
                <li>If both emplid and email are provided but mismatch a 422 is returned.</li>
              </ul>
              <p style={{ fontWeight: 600, margin: '12px 0 6px' }}>📄 Sample response from Reporting Line system</p>
              <pre style={{
                background: '#0f172a', color: '#e2e8f0', borderRadius: 8,
                padding: 14, fontSize: 11, overflowX: 'auto',
                whiteSpace: 'pre', margin: 0,
              }}>{`{
  "requestId": "7a7df6c2-5e8f-4d3f-a424-8fdac96d20f8",
  "action": "epdr",
  "requester": {
    "emplid": "90012345",
    "email": "user@ust.hk"
  },
  "resolvedAt": "2026-07-06T10:30:01+08:00",
  "timezone": "Asia/Hong_Kong",
  "approvers": [
    {
      "emplid": "80010001",
      "email": "manager1@ust.hk",
      "name": "Primary Manager",
      "role": "primary_approver",
      "level": 1,
      "source": "reporting_line"
    },
    {
      "emplid": "80010088",
      "email": "manager2@ust.hk",
      "name": "Division Head",
      "role": "secondary_approver",
      "level": 2,
      "source": "action_config"
    }
  ],
  "audit": {
    "ruleId": "EPDR_RULE_V3",
    "ruleVersion": "3.2.0",
    "orgSnapshotId": "ORG_20260706_080000"
  }
}`}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
