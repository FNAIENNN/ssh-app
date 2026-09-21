import { NavLink, Outlet } from 'react-router-dom';
import { useSite } from '../../hooks/useSite';
import { Empty } from '../../components/ui/State';

/**
 * Seed tab — container for the 5 cards (PRD §7):
 *   Sections · Payments · Seed Exchange · Food · Reports
 * Renders a sub-nav and the active card via <Outlet />.
 */
const CARDS = [
  { to: 'dashboard', label: 'Dashboard', icon: '🗂️' },
  { to: 'seed-stock', label: 'Seed Stock', icon: '🌱' },
  { to: 'payments', label: 'Payments', icon: '💳' },
  { to: 'exchange', label: 'Seed Exchange', icon: '🔁' },
  { to: 'food', label: 'Food', icon: '🍱' },
  { to: 'reports', label: 'Reports', icon: '📊' },
];

export default function SeedTab() {
  const { site } = useSite();

  if (!site) {
    return (
      <Empty
        icon="🗺️"
        title="No site selected"
        hint="Choose a site from the Quick Actions menu (top-left logo) to start managing seed."
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-3 sm:p-6 pb-24 sm:pb-6">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-wider text-text-muted">{site.source ?? 'Site'}</p>
        <h1 className="text-2xl font-extrabold">{site.name}</h1>
      </div>

      <nav className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto mb-6">
        {CARDS.map((c) => (
          <NavLink
            key={c.to}
            to={c.to}
            end={c.to === 'dashboard'}
            className={({ isActive }) =>
              `px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 whitespace-nowrap ${isActive
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`
            }
          >
            <span>{c.icon}</span>
            <span>{c.label}</span>
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
