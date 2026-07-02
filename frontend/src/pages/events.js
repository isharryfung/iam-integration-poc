import { useState } from 'react';
import { apiFetch, statusBadge, formatDate } from '../lib/api';

const SOURCES = ['CADS', 'PEOPLESOFT', 'ECM', 'JSPM'];

export default function EventsSearch() {
  const [email, setEmail] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function search(e) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (sourceFilter) params.set('sourceSystem', sourceFilter);
      if (statusFilter) params.set('status', statusFilter);
      const data = await apiFetch(`/api/v1/users/${encodeURIComponent(email)}/events?${params}`);
      setResult(data);
    } catch (err) {
      setError(err.error || err.message || 'Error fetching events');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>🔍 Events Search</h1>
      <p style={{ color: '#64748b', marginBottom: 20 }}>
        Enter a UST email address to view all ingestion events for that user.
      </p>

      <form onSubmit={search} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <input
          type="email"
          placeholder="user@ust.hk"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{ flex: '1 1 220px', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
        />
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}>
          <option value="">All Systems</option>
          {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}>
          <option value="">All Statuses</option>
          {['received','validated','sent_to_midpoint','success','failed','dead_letter'].map(s =>
            <option key={s} value={s}>{s}</option>
          )}
        </select>
        <button type="submit" style={{
          background: '#1e40af', color: 'white', padding: '10px 20px',
          borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 14,
        }}>
          Search
        </button>
      </form>

      {loading && <p style={{ color: '#64748b' }}>Searching…</p>}
      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {result && (
        <div>
          <p style={{ marginBottom: 12, color: '#475569' }}>
            Found <strong>{result.total}</strong> event(s) for <strong>{result.email}</strong>
            {sourceFilter && ` — source: ${sourceFilter}`}
          </p>
          {result.events.length === 0 ? (
            <p style={{ color: '#94a3b8' }}>No events found.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#1e40af', color: 'white' }}>
                    {['Event ID','Source','Status','Action','Role','Received At','Processed At'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.events.map((ev, i) => {
                    const badge = statusBadge(ev.status);
                    return (
                      <tr key={ev.eventId} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                        <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>{ev.eventId.slice(0, 8)}…</td>
                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>{ev.sourceSystem}</td>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{ background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                            {badge.label}
                          </span>
                        </td>
                        <td style={{ padding: '7px 10px' }}>{ev.entitlement?.action || '—'}</td>
                        <td style={{ padding: '7px 10px' }}>{ev.entitlement?.role || '—'}</td>
                        <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{formatDate(ev.createdAt)}</td>
                        <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{formatDate(ev.processedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
