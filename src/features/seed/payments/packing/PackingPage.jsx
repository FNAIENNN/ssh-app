import React, { useState } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useToast } from '../../../../hooks/useToast';
import PackingDetails from './PackingDetails';
import PackingSelection from './PackingSelection';
import PackingSummary from './PackingSummary';

export default function PackingPage({ initialTanks, tankQtys, activeOrder, vehicles = [], onGoToHistory, onBack }) {
  const toast = useToast();
  // Master state preserving all details throughout the steps
  const [tanks, setTanks] = useState(() => {
    const isMixedMode = activeOrder?.current_stage === 'mixed-allocation';
    return initialTanks.map(t => {
      const maxQ = tankQtys?.[t.id] || 0;
      let initialQty = maxQ;
      let initialPackets = '';

      if (isMixedMode) {
        const savedTank = activeOrder?.packing_data?.tanks?.find(st => st.id === t.id);
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

  const handleComplete = async () => {
    if (!activeOrder?.id) {
      onGoToHistory();
      return;
    }

    const selectedTanks = tanks.filter(t => t.selected);
    const existingTanks = activeOrder?.packing_data?.tanks || [];
    const otherTanks = existingTanks.filter(et => !selectedTanks.some(st => st.id === et.id));
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
          className="flex items-center gap-1 text-sm font-bold"
          style={{ color: '#000', background: 'none', border: 'none', cursor: 'pointer' }}
          disabled={isSaving}
        >
          <span style={{ fontSize: '1.1rem' }}>←</span>
          <span>Back</span>
        </button>
        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
          Packing Flow (Step {step}/3)
        </span>
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
            onGoToHistory={handleComplete} 
          />
        </div>
      )}
    </div>
  );
}