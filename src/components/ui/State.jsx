/**
 * Tiny presentational helpers reused across feature pages.
 * Styled to match AppTheme color palette with glassmorphic card styles.
 */

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div>
        <h1
          className="text-2xl font-extrabold"
          style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ icon = '📭', title = 'Nothing here yet', hint }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.55)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        padding: '48px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <p style={{ fontWeight: 700, color: 'var(--color-text-primary)', fontSize: 15 }}>{title}</p>
      {hint && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 6, maxWidth: 320 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 12, padding: '40px 0',
        color: 'var(--color-text-muted)',
      }}
    >
      <span
        style={{
          width: 20, height: 20,
          borderRadius: '50%',
          border: '2.5px solid var(--color-primary)',
          borderTopColor: 'transparent',
          animation: 'spin 0.75s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ fontSize: 13 }}>{label}</span>
    </div>
  );
}

/** A labelled pill button — used to switch between cards/sub-tabs. */
export function PillButton({ active, onClick, children, color = 'var(--color-primary)' }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 18px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        border: `1px solid ${active ? color : 'var(--color-border)'}`,
        background: active
          ? color
          : 'rgba(255,255,255,0.65)',
        color: active ? '#fff' : color,
        cursor: 'pointer',
        transition: 'all 0.18s ease',
        backdropFilter: 'blur(8px)',
      }}
    >
      {children}
    </button>
  );
}
