/**
 * Shared API client for the frontend.
 * All calls attach the api_key header automatically.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'poc-dev-key-1234';

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      api_key: API_KEY,
      ...(options.headers || {}),
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw { status: res.status, ...data };
  }
  return data;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-HK', { timeZone: 'Asia/Hong_Kong' });
}

export function statusBadge(status) {
  const map = {
    success:             { bg: '#d1fae5', color: '#065f46', label: '✅ Success' },
    validated:           { bg: '#dbeafe', color: '#1e40af', label: '🔵 Validated' },
    sent_to_midpoint:    { bg: '#e0e7ff', color: '#3730a3', label: '📤 Sent to MidPoint' },
    received:            { bg: '#f3f4f6', color: '#374151', label: '📥 Received' },
    failed:              { bg: '#fee2e2', color: '#991b1b', label: '❌ Failed' },
    validation_failed:   { bg: '#fef3c7', color: '#92400e', label: '⚠️ Validation Failed' },
    retrying:            { bg: '#fef9c3', color: '#713f12', label: '🔄 Retrying' },
    dead_letter:         { bg: '#fce7f3', color: '#831843', label: '💀 Dead Letter' },
    ALLOW:               { bg: '#d1fae5', color: '#065f46', label: '✅ ALLOW' },
    DENY:                { bg: '#fee2e2', color: '#991b1b', label: '❌ DENY' },
  };
  return map[status] || { bg: '#f3f4f6', color: '#374151', label: status };
}
