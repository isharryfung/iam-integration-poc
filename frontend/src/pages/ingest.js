import { useState } from 'react';
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
    validFrom: '2025-01-01',
    validUntil: '2099-12-31',
    action: 'provision',
    permissions: {
      enquireReqPoReceipt: true,
      recordReceiptGoodsServices: true,
      certifyReceiptForPayment: true,
      enquireBrGeneralFms: true,
      enquireBrStaffingHrms: false,
      enquireBrStudentSis: false,
      approveEnquireBudgetCommitmentAllSystems: false,
      enquireBudgetPositionFinancialInfo: true,
      approveBudgetCommitmentEproReq: true,
      approveBudgetCommitmentPcard: false,
      approveBudgetCommitmentExpense: true,
      approveBudgetCommitmentStudentHelperTimesheet: false,
      approveBudgetCommitmentStudentAwardBudgetRequest: false,
      approveBudgetCommitmentCateringBooking: false,
      approveBudgetCommitmentFoEforms: false,
      approveBudgetCommitmentStaffBudgetRequestEform: false,
      enquireBlockGrantSalaryAccountView: false,
      enquireBlockGrantSalaryStaffView: false,
    },
    limits: {
      certifyReceiptForPaymentMaxAmountHkd: 50000,
      approveEproReqMaxAmountHkd: 100000,
      approveExpenseMaxAmountHkd: 50000,
    },
    delegation: {
      procurement: { allowFurtherDelegation: false },
      budget: { allowFurtherDelegation: false },
    },
  },
  PEOPLESOFT: {
    module: 'HRMS',
    emplid: 'P98765',
    email: 'jane.smith@ust.hk',
    name: 'Jane Smith',
    jobCode: 'IT_ANALYST',
    department: 'Information Technology',
    action: 'update',
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

  function onSourceChange(src) {
    setSourceSystem(src);
    setPayload(JSON.stringify(SAMPLE_PAYLOADS[src], null, 2));
    setJsonError('');
    setResult(null);
    setError('');
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ fontWeight: 600, fontSize: 13 }}>
              JSON Payload for {sourceSystem}:
              {sourceSystem === 'CADS' && (
                <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 8 }}>
                  CADS sample payload — edit before submitting
                </span>
              )}
            </label>
            {sourceSystem === 'CADS' && (
              <button
                type="button"
                onClick={() => onSourceChange('CADS')}
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: 'white',
                  color: '#1e293b',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                ↺ Load CADS Sample
              </button>
            )}
          </div>
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
