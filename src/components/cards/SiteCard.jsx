/**
 * Site card (PRD §5). Shows site name, # sections, # tanks, and total acres.
 * Tap → opens that site's dashboard.
 * Glassmorphic design with AppTheme.primary navy accent stripe.
 */
export default function SiteCard({ site, stats, onOpen }) {
  const sections = stats?.sections ?? 0;
  const tanks = stats?.tanks ?? 0;
  const acres = stats?.acres ?? 0;

  return (
    <button
      onClick={() => onOpen?.(site)}
      className="w-full text-left transition-all duration-200 group"
      style={{
        background: 'rgba(255,255,255,0.78)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.60)',
        borderRadius: 'var(--radius-lg)',
        boxShadow:
          '0 2px 12px rgba(15,23,42,0.06),' +
          '0 1px 3px rgba(15,23,42,0.04)',
        padding: '0',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.boxShadow =
          '0 8px 30px rgba(26,26,46,0.14),' +
          '0 2px 8px rgba(26,26,46,0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow =
          '0 2px 12px rgba(15,23,42,0.06),' +
          '0 1px 3px rgba(15,23,42,0.04)';
      }}
    >
      {/* Top accent stripe (AppTheme.primary) */}
      <div
        style={{
          height: 4,
          background: 'linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
        }}
      />

      <div style={{ padding: '20px 20px 16px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em',
                color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 4,
              }}
            >
              {site.source === 'Thavvu' ? 'Aqua' : (site.source ?? 'Site')}
            </p>
            <h3
              style={{
                fontSize: 20, fontWeight: 800, color: 'var(--color-text-primary)',
                letterSpacing: '-0.02em', lineHeight: 1.2,
              }}
            >
              {site.name}
            </h3>
            {site.region && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
                {site.region}
              </p>
            )}
          </div>
          <div
            style={{
              width: 42, height: 42, flexShrink: 0,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, rgba(26,26,46,0.08) 0%, rgba(45,45,68,0.06) 100%)',
              border: '1px solid rgba(26,26,46,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
            }}
          >
            🌊
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 16 }}>
          <StatPill label="Sections" value={sections} />
          <StatPill label="Tanks" value={tanks} />
          <StatPill label="Acres" value={acres.toFixed(2)} />
        </div>

        {/* CTA */}
        <div
          style={{
            marginTop: 14,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 13, fontWeight: 700,
            color: 'var(--color-primary)',
            transition: 'gap 0.2s ease',
          }}
          className="group-hover:gap-2"
        >
          Open dashboard <span style={{ fontSize: 15 }}>→</span>
        </div>
      </div>
    </button>
  );
}

function StatPill({ label, value }) {
  return (
    <div
      style={{
        borderRadius: 'var(--radius-sm)',
        padding: '10px 8px',
        textAlign: 'center',
        background: 'rgba(248,249,252,0.90)',
        border: '1px solid var(--color-border-light)',
      }}
    >
      <p
        style={{
          fontSize: 18, fontWeight: 800,
          color: 'var(--color-primary)',
          lineHeight: 1,
        }}
      >
        {value}
      </p>
      <p
        style={{
          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em',
          color: 'var(--color-text-muted)', marginTop: 3, fontWeight: 600,
        }}
      >
        {label}
      </p>
    </div>
  );
}
