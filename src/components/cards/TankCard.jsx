/**
 * Tank card (PRD §7.1). Selectable.
 * Shows name + area + live quantity badge (green when stocked).
 * Glassmorphic design with AppTheme colour palette.
 */
export default function TankCard({ tank, active, onSelect }) {
  const stocked = Number(tank.quantity || 0) > 0;

  return (
    <button
      onClick={() => onSelect?.(tank)}
      className="text-left w-full transition-all duration-200"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: active
          ? 'rgba(26,26,46,0.07)'
          : 'rgba(255,255,255,0.75)',
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
        border: active
          ? '2px solid var(--color-primary)'
          : '1px solid rgba(255,255,255,0.55)',
        borderRadius: 'var(--radius-md)',
        boxShadow: active
          ? '0 4px 16px rgba(26,26,46,0.12)'
          : '0 1px 6px rgba(15,23,42,0.05)',
        padding: '12px 14px',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 5px 16px rgba(26,26,46,0.09)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 1px 6px rgba(15,23,42,0.05)';
        }
      }}
    >
      {/* Tank letter badge */}
      <span
        style={{
          width: 36, height: 36, flexShrink: 0,
          borderRadius: 'var(--radius-sm)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 13, color: '#fff',
          background: stocked
            ? 'linear-gradient(135deg, var(--color-success) 0%, var(--color-success-light) 100%)'
            : 'linear-gradient(135deg, var(--color-text-muted) 0%, var(--color-text-hint) 100%)',
          boxShadow: stocked
            ? '0 2px 8px rgba(5,150,105,0.30)'
            : '0 2px 6px rgba(71,85,105,0.25)',
        }}
      >
        {tank.name}
      </span>

      {/* Tank info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
          {tank.name}
        </p>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
          {Number(tank.area_acres || 0).toFixed(2)} acres
        </p>
      </div>

      {/* Stocked badge */}
      {stocked && (
        <span
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '3px 9px',
            borderRadius: 999,
            fontSize: 11, fontWeight: 700,
            background: 'var(--color-success-bg)',
            color: 'var(--color-success)',
            border: '1px solid rgba(5,150,105,0.18)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {Number(tank.quantity).toLocaleString('en-IN')} seed
        </span>
      )}
    </button>
  );
}
