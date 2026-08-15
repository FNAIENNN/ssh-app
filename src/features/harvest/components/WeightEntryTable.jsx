import { useCallback } from 'react';
import ESP32ScaleConnector from './ESP32ScaleConnector';
import { useESP32Scale } from '../hooks/useESP32Scale';

/**
 * WeightEntryTable — Step 3: Weighment entry with ESP32 scale integration.
 */
export default function WeightEntryTable({ weightRows, setWeightRows, onProceed, onBack }) {
  // Callback when ESP32 scale captures a weight automatically or manually
  const handleAutoWeightCaptured = useCallback((capturedKg) => {
    setWeightRows((prev) => {
      // If last row is empty (0 kg), update it; otherwise append a new row
      const last = prev[prev.length - 1];
      if (last && Number(last.kgs) === 0) {
        return prev.map((r, idx) => (idx === prev.length - 1 ? { ...r, kgs: String(capturedKg) } : r));
      }
      return [...prev, { id: Date.now(), kgs: String(capturedKg), loose: '0' }];
    });
  }, [setWeightRows]);

  const scale = useESP32Scale(handleAutoWeightCaptured);

  const addRow = () => {
    setWeightRows((prev) => [...prev, { id: Date.now(), kgs: '', loose: '0' }]);
  };

  const updateRow = (id, field, val) => {
    setWeightRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const deleteRow = (id) => {
    if (weightRows.length <= 1) return;
    setWeightRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Calculations
  const totalKgs = weightRows.reduce((sum, r) => sum + (Number(r.kgs) || 0), 0);
  const totalLoose = weightRows.reduce((sum, r) => sum + (Number(r.loose) || 0), 0);
  const totalSave = Math.max(0, totalKgs - totalLoose);

  return (
    <div className="space-y-6">
      {/* ESP32 Scale Connector Header */}
      <ESP32ScaleConnector scale={scale} />

      {/* Weighment Entry Card */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Weighment Table</h3>
            <p className="text-xs text-slate-500">
              Weights can be auto-captured from ESP32 or entered manually.
            </p>
          </div>
          <button
            type="button"
            onClick={addRow}
            className="btn-secondary text-xs font-bold flex items-center gap-1"
          >
            ➕ Add Row
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-extrabold border-b border-slate-200">
                <th className="p-3 w-16 text-center">S.No</th>
                <th className="p-3">Weight (KGs)</th>
                <th className="p-3">Loose Weight (KGs)</th>
                <th className="p-3 text-right">Net Save (KGs)</th>
                <th className="p-3 w-16 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {weightRows.map((row, idx) => {
                const rowKg = Number(row.kgs) || 0;
                const rowLoose = Number(row.loose) || 0;
                const rowSave = Math.max(0, rowKg - rowLoose);

                return (
                  <tr key={row.id || idx} className="hover:bg-slate-50/60 transition">
                    <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                    <td className="p-3">
                      <input
                        type="number"
                        step="0.1"
                        placeholder="e.g. 25.5"
                        value={row.kgs}
                        onChange={(e) => updateRow(row.id, 'kgs', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-500"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        step="0.1"
                        placeholder="0"
                        value={row.loose}
                        onChange={(e) => updateRow(row.id, 'loose', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-sm text-slate-900 focus:bg-white focus:border-blue-500"
                      />
                    </td>
                    <td className="p-3 text-right font-extrabold font-mono text-emerald-700 text-sm">
                      {rowSave.toFixed(2)} KG
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => deleteRow(row.id)}
                        disabled={weightRows.length <= 1}
                        className="text-slate-400 hover:text-red-500 disabled:opacity-30 text-base"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-extrabold border-t-2 border-slate-900">
                <td className="p-3 text-center uppercase tracking-wider text-[11px]">Total</td>
                <td className="p-3 font-mono text-sm text-blue-300">{totalKgs.toFixed(2)} KG</td>
                <td className="p-3 font-mono text-sm text-amber-300">{totalLoose.toFixed(2)} KG</td>
                <td className="p-3 text-right font-mono text-base text-emerald-400">
                  {totalSave.toFixed(2)} KG
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Live Summary Chips */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="rounded-xl p-3 bg-blue-50 border border-blue-200">
            <span className="text-[10px] font-bold text-blue-600 uppercase block">Total Gross KGs</span>
            <span className="text-lg font-black text-blue-900 font-mono">{totalKgs.toFixed(2)}</span>
          </div>

          <div className="rounded-xl p-3 bg-amber-50 border border-amber-200">
            <span className="text-[10px] font-bold text-amber-600 uppercase block">Total Loose</span>
            <span className="text-lg font-black text-amber-900 font-mono">{totalLoose.toFixed(2)}</span>
          </div>

          <div className="rounded-xl p-3 bg-emerald-50 border border-emerald-200">
            <span className="text-[10px] font-bold text-emerald-600 uppercase block">Net Save KGs</span>
            <span className="text-lg font-black text-emerald-900 font-mono">{totalSave.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button type="button" onClick={onBack} className="btn-secondary">
          ← Back to Checklist
        </button>

        <button
          type="button"
          disabled={totalSave <= 0}
          onClick={onProceed}
          className={`btn ${totalSave > 0 ? 'btn-primary' : 'opacity-50 cursor-not-allowed'}`}
        >
          Proceed to Count Entry ({totalSave.toFixed(1)} KG) →
        </button>
      </div>
    </div>
  );
}
