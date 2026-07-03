import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

// Sample payloads for each source system to help non-technical users
const SAMPLE_PAYLOADS = {
  CADS: {
    employeeId: 'E12345',
    employeeEmail: 'john.doe@ust.hk',
    employeeName: 'John Doe',
    department: 'Finance Management Office',
    orgUnit: 'FMO',
    jobTitle: 'Finance Officer',
    role: 'APPROVER',
    action: 'provision',
  },
  PEOPLESOFT: {
    Dept: 'DAO',
    'Rank/ Team': 'Alumni Team',
    User: 'dao.alumni.manager',
    'Role Name': 'HKUST ALUM ADMIN DOWNLOAD DATA',
    Remarks: 'Access to AAS',
    'Data Level Security': 'All alumni',
  },
  ECM: {
    userId: 'ECM-001',
    userEmail: 'alice.chan@ust.hk',
    userName: 'Alice Chan',
    documentClass: 'FINANCE_CONTRACTS',
    role: 'READER',
    accessLevel: 'L2',
    action: 'provision',
  },
  JSPM: {
    projectCode: 'PROJ-2026-001',
    userEmail: 'bob.lee@ust.hk',
    userName: 'Bob Lee',
    projectRole: 'PROJECT_MANAGER',
    action: 'assign',
  },
};

export default function TestIngest() {
  const [sourceSystem, setSourceSystem] = useState('CADS');
  const [payload, setPayload] = useState(JSON.stringify(SAMPLE_PAYLOADS.CADS, null, 2));
  const [jsonError, setJsonError] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mappedPreview, setMappedPreview] = useState(null);
  const [mappedPreviewLoading, setMappedPreviewLoading] = useState(false);
  const [mappedPreviewError, setMappedPreviewError] = useState('');

  function onSourceChange(src) {
    setSourceSystem(src);
    setPayload(JSON.stringify(SAMPLE_PAYLOADS[src], null, 2));
    setJsonError('');
    setResult(null);
    setError('');
    setMappedPreview(null);
    setMappedPreviewError('');
  }

  function validateJson(val) {
    try { JSON.parse(val); setJsonError(''); } catch { setJsonError('Invalid JSON — please fix before submitting.'); }
    setPayload(val);
  }

  async function submit(e) {
    e.preventDefault();
    if (jsonError) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const body = JSON.parse(payload);
      const data = await apiFetch(`/api/v1/inbound/${sourceSystem.toLowerCase()}`, {
        method: 'POST',
        headers: { 'X-Source-System': sourceSystem, 'Idempotency-Key': `ui-${Date.now()}` },
        body: JSON.stringify(body),
      });
      setResult(data);
    } catch (err) {
      setError(err.error || err.message || 'Submission failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sourceSystem !== 'PEOPLESOFT') {
      setMappedPreview(null);
      setMappedPreviewLoading(false);
      setMappedPreviewError('');
      return;
    }

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      setMappedPreview(null);
      setMappedPreviewLoading(false);
      setMappedPreviewError('');
      return;
    }

    const timer = setTimeout(async () => {
      setMappedPreviewLoading(true);
      setMappedPreviewError('');

      try {
        const data = await apiFetch('/api/v1/inbound/peoplesoft/preview', {
          method: 'POST',
          headers: { 'X-Source-System': 'PEOPLESOFT', 'Idempotency-Key': `ui-preview-${Date.now()}` },
          body: JSON.stringify(parsedPayload),
        });
        setMappedPreview(data);
      } catch (err) {
        setMappedPreview(null);
        setMappedPreviewError(err.error || err.message || 'Unable to generate PeopleSoft mapped payload preview');
      } finally {
        setMappedPreviewLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [payload, sourceSystem]);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>📤 Test Ingest</h1>
      <p style={{ color: '#64748b', marginBottom: 20 }}>
        Submit a test event from any source system. Pre-filled samples are provided for each system.
        You can edit the JSON payload before submitting.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['CADS','PEOPLESOFT','ECM','JSPM'].map(src => (
          <button
            key={src}
            onClick={() => onSourceChange(src)}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: '2px solid',
              borderColor: sourceSystem === src ? '#1e40af' : '#cbd5e1',
              background: sourceSystem === src ? '#1e40af' : 'white',
              color: sourceSystem === src ? 'white' : '#1e293b',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {src}
          </button>
        ))}
      </div>

      <form onSubmit={submit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 4 }}>
            JSON Payload for {sourceSystem}:
          </label>
          <textarea
            value={payload}
            onChange={e => validateJson(e.target.value)}
            rows={14}
            style={{
              width: '100%',
              fontFamily: 'monospace',
              fontSize: 13,
              padding: 12,
              borderRadius: 8,
              border: jsonError ? '2px solid #ef4444' : '1px solid #cbd5e1',
              resize: 'vertical',
            }}
          />
          {jsonError && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{jsonError}</p>}
        </div>

        <button
          type="submit"
          disabled={loading || !!jsonError}
          style={{
            background: loading || jsonError ? '#94a3b8' : '#1e40af',
            color: 'white',
            padding: '10px 24px',
            borderRadius: 8,
            border: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {loading ? 'Submitting…' : `Submit to ${sourceSystem}`}
        </button>

        {sourceSystem === 'PEOPLESOFT' && (
          <div style={{ marginTop: 14 }}>
            <p style={{ marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#334155' }}>
              PeopleSoft mapped payload preview
            </p>

            {mappedPreviewLoading && (
              <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>Generating preview…</p>
            )}

            {mappedPreviewError && (
              <div style={{ background: '#fee2e2', color: '#991b1b', padding: 10, borderRadius: 8, fontSize: 12 }}>
                ⚠️ {mappedPreviewError}
              </div>
            )}

            {mappedPreview && (
              <div
                style={{
                  marginTop: 8,
                  border: '1px solid #bfdbfe',
                  borderRadius: 8,
                  background: '#eff6ff',
                  padding: 12,
                }}
              >
                <p style={{ marginTop: 0, marginBottom: 8, fontSize: 12, color: mappedPreview.isValid ? '#065f46' : '#92400e' }}>
                  {mappedPreview.isValid ? '✅ Mapping validation passed' : '⚠️ Mapping validation issues found'}
                </p>
                {!mappedPreview.isValid && mappedPreview.errors.length > 0 && (
                  <ul style={{ marginTop: 0, marginBottom: 10, paddingLeft: 18, fontSize: 12, color: '#92400e' }}>
                    {mappedPreview.errors.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
                <pre
                  style={{
                    margin: 0,
                    background: '#0f172a',
                    color: '#e2e8f0',
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 12,
                    overflowX: 'auto',
                  }}
                >
                  {JSON.stringify(mappedPreview.mappedPayload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </form>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: 14, borderRadius: 8, marginTop: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {result && (
        <div style={{ background: '#d1fae5', color: '#065f46', padding: 16, borderRadius: 8, marginTop: 16 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>✅ Event Accepted!</p>
          <table style={{ fontSize: 13 }}>
            <tbody>
              {[
                ['Event ID', result.eventId],
                ['Job ID', result.jobId],
                ['Status', result.status],
                ['Correlation ID', result.correlationId],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td style={{ fontWeight: 600, paddingRight: 16, paddingBottom: 4 }}>{k}</td>
                  <td style={{ fontFamily: 'monospace' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 8, fontSize: 12 }}>
            → Go to <a href="/events" style={{ textDecoration: 'underline' }}>Events Search</a> to
            track this event or check <a href="/sync-status" style={{ textDecoration: 'underline' }}>Sync Status</a>.
          </p>
        </div>
      )}
    </div>
  );
}
