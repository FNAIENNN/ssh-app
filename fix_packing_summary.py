import re

with open('src/features/seed/payments/packing/PackingSummary.jsx', 'r') as f:
    content = f.read()

# Replace the renderSummaryTable
old_render_table = """  const renderSummaryTable = (tankList) => (
    <div className="overflow-x-auto rounded-[8px] border" style={{ borderColor: 'var(--color-border)' }}>
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="bg-slate-100 text-slate-700">
            <th className="p-3 font-bold border-r" style={{ borderColor: 'var(--color-border)' }}>Tank</th>
            <th className="p-3 font-bold border-r" style={{ borderColor: 'var(--color-border)' }}>Quantity</th>
            <th className="p-3 font-bold border-r" style={{ borderColor: 'var(--color-border)' }}>Number of Packets</th>
            <th className="p-3 font-bold">Status</th>
          </tr>
        </thead>
        <tbody>
          {tankList.map((t) => (
            <tr key={t.id} className="border-t hover:bg-slate-50 transition" style={{ borderColor: 'var(--color-border)' }}>
              <td className="p-3 font-bold text-slate-800 border-r flex items-center gap-2" style={{ borderColor: 'var(--color-border)' }}>
                {t.isTransferTarget ? 'Target Tank: ' + t.name : t.name}
              </td>
              <td className="p-3 font-extrabold text-primary border-r" style={{ borderColor: 'var(--color-border)' }}>
                {t.status === 'Returned' || t.status === 'Transferred' ? '-' : Number(t.quantity).toLocaleString('en-IN')}
              </td>
              <td className="p-3 font-bold text-slate-700 border-r" style={{ borderColor: 'var(--color-border)' }}>
                {t.status === 'Returned' || t.status === 'Transferred' ? '-' : t.numberOfPackets}
              </td>
              <td className="p-3 font-bold">
                <span className={`px-2 py-1 text-[11px] uppercase rounded-full ${t.status === 'Returned' ? 'bg-red-100 text-red-700' : t.status === 'Transferred' ? 'bg-blue-100 text-blue-700' : t.status === 'Stocking Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {t.status || 'Pending'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );"""

new_render_table = """  const renderSummaryTable = (tankList) => (
    <div className="overflow-x-auto rounded-[8px] border" style={{ borderColor: 'var(--color-border)' }}>
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="bg-slate-100 text-slate-700">
            <th className="p-3 font-bold border-r" style={{ borderColor: 'var(--color-border)' }}>Tank</th>
            <th className="p-3 font-bold border-r" style={{ borderColor: 'var(--color-border)' }}>Quantity</th>
            <th className="p-3 font-bold border-r" style={{ borderColor: 'var(--color-border)' }}>Number of Packets</th>
            <th className="p-3 font-bold">Status</th>
          </tr>
        </thead>
        <tbody>
          {tankList.map((t) => {
            const isFullyEmpty = t.quantity <= 0 && t.numberOfPackets <= 0;
            return (
              <tr key={t.id} className="border-t hover:bg-slate-50 transition" style={{ borderColor: 'var(--color-border)' }}>
                <td className="p-3 font-bold text-slate-800 border-r flex items-center gap-2" style={{ borderColor: 'var(--color-border)' }}>
                  {t.isTransferTarget ? 'Target Tank: ' + t.name : t.name}
                </td>
                <td className="p-3 font-extrabold text-primary border-r" style={{ borderColor: 'var(--color-border)' }}>
                  {isFullyEmpty && (t.status === 'Returned' || t.status === 'Transferred') ? '-' : Number(t.quantity).toLocaleString('en-IN')}
                </td>
                <td className="p-3 font-bold text-slate-700 border-r" style={{ borderColor: 'var(--color-border)' }}>
                  {isFullyEmpty && (t.status === 'Returned' || t.status === 'Transferred') ? '-' : t.numberOfPackets}
                </td>
                <td className="p-3 font-bold">
                  <span className={`px-2 py-1 text-[11px] uppercase rounded-full ${t.status === 'Returned' ? 'bg-red-100 text-red-700' : t.status === 'Transferred' ? 'bg-blue-100 text-blue-700' : t.status === 'Stocking Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {t.status || 'Pending'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );"""

content = content.replace(old_render_table, new_render_table)

# Update unassignedTanks logic
old_unassigned_logic = """  const unassignedTanks = finalTanks.filter(t => !assignedTankIds.has(String(t.id)));"""
new_unassigned_logic = """  const unassignedTanks = finalTanks.filter(t => !assignedTankIds.has(String(t.id)) && !t.isTransferTarget);
  const targetTanks = finalTanks.filter(t => t.isTransferTarget);"""
content = content.replace(old_unassigned_logic, new_unassigned_logic)

# Insert the Transferred Target Tanks UI before unassignedTanks UI
old_unassigned_ui = """      {unassignedTanks.length > 0 && (
        <div className="space-y-3 mb-6 p-4 rounded-[12px] bg-red-50/50 border border-red-200 shadow-sm">"""
new_unassigned_ui = """      {targetTanks.length > 0 && (
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
      )}

      {unassignedTanks.length > 0 && (
        <div className="space-y-3 mb-6 p-4 rounded-[12px] bg-red-50/50 border border-red-200 shadow-sm">"""
content = content.replace(old_unassigned_ui, new_unassigned_ui)

with open('src/features/seed/payments/packing/PackingSummary.jsx', 'w') as f:
    f.write(content)
