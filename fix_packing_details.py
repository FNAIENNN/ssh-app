import re

with open('src/features/seed/payments/packing/PackingDetails.jsx', 'r') as f:
    content = f.read()

old_render = """  const renderTankTable = (tankList) => {
    const sortedTanks = [...tankList].sort((a, b) => {
      const vIndexA = vehicles.findIndex(v => (v.tank_ids || []).some(id => String(id) === String(a.id)));
      const vIndexB = vehicles.findIndex(v => (v.tank_ids || []).some(id => String(id) === String(b.id)));
      
      if (vIndexA === -1 && vIndexB !== -1) return 1;
      if (vIndexA !== -1 && vIndexB === -1) return -1;
      
      if (vIndexA !== vIndexB) return vIndexA - vIndexB;
      
      return (a.name || '').localeCompare(b.name || '');
    });

    return (
      <div className="overflow-x-auto rounded-[8px] border" style={{ borderColor: 'var(--color-border)' }}>
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-700">
              <th className="p-3 font-bold border-r" style={{ borderColor: 'var(--color-border)' }}>Vehicle</th>
              <th className="p-3 font-bold border-r" style={{ borderColor: 'var(--color-border)' }}>Tank</th>
              <th className="p-3 font-bold border-r" style={{ borderColor: 'var(--color-border)' }}>Quantity</th>
              <th className="p-3 font-bold">Number of Packets</th>
            </tr>
          </thead>
          <tbody>
            {sortedTanks.map((t) => (
              <tr key={t.id} className="border-t hover:bg-slate-50 transition" style={{ borderColor: 'var(--color-border)' }}>
                <td className="p-3 font-bold text-slate-500 border-r text-xs uppercase" style={{ borderColor: 'var(--color-border)' }}>
                  {getVehicleNo(t.id)}
                </td>
                <td className="p-3 font-bold text-slate-800 border-r" style={{ borderColor: 'var(--color-border)' }}>{t.name}</td>
                <td className="p-3 font-extrabold text-primary border-r" style={{ borderColor: 'var(--color-border)' }}>
                  {Number(t.quantity).toLocaleString('en-IN')}
                </td>
                <td className="p-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="field text-sm w-full font-bold text-slate-800"
                    placeholder="Enter packets"
                    value={t.numberOfPackets}
                    onChange={(e) => handlePacketsChange(t.id, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };"""

new_render = """  const assignedTankIds = new Set();
  vehicles.forEach(v => {
    (v.tank_ids || []).forEach(tid => assignedTankIds.add(String(tid)));
  });

  const unassignedTanks = tanks.filter(t => !assignedTankIds.has(String(t.id)));

  const renderVehicleBlock = (v, vIndex, vehicleTanks) => (
    <div key={v.id || vIndex} className="space-y-4 mb-8">
      <div className="border-b pb-2 mb-4" style={{ borderColor: 'var(--color-border)' }}>
        <h4 className="font-black text-lg text-primary uppercase tracking-wide">VEHICLE {vIndex + 1}</h4>
        <p className="text-sm font-bold text-slate-600">Driver: {v.driver_name || 'N/A'}</p>
      </div>
      <div className="space-y-4">
        {vehicleTanks.map((t) => (
          <div key={t.id} className="p-4 rounded-[12px] border bg-slate-50 shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
            <h5 className="font-black text-lg text-slate-800 mb-2">{t.name}</h5>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <span className="text-sm font-bold text-slate-500 uppercase">Selected Quantity:</span>
                <span className="ml-2 font-extrabold text-primary text-base">{Number(t.quantity).toLocaleString('en-IN')} pcs</span>
              </div>
              <div className="flex-1 flex items-center gap-2">
                <label className="text-sm font-bold text-slate-500 uppercase whitespace-nowrap">Number of Packets:</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="field text-sm w-full max-w-[120px] font-bold text-slate-800"
                  placeholder="e.g. 10"
                  value={t.numberOfPackets || ''}
                  onChange={(e) => handlePacketsChange(t.id, e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );"""

content = content.replace(old_render, new_render)

# Replace {renderTankTable(tanks)} with the vehicle map
old_ui = """      {renderTankTable(tanks)}"""
new_ui = """      {vehicles.map((v, i) => {
        const vTanks = tanks.filter(t => (v.tank_ids || []).some(id => String(id) === String(t.id)));
        if (vTanks.length === 0) return null;
        return renderVehicleBlock(v, i, vTanks);
      })}

      {unassignedTanks.length > 0 && (
        <div className="space-y-4 mb-8">
          <div className="border-b pb-2 mb-4 border-red-200">
            <h4 className="font-black text-lg text-red-800 uppercase tracking-wide">Unassigned Tanks</h4>
          </div>
          <div className="space-y-4">
            {unassignedTanks.map((t) => (
              <div key={t.id} className="p-4 rounded-[12px] border bg-red-50 border-red-200 shadow-sm">
                <h5 className="font-black text-lg text-slate-800 mb-2">{t.name}</h5>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1">
                    <span className="text-sm font-bold text-slate-500 uppercase">Selected Quantity:</span>
                    <span className="ml-2 font-extrabold text-red-700 text-base">{Number(t.quantity).toLocaleString('en-IN')} pcs</span>
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <label className="text-sm font-bold text-slate-500 uppercase whitespace-nowrap">Number of Packets:</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="field text-sm w-full max-w-[120px] font-bold text-slate-800"
                      placeholder="e.g. 10"
                      value={t.numberOfPackets || ''}
                      onChange={(e) => handlePacketsChange(t.id, e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}"""
content = content.replace(old_ui, new_ui)

with open('src/features/seed/payments/packing/PackingDetails.jsx', 'w') as f:
    f.write(content)
