/**
 * HarvestChecklist — Pre-Harvest Safety Checklist.
 * Loads checklist items dynamically from Settings (localStorage).
 * Falls back to 9 default items if none configured.
 */
export default function HarvestChecklist({ checklist, setChecklist, siteId, onProceed, onBack }) {
  // Load items from localStorage (set in HarvestSettingsTab)
  const CHECKLIST_STORAGE_KEY = `harvest_checklist_${siteId}`;
  const DEFAULT_ITEMS = [
    { key: 'permission', label: 'Harvest Permission Approved', desc: 'Manager / Management signoff' },
    { key: 'waterLevel', label: 'Water Level Reduced', desc: 'Pond drained to safe harvest level' },
    { key: 'harvestNet', label: 'Harvest Net Ready', desc: 'Clean, untorn netting deployed' },
    { key: 'iceReady', label: 'Ice Ready', desc: 'Sufficient crushed ice on site' },
    { key: 'vehicleReady', label: 'Vehicle Ready', desc: 'Insulated transport vehicle parked' },
    { key: 'packingReady', label: 'Packing Crates Ready', desc: 'Clean crates and weighing tubs' },
    { key: 'labourReady', label: 'Labour Crew Ready', desc: 'Harvest workers present and equipped' },
    { key: 'countSample', label: 'Count Sample Taken', desc: 'Pre-harvest count verification sample' },
    { key: 'supervisorApproval', label: 'Supervisor On-Site Approval', desc: 'Harvest incharge verified all conditions' },
  ];

  let items = DEFAULT_ITEMS;
  try {
    const stored = localStorage.getItem(CHECKLIST_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        items = parsed;
      }
    }
  } catch {}

  const checkedCount = items.filter((i) => checklist[i.key]).length;
  const isComplete = checkedCount === items.length;

  const toggleAll = (value) => {
    const next = {};
    items.forEach((i) => (next[i.key] = value));
    setChecklist(next);
  };

  return (
    <div className="space-y-6">
      {/* Header & Status */}
      <div
        className="rounded-2xl p-5 border flex items-center justify-between gap-4"
        style={{
          background: isComplete ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
          borderColor: isComplete ? 'var(--color-success)' : 'var(--color-warning)',
        }}
      >
        <div>
          <h3
            className="text-base font-extrabold flex items-center gap-2"
            style={{ color: isComplete ? 'var(--color-success)' : 'var(--color-warning)' }}
          >
            <span>{isComplete ? '✅ Pre-Harvest Checklist Complete' : '⚠️ Pre-Harvest Safety Checklist'}</span>
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            All {items.length} safety and operational items must be verified before proceeding.
          </p>
        </div>

        <div className="text-right">
          <span
            className="text-2xl font-black font-mono block"
            style={{ color: isComplete ? 'var(--color-success)' : 'var(--color-warning)' }}
          >
            {checkedCount} / {items.length}
          </span>
          <button
            type="button"
            onClick={() => toggleAll(!isComplete)}
            className="text-[11px] font-bold underline mt-0.5 hover:opacity-80"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {isComplete ? 'Uncheck All' : 'Check All'}
          </button>
        </div>
      </div>

      {/* Checklist grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((item, idx) => {
          const checked = Boolean(checklist[item.key]);
          return (
            <label
              key={item.key}
              className="rounded-xl p-3.5 border transition cursor-pointer flex items-start gap-3 select-none"
              style={{
                background: checked ? 'var(--color-success-bg)' : 'var(--color-surface-card)',
                borderColor: checked ? 'var(--color-success)' : 'var(--color-border)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecklist({ ...checklist, [item.key]: e.target.checked })}
                className="w-5 h-5 accent-emerald-600 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold block" style={{ color: 'var(--color-text-primary)' }}>
                  {idx + 1}. {item.label}
                </span>
                {item.desc && (
                  <span className="text-[11px] block mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {item.desc}
                  </span>
                )}
              </div>
              <span className="text-sm">{checked ? '✅' : '⏳'}</span>
            </label>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <button type="button" onClick={onBack} className="btn-secondary">
          ← Back to Tank Selection
        </button>

        <button
          type="button"
          disabled={!isComplete}
          onClick={onProceed}
          className={`btn ${isComplete ? 'btn-primary' : 'opacity-50 cursor-not-allowed'}`}
        >
          Proceed to Billing Page →
        </button>
      </div>
    </div>
  );
}
