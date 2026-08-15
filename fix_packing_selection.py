import re

with open('src/features/seed/payments/packing/PackingSelection.jsx', 'r') as f:
    content = f.read()

# I will replace the grid container and the validTanks.map
old_grid = """      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {validTanks.map((t) => {"""

new_grid = """      {vehicles.map((v, vIndex) => {
        const vTanks = validTanks.filter(t => (v.tank_ids || []).some(id => String(id) === String(t.id)) && !t.isTransferTarget);
        if (vTanks.length === 0) return null;
        return (
          <div key={v.id || vIndex} className="space-y-4 mb-8">
            <div className="border-b pb-2 mb-4" style={{ borderColor: 'var(--color-border)' }}>
              <h4 className="font-black text-lg text-primary uppercase tracking-wide">VEHICLE {vIndex + 1}</h4>
              <p className="text-sm font-bold text-slate-600">Driver: {v.driver_name || 'N/A'}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {vTanks.map((t) => {"""

content = content.replace(old_grid, new_grid)

# We need to close the vehicle mapping and handle unassigned/target tanks
# Find the end of the validTanks.map and close the tags
# The map returns JSX for each tank. We need to find `        })} \n      </div>`
old_grid_end = """        })}
      </div>"""

new_grid_end = """        })}
            </div>
          </div>
        );
      })}

      {(() => {
        const assignedTankIds = new Set();
        vehicles.forEach(v => {
          (v.tank_ids || []).forEach(tid => assignedTankIds.add(String(tid)));
        });
        const unassignedTanks = validTanks.filter(t => !assignedTankIds.has(String(t.id)) && !t.isTransferTarget);
        const targetTanks = validTanks.filter(t => t.isTransferTarget);

        return (
          <>
            {targetTanks.length > 0 && (
              <div className="space-y-4 mb-8">
                <div className="border-b pb-2 mb-4 border-blue-200">
                  <h4 className="font-black text-lg text-blue-800 uppercase tracking-wide">Transferred Target Tanks</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {targetTanks.map(t => {
                    const styles = getTankStyles(t.status);
                    const isFullyDone = t.quantity <= 0 && t.numberOfPackets <= 0 && (t.status === 'Transferred' || t.status === 'Returned');
                    return renderTankBox(t, styles, isFullyDone, 'Target Tank');
                  })}
                </div>
              </div>
            )}
            {unassignedTanks.length > 0 && (
              <div className="space-y-4 mb-8">
                <div className="border-b pb-2 mb-4 border-red-200">
                  <h4 className="font-black text-lg text-red-800 uppercase tracking-wide">Unassigned Tanks</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {unassignedTanks.map(t => {
                    const styles = getTankStyles(t.status);
                    const isFullyDone = t.quantity <= 0 && t.numberOfPackets <= 0 && (t.status === 'Transferred' || t.status === 'Returned');
                    return renderTankBox(t, styles, isFullyDone, 'Unassigned');
                  })}
                </div>
              </div>
            )}
          </>
        );
      })()}"""

# We need to extract the tank rendering logic into a helper function `renderTankBox` because it's duplicated now.
# Let's see the current tank rendering. It starts with `const styles = getTankStyles(t.status);` inside the map.

old_tank_render = """          const styles = getTankStyles(t.status);
          
          let vehicleLabel = '';
          if (t.isTransferTarget) {
            vehicleLabel = 'Target Tank';
          } else {
            const vIndex = vehicles.findIndex(v => (v.tank_ids || []).some(id => String(id) === String(t.id)));
            vehicleLabel = vIndex !== -1 ? `Vehicle ${vIndex + 1}` : 'Unassigned';
          }

          const isFullyDone = t.quantity <= 0 && t.numberOfPackets <= 0 && (t.status === 'Transferred' || t.status === 'Returned');

          return (
            <div 
              key={t.id} 
              className="tank-box relative p-4 rounded-[12px] border space-y-3 cursor-pointer transition"
              style={{ 
                borderColor: styles.border,
                background: styles.bg,
                boxShadow: openPopoverId === t.id ? '0 10px 15px -3px rgb(0 0 0 / 0.1)' : '0 1px 2px 0 rgb(0 0 0 / 0.05)'
              }}
              onClick={() => {
                if (openPopoverId === t.id) {
                  setOpenPopoverId(null);
                } else {
                  setOpenPopoverId(t.id);
                  setPopoverView('main');
                }
              }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-extrabold text-lg text-slate-800">
                    {t.isTransferTarget ? t.name : `${vehicleLabel} — ${t.name}`}
                  </h4>
                  {t.isTransferTarget && (
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                      Target Tank
                    </p>
                  )}
                </div>
                {t.status && !isFullyDone && !t.isTransferTarget && (
                  <span 
                    className="text-[10px] font-extrabold px-2 py-1 rounded-full uppercase tracking-wide border" 
                    style={{ background: styles.badgeBg, color: styles.text, borderColor: styles.border }}
                  >
                    {t.status === 'Stocking Completed' ? '✓ Completed' : t.status}
                  </span>
                )}
              </div>
              
              <div className="space-y-1">
                {isFullyDone ? (
                   <p className="font-extrabold text-base uppercase tracking-wider mt-2" style={{ color: styles.text }}>
                     {t.status}
                   </p>
                ) : (
                  <>
                    <p className="text-xs font-bold text-slate-500 uppercase">
                      {t.transferredPackets > 0 || t.returnedPackets > 0 ? 'Remaining Quantity:' : 'Quantity:'} <span className="text-sm font-black text-slate-800 ml-1">{Number(t.quantity).toLocaleString('en-IN')} pcs</span>
                    </p>
                    <p className="text-xs font-bold text-slate-500 uppercase">
                      {t.transferredPackets > 0 || t.returnedPackets > 0 ? 'Remaining Packets:' : 'Number of Packets:'} <span className="text-sm font-black text-slate-800 ml-1">{t.numberOfPackets}</span>
                    </p>
                  </>
                )}

                {t.isTransferTarget && t.transferredFrom && (
                  <p className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1.5 rounded-[6px] mt-2 shadow-sm inline-block w-full truncate">
                    Transferred From: {t.transferredFrom}
                  </p>
                )}
              </div>
            </div>
          );"""

