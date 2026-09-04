import React, { useState } from 'react';

export default function PackingDetails({ tanks, setTanks, vehicles = [], activeOrder = null, onNext }) {
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [savedVehicles, setSavedVehicles] = useState(new Set());

  // Update packet count for a specific tank
  const handlePacketsChange = (id, val) => {
    // Only allow positive integers or empty string
    if (val === '' || /^\d+$/.test(val)) {
      setTanks(prev => prev.map(t => t.id === id ? { ...t, numberOfPackets: val } : t));
    }
  };

  const handleQuantityChange = (id, val) => {
    if (val === '' || /^\d+$/.test(val)) {
      setTanks(prev => prev.map(t => {
        if (t.id === id) {
          const numVal = Number(val);
          if (numVal > t.maxQuantity) {
            return { ...t, quantity: t.maxQuantity };
          }
          return { ...t, quantity: val };
        }
        return t;
      }));
    }
  };

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const selectedIndex = vehicles.findIndex(v => v.id === selectedVehicleId);

  const handleSaveVehicle = () => {
    if (!selectedVehicle) return;
    const tids = selectedVehicle.tank_ids || selectedVehicle.selectedTanks || [];
    const vTanks = tanks.filter(t => tids.includes(t.id));
    const isMixedMode = activeOrder?.current_stage === 'mixed-allocation';

    const missingQty = vTanks.some(t => {
      if (isMixedMode) return false; // Qty can be 0 or empty in mixed mode (untouched)
      return !t.quantity || Number(t.quantity) <= 0;
    });
    if (missingQty) {
      alert("Please enter a valid packing quantity (greater than 0) for all tanks assigned to this vehicle.");
      return;
    }

    const missingPackets = vTanks.some(t => {
      const q = Number(t.quantity);
      if (isMixedMode && (!t.quantity || q <= 0)) {
        return false; // Untouched in mixed mode, ignore packets
      }
      return !t.numberOfPackets || Number(t.numberOfPackets) <= 0;
    });
    if (missingPackets) {
      alert("Please enter a valid number of packets for all active tanks assigned to this vehicle.");
      return;
    }
    
    setSavedVehicles(prev => {
      const nextSet = new Set(prev);
      nextSet.add(selectedVehicleId);
      return nextSet;
    });
  };

  const handleNext = () => {
    if (vehicles.length > 0 && savedVehicles.size < vehicles.length) {
      alert("Please save packing data for all booked vehicles before proceeding.");
      return;
    }
    onNext();
  };

  // Find all assigned tank IDs to see if there are unassigned ones
  const assignedTankIds = new Set();
  vehicles.forEach(v => {
    const tids = v.tank_ids || v.selectedTanks || [];
    tids.forEach(tid => assignedTankIds.add(tid));
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
              <td className="p-3 border-r" style={{ borderColor: 'var(--color-border)' }}>
                <input
                  type="text"
                  inputMode="numeric"
                  className="field text-sm w-full font-extrabold text-primary"
                  placeholder="Enter quantity"
                  value={t.quantity}
                  onChange={(e) => handleQuantityChange(t.id, e.target.value)}
                />
                <div className="text-[10px] text-text-muted mt-1 font-semibold">Available: {Number(t.maxQuantity).toLocaleString('en-IN')}</div>
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

      {vehicles.length > 0 && (
        <div className="card p-4 mb-6" style={{ borderColor: 'var(--color-border)' }}>
          <label className="field-label">Select Vehicle</label>
          <select
            className="field text-sm font-semibold"
            value={selectedVehicleId}
            onChange={(e) => setSelectedVehicleId(e.target.value)}
          >
            <option value="">-- Select a Vehicle --</option>
            {vehicles.map((v, i) => (
              <option key={v.id} value={v.id}>
                Vehicle {i + 1} · {v.vehicle_no || v.vehicleNo || 'No Reg'} {savedVehicles.has(v.id) ? '✓ Saved' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedVehicle && (() => {
        const v = selectedVehicle;
        const i = selectedIndex;
        const tids = v.tank_ids || v.selectedTanks || [];
        const vTanks = tanks.filter(t => tids.includes(t.id));
        const isSaved = savedVehicles.has(v.id);
        
        return (
          <div key={v.id} className="space-y-3 mb-6 p-4 rounded-[12px] border bg-slate-50 shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-2 mb-2 pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-xl">🚛</span>
              <div>
                <p className="text-[11px] uppercase font-bold text-slate-500">Vehicle {i + 1}</p>
                <h4 className="font-extrabold text-sm text-primary flex items-center gap-2">
                  {v.vehicle_no || v.vehicleNo || 'No Reg'} — {v.driver_name || v.driverName || 'No Driver'}
                  {isSaved && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">✓ Saved</span>}
                </h4>
              </div>
            </div>
            
            {vTanks.length > 0 ? (
              renderTankTable(vTanks)
            ) : (
              <p className="text-xs font-bold text-slate-500 italic">No tanks assigned to this vehicle.</p>
            )}

            <div className="pt-3 flex justify-end">
              <button
                type="button"
                onClick={handleSaveVehicle}
                className="btn-primary px-6 py-2 text-sm shadow-sm"
              >
                Save
              </button>
            </div>
          </div>
        );
      })()}

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