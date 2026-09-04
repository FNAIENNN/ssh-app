import { useState } from 'react';

export default function NewlyAddedTanksPanel({ newlyAddedTanks, addNewlyAddedTank, orderForm, setOrderForm, selectTank }) {
  const [tankName, setTankName] = useState('');
  const [tankQty, setTankQty] = useState('');

  function handleAdd() {
    const cleanName = tankName.trim().toUpperCase();
    if (!cleanName) return;
    
    const newId = `new-${Date.now()}`;
    
    // Add to context
    addNewlyAddedTank({ 
      id: newId, 
      name: cleanName 
    });

    // Auto-select and set quantity in orderForm
    setOrderForm(prev => {
      const newIds = prev.selectedTankIds.includes(newId) 
        ? prev.selectedTankIds 
        : [...prev.selectedTankIds, newId];
        
      return {
        ...prev,
        selectedTankIds: newIds,
        tankQtys: {
          ...prev.tankQtys,
          [newId]: tankQty
        }
      };
    });
    
    // Clear inputs
    setTankName('');
    setTankQty('');
  }

  return (
    <div className="space-y-4 p-4 rounded-[12px] bg-slate-50 border border-slate-200 mt-2 text-left">
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-bold text-slate-800">Manually Add Tank</h4>
        <p className="text-xs text-text-muted">
          Add a tank that wasn't found in the system. It will be saved to the bill.
        </p>
      </div>
      
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="field-label text-xs">Enter Tank Name</label>
          <input 
            className="field text-sm font-bold uppercase" 
            placeholder="e.g. A12" 
            value={tankName}
            onChange={e => setTankName(e.target.value)}
          />
        </div>
        <div className="w-32">
          <label className="field-label text-xs">Count</label>
          <input 
            type="number"
            className="field text-sm" 
            placeholder="Qty" 
            value={tankQty}
            onChange={e => setTankQty(e.target.value)}
          />
        </div>
        <button 
          type="button" 
          onClick={handleAdd}
          disabled={!tankName.trim()}
          className="btn-primary px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          Add Tank
        </button>
      </div>

      {newlyAddedTanks.length > 0 && (
        <div className="pt-3 border-t border-slate-200">
          <p className="text-xs font-bold text-text-muted mb-2">Added Tanks ({newlyAddedTanks.length})</p>
          <div className="space-y-2">
            {newlyAddedTanks.map((t) => {
              const selected = orderForm.selectedTankIds.includes(t.id);
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 border transition"
                  style={{
                    borderColor: selected ? 'var(--color-success)' : 'var(--color-border)',
                    background: selected ? 'var(--color-success-bg)' : '#fff',
                  }}
                >
                  <input
                    type="checkbox"
                    id={`new-tank-chk-${t.id}`}
                    checked={selected}
                    onChange={() => selectTank(t.id)}
                    className="w-4 h-4 accent-primary cursor-pointer"
                  />
                  <label
                    htmlFor={`new-tank-chk-${t.id}`}
                    className="text-sm font-semibold flex-1 min-w-0 truncate cursor-pointer"
                  >
                    {t.name}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Qty"
                      className="field py-1.5 w-28 text-xs"
                      value={orderForm.tankQtys[t.id] ?? ''}
                      onChange={(e) =>
                        setOrderForm((f) => ({ ...f, tankQtys: { ...f.tankQtys, [t.id]: e.target.value } }))
                      }
                    />
                    {selected && (
                      <span className="text-[11px] font-extrabold text-success whitespace-nowrap">✓</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
