/**
 * Section sub-card (PRD §7.1). Selectable; shows tank count + total acres.
 * Glassmorphic design with AppTheme.primary selection highlight.
 */
export default function SectionCard({ section, tanks = [], active, onSelect }) {
  const acres = tanks.reduce((sum, t) => sum + Number(t.area_acres || 0), 0);

  return (
    <button
      onClick={() => onSelect?.(section)}
      className="text-left w-full transition-all duration-200"
      style={{
        background: active
          ? 'rgba(26,26,46,0.08)'
          : 'rgba(255,255,255,0.75)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        border: active
          ? '2px solid var(--color-primary)'
          : '1px solid rgba(255,255,255,0.55)',
        borderRadius: 'var(--radius-md)',
        boxShadow: active
          ? '0 4px 20px rgba(26,26,46,0.15)'
          : '0 2px 8px rgba(15,23,42,0.05)',
        padding: '16px',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(26,26,46,0.10)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(15,23,42,0.05)';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Section letter badge */}
        <span
          style={{
            width: 40, height: 40,
            borderRadius: 'var(--radius-md)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800,
            fontSize: 15,
            color: '#fff',
            background: active
              ? 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)'
              : 'linear-gradient(135deg, var(--color-primary-light) 0%, rgba(45,45,68,0.85) 100%)',
            boxShadow: '0 2px 8px rgba(26,26,46,0.25)',
            flexShrink: 0,
          }}
        >
          {section.name}
        </span>

        {/* Tank count chip */}
        <span
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '3px 10px',
            borderRadius: 999,
            fontSize: 11, fontWeight: 700,
            background: 'var(--color-info-bg)',
            color: 'var(--color-info)',
            border: '1px solid rgba(37,99,235,0.15)',
          }}
        >
          {tanks.length} tank{tanks.length === 1 ? '' : 's'}
        </span>
      </div>

      <p
        style={{
          marginTop: 12, fontSize: 12, fontWeight: 500,
          color: active ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
        }}
      >
        {acres.toFixed(2)} acres total
      </p>
    </button>
  );
}
