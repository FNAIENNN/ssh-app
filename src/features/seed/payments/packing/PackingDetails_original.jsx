import React from 'react';

export default function PackingDetails({ tanks, setTanks, vehicles = [], onNext }) {
  // Update packet count for a specific tank
  const handlePacketsChange = (id, val) => {
    // Only allow positive integers or empty string
    if (val === '' || /^\d+$/.test(val)) {
      setTanks(prev => prev.map(t => t.id === id ? { ...t, numberOfPackets: val } : t));
    }
  };

  const handleNext = () => {
    // Validation: All tanks must have a packet count
    const missing = tanks.some(t => !t.numberOfPackets || Number(t.numberOfPackets) <= 0);
    if (missing) {
      alert("Please enter a valid number of packets for all tanks.");
      return;
    }
    onNext();
  };

  // Find all assigned tank IDs to see if there are unassigned ones
  const assignedTankIds = new Set();
  vehicles.forEach(v => {
    (v.tank_ids || []).forEach(tid => assignedTankIds.add(tid));
  });

  const unassignedTanks = tanks.filter(t => !assignedTankIds.has(t.id));

  const renderTankTable = (tankList) => (
    <div className="overflow-x-auto rounded-[8px] border" style={{ borderColor: 'var(--color-border)' }}>
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="bg-slate-100 text-slate-700">
            <th className="p-3 font-bold border-r" style={{ borderColor: 'var(--color-border)' }}>Tank</th>
            <th className="p-3 font-bold border-r" style={{ borderColor: 'var(--color-border)' }}>Quantity</th>
            <th className="p-3 font-bold">Number of Packets</th>
          </tr>
        </thead>
        <tbody>
          {tankList.map((t) => (
            <tr key={t.id} className="border-t hover:bg-slate-50 transition" style={{ borderColor: 'var(--color-border)' }}>
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

  return (
    <div className="card p-5 space-y-4 shadow-sm border" style={{ borderColor: 'var(--color-border)' }}>
      <h3 className="font-extrabold text-lg text-primary border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>📦 Step 1: Packing Details</h3>
      
      {vehicles.length === 0 && (
        <div className="p-4 bg-amber-50 text-amber-800 text-sm font-bold border border-amber-200 rounded">
          No vehicles found. Showing all tanks below.
        </div>
      )}

      {vehicles.map((v, i) => {
        const vTanks = tanks.filter(t => (v.tank_ids || []).includes(t.id));
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
            {renderTankTable(vTanks)}
          </div>
        );
      })}

      {unassignedTanks.length > 0 && (
        <div className="space-y-3 mb-6 p-4 rounded-[12px] bg-red-50/50 border border-red-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-red-200">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-[11px] uppercase font-bold text-red-500">Unassigned</p>
              <h4 className="font-extrabold text-sm text-red-800">
                Tanks Without Vehicle
              </h4>
            </div>
          </div>
          <p className="text-xs text-red-600 font-semibold mb-2">These tanks were not assigned to any vehicle during Vehicle Booking.</p>
          {renderTankTable(unassignedTanks)}
        </div>
      )}

      <div className="pt-4 flex justify-end">
        <button
          type="button"
          onClick={handleNext}
          className="btn-success px-8 py-3 font-extrabold text-sm shadow-md"
        >
          Next ➔
        </button>
      </div>
    </div>
  );
}
