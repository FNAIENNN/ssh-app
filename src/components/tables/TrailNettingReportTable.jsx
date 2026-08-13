import { formatDate } from '../../hooks/useTrailNettingCadence';

/**
 * Canonical "Trail Netting Report & Pattubadi" table (PRD §8.4).
 * Reproduces the uploaded reference table pixel-for-logic.
 *
 * Columns: Tank Nos | Hatchery | Seed Stocked | Survived Seed | DOC |
 *          Latest Date | Previous Date | Latest Count | Previous Count |
 *          Count Diff | Growth Diff | Wkly Grth | Betw Feed Consp |
 *          Betw Growth Kgs | Betw FCR | Feed Consp (total)
 */
const COLUMNS = [
  { key: 'tank_name', label: 'Tank Nos' },
  { key: 'hatchery', label: 'Hatchery' },
  { key: 'seed_stocked', label: 'Seed Stocked', num: true },
  { key: 'survived_seed', label: 'Survived Seed', num: true },
  { key: 'doc', label: 'DOC', num: true },
  { key: 'latest_date', label: 'Latest Date' },
  { key: 'previous_date', label: 'Previous Date' },
  { key: 'latest_count', label: 'Latest Count', num: true },
  { key: 'previous_count', label: 'Previous Count', num: true },
  { key: 'count_diff', label: 'Count Diff', num: true },
  { key: 'growth_diff', label: 'Growth Diff', num: true },
  { key: 'weekly_growth', label: 'Wkly Grth as per Trail Netting', num: true },
  { key: 'feed_consp_between', label: 'Betw Period Feed Consp', num: true },
  { key: 'growth_kgs_between', label: 'Betw Period Growth in Kgs', num: true },
  { key: 'fcr_between', label: 'Betw Period FCR', num: true },
  { key: 'feed_consp_total', label: 'Feed Consp', num: true },
];

export default function TrailNettingReportTable({ rows = [] }) {
  if (!rows.length) {
    return <div className="card p-4 text-sm text-text-muted">No trail netting reports yet.</div>;
  }

  return (
    <div className="card p-3 overflow-x-auto scroll-thin">
      <table className="text-sm border-collapse" style={{ minWidth: 1400 }}>
        <thead>
          <tr style={{ background: 'var(--color-primary-dark)' }}>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className="text-white font-bold px-3 py-2.5 whitespace-nowrap text-xs"
                style={{ textAlign: c.num ? 'right' : 'left' }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.id ?? i}
              className="border-b last:border-0"
              style={{ borderColor: 'var(--color-border)', background: i % 2 ? 'var(--color-surface)' : undefined }}
            >
              {COLUMNS.map((c) => (
                <td
                  key={c.key}
                  className="px-3 py-2 whitespace-nowrap"
                  style={{ textAlign: c.num ? 'right' : 'left' }}
                >
                  {renderCell(c, r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderCell(col, row) {
  const v = row[col.key];
  if (col.key === 'latest_date' || col.key === 'previous_date') return formatDate(v);
  if (v === null || v === undefined || v === '') return '—';
  if (col.num && typeof v === 'number') return Number(v).toLocaleString('en-IN');
  return v;
}
