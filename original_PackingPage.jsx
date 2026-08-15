import React, { useState } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useToast } from '../../../../hooks/useToast';
import PackingDetails from './PackingDetails';
import PackingSelection from './PackingSelection';
import PackingSummary from './PackingSummary';

export default function PackingPage({ initialTanks, tankQtys, activeOrder, vehicles = [], onGoToHistory, onBack }) {
  const toast = useToast();
  // Master state preserving all details throughout the steps
  const [tanks, setTanks] = useState(() => 
    initialTanks.map(t => ({
      id: t.id,
      name: t.name,
      quantity: tankQtys?.[t.id] || 0,
      numberOfPackets: '',
      selected: false
    }))
  );

  const [step, setStep] = useState(1); // 1 = Details, 2 = Selection, 3 = Summary
  const [isSaving, setIsSaving] = useState(false);

  const handleComplete = async () => {
    if (!activeOrder?.id) {
      onGoToHistory();
      return;
    }

    const selectedTanks = tanks.filter(t => t.selected);
    const totalQuantity = selectedTanks.reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);
    const totalPackets = selectedTanks.reduce((sum, t) => sum + (Number(t.numberOfPackets) || 0), 0);

    const packingData = {
      tanks: selectedTanks,
      totalQuantity,
      totalPackets,
      completedAt: new Date().toISOString()
    };

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from(TABLES.bills)
        .update({ packing_data: packingData })
        .eq('id', activeOrder.id);
      
      if (error) throw error;
      toast.success('Packing details saved successfully!');
      onGoToHistory();
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
          onNext={() => setStep(2)} 
        />
      )}

      {step === 2 && (
        <PackingSelection 
          tanks={tanks} 
          setTanks={setTanks} 
          vehicles={vehicles}
          onProceed={() => setStep(3)} 
        />
      )}

      {step === 3 && (
        <div className="space-y-4">
          <PackingSummary 
            tanks={tanks} 
            vehicles={vehicles}
            onGoToHistory={handleComplete} 