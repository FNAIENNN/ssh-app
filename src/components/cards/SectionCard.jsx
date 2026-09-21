/**
 * Section sub-card (PRD §7.1). Selectable; shows tank count + total acres.
 * Glassmorphic design with AppTheme.primary selection highlight.
 */
export default function SectionCard({ section, tanks = [], active, onSelect }) {
  const acres = tanks.reduce((sum, t) => sum + Number(t.area_acres || 0), 0);

  return (
    <button
      onClick={() => onSelect?.(section)}
      className="text-left w-full transition-all duration-200 p-2 sm:p-4 flex flex-col sm:block items-center sm:items-stretch"
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
      <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-1.5 sm:gap-0 w-full">
        {/* Section letter badge */}
        <span
          className="flex-shrink-0 flex items-center justify-center font-extrabold text-white shadow-sm rounded-md w-7 h-7 sm:w-10 sm:h-10 text-[11px] sm:text-[15px]"
          style={{
            background: active
              ? 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)'
              : 'linear-gradient(135deg, var(--color-primary-light) 0%, rgba(45,45,68,0.85) 100%)',
          }}
        >
          {section.name}
        </span>

        {/* Tank count chip */}
        <span
          className="inline-flex items-center px-1.5 py-0.5 sm:px-[10px] sm:py-[3px] rounded-full font-bold bg-blue-50 text-blue-600 border border-blue-100 whitespace-nowrap text-[9px] sm:text-[11px]"
        >
          {tanks.length} <span className="hidden sm:inline">&nbsp;tank{tanks.length === 1 ? '' : 's'}</span><span className="sm:hidden pl-0.5">T</span>
        </span>
      </div>

      <p
        className="mt-1.5 sm:mt-3 font-medium text-center sm:text-left text-[9px] sm:text-xs whitespace-nowrap overflow-hidden text-ellipsis w-full"
        style={{
          color: active ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
        }}
      >
        {acres.toFixed(2)} <span className="hidden sm:inline">acres total</span><span className="sm:hidden">ac</span>
      </p>
    </button>
  );
}
