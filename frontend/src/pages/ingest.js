import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../lib/api';

// Sample payloads for each source system to help non-technical users
const SAMPLE_PAYLOADS = {
  // Raw CADS table-row format — keys match the actual CADS column headers used
  // by the transformer. The backend /cads/transform endpoint maps this into
  // a canonical MidPoint JSON payload (shown in the preview panel below).
  CADS: {
    'User Email': 'john.doe@ust.hk',
    'Role': 'BCO',
    'Department / Project': 'Finance Management Office',
    '(1)\nEnquire REQ/PO/\nReceipt ': 'Y',
    '(2)\nRecord Receipt of Goods/\nServices': 'Y',
    '(3)\nCertify Receipt for Payment': 'Y',
    '(4)\nCertify Receipt for Payment Max. Amount (HKD)': 'Unlimited',
    'Allow Further Delegation ': 'Y',
    '(I)\nEnquire BR - General (FMS)': 'Y',
    '(II)\nEnquire BR - Staffing related (HRMS)': 'N',
    '(III)\nEnquire BR - Student related (SIS)': 'N',
    'Allow Further Delegation': 'N',
    'Valid From': '2025-01-07',
    'Valid To': '31/12/2099',
  },
  PEOPLESOFT: {
    Dept: 'DAO',
    'Rank/ Team': 'Alumni Team',
    User: 'dao.alumni.manager',
    'Role Name': 'HKUST ALUM ADMIN DOWNLOAD DATA',
    Remarks: 'Access to AAS',
    'Data Level Security': 'All alumni',
  },
  // ECM combined input: membership rows (usergroup-user) + group-item rows (usergroup-doctype)
  // The backend /ecm/preview endpoint merges these into one combined payload per user.
  ECM: {
    membershipRows: [
      { USERGROUPNAME: 'AR_All_Docs', USERNAME: 'ARIVY' },
      { USERGROUPNAME: 'AR_RS_MGT',   USERNAME: 'ARIVY' },
      { USERGROUPNAME: 'AR_All_Docs', USERNAME: 'BWONG' },
    ],
    groupItemRows: [
      { USERGROUPNAME: 'AR_All_Docs', ITEMTYPENAME: 'AR: Academic Transcript',              Dept: 'ARO', Team: null, 'Function/ Role?': null },
      { USERGROUPNAME: 'AR_All_Docs', ITEMTYPENAME: 'AR: Degree Diploma',                   Dept: 'ARO', Team: null, 'Function/ Role?': null },
      { USERGROUPNAME: 'AR_RS_MGT',   ITEMTYPENAME: 'AR: Special Student Document (Confidential)', Dept: 'ARO', Team: null, 'Function/ Role?': null },
    ],
  },
  JSPM: {
    ROLE_GROUP_DESC:  'Dept Salary Plan Owner',
    USER_NAM:         'pmshr',
    ROLE_GROUP_ID_1:  '2019120201000000000005',
    SETID_DEPT:       'HKUST',
    DEPTID:           '22000',
    ZR_TEAM_UNIT_CDE: '',
  },
};

