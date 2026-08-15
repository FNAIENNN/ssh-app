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
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-wider text-text-muted">{site.source ?? 'Site'}</p>
        <h1 className="text-2xl font-extrabold">{site.name}</h1>
      </div>

      <nav className="flex flex-wrap gap-2 mb-6">
        {CARDS.map((c) => (
          <NavLink
            key={c.to}
            to={c.to}
            className={({ isActive }) =>
              `px-4 py-2 rounded-full text-sm font-semibold border transition flex items-center gap-2 ${
                isActive ? 'text-white' : 'bg-transparent'
              }`
            }
            style={({ isActive }) =>
              isActive
                ? { background: 'var(--color-primary)', borderColor: 'var(--color-primary)' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
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
