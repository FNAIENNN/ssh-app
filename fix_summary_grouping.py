import re

with open('src/features/seed/payments/packing/PackingSummary.jsx', 'r') as f:
    content = f.read()

# I need to change how targetTanks are handled in PackingSummary.jsx
# In the return block:

old_vehicle_map = """      {vehicles.map((v, i) => {
        const vTanks = finalTanks.filter(t => (v.tank_ids || []).some(id => String(id) === String(t.id)));
        if (vTanks.length === 0) return null;
        return (
          <div key={v.id} className="space-y-3 mb-6 p-4 rounded-[12px] border bg-slate-50 shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-2 mb-2 pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-xl">🚛</span>
              <div>
                <p className="text-[11px] uppercase font-bold text-slate-500">Vehicle {i + 1}</p>
                <h4 className="font-extrabold text-sm text-primary">
                  {v.vehicle_no || 'No Reg'} — {v.driver_name || 'No Driver'}
                </h4>
              </div>
            </div>
            {renderSummaryTable(vTanks)}
          </div>
        );
      })}"""

new_vehicle_map = """      {vehicles.map((v, i) => {
        const vTanks = finalTanks.filter(t => {
          if (t.isTransferTarget && t.sourceTankId) {
            return (v.tank_ids || []).some(id => String(id) === String(t.sourceTankId));
          }
          return (v.tank_ids || []).some(id => String(id) === String(t.id));
        });
        if (vTanks.length === 0) return null;
        return (
          <div key={v.id} className="space-y-3 mb-6 p-4 rounded-[12px] border bg-slate-50 shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-2 mb-2 pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-xl">🚛</span>
              <div>
                <p className="text-[11px] uppercase font-bold text-slate-500">Vehicle {i + 1}</p>
                <h4 className="font-extrabold text-sm text-primary">
                  {v.vehicle_no || 'No Reg'} — {v.driver_name || 'No Driver'}
                </h4>
              </div>
            </div>
            {renderSummaryTable(vTanks)}
          </div>
        );
      })}"""
content = content.replace(old_vehicle_map, new_vehicle_map)


# And remove the separate Transferred Target Tanks block:
old_target_block = """      {targetTanks.length > 0 && (
        <div className="space-y-3 mb-6 p-4 rounded-[12px] bg-blue-50/50 border border-blue-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-blue-200">
            <span className="text-xl">🔄</span>
            <div>
              <p className="text-[11px] uppercase font-bold text-blue-500">Transferred</p>
              <h4 className="font-extrabold text-sm text-blue-800">
                Target Tanks
              </h4>
            </div>
          </div>
          {renderSummaryTable(targetTanks)}
        </div>
      )}"""
content = content.replace(old_target_block, "")

# And we should update the logic for targetTanks in the unassigned calculation so it correctly falls back to unassigned if sourceTankId is missing:
old_unassigned_calc = """  const unassignedTanks = finalTanks.filter(t => !assignedTankIds.has(String(t.id)) && !t.isTransferTarget);
  const targetTanks = finalTanks.filter(t => t.isTransferTarget);"""
new_unassigned_calc = """  const unassignedTanks = finalTanks.filter(t => {
    if (t.isTransferTarget && t.sourceTankId) {
      return !assignedTankIds.has(String(t.sourceTankId));
    }
    return !assignedTankIds.has(String(t.id));
  });"""
content = content.replace(old_unassigned_calc, new_unassigned_calc)

with open('src/features/seed/payments/packing/PackingSummary.jsx', 'w') as f:
    f.write(content)