new_tank_render = """          const styles = getTankStyles(t.status);
          const isFullyDone = t.quantity <= 0 && t.numberOfPackets <= 0 && (t.status === 'Transferred' || t.status === 'Returned');
          return renderTankBox(t, styles, isFullyDone, '');"""

content = content.replace(old_tank_render, new_tank_render)

# Now inject the renderTankBox function right before the return statement of PackingSelection
# We need to find `  const activeTank = tanks.find(t => t.id === openPopoverId);`
old_active_tank = """  const activeTank = tanks.find(t => t.id === openPopoverId);"""
new_active_tank = """  const activeTank = tanks.find(t => t.id === openPopoverId);

  const renderTankBox = (t, styles, isFullyDone, labelFallback) => (
            <div 
              key={t.id} 
              className="tank-box relative p-4 rounded-[12px] border space-y-3 cursor-pointer transition"
              style={{ 
                borderColor: styles.border,
                background: styles.bg,
                boxShadow: openPopoverId === t.id ? '0 10px 15px -3px rgb(0 0 0 / 0.1)' : '0 1px 2px 0 rgb(0 0 0 / 0.05)'
              }}
              onClick={() => {
                if (openPopoverId === t.id) {
                  setOpenPopoverId(null);
                } else {
                  setOpenPopoverId(t.id);
                  setPopoverView('main');
                }
              }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-extrabold text-lg text-slate-800">
                    {t.name}
                  </h4>
                  {t.isTransferTarget && (
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                      Target Tank
                    </p>
                  )}
                </div>
                {t.status && !isFullyDone && !t.isTransferTarget && (
                  <span 
                    className="text-[10px] font-extrabold px-2 py-1 rounded-full uppercase tracking-wide border" 
                    style={{ background: styles.badgeBg, color: styles.text, borderColor: styles.border }}
                  >
                    {t.status === 'Stocking Completed' ? '✓ Completed' : t.status === 'Returned' ? '🔴 Returned' : t.status}
                  </span>
                )}
                {isFullyDone && t.status === 'Returned' && (
                  <span className="text-[10px] font-extrabold px-2 py-1 rounded-full uppercase tracking-wide border bg-red-100 text-red-700 border-red-200">
                    🔴 Returned
                  </span>
                )}
              </div>
              
              <div className="space-y-1">
                {isFullyDone ? (
                   <p className="font-extrabold text-base uppercase tracking-wider mt-2" style={{ color: styles.text }}>
                     {t.status === 'Returned' ? 'Returned' : t.status}
                   </p>
                ) : (
                  <>
                    <p className="text-xs font-bold text-slate-500 uppercase">
                      {t.transferredPackets > 0 || t.returnedPackets > 0 ? 'Remaining Quantity:' : 'Quantity:'} <span className="text-sm font-black text-slate-800 ml-1">{Number(t.quantity).toLocaleString('en-IN')} pcs</span>
                    </p>
                    <p className="text-xs font-bold text-slate-500 uppercase">
                      {t.transferredPackets > 0 || t.returnedPackets > 0 ? 'Remaining Packets:' : 'Packets:'} <span className="text-sm font-black text-slate-800 ml-1">{t.numberOfPackets}</span>
                    </p>
                  </>
                )}

                {t.isTransferTarget && t.transferredFrom && (
                  <p className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1.5 rounded-[6px] mt-2 shadow-sm inline-block w-full truncate">
                    Transferred From: {t.transferredFrom}
                  </p>
                )}
              </div>
            </div>
  );
"""
content = content.replace(old_active_tank, new_active_tank)

content = content.replace(old_grid_end, new_grid_end)

with open('src/features/seed/payments/packing/PackingSelection.jsx', 'w') as f:
    f.write(content)
