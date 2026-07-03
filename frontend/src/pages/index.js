import { useState, useEffect } from 'react';
import { apiFetch, statusBadge, formatDate } from '../lib/api';

const card = {
  background: 'white',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  minWidth: 160,
};

const StatCard = ({ label, value, color }) => (
  <div style={{ ...card, borderTop: `4px solid ${color}` }}>
    <div style={{ fontSize: 32, fontWeight: 700, color }}>{value}</div>
    <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{label}</div>
  </div>
);

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        // Load a sample email's events to derive stats (POC approach)
        // In a real system, a /api/v1/stats endpoint would provide this
        const health = await apiFetch('/health');
        setStats({ status: health.status });
        setLoading(false);
      } catch (e) {
        setError('Cannot reach backend — is it running?');
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        IAM Integration Platform — Dashboard
      </h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>
        Welcome! Use this portal to test and monitor the IAM integration between CADS, PeopleSoft,
        ECM, JSPM and the MidPoint Identity Governance system.
      </p>

      {loading && <p>Loading…</p>}
      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
          <StatCard label="Backend Status" value="✅ Online" color="#10b981" />
          <StatCard label="Source Systems" value="4" color="#3b82f6" />
          <StatCard label="Allowed Domain" value="@ust.hk" color="#8b5cf6" />
          <StatCard label="Future Domains" value="connect / family" color="#f59e0b" />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {[
          { emoji: '📤', title: 'Test Ingest', desc: 'Submit a test event from CADS, PeopleSoft, ECM, or JSPM.', href: '/ingest' },
          { emoji: '🔍', title: 'Events Search', desc: 'Search all events for a user by email address.', href: '/events' },
          { emoji: '🪞', title: 'MidPoint Preview', desc: 'Preview standardized MidPoint JSON from existing inbound events.', href: '/midpoint-preview' },
          { emoji: '🔄', title: 'Sync Status', desc: 'Check the current sync/provisioning status for any user.', href: '/sync-status' },
          { emoji: '🔑', title: 'Access Check', desc: 'Verify whether a user has access to a specific service.', href: '/access' },
        ].map(({ emoji, title, desc, href }) => (
          <a key={href} href={href} style={{
            ...card,
            display: 'block',
            borderLeft: '4px solid #1e40af',
            transition: 'box-shadow 0.2s',
          }}
          onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(30,64,175,0.15)'}
          onMouseOut={e => e.currentTarget.style.boxShadow = card.boxShadow}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>{emoji}</div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{title}</div>
            <div style={{ color: '#64748b', fontSize: 13 }}>{desc}</div>
          </a>
        ))}
      </div>

      <div style={{ marginTop: 32, background: '#f0f9ff', borderRadius: 12, padding: 20 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 12 }}>Quick Reference: Source Systems</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#1e40af', color: 'white' }}>
              {['System', 'Type', 'Data', 'User Type'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['CADS',        'HR System',             'Staff profiles, org structure',    'Staff'],
              ['PeopleSoft',  'SIS / FMS / HRMS',      'Students, finance, HR records',    'Staff + Students'],
              ['ECM',         'Document Management',   'User access + document classes',   'Staff'],
              ['JSPM',        'Project Management',    'Project assignments + roles',       'Staff'],
            ].map(([sys, type, data, ut], i) => (
              <tr key={sys} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{sys}</td>
                <td style={{ padding: '8px 12px' }}>{type}</td>
                <td style={{ padding: '8px 12px', color: '#475569' }}>{data}</td>
                <td style={{ padding: '8px 12px' }}>{ut}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
