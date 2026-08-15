import re

with open('src/features/seed/payments/seedStocking/SeedVanPlanStep1.jsx', 'r') as f:
    content = f.read()

target = """                // Otherwise fallback to remaining quantity logic
                const rem = tankRemainingMap[t.name] ?? t.initialQty;
                if (rem > 0) return groupName === 'PENDING';
                return false;
              });

              if (groupTanks.length === 0) return null;

              return (
                <div key={groupName}>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-3">{groupName}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {groupTanks.map(t => {
                      const rem = tankRemainingMap[t.name] ?? t.initialQty;
                      const effRem = rem - (t.returnedQuantity || 0) - (t.transferredQuantity || 0);
                      const packets = t.numberOfPackets;

                      return (
                        <div key={t.id} className="p-3 rounded-[8px] bg-white border shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
                          <div className="flex justify-between items-center mb-2 border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>
                             <span className="font-extrabold text-slate-800 text-sm">{t.name}</span>
                          </div>

                          {groupName === 'PENDING' && (
                            <div className="text-xs text-slate-600 space-y-1">
                              <p>Current Quantity: <span className="font-extrabold text-slate-800">{rem.toLocaleString('en-IN')} pcs</span></p>
                              {packets != null && <p>Current Packets: <span className="font-extrabold text-slate-800">{packets}</span></p>
                              
                              <div className="flex gap-2 mt-3 pt-2 border-t border-slate-100">
                                <button onClick={() => setActiveModal({ type: 'return', tankName: t.name, maxQty: effRem })} className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition">
                                   Return
                                </button>
                                <button onClick={() => setActiveModal({ type: 'transfer', tankName: t.name, maxQty: effRem })} className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition">
                                   Transfer
                                </button>
                              </div>
                            </div>
                          )}"""

# The exact text has some differences. I will just find the substring and replace.
idx_start = content.find("                // Otherwise fallback to remaining quantity logic\n                const rem = tankRemainingMap[t.name] ?? t.initialQty;\n                if (rem > 0) return groupName === 'PENDING';\n                return false;")
idx_end = content.find("                          {groupName === 'COMPLETED' && (")

replacement = """                // Otherwise fallback to remaining quantity logic
                const baseRem = tankRemainingMap[t.name] ?? t.initialQty;
                const effRem = baseRem - (t.returnedQuantity || 0) - (t.transferredQuantity || 0);
                
                if (effRem > 0) {
                  return groupName === 'PENDING';
                } else {
                  return groupName === 'COMPLETED';
                }
              });

              if (groupTanks.length === 0) return null;

              const colors = {
                COMPLETED: 'text-emerald-700 bg-emerald-100 border-emerald-300',
                PENDING: 'text-slate-700 bg-slate-100 border-slate-300',
                RETURNED: 'text-red-700 bg-red-100 border-red-300',
                TRANSFERRED: 'text-blue-700 bg-blue-100 border-blue-300'
              };

              return (
                <div key={groupName} className="space-y-3">
                  <div className={`px-3 py-1 rounded-[6px] font-black text-[10px] border uppercase tracking-wider ${colors[groupName]} inline-block`}>
                    {groupName}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {groupTanks.map(t => {
                      const rem = tankRemainingMap[t.name] ?? t.initialQty;
                      const effRem = rem - (t.returnedQuantity || 0) - (t.transferredQuantity || 0);
                      const packets = t.numberOfPackets;

                      return (
                        <div key={t.id} className="p-3 rounded-[8px] bg-white border shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
                          <div className="flex justify-between items-center mb-2 border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>
                             <span className="font-extrabold text-slate-800 text-sm">{t.name}</span>
                          </div>

                          {groupName === 'PENDING' && (
                            <div className="text-xs text-slate-600 space-y-1">
                              <p>Current Quantity: <span className="font-extrabold text-slate-800">{effRem.toLocaleString('en-IN')} pcs</span></p>
                              {packets != null && <p>Current Packets: <span className="font-extrabold text-slate-800">{packets}</span></p>}
                              
                              <div className="flex gap-2 mt-3 pt-2 border-t border-slate-100">
                                <button onClick={() => setActiveModal({ type: 'return', tankName: t.name, maxQty: effRem })} className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition">
                                   Return
                                </button>
                                <button onClick={() => setActiveModal({ type: 'transfer', tankName: t.name, maxQty: effRem })} className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition">
                                   Transfer
                                </button>
                              </div>
                            </div>
                          )}
"""

if idx_start != -1 and idx_end != -1:
    new_content = content[:idx_start] + replacement + content[idx_end:]
    with open('src/features/seed/payments/seedStocking/SeedVanPlanStep1.jsx', 'w') as f:
        f.write(new_content)
    print("Replaced successfully")
else:
    print("Indices not found")
