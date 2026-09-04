import React from 'react';

export default function PackingSummary({ tanks, vehicles = [], onGoToHistory }) {
  const selectedTanks = tanks.filter(t => t.selected);
  
  const finalTanks = selectedTanks;

  const totalQuantity = finalTanks.reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);
  const totalPackets = finalTanks.reduce((sum, t) => sum + (Number(t.numberOfPackets) || 0), 0);

  const assignedTankIds = new Set();
  vehicles.forEach(v => {
    (v.tank_ids || v.selectedTanks || []).forEach(tid => assignedTankIds.add(String(tid)));
  });

  const unassignedTanks = finalTanks.filter(t => {
    if (t.isTransferTarget && t.originalTankId) {
      return !assignedTankIds.has(String(t.originalTankId));
    }
    return !assignedTankIds.has(String(t.id));
  });

  const getStatusColor = (status) => {
    const s = status || '';
    if (s.includes('Returned')) return 'bg-red-100 text-red-700';
    if (s.includes('Transferred')) return 'bg-blue-100 text-blue-700';
    if (s === 'Stocking Completed') return 'bg-green-100 text-green-700';
    if (s.includes('Partially')) return 'bg-orange-100 text-orange-800';
    return 'bg-yellow-100 text-yellow-700';
  };

  const renderSummaryTable = (tankList) => (
    <div className="space-y-4">
      {tankList.map((t) => {
        if (t.isTransferTarget) {
          return (
            <div key={t.id} className="p-4 rounded-[12px] border bg-white shadow-sm space-y-2" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex justify-between items-center pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <h4 className="font-extrabold text-slate-800 flex items-center gap-2">
                   <span>🎯</span> Target Tank: {t.name}
                </h4>
                <span className={`px-2 py-1 text-[11px] uppercase font-bold rounded-full ${getStatusColor(t.status)}`}>
                  {t.status || 'Pending'}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-2">
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase">Received from</p>
                  <p className="font-extrabold text-slate-700">{t.sourceTankId ? (tanks.find(src => src.id === t.sourceTankId)?.name || 'Source') : 'Source'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase">Received Quantity</p>
                  <p className="font-extrabold text-primary">{Number(t.quantity).toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase">Received Packets</p>
                  <p className="font-extrabold text-slate-700">{t.numberOfPackets}</p>
                </div>
              </div>
            </div>
          );
        }

        const originalQty = t.originalQuantity != null ? t.originalQuantity : t.quantity;
        
        return (
          <div key={t.id} className="p-4 rounded-[12px] border bg-white shadow-sm space-y-4" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex justify-between items-center pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h4 className="font-extrabold text-slate-800 text-lg flex items-center gap-2">
                 <span>📦</span> {t.name}
              </h4>
              <span className={`px-3 py-1 text-xs uppercase font-bold rounded-full ${getStatusColor(t.status)}`}>
                {t.status || 'Pending'}
              </span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase">Original</p>
                <p className="font-extrabold text-slate-700">{Number(originalQty).toLocaleString('en-IN')} pcs</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase">Returned</p>
                <p className="font-extrabold text-red-600">{Number(t.returnedQuantity || 0).toLocaleString('en-IN')} pcs</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase">Transferred</p>
                <p className="font-extrabold text-blue-600">{Number(t.transferredQuantity || 0).toLocaleString('en-IN')} pcs</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase">Remaining</p>
                <p className="font-extrabold text-emerald-700">{Number(t.quantity).toLocaleString('en-IN')} pcs</p>
              </div>
            </div>

            {((t.transfers && t.transfers.length > 0) || (t.returns && t.returns.length > 0)) && (
              <div className="pt-3 border-t grid grid-cols-1 md:grid-cols-2 gap-4" style={{ borderColor: 'var(--color-border)' }}>
                {t.transfers && t.transfers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Transfer Details</p>
                    {t.transfers.map((tr, idx) => (
                      <div key={idx} className="text-sm bg-slate-50 p-2 rounded border border-slate-200">
                        <span className="font-bold">{t.name} ➔ {tr.target}</span> : <span className="font-extrabold text-blue-700">{Number(tr.quantity).toLocaleString('en-IN')}</span> pcs
                      </div>
                    ))}
                  </div>
                )}
                {t.returns && t.returns.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Return Details</p>
                    {t.returns.map((ret, idx) => (
                      <div key={idx} className="text-sm bg-slate-50 p-2 rounded border border-slate-200">
                        <span className="font-bold">{t.name} ➔ Hatchery</span> : <span className="font-extrabold text-red-700">{Number(ret.quantity).toLocaleString('en-IN')}</span> pcs
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="card p-5 space-y-4 shadow-sm border" style={{ borderColor: 'var(--color-border)' }}>
      <h3 className="font-extrabold text-lg text-primary border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>📋 Final Packet Summary</h3>
      
      {vehicles.length === 0 && (
        <div className="p-4 bg-amber-50 text-amber-800 text-sm font-bold border border-amber-200 rounded">
          No vehicles found. Showing all tanks below.
        </div>
      )}

      {vehicles.map((v, i) => {
        const vTanks = finalTanks.filter(t => {
          if (t.isTransferTarget && t.originalTankId) {
            return (v.tank_ids || v.selectedTanks || []).some(id => String(id) === String(t.originalTankId));
          }
          return (v.tank_ids || v.selectedTanks || []).some(id => String(id) === String(t.id));
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
          {renderSummaryTable(unassignedTanks)}
        </div>
      )}

      {/* Grand Total Footer */}
      <div className="mt-6 p-5 rounded-[12px] bg-emerald-50 border border-emerald-200 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase font-bold text-emerald-700">Grand Total</p>
          <h4 className="font-black text-lg text-emerald-900">All Tanks</h4>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase font-bold text-emerald-700">Total Packets</p>
          <p className="font-black text-2xl text-emerald-900">{Number(totalPackets).toLocaleString('en-IN')}</p>
        </div>
      </div>

      <div className="pt-4 flex justify-end">
        <button
          type="button"
          onClick={onGoToHistory}
          className="btn-success px-8 py-3 font-extrabold text-sm shadow-md"
        >
          Confirm & Continue to Outside Workers ➔
        </button>
      </div>
    </div>
  );
}