export default function TestIngest() {
  const [sourceSystem, setSourceSystem] = useState('CADS');
  const [payload, setPayload] = useState(JSON.stringify(SAMPLE_PAYLOADS.CADS, null, 2));
  const [jsonError, setJsonError] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mappedPayload, setMappedPayload] = useState(null);
  const [mappingErrors, setMappingErrors] = useState([]);
  const [mappingLoading, setMappingLoading] = useState(false);
  const debounceRef = useRef(null);

  // Fetch the canonical CADS-mapped JSON whenever the payload or source changes
  useEffect(() => {
    if (sourceSystem !== 'CADS') {
      setMappedPayload(null);
      setMappingErrors([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      let parsed;
      try { parsed = JSON.parse(payload); } catch { return; }
      setMappingLoading(true);
      try {
        const data = await apiFetch('/api/v1/inbound/cads/transform', {
          method: 'POST',
          body: JSON.stringify(parsed),
        });
        setMappedPayload(data.payload);
        setMappingErrors(data.errors || []);
      } catch (err) {
        setMappedPayload(err.payload || null);
        setMappingErrors(err.errors || []);
      } finally {
        setMappingLoading(false);
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [payload, sourceSystem]);
  const [mappedPreview, setMappedPreview] = useState(null);
  const [mappedPreviewLoading, setMappedPreviewLoading] = useState(false);
  const [mappedPreviewError, setMappedPreviewError] = useState('');
  const [ecmPreview, setEcmPreview] = useState(null);
  const [ecmPreviewLoading, setEcmPreviewLoading] = useState(false);
  const [ecmPreviewError, setEcmPreviewError] = useState('');
  const [jspmPreview, setJspmPreview] = useState(null);
  const [jspmPreviewLoading, setJspmPreviewLoading] = useState(false);
  const [jspmPreviewError, setJspmPreviewError] = useState('');

  function onSourceChange(src) {
    setSourceSystem(src);
    setPayload(JSON.stringify(SAMPLE_PAYLOADS[src], null, 2));
    setJsonError('');
    setResult(null);
    setError('');
    setMappedPreview(null);
    setMappedPreviewError('');
    setEcmPreview(null);
    setEcmPreviewError('');
    setJspmPreview(null);
    setJspmPreviewError('');
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

  useEffect(() => {
    if (sourceSystem !== 'ECM') {
      setEcmPreview(null);
      setEcmPreviewLoading(false);
      setEcmPreviewError('');
      return;
    }

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      setEcmPreview(null);
      setEcmPreviewLoading(false);
      setEcmPreviewError('');
      return;
    }

    const timer = setTimeout(async () => {
      setEcmPreviewLoading(true);
      setEcmPreviewError('');
      try {
        const data = await apiFetch('/api/v1/inbound/ecm/preview', {
          method: 'POST',
          headers: { 'X-Source-System': 'ECM', 'Idempotency-Key': `ui-ecm-preview-${Date.now()}` },
          body: JSON.stringify(parsedPayload),
        });
        setEcmPreview(data);
      } catch (err) {
        setEcmPreview(null);
        setEcmPreviewError(err.error || err.message || 'Unable to generate ECM combined payload preview');
      } finally {
        setEcmPreviewLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [payload, sourceSystem]);

  useEffect(() => {
    if (sourceSystem !== 'JSPM') {
      setJspmPreview(null);
      setJspmPreviewLoading(false);
      setJspmPreviewError('');
      return;
    }

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      setJspmPreview(null);
      setJspmPreviewLoading(false);
      setJspmPreviewError('');
      return;
    }

    const timer = setTimeout(async () => {
      setJspmPreviewLoading(true);
      setJspmPreviewError('');
      try {
        const data = await apiFetch('/api/v1/inbound/jspm/preview', {
          method: 'POST',
          headers: { 'X-Source-System': 'JSPM', 'Idempotency-Key': `ui-jspm-preview-${Date.now()}` },
          body: JSON.stringify(parsedPayload),
        });
        setJspmPreview(data);
      } catch (err) {
        setJspmPreview(null);
        setJspmPreviewError(err.error || err.message || 'Unable to generate JSPM mapped payload preview');
      } finally {
        setJspmPreviewLoading(false);
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

        {sourceSystem === 'ECM' && (
          <div style={{ marginTop: 14 }}>
            <p style={{ marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#334155' }}>
              ECM combined mapped payload preview
            </p>
            <p style={{ marginTop: 0, marginBottom: 8, fontSize: 12, color: '#64748b' }}>
              Merges <strong>usergroup-user</strong> (membershipRows) and <strong>usergroup-doctype</strong> (groupItemRows) into one combined payload per user.
            </p>

            {ecmPreviewLoading && (
              <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>Generating preview…</p>
            )}

            {ecmPreviewError && (
              <div style={{ background: '#fee2e2', color: '#991b1b', padding: 10, borderRadius: 8, fontSize: 12 }}>
                ⚠️ {ecmPreviewError}
              </div>
            )}

            {ecmPreview && (
              <div
                style={{
                  marginTop: 8,
                  border: '1px solid #bbf7d0',
                  borderRadius: 8,
                  background: '#f0fdf4',
                  padding: 12,
                }}
              >
                <p style={{ marginTop: 0, marginBottom: 8, fontSize: 12, color: ecmPreview.isValid ? '#065f46' : '#92400e' }}>
                  {ecmPreview.isValid ? '✅ ECM combined payload valid' : '⚠️ ECM mapping issues found'}
                  {ecmPreview.combined && ` — ${ecmPreview.combined.length} user(s)`}
                </p>
                {!ecmPreview.isValid && ecmPreview.errors && ecmPreview.errors.length > 0 && (
                  <ul style={{ marginTop: 0, marginBottom: 10, paddingLeft: 18, fontSize: 12, color: '#92400e' }}>
                    {ecmPreview.errors.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                )}
                {ecmPreview.combined && ecmPreview.combined.map((entry, i) => (
                  <div key={entry.username || i} style={{ marginBottom: 12 }}>
                    <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: '#1e40af' }}>
                      👤 {entry.username}
                    </p>
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
                      {JSON.stringify(entry.payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {sourceSystem === 'JSPM' && (
          <div style={{ marginTop: 14 }}>
            <p style={{ marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#334155' }}>
              JSPM mapped payload preview
            </p>
            <p style={{ marginTop: 0, marginBottom: 8, fontSize: 12, color: '#64748b' }}>
              Maps raw JSPM CSV row fields (ROLE_GROUP_DESC, USER_NAM, ROLE_GROUP_ID_1, DEPTID, …) to canonical JSON.
            </p>

            {jspmPreviewLoading && (
              <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>Generating preview…</p>
            )}

            {jspmPreviewError && (
              <div style={{ background: '#fee2e2', color: '#991b1b', padding: 10, borderRadius: 8, fontSize: 12 }}>
                ⚠️ {jspmPreviewError}
              </div>
            )}

            {jspmPreview && (
              <div
                style={{
                  marginTop: 8,
                  border: '1px solid #bfdbfe',
                  borderRadius: 8,
                  background: '#eff6ff',
                  padding: 12,
                }}
              >
                <p style={{ marginTop: 0, marginBottom: 8, fontSize: 12, color: jspmPreview.isValid ? '#065f46' : '#92400e' }}>
                  {jspmPreview.isValid ? '✅ JSPM mapping validation passed' : '⚠️ JSPM mapping issues found'}
                </p>
                {!jspmPreview.isValid && jspmPreview.errors && jspmPreview.errors.length > 0 && (
                  <ul style={{ marginTop: 0, marginBottom: 10, paddingLeft: 18, fontSize: 12, color: '#92400e' }}>
                    {jspmPreview.errors.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                )}
                {jspmPreview.mappedPayload && (
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
                    {JSON.stringify(jspmPreview.mappedPayload, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </form>

      {sourceSystem === 'CADS' && (
        <div style={{ marginTop: 24, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ background: '#f1f5f9', padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>🔄 CADS Mapped Payload (canonical JSON)</span>
            {mappingLoading && <span style={{ fontSize: 12, color: '#64748b' }}>Updating…</span>}
          </div>
          <div style={{ padding: 16 }}>
            {mappingErrors.length > 0 && (
              <div style={{ background: '#fef3c7', color: '#92400e', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
                <strong>Validation issues:</strong>
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  {mappingErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            {mappedPayload ? (
              <pre style={{
                margin: 0,
                fontFamily: 'monospace',
                fontSize: 12,
                background: '#f8fafc',
                padding: 12,
                borderRadius: 6,
                border: '1px solid #e2e8f0',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {JSON.stringify(mappedPayload, null, 2)}
              </pre>
            ) : (
              !mappingLoading && (
                <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
                  Enter a valid CADS row payload above to see the mapped canonical JSON.
                </p>
              )
            )}
          </div>
        </div>
      )}

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
