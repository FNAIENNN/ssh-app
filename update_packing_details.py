import re

with open('src/features/seed/payments/packing/PackingDetails.jsx', 'r') as f:
    content = f.read()

old_block = """  const renderVehicleBlock = (v, vIndex, vehicleTanks) => (
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

new_block = """  const renderVehicleBlock = (v, vIndex, vehicleTanks) => (
    <div key={v.id || vIndex} className="mb-8 p-4 rounded-[12px] bg-slate-50 border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-black text-slate-800">Vehicle {vIndex + 1}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-slate-200 mb-4">
        <div>
          <p className="text-[11px] uppercase font-bold text-slate-500">Vehicle Number</p>
          <p className="text-sm font-extrabold text-slate-900">
            {v.vehicle_no || 'N/A'}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase font-bold text-slate-500">Driver Name</p>
          <p className="text-sm font-extrabold text-slate-900">
            {v.driver_name || 'N/A'}
          </p>
        </div>
      </div>
      <div className="space-y-4">
        {vehicleTanks.map((t) => (
          <div key={t.id} className="p-4 rounded-[12px] border bg-white shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
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

content = content.replace(old_block, new_block)

with open('src/features/seed/payments/packing/PackingDetails.jsx', 'w') as f:
    f.write(content)
