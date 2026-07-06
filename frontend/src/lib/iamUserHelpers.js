/**
 * Shared UI helpers used across IAM user pages.
 */

export const STATE_BADGE_STYLES = {
  active:    { bg: '#dcfce7', color: '#166534' },
  inactive:  { bg: '#fee2e2', color: '#991b1b' },
  suspended: { bg: '#fef9c3', color: '#854d0e' },
};

export function StateBadge({ state }) {
  const style = STATE_BADGE_STYLES[state] || { bg: '#f1f5f9', color: '#475569' };
  return (
    <span style={{
      background: style.bg, color: style.color,
      padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
    }}>
      {state}
    </span>
  );
}
