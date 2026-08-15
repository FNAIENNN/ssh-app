import { NavLink } from 'react-router-dom';
import QuickActionsMenu from './QuickActionsMenu';
import NotificationBell from './NotificationBell';
import ProfileMenu from './ProfileMenu';
import { isDemoMode } from '../../lib/supabaseClient';

/**
 * Top header (PRD §6). Present on every authenticated screen.
 * Uses AppTheme.primary (#1A1A2E) dark navy backdrop with glassmorphic nav bar.
 *  - Top-left:  logo → Quick Actions
 *  - Top-center: "SSH" wordmark
 *  - Top-right: notification bell + profile avatar
 * Below: the three primary tabs — Seed · Trail Netting · Harvest.
 */
export default function AppHeader() {
  return (
    <header
      className="sticky top-0 z-40 text-white"
      style={{
        backgroundColor: 'var(--color-header-bg)',
      }}
    >
      <div
        className="flex items-center justify-between px-4"
        style={{ height: 'var(--header-h)' }}
      >
        <QuickActionsMenu />

        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          <span className="text-[18px] font-extrabold text-white">
            Aqua
          </span>
          <span className="text-[18px] font-light text-[#4FC3F7]">
            SSH
          </span>
          {isDemoMode && <DemoBadge />}
        </div>

        <div className="flex items-center gap-1">
          <NotificationBell />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

function DemoBadge() {
  return (
    <span
      className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold"
      style={{
        background: 'var(--color-highlight)',
        color: '#fff',
        letterSpacing: '0.08em',
      }}
      title="Running on local demo data (localStorage)."
    >
      DEMO
    </span>
  );
}


