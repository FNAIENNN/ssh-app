import React, { useMemo } from 'react';
import { useMixedAllocationState } from './useMixedAllocationState';

export default function MixedAllocation({ activeOrder, vehicles, siteId, onContinuePacking, onContinueSeedVan, onProceedToOutsideWorkers, onBack }) {
  const {
    isPackingDone,
    isVanPlanDone,
    isMixedComplete,
    summaryData,
    grandTotals
  } = useMixedAllocationState(activeOrder, vehicles);

  const renderSummaryTable = (isFinal = false) => (
    <div className="space-y-4 mt-4">
      <h4 className={`font-extrabold text-lg border-b pb-2 ${isFinal ? 'text-success' : 'text-primary'}`}>
        {isFinal ? '✅ Final Mixed Summary Review' : '📊 Live Mixed Summary'}
      </h4>
      
      {summaryData.map(v => (
        <div key={v.vehicleId} className="border rounded-[8px] overflow-hidden">
          <div className="bg-slate-100 p-2 border-b font-bold text-sm text-slate-800">
            Vehicle: {v.vehicleNo}
          </div>
          <div className="overflow-x-auto bg-white">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b">
                  <th className="p-2 font-bold whitespace-nowrap">Tank Name</th>
                  <th className="p-2 font-bold text-right">Original Qty</th>
                  <th className="p-2 font-bold text-right text-blue-700">Packing Used</th>
                  <th className="p-2 font-bold text-right text-green-700">Seed Van Used</th>
                  <th className="p-2 font-bold text-right text-amber-700">Remaining</th>
                  <th className="p-2 font-bold text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {v.tanks.map(t => (
                  <tr key={t.id} className="border-b">
                    <td className="p-2 font-bold text-slate-800 whitespace-nowrap">{t.name}</td>
                    <td className="p-2 text-right">{t.original.toLocaleString('en-IN')}</td>
                    <td className="p-2 text-right text-blue-700 font-semibold">{t.packing.toLocaleString('en-IN')}</td>
                    <td className="p-2 text-right text-green-700 font-semibold">{t.van.toLocaleString('en-IN')}</td>
                    <td className="p-2 text-right text-amber-700 font-bold">{t.remaining.toLocaleString('en-IN')}</td>
                    <td className="p-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold border-t">
                  <td className="p-2 text-right text-slate-700">Vehicle Total:</td>
                  <td className="p-2 text-right text-slate-800">{v.totals.original.toLocaleString('en-IN')}</td>
                  <td className="p-2 text-right text-blue-800">{v.totals.packing.toLocaleString('en-IN')}</td>
                  <td className="p-2 text-right text-green-800">{v.totals.van.toLocaleString('en-IN')}</td>
                  <td className="p-2 text-right text-amber-800">{v.totals.remaining.toLocaleString('en-IN')}</td>
                  <td className="p-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}
      
      {/* Grand Totals */}
      <div className="card p-4 bg-slate-800 text-white rounded-[12px] shadow-sm">
        <h5 className="font-extrabold text-sm mb-3 border-b border-slate-600 pb-2">Overall Grand Totals</h5>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Total Original</div>
            <div className="text-lg font-extrabold">{grandTotals.original.toLocaleString('en-IN')}</div>
          </div>
          <div>
            <div className="text-[10px] text-blue-300 font-bold uppercase tracking-wider mb-1">Total Packing</div>
            <div className="text-lg font-extrabold text-blue-100">{grandTotals.packing.toLocaleString('en-IN')}</div>
          </div>
          <div>
            <div className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider mb-1">Total Seed Van</div>
            <div className="text-lg font-extrabold text-emerald-100">{grandTotals.van.toLocaleString('en-IN')}</div>
          </div>
          <div>
            <div className="text-[10px] text-amber-300 font-bold uppercase tracking-wider mb-1">Total Remaining</div>
            <div className="text-lg font-extrabold text-amber-400">{grandTotals.remaining.toLocaleString('en-IN')}</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-sm font-bold text-text-muted hover:text-black flex items-center gap-1">← Back</button>
        <span className="text-xs font-bold text-sky-700 bg-sky-100 px-3 py-1 rounded-full uppercase tracking-wider border border-sky-200">
          🔀 Mixed Workflow
        </span>
      </div>

      <div className="card p-5 border space-y-4 shadow-sm" style={{ borderColor: 'var(--color-primary)' }}>
        <h3 className="font-extrabold text-base text-primary border-b pb-2">Mixed Allocation Workflows</h3>
        <p className="text-xs text-text-secondary">
          Complete both workflows below. The quantities are dynamically shared between them.
        </p>

        <div className="pt-2">
          {isMixedComplete ? (
            <div className="mb-4">
              {renderSummaryTable(true)}
              {grandTotals.remaining > 0 ? (
                <div className="mt-6 p-5 border-2 border-amber-300 bg-amber-50 rounded-[12px]">
                  <h4 className="font-extrabold text-amber-900 mb-2">Remaining stock is still available. Do you want to process it further?</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                    <button
                      type="button"
                      onClick={onContinuePacking}
                      className="btn-primary py-3 rounded-[8px] text-sm font-bold shadow flex items-center justify-center gap-2"
                    >
                      📦 Continue Packing
                    </button>
                    <button
                      type="button"
                      onClick={onContinueSeedVan}
                      className="btn-success py-3 rounded-[8px] text-sm font-bold shadow flex items-center justify-center gap-2"
                    >
                      🚐 Continue Seed Van
                    </button>
                    <button
                      type="button"
                      onClick={onProceedToOutsideWorkers}
                      className="bg-slate-800 text-white hover:bg-slate-900 transition py-3 rounded-[8px] text-sm font-bold shadow flex items-center justify-center gap-2"
                    >
                      No, Proceed to Next Step ➔
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onProceedToOutsideWorkers}
                  className="btn-success w-full mt-6 py-4 rounded-[12px] text-base font-extrabold shadow flex items-center justify-center gap-2"
                >
                  <span>👷 Confirm Summary &amp; Proceed to Outside Workers</span>
                  <span>➔</span>
                </button>
              )}
            </div>
          ) : (
            <div className="mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Packing Button */}
                <button
                  type="button"
                  onClick={onContinuePacking}
                  className={`py-5 rounded-[12px] text-base font-extrabold shadow flex flex-col items-center justify-center gap-2 border-2 transition ${isPackingDone ? 'bg-blue-50 border-blue-400 text-blue-900' : 'btn-primary border-transparent'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📦</span>
                    <span>Start / Continue Packing</span>
                  </div>
                  {isPackingDone && (
                    <span className="text-[11px] uppercase tracking-wider opacity-80 font-semibold bg-white/20 px-3 py-1 rounded-full">
                      Saved Data Exists
                    </span>
                  )}
                </button>

                {/* Seed Van Plan Button */}
                <button
                  type="button"
                  onClick={onContinueSeedVan}
                  className={`py-5 rounded-[12px] text-base font-extrabold shadow flex flex-col items-center justify-center gap-2 border-2 transition ${isVanPlanDone ? 'bg-green-50 border-green-400 text-green-900' : 'btn-success border-transparent'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🚐</span>
                    <span>Start / Continue Seed Van Plan</span>
                  </div>
                  {isVanPlanDone && (
                    <span className="text-[11px] uppercase tracking-wider opacity-80 font-semibold bg-white/20 px-3 py-1 rounded-full">
                      Saved Data Exists
                    </span>
                  )}
                </button>
                
              </div>
              
              {/* Show Live Summary only if they've saved something in either flow */}
              {(isPackingDone || isVanPlanDone) && renderSummaryTable(false)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}