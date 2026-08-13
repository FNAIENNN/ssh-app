import { formatDate, daysSinceStart } from '../../hooks/useTrailNettingCadence';

/**
 * Per-tank seed data table (PRD §7.1).
 * Columns: Tank | Date | Seed Type | Quantity | PL Size | Hatchery | Days Completed.
 *   - PL Size = count of seed at stocking (the starting-stage count).
 *   - Days Completed is auto-calculated as today − entry date.
 *
 * `entries` is the raw seed_entries list for one tank; renders one row per entry.
 */
export default function SeedTable({ entries = [], tankName }) {
  if (!entries.length) {
    return (
      <div className="card p-4 text-sm text-text-muted">
        No seed entries for {tankName ?? 'this tank'} yet.
      </div>
    );
  }
  return (
    <div className="card p-3 overflow-x-auto scroll-thin">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
            {['Tank', 'Date', 'Seed Type', 'Quantity', 'PL Size', 'Hatchery', 'Days Completed'].map((h) => (
              <th key={h} className="text-left font-bold px-3 py-2 whitespace-nowrap text-xs text-text-secondary">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
              <td className="px-3 py-2.5 font-semibold">{e.tank_name ?? tankName ?? '—'}</td>
              <td className="px-3 py-2.5">{formatDate(e.date)}</td>
              <td className="px-3 py-2.5">{e.seed_type}</td>
              <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--color-primary)' }}>
                {Number(e.quantity).toLocaleString('en-IN')}
              </td>
              <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--color-success)' }}>
                {e.pl_size != null ? Number(e.pl_size).toLocaleString('en-IN') : '—'}
              </td>
              <td className="px-3 py-2.5">{e.hatchery ?? '—'}</td>
              <td className="px-3 py-2.5">
                <span
                  className="chip"
                  style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}
                >
                  {e.days_completed ?? daysSinceStart(e.date)} d
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
