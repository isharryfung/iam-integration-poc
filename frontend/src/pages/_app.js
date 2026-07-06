import '../styles/globals.css';
import Link from 'next/link';

const NAV_ITEMS = [
  { href: '/', label: '🏠 Dashboard' },
  { href: '/events', label: '🔍 Events Search' },
  { href: '/midpoint-preview', label: '🪞 MidPoint Preview' },
  { href: '/ingest', label: '📤 Test Ingest' },
  { href: '/test-reporting-line', label: '🔗 Reporting Line' },
  { href: '/sync-status', label: '🔄 Sync Status' },
  { href: '/access', label: '🔑 Access Check' },
];

export default function App({ Component, pageProps }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav style={{
        background: '#1e40af',
        color: 'white',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 700, fontSize: 18, marginRight: 16 }}>
          🛡️ IAM Integration POC
        </span>
        {NAV_ITEMS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            style={{
              color: 'white',
              opacity: 0.9,
              fontSize: 14,
              padding: '4px 8px',
              borderRadius: 4,
            }}
          >
            {label}
          </Link>
        ))}
      </nav>
      <main style={{ flex: 1, padding: 24 }}>
        <Component {...pageProps} />
      </main>
      <footer style={{
        background: '#1e3a8a',
        color: '#93c5fd',
        textAlign: 'center',
        padding: 12,
        fontSize: 12,
      }}>
        IAM Integration POC — HKUST — For testing purposes only
      </footer>
    </div>
  );
}
