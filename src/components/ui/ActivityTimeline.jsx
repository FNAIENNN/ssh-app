export default function ActivityTimeline({ timeline = [] }) {
  const items = Array.isArray(timeline) ? timeline : [];
  if (!items.length) {
    return (
      <div className="card p-4">
        <h4 className="font-extrabold text-sm mb-2">Activity Timeline</h4>
        <p className="text-xs text-text-muted italic">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <h4 className="font-extrabold text-sm">Activity Timeline</h4>
      <ol className="space-y-3">
        {items.map((item, idx) => {
          const label = item.step || item.action || item.process || 'Update';
          const when = item.timestamp
            ? new Date(item.timestamp).toLocaleString('en-IN')
            : [item.date, item.time].filter(Boolean).join(' ') || '—';
          return (
            <li key={item.id || `${label}-${idx}`} className="flex gap-3">
              <div className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--color-primary)' }} />
              <div>
                <p className="text-sm font-bold">{label}</p>
                <p className="text-[11px] text-text-muted">
                  {when}
                  {item.user ? ` · ${item.user}` : ''}
                </p>
                {item.reason && item.reason !== '—' && (
                  <p className="text-xs text-text-secondary mt-0.5">{item.reason}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
