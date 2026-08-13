/**
 * Shared ledger table shell (PRD §10).
 * The same reusable table is used across Seed Payments, Vehicle advances,
 * and Outside Workers — only the column set changes per call site.
 *
 * Ported from the Flutter `_buildLedgerTableShell` reference.
 */
export default function LedgerTable({
  title,
  subtitle,
  color = 'var(--color-primary)',
  icon = '📄',
  emptyText = 'No records yet.',
  columns = [],
  rows = [], // array of arrays (cells aligned to columns)
}) {
  return (
    <div className="card p-4 w-full">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-[12px] flex items-center justify-center text-base"
          style={{ background: `${color}1f` }}
        >
          <span>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold">{title}</p>
          {subtitle && <p className="text-[11px] text-text-secondary">{subtitle}</p>}
        </div>
      </div>

      <div className="mt-3">
        {rows.length === 0 ? (
          <p className="text-xs text-text-muted py-2">{emptyText}</p>
        ) : (
          <div className="overflow-x-auto scroll-thin -mx-1">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ borderBottom: `2px solid ${color}33` }}>
                  {columns.map((c, i) => (
                    <th
                      key={i}
                      className="text-left font-bold px-3 py-2 whitespace-nowrap"
                      style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((cells, r) => (
                  <tr
                    key={r}
                    className="border-b last:border-0"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    {cells.map((cell, c) => (
                      <td key={c} className="px-3 py-2.5 align-middle whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Status chip helper — mirrors the Flutter `_buildStatusChip`. */
export function StatusChip({ label, color }) {
  return (
    <span
      className="chip"
      style={{ background: `${color}1a`, border: `1px solid ${color}40`, color }}
    >
      {label}
    </span>
  );
}
