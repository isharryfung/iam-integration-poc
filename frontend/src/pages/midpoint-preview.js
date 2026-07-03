import { useMemo, useState } from 'react';
import { apiFetch, formatDate, statusBadge } from '../lib/api';

const SOURCES = ['CADS', 'PEOPLESOFT', 'ECM', 'JSPM'];

const cardStyle = {
  background: 'white',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
};

const inputStyle = {
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: 14,
};

function JsonPanel({ title, value, action }) {
  return (
    <div style={{ ...cardStyle, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h2>
        {action}
      </div>
      <pre style={{
        margin: 0,
        padding: 16,
        borderRadius: 10,
        background: '#0f172a',
        color: '#e2e8f0',
        fontSize: 12,
        lineHeight: 1.5,
        overflowX: 'auto',
        minHeight: 320,
      }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function MidpointPreviewPage() {
  const [email, setEmail] = useState('');
  const [sourceSystem, setSourceSystem] = useState('');
  const [eventId, setEventId] = useState('');
  const [events, setEvents] = useState([]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  const transformedJson = useMemo(
    () => (preview ? JSON.stringify(preview.midpointInput, null, 2) : ''),
    [preview]
  );

  async function searchEvents(e) {
    e.preventDefault();
    setError('');
    setCopyMessage('');

    if (eventId.trim()) {
      await loadPreviewByEventId(eventId.trim(), true);
      return;
    }

    setLoading(true);
    setPreview(null);

    try {
      const params = new URLSearchParams({ limit: '25' });
      if (email.trim()) params.set('email', email.trim());
      if (sourceSystem) params.set('sourceSystem', sourceSystem);

      const data = await apiFetch(`/api/v1/midpoint/events?${params.toString()}`);
      setEvents(data.events || []);
    } catch (err) {
      setEvents([]);
      setError(err.error || err.message || 'Unable to search events');
    } finally {
      setLoading(false);
    }
  }

  async function loadPreviewByEventId(id, replaceList = false) {
    setPreviewLoading(true);
    setError('');
    setCopyMessage('');

    try {
      const data = await apiFetch(`/api/v1/midpoint/preview?eventId=${encodeURIComponent(id)}`);
      setPreview(data);

      if (replaceList) {
        setEvents([{
          eventId: data.eventId,
          sourceSystem: data.sourceSystem,
          email: data.email,
          status: data.status,
          action: data.midpointInput?.entitlement?.action,
          role: data.midpointInput?.entitlement?.roleName,
          receivedAt: data.receivedAt,
          processedAt: data.processedAt,
        }]);
      }
    } catch (err) {
      setPreview(null);
      setError(err.error || err.message || 'Unable to load preview');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function loadLatestPreview() {
    if (!email.trim()) {
      setError('Enter an email address to load the latest event preview.');
      return;
    }

    setPreviewLoading(true);
    setError('');
    setCopyMessage('');

    try {
      const params = new URLSearchParams({ email: email.trim(), latest: 'true' });
      if (sourceSystem) params.set('sourceSystem', sourceSystem);
      const data = await apiFetch(`/api/v1/midpoint/preview/by-email?${params.toString()}`);
      setPreview(data);
    } catch (err) {
      setPreview(null);
      setError(err.error || err.message || 'Unable to load latest preview');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(transformedJson);
      setCopyMessage('Copied transformed JSON to clipboard.');
    } catch (_copyError) {
      setCopyMessage('Copy failed in this browser. Please copy manually from the panel.');
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>🪞 MidPoint Standard Input Preview</h1>
      <p style={{ color: '#64748b', marginBottom: 20, maxWidth: 900 }}>
        Search existing inbound events and preview how the platform standardizes them into the
        MidPoint input JSON. This page is read-only and designed for quick, non-technical review.
      </p>

      <form onSubmit={searchEvents} style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <input
            type="email"
            placeholder="Search by email (user@ust.hk)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
          <select value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)} style={inputStyle}>
            <option value="">All source systems</option>
            {SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}
          </select>
          <input
            type="text"
            placeholder="Search by exact eventId"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
          <button type="submit" style={{ background: '#1e40af', color: 'white', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600 }}>
            {loading ? 'Searching…' : 'Search Matching Events'}
          </button>
          <button
            type="button"
            onClick={loadLatestPreview}
            style={{ background: 'white', color: '#1e40af', border: '1px solid #1e40af', borderRadius: 8, padding: '10px 18px', fontWeight: 600 }}
          >
            {previewLoading ? 'Loading…' : 'Load Latest Preview by Email'}
          </button>
        </div>
      </form>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 20 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Matching events</h2>
          <span style={{ color: '#64748b', fontSize: 13 }}>{events.length} row(s)</span>
        </div>

        {loading ? (
          <p style={{ color: '#64748b', margin: 0 }}>Searching events…</p>
        ) : events.length === 0 ? (
          <p style={{ color: '#94a3b8', margin: 0 }}>No events loaded yet. Search by email or paste an event ID above.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1e40af', color: 'white' }}>
                  {['Event ID', 'Source', 'Email', 'Status', 'Action', 'Role', 'Received At', 'Preview'].map((header) => (
                    <th key={header} style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((event, index) => {
                  const badge = statusBadge(event.status);
                  return (
                    <tr key={event.eventId} style={{ background: index % 2 === 0 ? 'white' : '#f8fafc' }}>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>{event.eventId}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{event.sourceSystem}</td>
                      <td style={{ padding: '8px 10px' }}>{event.email || '—'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px' }}>{event.action || '—'}</td>
                      <td style={{ padding: '8px 10px' }}>{event.role || '—'}</td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{formatDate(event.receivedAt)}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <button
                          type="button"
                          onClick={() => loadPreviewByEventId(event.eventId)}
                          style={{ background: 'white', color: '#1e40af', border: '1px solid #1e40af', borderRadius: 8, padding: '6px 12px', fontWeight: 600 }}
                        >
                          {previewLoading ? 'Loading…' : 'Open Preview'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {preview && (
        <>
          <div style={{ ...cardStyle, marginBottom: 20, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Preview for event {preview.eventId}</div>
                <div style={{ color: '#475569', fontSize: 14 }}>
                  {preview.sourceSystem} · {preview.email || 'Unknown email'} · received {formatDate(preview.receivedAt)}
                </div>
              </div>
              <div style={{
                alignSelf: 'flex-start',
                background: preview.validation.isValid ? '#d1fae5' : '#fee2e2',
                color: preview.validation.isValid ? '#065f46' : '#991b1b',
                borderRadius: 999,
                padding: '8px 12px',
                fontWeight: 700,
                fontSize: 13,
              }}>
                {preview.validation.isValid ? '✅ Validation passed' : '❌ Validation failed'}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginBottom: 20 }}>
            <JsonPanel title="Source payload JSON" value={preview.sourcePayload} />
            <JsonPanel
              title="Standardized MidPoint input JSON"
              value={preview.midpointInput}
              action={(
                <button
                  type="button"
                  onClick={copyJson}
                  style={{ background: '#1e40af', color: 'white', border: 'none', borderRadius: 8, padding: '8px 12px', fontWeight: 600 }}
                >
                  Copy JSON
                </button>
              )}
            />
          </div>

          <div style={{ ...cardStyle }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 0, marginBottom: 12 }}>Validation details</h2>
            <div style={{ color: '#475569', marginBottom: 12 }}>
              Result: <strong>{preview.validation.status.toUpperCase()}</strong>
            </div>
            {copyMessage && (
              <div style={{ background: '#ecfeff', color: '#155e75', padding: 10, borderRadius: 8, marginBottom: 12 }}>
                {copyMessage}
              </div>
            )}

            {preview.validation.errors.length === 0 ? (
              <p style={{ margin: 0, color: '#065f46' }}>No missing or invalid fields were detected in the transformed output.</p>
            ) : (
              <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Missing fields</div>
                  {preview.validation.missingFields.length === 0 ? (
                    <p style={{ margin: 0, color: '#94a3b8' }}>None</p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {preview.validation.missingFields.map((field) => <li key={field}>{field}</li>)}
                    </ul>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Invalid fields</div>
                  {preview.validation.invalidFields.length === 0 ? (
                    <p style={{ margin: 0, color: '#94a3b8' }}>None</p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {preview.validation.invalidFields.map((field) => <li key={field}>{field}</li>)}
                    </ul>
                  )}
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Detailed messages</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {preview.validation.errors.map((item) => (
                      <li key={`${item.field}-${item.type}`}>{item.field}: {item.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
