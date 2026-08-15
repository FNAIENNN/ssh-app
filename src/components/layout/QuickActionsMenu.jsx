import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSite } from '../../hooks/useSite';
import { LogoMark } from '../../auth/LogoMark';

/**
 * Pop-over menu launched from the header logo (PRD §6).
 * Switch site, jump to common new-entry screens.
 */
export default function QuickActionsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const { sites, siteId, selectSite } = useSite();

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-[12px] px-2 py-1 hover:bg-white/10 transition"
        aria-label="Quick actions"
      >
        <LogoMark size={36} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-12 z-50 w-72 p-2 animate-in"
          style={{
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.65)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-pop)',
          }}
        >
          <p
            className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Quick Actions
          </p>

          <MenuItem icon="🌱" label="Seed Stock" onClick={() => go('/app/seed/seed-stock')} />
          <MenuItem icon="🔁" label="Seed Exchange" onClick={() => go('/app/seed/exchange')} />
          <MenuItem icon="🥢" label="Trail Netting" onClick={() => go('/app/trail-netting')} />
          <MenuItem icon="📊" label="Reports" onClick={() => go('/app/seed/reports')} />

          <div className="my-2 border-t" style={{ borderColor: 'var(--color-border)' }} />

          <p
            className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Switch Site
          </p>
          <div className="max-h-56 overflow-auto scroll-thin">
            {sites.length === 0 && (
              <p className="px-3 py-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>No sites yet.</p>
            )}
            {sites.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  selectSite(s.id);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-[8px] text-sm flex items-center justify-between transition"
                style={
                  s.id === siteId
                    ? { color: 'var(--color-primary)', fontWeight: 700 }
                    : { color: 'var(--color-text-primary)' }
                }
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span>{s.name}</span>
                {s.id === siteId && <span style={{ color: 'var(--color-success)' }}>✓</span>}
              </button>
            ))}
          </div>
          <button
            onClick={() => go('/sites')}
            className="w-full text-left px-3 py-2 mt-1 rounded-[8px] text-sm font-semibold transition"
            style={{ color: 'var(--color-primary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            + Manage sites
          </button>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-[8px] text-sm hover:bg-[var(--color-surface)] text-left"
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
