import re

with open('src/features/seed/payments/packing/PackingSelection.jsx', 'r') as f:
    original = f.read()

# We need to extract the imports, the component signature, and the logic.
# Actually, it's easier to rewrite the entire component to be extremely clean.

new_content = """import React, { useState } from 'react';
import { useSite } from '../../../../hooks/useSite';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useAuth } from '../../../../hooks/useAuth';
import { useToast } from '../../../../hooks/useToast';

export default function PackingSelection({ tanks, setTanks, vehicles = [], activeOrder, onProceed }) {
  const [activeModalTankKey, setActiveModalTankKey] = useState(null);
  const [selectedAction, setSelectedAction] = useState(null);
  const [otherSubAction, setOtherSubAction] = useState(null);

  const { site } = useSite();
  const siteId = site?.id;
  const { user } = useAuth();
  const toast = useToast();

  const [returnQuantity, setReturnQuantity] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [transferTarget, setTransferTarget] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('');
  const [transferPackets, setTransferPackets] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getVehicleNo = (tankId) => {
    const assignedVehicle = vehicles.find(v => (v.tank_ids || []).some(id => String(id) === String(tankId)));
    return assignedVehicle ? (assignedVehicle.vehicle_no || 'Unknown') : 'Unassigned';
  };

  const appendPackingHistory = async (record) => {
    if (!activeOrder?.id) return true;
    try {
      const { data: billData, error: billError } = await supabase
        .from(TABLES.bills)
        .select('timeline')
        .eq('id', activeOrder.id)
        .single();
      
      if (billError) throw billError;

      const currentTimeline = billData.timeline || [];
      const isDuplicate = currentTimeline.some(t => t.signature === record.signature);
      if (isDuplicate) return true;

      const newEntry = {
        id: `tl-${Date.now()}`,
        date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
        userName: user?.email || 'Field User',
        process: 'Packing',
        ...record
      };

      const { error: updateError } = await supabase
        .from(TABLES.bills)
        .update({ timeline: [...currentTimeline, newEntry] })
        .eq('id', activeOrder.id);

      if (updateError) throw updateError;
      return true;
    } catch (err) {
      console.error("Failed to append history", err);
      return false;
    }
  };

  const closeModal = () => {
    setActiveModalTankKey(null);
    setSelectedAction(null);
    setOtherSubAction(null);
    setReturnQuantity('');
    setReturnReason('');
    setTransferTarget('');
    setTransferQuantity('');
    setTransferPackets('');
  };

  const activeTank = tanks.find(t => t.id === activeModalTankKey);

  const confirmReturn = async () => {
    if (isSubmitting || !activeTank) return;
    
    if (!returnQuantity) {
      toast.error("Enter Quantity is required.");
      return;
    }
    const qty = Number(returnQuantity);
    if (qty <= 0) {
      toast.error("Quantity must be greater than 0.");
      return;
    }
    if (qty > activeTank.quantity) {
      toast.error("Return quantity cannot exceed the remaining quantity.");
      return;
    }

    setIsSubmitting(true);
    try {
      const returnedPackets = activeTank.quantity > 0 ? Math.round((qty / activeTank.quantity) * activeTank.numberOfPackets) : 0;
      const billNumber = `RB-${Date.now().toString().slice(-6)}`;

      const payload = {
        site_id: siteId,
        bill_number: billNumber,
        type: 'return',
        status: 'Completed',
        current_stage: 'pay',
        created_by: user?.id,
        packing_data: {
            order_id: activeOrder?.id,
            order_number: activeOrder?.bill_number,
            tank_id: activeTank.id,
            tank_name: activeTank.name,
            vehicle_no: getVehicleNo(activeTank.id),
            quantity: qty,
            packets: returnedPackets,
            reason: returnReason
        }
      };

      const { data: billData, error: billError } = await supabase
        .from(TABLES.bills)
        .insert(payload)
        .select();

      if (billError) throw billError;

      const newBill = (Array.isArray(billData) ? billData[0] : billData) || { id: billNumber, bill_number: billNumber };

      const paymentPayload = {
        site_id: siteId,
        type: 'return',
        method: 'return',
        amount: 0,
        status: 'returned',
        related_tank_id: activeTank.id,
        bill_id: newBill.id,
        created_by: user?.id,
      };

      const { error: paymentError } = await supabase
        .from(TABLES.payments)
        .insert(paymentPayload);

      if (paymentError) throw paymentError;

      const remainingQty = activeTank.quantity - qty;
      const finalRemainingPackets = activeTank.numberOfPackets - returnedPackets;
      const newStatus = (finalRemainingPackets <= 0 && remainingQty <= 0) ? 'Returned' : activeTank.status;

      const historySaved = await appendPackingHistory({
        signature: `return-${activeTank.id}-${qty}-${Date.now()}`,
        action: 'Return',
        vehicle: getVehicleNo(activeTank.id),
        sourceTank: activeTank.name,
        targetTank: '—',
        quantity: qty,
        packets: returnedPackets,
        remainingQty: remainingQty,
        remainingPackets: finalRemainingPackets,
        reason: returnReason || '—',
        billNumber: newBill.bill_number || newBill.id,
        status: 'Returned'
      });

      if (!historySaved) throw new Error("Failed to save history");

      setTanks(prev => prev.map(t => t.id === activeTank.id ? { 
        ...t, 
        status: newStatus, 
        selected: true,
        quantity: remainingQty,
        numberOfPackets: finalRemainingPackets,
        returnedPackets: (t.returnedPackets || 0) + returnedPackets,
        returnReason 
      } : t));
      
      toast.success(`Generated Return Bill ${newBill.bill_number}`);
      closeModal();
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate return bill.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmTransfer = async () => {
    if (isSubmitting || !activeTank) return;

    if (!transferTarget.trim()) {
      toast.error("Target Tank Name is required.");
      return;
    }
    const transferQty = Number(transferQuantity);
    if (!transferQuantity || transferQty <= 0) {
      toast.error("Enter Quantity is required and must be greater than 0.");
      return;
    }
    if (transferQty > activeTank.quantity) {
      toast.error("Transfer quantity cannot exceed the available quantity.");
      return;
    }
    const packets = Number(transferPackets);
    if (!transferPackets || packets <= 0) {
      toast.error("Number of Packets must be greater than 0.");
      return;
    }
    if (packets > activeTank.numberOfPackets) {
      toast.error("Requested packets cannot exceed the remaining packets.");
      return;
    }

    setIsSubmitting(true);
    try {
      const remainingPackets = activeTank.numberOfPackets - packets;
      const remainingQty = activeTank.quantity - transferQty;
      const newStatus = (remainingPackets <= 0 && remainingQty <= 0) ? 'Transferred' : activeTank.status;

      const historySaved = await appendPackingHistory({
        signature: `transfer-${activeTank.id}-${transferTarget}-${transferQty}-${Date.now()}`,
        action: 'Transfer',
        vehicle: getVehicleNo(activeTank.id),
        sourceTank: activeTank.name,
        targetTank: transferTarget.toUpperCase().trim(),
        quantity: transferQty,
        packets: packets,
        remainingQty: remainingQty,
        remainingPackets: remainingPackets,
        reason: '—',
        billNumber: '—',
        status: 'Transferred'
      });

      if (!historySaved) throw new Error("Failed to save history");

      setTanks(prev => {
        let next = [...prev];
        const srcIdx = next.findIndex(t => t.id === activeTank.id);
        
        if (srcIdx !== -1) {
          next[srcIdx] = {
            ...next[srcIdx],
            quantity: remainingQty,
            numberOfPackets: remainingPackets,
            status: newStatus,
            transferredTarget: transferTarget.toUpperCase(),
            transferredPackets: (next[srcIdx].transferredPackets || 0) + packets,
            selected: true
          };
        }
        
        const tgtIdx = next.findIndex(t => t.name.toLowerCase() === transferTarget.trim().toLowerCase());
        if (tgtIdx !== -1) {
          next[tgtIdx] = {
            ...next[tgtIdx],
            quantity: Number(next[tgtIdx].quantity) + transferQty,
            numberOfPackets: Number(next[tgtIdx].numberOfPackets) + packets,
            isTransferTarget: true
          };
        } else {
          next.push({
            id: 'tank-' + Date.now(),
            name: transferTarget.toUpperCase().trim(),
            numberOfPackets: packets,
            quantity: transferQty, 
            status: 'Transferred',
            selected: true,
            isTransferTarget: true,
            sourceTankId: activeTank.id
          });
        }
        return next;
      });
      toast.success(`Transferred ${transferQty} pcs to Tank ${transferTarget.toUpperCase()}`);
      closeModal();
    } catch (err) {
      console.error(err);
      toast.error("Failed to complete transfer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateTankStatus = async (status) => {
    if (isSubmitting || !activeTank) return;
    setIsSubmitting(true);
    try {
      const historySaved = await appendPackingHistory({
        signature: `status-${activeTank.id}-${status}-${Date.now()}`,
        action: status,
        vehicle: getVehicleNo(activeTank.id),
        sourceTank: activeTank.name,
        targetTank: '—',
        quantity: activeTank.quantity,
        packets: activeTank.numberOfPackets,
        remainingQty: activeTank.quantity,
        remainingPackets: activeTank.numberOfPackets,
        reason: '—',
        billNumber: '—',
        status: status
      });

      if (!historySaved) throw new Error("Failed to save history");

      setTanks(prev => prev.map(t => t.id === activeTank.id ? { ...t, status, selected: true } : t));
      toast.info(`Updated Tank ${activeTank.name} status to ${status}`);
      closeModal();
    } catch (err) {
      console.error(err);
      toast.error(`Failed to mark as ${status}.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProceed = () => {
    const selectedTanks = tanks.filter(t => t.selected);
    if (selectedTanks.length === 0) {
      toast.error("Please select a status for at least one tank to proceed.");
      return;
    }
    onProceed();
  };

  const validTanks = tanks.filter(t => t.quantity > 0 || t.status === 'Transferred' || t.status === 'Returned');

  const renderTankGrid = (tankList) => (
    <div className="grid grid-cols-2 gap-4">
      {tankList.map((t) => {
        let bgColor = '#f8fafc';
        let borderColor = 'var(--color-border)';
        let textColor = '#0f172a';

        if (t.status === 'Stocking Completed') {
          bgColor = '#dcfce7';
          borderColor = '#22c55e';
          textColor = '#14532d';
        } else if (t.status === 'Pending') {
          bgColor = '#fef9c3';
          borderColor = '#eab308';
          textColor = '#713f12';
        } else if (t.status === 'Returned') {
          bgColor = '#ffedd5';
          borderColor = '#f97316';
          textColor = '#7c2d12';
        } else if (t.status === 'Transferred') {
          bgColor = '#eff6ff';
          borderColor = '#3b82f6';
          textColor = '#1e3a8a';
        }

        const isFullyDone = t.quantity <= 0 && t.numberOfPackets <= 0 && (t.status === 'Transferred' || t.status === 'Returned');

        return (
          <div
            key={t.id}
            onClick={() => {
              if (t.status !== 'Transferred' && !t.isTransferTarget) {
                setActiveModalTankKey(t.id);
                setTransferQuantity(String(t.quantity));
                setTransferPackets(String(t.numberOfPackets));
              }
            }}
            className={`p-4 rounded-[12px] border space-y-1 text-center ${t.status !== 'Transferred' && !t.isTransferTarget ? 'cursor-pointer hover:shadow-md transition' : ''}`}
            style={{ background: bgColor, borderColor, borderWidth: 2 }}
          >
            <p className="text-[11px] font-extrabold uppercase text-slate-500">
              {t.isTransferTarget ? 'Target Tank' : 'Selected Tank'}
            </p>
            <p className="font-extrabold text-base" style={{ color: textColor }}>
              {t.name}
            </p>
            {isFullyDone && t.status === 'Returned' ? (
              <p className="text-[11px] font-black text-amber-700">Returned</p>
            ) : t.status === 'Transferred' ? (
              <div className="text-[11px] font-bold mt-1" style={{ color: '#1d4ed8' }}>
                🔵 Transferred
              </div>
            ) : (
              <div className="space-y-0.5">
                <p className="text-xs font-semibold" style={{ color: textColor }}>
                  {Number(t.quantity).toLocaleString('en-IN')} pcs
                </p>
                <p className="text-xs font-semibold" style={{ color: textColor }}>
                  {t.numberOfPackets} packets
                </p>
              </div>
            )}
            {t.status && !isFullyDone && !t.isTransferTarget && (
              <span className="inline-block mt-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full capitalize" style={{ background: `${borderColor}30`, color: textColor }}>
                {t.status === 'Stocking Completed' ? '✓ Completed' : t.status}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );

  const assignedTankIds = new Set();
  vehicles.forEach(v => {
    (v.tank_ids || []).forEach(tid => assignedTankIds.add(String(tid)));
  });
  const unassignedTanks = validTanks.filter(t => !assignedTankIds.has(String(t.id)) && !t.isTransferTarget);
  const targetTanks = validTanks.filter(t => t.isTransferTarget);

  return (
    <div className="card p-6 space-y-6 max-w-4xl mx-auto shadow-md border relative" style={{ borderColor: 'var(--color-primary)' }}>
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div>
            <h3 className="text-2xl font-black text-primary uppercase tracking-wide flex items-center gap-2">
              <span>📋</span> Step 2: Packing Status
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Click any tank box to set status (Stocking Completed, Pending, Return, or Transfer).
            </p>
          </div>
        </div>
      </div>

      {vehicles.length === 0 && (
        <div className="p-4 bg-amber-50 text-amber-800 text-sm font-bold border border-amber-200 rounded">
          No vehicles found. Showing all tanks below.
        </div>
      )}

      <div className="p-4 rounded-[16px] border space-y-4 bg-slate-50" style={{ borderColor: 'var(--color-border)' }}>
        {vehicles.map((v, vIndex) => {
          const vTanks = validTanks.filter(t => (v.tank_ids || []).some(id => String(id) === String(t.id)) && !t.isTransferTarget);
          if (vTanks.length === 0) return null;
          return (
            <div key={v.id || vIndex} className="space-y-4 mb-6">
              <div className="flex justify-center mt-2 mb-4">
                <div
                  className="px-8 py-2 rounded-full font-black text-sm text-white shadow-sm uppercase tracking-widest flex items-center gap-2"
                  style={{ background: 'var(--color-primary)' }}
                >
                  <span>🚛</span>
                  <span>VEHICLE {vIndex + 1} - {v.driver_name || 'No Driver'}</span>
                </div>
              </div>
              {renderTankGrid(vTanks)}
            </div>
          );
        })}

        {targetTanks.length > 0 && (
          <div className="space-y-4 mb-6">
            <div className="flex justify-center mt-2 mb-4">
              <div
                className="px-8 py-2 rounded-full font-black text-sm text-white shadow-sm uppercase tracking-widest flex items-center gap-2"
                style={{ background: '#0284c7' }}
              >
                <span>🔄</span>
                <span>Transferred Target Tanks</span>
              </div>
            </div>
            {renderTankGrid(targetTanks)}
          </div>
        )}

        {unassignedTanks.length > 0 && (
          <div className="space-y-4 mb-6">
            <div className="flex justify-center mt-2 mb-4">
              <div
                className="px-8 py-2 rounded-full font-black text-sm text-white shadow-sm uppercase tracking-widest flex items-center gap-2"
                style={{ background: '#dc2626' }}
              >
                <span>⚠️</span>
                <span>Unassigned Tanks</span>
              </div>
            </div>
            {renderTankGrid(unassignedTanks)}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={handleProceed}
          className="btn-success w-full text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2"
        >
          <span>Complete Packing ✓</span>
        </button>
      </div>

      {/* Modal matching Seed Van Plan exact UI */}
      {activeModalTankKey && activeTank && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="card p-6 max-w-md w-full space-y-4 bg-white rounded-[16px] shadow-2xl">
            <div className="flex items-center justify-between border-b pb-2 mb-2">
              {(selectedAction || otherSubAction) ? (
                <button
                  type="button"
                  onClick={() => {
                    if (otherSubAction) setOtherSubAction(null);
                    else if (selectedAction) setSelectedAction(null);
                  }}
                  className="text-xs font-bold text-text-muted hover:text-black flex items-center gap-1"
                >
                  ← Back
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={closeModal}
                className="text-sm font-bold text-text-muted hover:text-black"
              >
                ✕
              </button>
            </div>
            <h4 className="font-extrabold text-lg text-primary mt-2">
              Status Selection for Tank {activeTank.name}
            </h4>

            {!selectedAction && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => updateTankStatus('Stocking Completed')}
                  className="w-full btn p-3 text-left font-bold rounded-[10px] flex items-center justify-between transition hover:opacity-90"
                  style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #22c55e' }}
                  disabled={isSubmitting}
                >
                  <span>1. Stocking Completed</span>
                  <span>✓</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateTankStatus('Pending')}
                  className="w-full btn p-3 text-left font-bold rounded-[10px] flex items-center justify-between transition hover:opacity-90"
                  style={{ background: '#fef9c3', color: '#a16207', border: '1px solid #eab308' }}
                  disabled={isSubmitting}
                >
                  <span>2. Pending</span>
                  <span>⏳</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAction('others')}
                  className="w-full btn p-3 text-left font-bold rounded-[10px] flex items-center justify-between transition hover:opacity-90"
                  style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #94a3b8' }}
                >
                  <span>3. Others (Return / Transfer)</span>
                  <span>➔</span>
                </button>
              </div>
            )}

            {selectedAction === 'others' && !otherSubAction && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-text-secondary">Select Option:</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setOtherSubAction('return')}
                    className="btn p-3 font-bold rounded-[10px] text-center transition hover:opacity-90"
                    style={{ background: '#ffedd5', color: '#c2410c', border: '1px solid #f97316' }}
                  >
                    ↩️ Return
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtherSubAction('transfer')}
                    className="btn p-3 font-bold rounded-[10px] text-center transition hover:opacity-90"
                    style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #0284c7' }}
                  >
                    🔀 Transfer
                  </button>
                </div>
              </div>
            )}

            {otherSubAction === 'return' && (
              <div className="space-y-3">
                <h5 className="font-extrabold text-sm text-amber-800">↩️ Generate Return Bill</h5>
                <div>
                  <label className="field-label text-xs">Returned Seed Count *</label>
                  <input
                    type="number"
                    className="field text-sm"
                    placeholder={`Max: ${activeTank.quantity}`}
                    value={returnQuantity}
                    onChange={(e) => setReturnQuantity(e.target.value)}
                  />
                  <p className="text-[10px] text-text-muted mt-1">Available in Tank: {activeTank.quantity} pcs</p>
                </div>
                <div>
                  <label className="field-label text-xs">Reason for Return (Optional)</label>
                  <input
                    className="field text-sm"
                    placeholder="e.g. Quality issue"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={confirmReturn}
                    disabled={isSubmitting}
                    className="btn-warning flex-1 font-bold text-xs py-2.5 bg-amber-500 text-white rounded transition hover:opacity-90"
                  >
                    {isSubmitting ? 'Processing...' : 'Confirm & Generate Return Bill'}
                  </button>
                </div>
              </div>
            )}

            {otherSubAction === 'transfer' && (
              <div className="space-y-3">
                <h5 className="font-extrabold text-sm text-sky-800">🔀 Transfer Seed Quantity</h5>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="field-label text-[11px]">Quantity to Transfer *</label>
                    <input
                      type="number"
                      className="field text-sm"
                      placeholder={`Max: ${activeTank.quantity}`}
                      value={transferQuantity}
                      onChange={(e) => setTransferQuantity(e.target.value)}
                    />
                    <p className="text-[10px] text-text-muted mt-1">Available: {activeTank.quantity} pcs</p>
                  </div>
                  <div>
                    <label className="field-label text-[11px]">Number of Packets *</label>
                    <input
                      type="number"
                      className="field text-sm"
                      placeholder={`Max: ${activeTank.numberOfPackets}`}
                      value={transferPackets}
                      onChange={(e) => setTransferPackets(e.target.value)}
                    />
                    <p className="text-[10px] text-text-muted mt-1">Available: {activeTank.numberOfPackets} pkt</p>
                  </div>
                </div>

                <div>
                  <label className="field-label text-xs">New Target Tank Name *</label>
                  <input
                    className="field text-sm"
                    placeholder="e.g. Tank A3"
                    value={transferTarget}
                    onChange={(e) => setTransferTarget(e.target.value)}
                  />
                </div>

                <div className="p-2.5 rounded bg-sky-50 text-[11px] text-sky-800 border border-sky-200 mt-2">
                  <p><strong>Transferring From:</strong> Tank {activeTank.name}</p>
                  <p><strong>Quantity:</strong> {transferQuantity || 0} pcs ({transferPackets || 0} pkt)</p>
                  <p><strong>Target:</strong> {transferTarget || 'New Tank'}</p>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={confirmTransfer}
                    disabled={isSubmitting || !transferTarget.trim()}
                    className="btn-success flex-1 font-bold text-xs py-2.5 transition hover:opacity-90"
                  >
                    {isSubmitting ? 'Processing...' : 'Confirm Transfer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
"""

with open('src/features/seed/payments/packing/PackingSelection.jsx', 'w') as f:
    f.write(new_content)
