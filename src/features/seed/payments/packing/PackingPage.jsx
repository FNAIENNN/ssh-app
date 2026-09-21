import React, { useState, useEffect } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useToast } from '../../../../hooks/useToast';
import PackingDetails from './PackingDetails';
import PackingSelection from './PackingSelection';
import PackingSummary from './PackingSummary';
import { aggregateTankStates } from '../seedStocking/stockingUtils';

export default function PackingPage({ initialTanks, tankQtys, activeOrder, vehicles = [], onGoToHistory, onBack, detectedActiveTanks, onProceedToReview }) {
  const toast = useToast();
  // Master state preserving all details throughout the steps
  const [tanks, setTanks] = useState(() => {
    const isMixedMode = activeOrder?.current_stage === 'mixed-allocation' || activeOrder?.type === 'mixed' || Boolean(activeOrder?.packing_data && activeOrder?.stocking_status_data);

    // Build combined list of original tanks + Seed Van transfer targets
    const tanksMap = new Map();

    (initialTanks || []).forEach(t => {
      if (!t || !t.name) return;
      const normKey = String(t.name).trim().toUpperCase();
      tanksMap.set(normKey, {
        ...t,
        id: t.id,
        name: t.name,
        qty: Number(t.qty || t.quantity) || 0,
        isTransferTarget: false
      });
    });

    // Discover Seed Van transfer targets from stocking_status_data
    if (activeOrder?.stocking_status_data) {
      Object.entries(activeOrder.stocking_status_data).forEach(([vId, vData]) => {
        if (vId === 'supervisorName' || vId === 'supervisorPhone' || vId === 'supervisorSignature' || vId === 'seedVanCompleted') return;
        if (vData?.tankStates) {
          const aggregated = aggregateTankStates(vData.tankStates, vData.transfers);
          aggregated.forEach(agg => {
            if (!agg || !agg.tankName) return;
            const normKey = String(agg.tankName).trim().toUpperCase();
            if (!tanksMap.has(normKey) && agg.totalCount > 0) {
              tanksMap.set(normKey, {
                id: agg.targetTankId || agg.tankName,
                name: agg.tankName,
                qty: agg.totalCount,
                isTransferTarget: true
              });
            }
          });
        }
      });
    }

    // Also include any previously saved packing tanks that were transfer targets
    if (activeOrder?.packing_data?.tanks) {
      activeOrder.packing_data.tanks.forEach(pt => {
        if (!pt || !pt.name) return;
        const normKey = String(pt.name).trim().toUpperCase();
        if (!tanksMap.has(normKey) && pt.isTransferTarget) {
          tanksMap.set(normKey, {
            ...pt,
            id: pt.id || pt.name,
            name: pt.name,
            qty: Number(pt.quantity) || 0,
            isTransferTarget: true
          });
        }
      });
    }

    const unifiedTanksList = Array.from(tanksMap.values());

    return unifiedTanksList.map(t => {
      const normKey = String(t.name).trim().toUpperCase();
      const maxQ = tankQtys?.[t.id] ?? tankQtys?.[normKey] ?? Number(t.qty || 0);
      let initialQty = maxQ;
      let initialPackets = '';

      if (isMixedMode) {
        const savedTank = activeOrder?.packing_data?.tanks?.find(st => String(st.id) === String(t.id) || String(st.name || '').trim().toUpperCase() === normKey);
        if (savedTank) {
          initialQty = savedTank.quantity;
          initialPackets = savedTank.numberOfPackets || '';
        } else {
          initialQty = '';
        }
      }

      console.log(`--- PACKING TANK INIT (${t.name}) ---`);
      console.log(`Max Editable (Available): ${maxQ} | Restored Qty: ${initialQty === '' ? 'Untouched' : initialQty}`);

      return {
        ...t,
        id: t.id,
        name: t.name,
        maxQuantity: maxQ,
        quantity: initialQty,
        numberOfPackets: initialPackets,
        selected: false
      };
    });
  });

  const [step, setStep] = useState(1); // 1 = Details, 2 = Selection, 3 = Summary
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const handleComplete = async () => {
    if (!activeOrder?.id) {
      onGoToHistory();
      return;
    }

    const selectedTanks = tanks.filter(t => t.selected);
    const existingTanks = activeOrder?.packing_data?.tanks || [];
    const otherTanks = existingTanks.filter(et => !selectedTanks.some(st => String(st.id) === String(et.id) || String(st.name || '').trim().toUpperCase() === String(et.name || '').trim().toUpperCase()));
    const mergedTanks = [...otherTanks, ...selectedTanks];

    const totalQuantity = mergedTanks.reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);
    const totalPackets = mergedTanks.reduce((sum, t) => sum + (Number(t.numberOfPackets) || 0), 0);

    const packingData = {
      tanks: mergedTanks,
      totalQuantity,
      totalPackets,
      completedAt: new Date().toISOString(),
      packingCompleted: true
    };

    setIsSaving(true);
    try {
      const { data: updatedBill, error } = await supabase
        .from(TABLES.bills)
        .update({ packing_data: packingData })
        .eq('id', activeOrder.id)
        .select('*')
        .single();

      if (error) throw error;

      console.log('--- PACKING SAVED ---');
      packingData.tanks.forEach(t => {
        console.log(`Tank: ${t.name}, Saved Packing Used: ${t.quantity}`);
      });

      toast.success('Packing details saved successfully!');
      onGoToHistory(updatedBill);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save packing details');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => step > 1 ? setStep(step - 1) : onBack()}
          className="hidden sm:flex items-center gap-1 text-sm font-bold"
          style={{ color: '#000', background: 'none', border: 'none', cursor: 'pointer' }}
          disabled={isSaving}
        >
          <span style={{ fontSize: '1.1rem' }}>←</span>
          <span>Back</span>
        </button>
        <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-sm overflow-x-auto w-full">
          <div className="flex items-center gap-2 min-w-max">
            {[
              { id: 1, label: '1. Details', icon: '📦' },
              { id: 2, label: '2. Selection', icon: '🗳️' },
              { id: 3, label: '3. Summary', icon: '📋' },
            ].map((stepObj) => {
              const isActive = step === stepObj.id;
              const isCompleted = stepObj.id < step;
              const isEnabled = stepObj.id <= step;

              return (
                <button
                  key={stepObj.id}
                  type="button"
                  disabled={!isEnabled}
                  onClick={() => isEnabled && setStep(stepObj.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : isCompleted
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 cursor-pointer'
                        : isEnabled
                          ? 'text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 cursor-pointer'
                          : 'text-slate-400 bg-slate-50/50 cursor-not-allowed opacity-60 border border-transparent'
                    }`}
                >
                  <span>{isCompleted ? '✓' : stepObj.icon}</span>
                  <span>{stepObj.label}</span>
                  {!isEnabled && <span className="text-[10px]">🔒</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {step === 1 && (
        <PackingDetails
          tanks={tanks}
          setTanks={setTanks}
          vehicles={vehicles}
          activeOrder={activeOrder}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <PackingSelection
          tanks={tanks}
          setTanks={setTanks}
          vehicles={vehicles}
          activeOrder={activeOrder}
          onProceed={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <div className="space-y-4">
          <PackingSummary
            tanks={tanks}
            vehicles={vehicles}
            activeOrder={activeOrder}
            onGoToHistory={handleComplete}
            detectedActiveTanks={detectedActiveTanks}
            onProceedToReview={onProceedToReview}
          />
        </div>
      )}
    </div>
  );
}