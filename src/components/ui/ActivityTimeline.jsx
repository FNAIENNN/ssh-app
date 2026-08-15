import React from 'react';

/**
 * ActivityTimeline component — renders a vertical timeline of all completed workflow actions for a bill.
 * Entries shape: [{ id, date, time, userName, action }]
 */
export default function ActivityTimeline({ timeline = [] }) {
  if (!timeline || timeline.length === 0) {
    return (
      <div className="card p-5 border space-y-2 text-xs">
        <h4 className="font-extrabold text-sm text-primary border-b pb-2 flex items-center gap-2">
          <span>⏳</span> Activity Timeline
        </h4>
        <p className="text-text-muted italic">No timeline entries recorded yet.</p>
      </div>
    );
  }

  function getActionIcon(action = '') {
    const act = action.toLowerCase();
    if (act.includes('created') || act.includes('order')) return '📄';
    if (act.includes('cash')) return '💵';
    if (act.includes('advance')) return '🧾';
    if (act.includes('vehicle')) return '🚚';
    if (act.includes('van')) return '🚐';
    if (act.includes('stocking')) return '🌱';
    if (act.includes('worker') || act.includes('outside')) return '👷';
    if (act.includes('completed') || act.includes('finished')) return '🎉';
    return '⏱️';
  }

  return (
    <div className="card p-5 border space-y-4">
      <h4 className="font-extrabold text-base text-primary border-b pb-2 flex items-center gap-2">
        <span>⏳</span> Activity Timeline
      </h4>
      <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
        {timeline.map((entry, idx) => {
          const icon = getActionIcon(entry.action);
          const isLatest = idx === timeline.length - 1;
          return (
            <div key={entry.id || idx} className="relative flex items-start gap-3 text-xs">
              <span
                className="absolute -left-6 top-0.5 flex items-center justify-center w-5 h-5 rounded-full text-xs shadow-sm"
                style={{
                  background: isLatest ? 'var(--color-primary)' : '#e2e8f0',
                  color: isLatest ? '#ffffff' : '#334155',
                }}
              >
                {icon}
              </span>
              <div className="flex-1 bg-slate-50 border p-3 rounded-[10px] space-y-1">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span className="text-sm">{entry.action}</span>
                  <span className="text-[10px] font-semibold text-text-muted">
                    {entry.date} · {entry.time}
                  </span>
                </div>
                <p className="text-text-secondary text-[11px]">
                  Performed by: <strong>{entry.userName || 'Field User'}</strong>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
