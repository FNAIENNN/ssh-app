import { useCallback } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { useAuth } from '../../../hooks/useAuth';
import ESP32ScaleConnector from './ESP32ScaleConnector';
import { useESP32Scale } from '../hooks/useESP32Scale';

/** Prevent scroll/wheel from changing number inputs */
const preventWheel = (e) => e.target.blur();
import DigitalSignaturePad from './DigitalSignaturePad';

/**
 * WeightEntryTable — Step 4: Weighment entry with ESP32 scale integration.
 * Includes Harvest Supervisor Digital Signature (Middle or Full Harvest).
 */
export default function WeightEntryTable({
  weightRows,
  setWeightRows,
  siteId,
  tankId,
  sessionId,
  netWeightPerNet,
  onNetWeightChange,
  harvestType = 'middle',
  supervisorSignature,
  onSupervisorSignatureChange,
  onProceed,
  onBack,
}) {
  const { user } = useAuth();

  const handleAutoWeightCaptured = useCallback(
    (capturedKg, source = 'auto', mode = 'simulator') => {
      setWeightRows((prev) => {
        const last = prev[prev.length - 1];
        if (last && Number(last.kgs) === 0) {
          return prev.map((r, idx) =>
            idx === prev.length - 1 ? { ...r, kgs: String(capturedKg) } : r
          );
        }
        return [...prev, { id: Date.now(), kgs: String(capturedKg), nets: 2 }];
      });

      if (siteId && sessionId) {
        try {
          void supabase
            .from(TABLES.harvestWeighments)
            .insert({
              session_id: sessionId,
              site_id: siteId,
              tank_id: tankId || null,
              weight_kg: Number(capturedKg),
              loose_kg: 0,
              captured_by: user?.id || null,
              source,
              mode,
            })
            .then(({ error: insErr }) => {
              if (insErr) {
                console.warn('Weighment log insert failed:', insErr.message);
              }
            })
            .catch((e) => {
              console.warn('Weighment log exception:', e?.message || e);
            });
        } catch (e) {
          console.warn('Weighment log exception:', e?.message || e);
        }
      }
    },
    [setWeightRows, siteId, tankId, sessionId, user]
  );

  const scale = useESP32Scale(handleAutoWeightCaptured);

  const addRow = () => {
    setWeightRows((prev) => [...prev, { id: Date.now(), kgs: '', nets: 2 }]);
  };

  const updateRow = (id, field, val) => {
    setWeightRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const updateNets = (id, delta) => {
    setWeightRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const newNets = Math.max(0, (Number(r.nets) || 2) + delta);
        return { ...r, nets: newNets };
      })
    );
  };

  const deleteRow = (id) => {
    if (weightRows.length <= 1) return;
    setWeightRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Calculations
  const totalWeight = weightRows.reduce((sum, r) => sum + (Number(r.kgs) || 0), 0);
  const totalNets = weightRows.reduce((sum, r) => sum + (Number(r.nets) || 0), 0);
  const netWtPerNet = Number(netWeightPerNet) || 0;
  const totalNetWeight = totalNets * netWtPerNet;
  const grandTotal = Math.max(0, totalWeight - totalNetWeight);

  return (
    <div className="space-y-6">
      {/* ESP32 Scale Connector Header */}
      <ESP32ScaleConnector scale={scale} />

      {/* Weighment Entry Card */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Weighment Table</h3>
            <p className="text-xs text-slate-500">
              Weights auto-captured from ESP32 or entered manually. Default nets = 2 per weighment.
            </p>
          </div>
          {/* Net Weight Input — top-right */}
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wide block">Net Wt/Net (kg)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 0.5"
                  value={netWeightPerNet}
                  onChange={(e) => onNetWeightChange?.(e.target.value)}
                  onWheel={preventWheel}
                  className="w-28 bg-amber-50 border border-amber-400 rounded-xl px-3 py-1.5 font-mono text-sm font-bold text-amber-900 focus:bg-white focus:border-amber-600 focus:outline-none"
                />
              </div>
              {netWtPerNet > 0 && (
                <span className="text-[10px] text-amber-600 font-bold block">{netWtPerNet} kg/net</span>
              )}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="btn-secondary text-xs font-bold flex items-center gap-1"
            >
              ➕ Add Row
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-extrabold border-b border-slate-200">
                <th className="p-3 w-14 text-center">S.No</th>
                <th className="p-3">Weight (KGs)</th>
                <th className="p-3 text-center" style={{ minWidth: '130px' }}>Nets</th>
                <th className="p-3 w-16 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {weightRows.map((row, idx) => {
                const rowKg = Number(row.kgs) || 0;
                const rowNets = Number(row.nets) ?? 2;

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
                        onWheel={preventWheel}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
                      />
                      {rowKg > 0 && (
                        <span className="text-[10px] text-blue-600 font-bold block mt-0.5">
                          = {rowKg.toFixed(1)} kg
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateNets(row.id, -1)}
                          disabled={rowNets <= 0}
                          className="w-7 h-7 rounded-lg bg-red-100 text-red-700 font-black text-base flex items-center justify-center hover:bg-red-200 disabled:opacity-30 transition"
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-black font-mono text-slate-900 text-sm">
                          {rowNets}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateNets(row.id, 1)}
                          className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 font-black text-base flex items-center justify-center hover:bg-emerald-200 transition"
                        >
                          +
                        </button>
                      </div>
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
                <td className="p-3 font-mono text-sm text-blue-300">{totalWeight.toFixed(1)} KG</td>
                <td className="p-3 text-center font-mono text-sm text-amber-300">{totalNets} nets</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 3 Summary Cards */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="rounded-xl p-3 bg-blue-50 border border-blue-200">
            <span className="text-[10px] font-bold text-blue-600 uppercase block">Total Weight</span>
            <span className="text-lg font-black text-blue-900 font-mono">{totalWeight.toFixed(1)}</span>
            <span className="text-[10px] text-blue-600 block">KG</span>
          </div>

          <div className="rounded-xl p-3 bg-amber-50 border border-amber-200">
            <span className="text-[10px] font-bold text-amber-600 uppercase block">Total Net Weight</span>
            <span className="text-lg font-black text-amber-900 font-mono">{totalNetWeight.toFixed(2)}</span>
            <span className="text-[10px] text-amber-600 block">
              {totalNets} nets × {netWtPerNet || '?'} kg
            </span>
          </div>

          <div className="rounded-xl p-3 bg-emerald-50 border border-emerald-200">
            <span className="text-[10px] font-bold text-emerald-600 uppercase block">Grand Total</span>
            <span className="text-lg font-black text-emerald-900 font-mono">{grandTotal.toFixed(1)}</span>
            <span className="text-[10px] text-emerald-600 block">KG (after net deduction)</span>
          </div>
        </div>
        {/* Harvest Supervisor Digital Signature Section */}
        <div className="pt-3 border-t border-slate-100">
          <DigitalSignaturePad
            label={harvestType === 'full' ? 'Full Harvest Supervisor Signature' : 'Middle Harvest Supervisor Signature'}
            value={supervisorSignature}
            onChange={onSupervisorSignatureChange}
            height={120}
          />
        </div>
      </div>

      {/* Action buttons — compact & proportional */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-200 gap-3">
        <button type="button" onClick={onBack} className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-extrabold transition">
          ← Back to Checklist
        </button>

        <button
          type="button"
          disabled={grandTotal <= 0}
          onClick={onProceed}
          className={`px-4 py-2 rounded-xl text-white text-xs font-extrabold transition shadow-sm ${
            grandTotal > 0 ? 'bg-blue-600 hover:bg-blue-500' : 'bg-slate-300 cursor-not-allowed'
          }`}
        >
          Proceed to Count Entry ({grandTotal.toFixed(1)} KG) →
        </button>
      </div>
    </div>
  );
}
