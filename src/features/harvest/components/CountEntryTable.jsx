import { useState, useEffect } from 'react';

/**
 * CountEntryTable — Step 4: Count sample entry & Price per Kg calculation.
 * Count = Pieces ÷ Kgs. Selects one sample as final count.
 */
export default function CountEntryTable({
  countRows,
  setCountRows,
  selectedCountIdx,
  setSelectedCountIdx,
  pricePerKg,
  setPricePerKg,
  totalHarvestKgs,
  onProceed,
  onBack,
}) {
  const addRow = () => {
    setCountRows((prev) => [...prev, { id: Date.now(), kgs: '1.0', pieces: '50' }]);
  };

  const updateRow = (id, field, val) => {
    setCountRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const deleteRow = (id) => {
    if (countRows.length <= 1) return;
    setCountRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Compute selected count value
  const selectedRow = countRows[selectedCountIdx] || countRows[0];
  const selectedKg = Number(selectedRow?.kgs) || 0;
  const selectedPcs = Number(selectedRow?.pieces) || 0;
  const finalCalculatedCount = selectedKg > 0 ? Math.round(selectedPcs / selectedKg) : 0;

  const totalAmount = Math.round(totalHarvestKgs * (Number(pricePerKg) || 0));

  return (
    <div className="space-y-6">
      {/* Count Samples Table Card */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Count Sample Table</h3>
            <p className="text-xs text-slate-500">
              Count = Pieces ÷ Kgs. Select one row as the Final Harvest Count.
            </p>
          </div>
          <button
            type="button"
            onClick={addRow}
            className="btn-secondary text-xs font-bold flex items-center gap-1"
          >
            ➕ Add Sample
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-extrabold border-b border-slate-200">
                <th className="p-3 w-12 text-center">Select</th>
                <th className="p-3 w-14 text-center">S.No</th>
                <th className="p-3">Sample Weight (KGs)</th>
                <th className="p-3">Total Pieces (No)</th>
                <th className="p-3 text-right">Calculated Count</th>
                <th className="p-3 w-16 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {countRows.map((row, idx) => {
                const kgs = Number(row.kgs) || 0;
                const pcs = Number(row.pieces) || 0;
                const calcCount = kgs > 0 ? Math.round(pcs / kgs) : 0;
                const isSelected = selectedCountIdx === idx;

                return (
                  <tr
                    key={row.id || idx}
                    className={`transition ${isSelected ? 'bg-blue-50/70 font-bold' : 'hover:bg-slate-50/60'}`}
                  >
                    <td className="p-3 text-center">
                      <input
                        type="radio"
                        name="finalCountRadio"
                        checked={isSelected}
                        onChange={() => setSelectedCountIdx(idx)}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                    </td>
                    <td className="p-3 text-center text-slate-500">{idx + 1}</td>
                    <td className="p-3">
                      <input
                        type="number"
                        step="0.1"
                        placeholder="1.0"
                        value={row.kgs}
                        onChange={(e) => updateRow(row.id, 'kgs', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-sm text-slate-900 focus:bg-white focus:border-blue-500"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        placeholder="e.g. 50"
                        value={row.pieces}
                        onChange={(e) => updateRow(row.id, 'pieces', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-sm text-slate-900 focus:bg-white focus:border-blue-500"
                      />
                    </td>
                    <td className="p-3 text-right font-extrabold font-mono text-blue-700 text-sm">
                      {calcCount > 0 ? `${calcCount} count/kg` : '—'}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => deleteRow(row.id)}
                        disabled={countRows.length <= 1}
                        className="text-slate-400 hover:text-red-500 disabled:opacity-30 text-base"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pricing & Final Summary Card */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <h3 className="text-base font-extrabold text-slate-900">Price & Revenue Calculation</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          {/* Selected Final Count Banner */}
          <div className="rounded-xl p-4 bg-gradient-to-br from-blue-900 to-slate-900 text-white shadow-md">
            <span className="text-[10px] font-bold tracking-wider text-blue-300 uppercase block">
              FINAL HARVEST COUNT
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-3xl font-black font-mono text-white">{finalCalculatedCount}</span>
              <span className="text-xs text-blue-200">shrimp / KG</span>
            </div>
            <span className="text-[10px] text-slate-300 block mt-1">
              (Sample #{selectedCountIdx + 1}: {selectedPcs} pcs in {selectedKg} kg)
            </span>
          </div>

          {/* Price per Kg Input */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Price per Kg (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-bold">₹</span>
              <input
                type="number"
                placeholder="e.g. 450"
                value={pricePerKg}
                onChange={(e) => setPricePerKg(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-3 py-2.5 text-lg font-black font-mono text-slate-900 focus:bg-white focus:border-blue-600"
              />
            </div>
            <span className="text-[10px] text-slate-500 block mt-1">
              Agreed buyer rate per kg for {finalCalculatedCount} count
            </span>
          </div>

          {/* Total Revenue Display */}
          <div className="rounded-xl p-4 bg-emerald-50 border border-emerald-200">
            <span className="text-[10px] font-bold text-emerald-700 uppercase block">
              TOTAL HARVEST REVENUE
            </span>
            <span className="text-2xl font-black font-mono text-emerald-900 block mt-1">
              ₹{totalAmount.toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] text-emerald-700 block mt-1">
              ({totalHarvestKgs.toFixed(1)} KG × ₹{Number(pricePerKg) || 0}/KG)
            </span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button type="button" onClick={onBack} className="btn-secondary">
          ← Back to Weight Entry
        </button>

        <button
          type="button"
          disabled={finalCalculatedCount <= 0 || !pricePerKg || Number(pricePerKg) <= 0}
          onClick={onProceed}
          className={`btn ${
            finalCalculatedCount > 0 && pricePerKg && Number(pricePerKg) > 0
              ? 'btn-primary'
              : 'opacity-50 cursor-not-allowed'
          }`}
        >
          Proceed to Grader Details →
        </button>
      </div>
    </div>
  );
}
