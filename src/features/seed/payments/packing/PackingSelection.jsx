import React, { useState } from 'react';
import { useSite } from '../../../../hooks/useSite';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useAuth } from '../../../../hooks/useAuth';
import { useToast } from '../../../../hooks/useToast';
import CameraCapture from '../../../../components/ui/CameraCapture';

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
  const [returnPhoto, setReturnPhoto] = useState(null);
  const [returnVideo, setReturnVideo] = useState(null);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('');
  const [transferPackets, setTransferPackets] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [isCapturingVideo, setIsCapturingVideo] = useState(false);

  const handleFileUpload = (e, setFileState) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFileState(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const getVehicleNo = (tank) => {
    const searchId = tank.originalTankId || tank.id;
    const assignedVehicle = vehicles.find(v => (v.tank_ids || v.selectedTanks || []).some(id => String(id) === String(searchId)));
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
    setReturnPhoto(null);
    setReturnVideo(null);
    setIsCapturingPhoto(false);
    setIsCapturingVideo(false);
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
    if (!returnReason.trim()) {
      toast.error("Reason is mandatory.");
      return;
    }

    setIsSubmitting(true);
    try {
      const returnedPackets = activeTank.quantity > 0 ? Math.round((qty / activeTank.quantity) * activeTank.numberOfPackets) : 0;
      const billNumber = `RB-${Date.now().toString().slice(-6)}`;

      const payload = {
        site_id: siteId,
        bill_number: billNumber,
        type: 'return_bill',
        status: 'Completed',
        current_stage: 'pay',
        created_by: user?.id,
        original_bill_id: activeOrder?.id || null,
        original_bill_number: activeOrder?.bill_number || 'N/A',
        packing_data: {
            order_id: activeOrder?.id,
            order_number: activeOrder?.bill_number,
            tank_id: activeTank.id,
            tank_name: activeTank.name,
            vehicle_no: getVehicleNo(activeTank),
            quantity: qty,
            packets: returnedPackets,
            reason: returnReason,
            photo: returnPhoto,
            video: returnVideo,
            return_date: new Date().toLocaleDateString('en-IN'),
            return_time: new Date().toLocaleTimeString('en-IN'),
            return_status: 'Returned'
        }
      };

      const { data: billData, error: billError } = await supabase
        .from(TABLES.bills)
        .insert(payload)
        .select();

      if (billError) throw billError;

      const newBill = (Array.isArray(billData) ? billData[0] : billData) || { id: billNumber, bill_number: billNumber };

      const refundAmount = qty * (Number(activeOrder?.per_piece_price) || 0);

      const paymentPayload = {
        site_id: siteId,
        type: 'return',
        method: 'return',
        amount: refundAmount,
        status: 'returned',
        related_tank_id: activeTank.id,
        bill_id: activeOrder?.id,
        created_by: user?.id,
        note: activeTank.tank_name || activeTank.name,
        holder_name: activeTank.tank_name || activeTank.name,
        vehicle_no: getVehicleNo(activeTank),
        packing_data: {
            ...payload.packing_data,
            return_bill_id: newBill.id,
            return_bill_number: newBill.bill_number
        }
      };

      const { error: paymentError } = await supabase
        .from(TABLES.payments)
        .insert(paymentPayload);

      if (paymentError) throw paymentError;

      const remainingQty = activeTank.quantity - qty;
      const finalRemainingPackets = activeTank.numberOfPackets - returnedPackets;
      
      const transferredTotal = activeTank.transferredQuantity || 0;
      const returnedTotal = (activeTank.returnedQuantity || 0) + qty;
      const isFullyProcessed = (remainingQty <= 0 && finalRemainingPackets <= 0);

      let newStatus = 'Pending';
      if (isFullyProcessed) {
        newStatus = 'Returned';
      } else {
        if (transferredTotal > 0 && returnedTotal > 0) newStatus = 'Partially Processed';
        else if (transferredTotal > 0) newStatus = 'Partially Transferred';
        else if (returnedTotal > 0) newStatus = 'Partially Returned';
      }

      const historySaved = await appendPackingHistory({
        signature: `return-${activeTank.id}-${qty}-${Date.now()}`,
        action: 'Return',
        vehicle: getVehicleNo(activeTank),
        sourceTank: activeTank.name,
        targetTank: '—',
        quantity: qty,
        packets: returnedPackets,
        remainingQty: remainingQty,
        remainingPackets: finalRemainingPackets,
        reason: returnReason || '—',
        photo: returnPhoto,
        video: returnVideo,
        billNumber: newBill.bill_number || newBill.id,
        status: 'Returned'
      });

      if (!historySaved) throw new Error("Failed to save history");

      const newTanksState = tanks.map(t => {
        if (t.id === activeTank.id) {
          const returnsArr = [...(t.returns || []), { quantity: qty, packets: returnedPackets }];
          return {
            ...t,
            originalQuantity: t.originalQuantity != null ? t.originalQuantity : t.quantity,
            originalPackets: t.originalPackets != null ? t.originalPackets : t.numberOfPackets,
            status: newStatus,
            selected: true,
            quantity: remainingQty,
            numberOfPackets: finalRemainingPackets,
            returnedQuantity: returnedTotal,
            returnedPackets: (t.returnedPackets || 0) + returnedPackets,
            returnReason,
            returns: returnsArr
          };
        }
        return t;
      });
      
      setTanks(newTanksState);

      // Persist the updated tanks array to the active order so the return doesn't disappear on refresh
      if (activeOrder && activeOrder.id) {
         const { error: updateError } = await supabase
           .from(TABLES.bills)
           .update({ selected_tanks: newTanksState })
           .eq('id', activeOrder.id);
           
         if (updateError) {
           console.error("Failed to persist return tanks:", updateError);
         }
      }
      
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
      
      const transferredTotal = (activeTank.transferredQuantity || 0) + transferQty;
      const returnedTotal = activeTank.returnedQuantity || 0;
      const isFullyProcessed = (remainingQty <= 0 && remainingPackets <= 0);

      let newStatus = 'Pending';
      if (isFullyProcessed) {
        newStatus = 'Transferred';
      } else {
        if (transferredTotal > 0 && returnedTotal > 0) newStatus = 'Partially Processed';
        else if (transferredTotal > 0) newStatus = 'Partially Transferred';
        else if (returnedTotal > 0) newStatus = 'Partially Returned';
      }

      const historySaved = await appendPackingHistory({
        signature: `transfer-${activeTank.id}-${transferTarget}-${transferQty}-${Date.now()}`,
        action: 'Transfer',
        vehicle: getVehicleNo(activeTank),
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
          const transfersArr = [...(next[srcIdx].transfers || []), { target: transferTarget.toUpperCase().trim(), quantity: transferQty, packets }];
          next[srcIdx] = {
            ...next[srcIdx],
            originalQuantity: next[srcIdx].originalQuantity != null ? next[srcIdx].originalQuantity : next[srcIdx].quantity,
            originalPackets: next[srcIdx].originalPackets != null ? next[srcIdx].originalPackets : next[srcIdx].numberOfPackets,
            quantity: remainingQty,
            numberOfPackets: remainingPackets,
            status: newStatus,
            transferredTarget: transferTarget.toUpperCase(),
            transferredQuantity: transferredTotal,
            transferredPackets: (next[srcIdx].transferredPackets || 0) + packets,
            transfers: transfersArr,
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
            status: 'Pending',
            selected: true,
            isTransferTarget: true,
            sourceTankId: activeTank.id,
            originalTankId: activeTank.originalTankId || activeTank.id
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
        vehicle: getVehicleNo(activeTank),
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
        } else if (t.status === 'Pending' || t.status === 'Partially Returned' || t.status === 'Partially Transferred' || t.status === 'Partially Processed') {
          bgColor = '#fef9c3';
          borderColor = '#eab308';
          textColor = '#713f12';
        } else if (t.status === 'Returned') {
          bgColor = '#fee2e2';
          borderColor = '#ef4444';
          textColor = '#7f1d1d';
        } else if (t.status === 'Transferred') {
          bgColor = '#eff6ff';
          borderColor = '#3b82f6';
          textColor = '#1e3a8a';
        }

        const isFullyDone = t.quantity <= 0 && t.numberOfPackets <= 0 && (t.status === 'Transferred' || t.status === 'Returned');

        return (
          <div key={t.id} className="relative">
            <div
              onClick={() => {
                if (t.status !== 'Transferred' && t.status !== 'Returned') {
                  setActiveModalTankKey(t.id);
                  setTransferQuantity(String(t.quantity));
                  setTransferPackets(String(t.numberOfPackets));
                  setSelectedAction(null);
                  setOtherSubAction(null);
                }
              }}
              className={`p-4 rounded-[12px] border space-y-1 text-center ${t.status !== 'Transferred' && t.status !== 'Returned' ? 'cursor-pointer hover:shadow-md transition' : ''}`}
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
                  {t.status === 'Stocking Completed' ? '✓ Stocking Completed' : t.status}
                </span>
              )}
            </div>

            {/* REMOVED SMALL POPUP FROM HERE */}
          </div>
        );
      })}
    </div>
  );

  const assignedTankIds = new Set();
  vehicles.forEach(v => {
    (v.tank_ids || v.selectedTanks || []).forEach(tid => assignedTankIds.add(String(tid)));
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
          const vTanks = validTanks.filter(t => (v.tank_ids || v.selectedTanks || []).some(id => String(id) === String(t.id)) && !t.isTransferTarget);
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

      {/* FULL SCREEN CENTERED MODAL FOR ALL STATUS SELECTIONS */}
      {activeModalTankKey && activeTank && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 transition-opacity"
          onClick={closeModal}
        >
          <div 
            className="card p-6 max-w-md w-full space-y-4 bg-white rounded-[16px] shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2 mb-3">
              <h4 className="font-extrabold text-lg text-primary">
                {!selectedAction && !otherSubAction ? 'Tank Status' : (selectedAction === 'others' && !otherSubAction ? 'Others' : `Status Selection for Tank ${activeTank.name}`)}
              </h4>
              <button
                type="button"
                onClick={closeModal}
                className="text-2xl font-bold text-text-muted hover:text-black leading-none pb-1 px-1"
                title="Close"
              >
                ×
              </button>
            </div>

            {!selectedAction && !otherSubAction && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => updateTankStatus('Stocking Completed')}
                  className="w-full btn p-4 text-left font-bold rounded-[10px] flex items-center justify-between transition hover:opacity-90 shadow-sm"
                  style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #22c55e' }}
                  disabled={isSubmitting}
                >
                  <span className="text-base">1. Stocking Completed</span>
                  <span className="text-xl">✓</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateTankStatus('Pending')}
                  className="w-full btn p-4 text-left font-bold rounded-[10px] flex items-center justify-between transition hover:opacity-90 shadow-sm"
                  style={{ background: '#fef9c3', color: '#a16207', border: '1px solid #eab308' }}
                  disabled={isSubmitting}
                >
                  <span className="text-base">2. Pending</span>
                  <span className="text-xl">⏳</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAction('others')}
                  className="w-full btn p-4 text-left font-bold rounded-[10px] flex items-center justify-between transition hover:opacity-90 shadow-sm"
                  style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #94a3b8' }}
                >
                  <span className="text-base">3. Others</span>
                  <span className="text-xl">➔</span>
                </button>
              </div>
            )}

            {selectedAction === 'others' && !otherSubAction && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setOtherSubAction('return')}
                  className="w-full btn p-4 text-left font-bold rounded-[10px] flex items-center justify-between transition hover:opacity-90 shadow-sm"
                  style={{ background: '#ffedd5', color: '#c2410c', border: '1px solid #f97316' }}
                >
                  <span className="text-base">↩️ Return</span>
                  <span className="text-xl">➔</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOtherSubAction('transfer')}
                  className="w-full btn p-4 text-left font-bold rounded-[10px] flex items-center justify-between transition hover:opacity-90 shadow-sm"
                  style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #0284c7' }}
                >
                  <span className="text-base">🔀 Transfer</span>
                  <span className="text-xl">➔</span>
                </button>
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
                  <label className="field-label text-xs">Reason for Return *</label>
                  <input
                    className="field text-sm"
                    placeholder="e.g. Quality issue"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label text-xs mb-2 block">Photo</label>
                  {isCapturingPhoto ? (
                    <CameraCapture 
                      mode="photo" 
                      onCapture={(dataUrl) => { setReturnPhoto(dataUrl); setIsCapturingPhoto(false); }} 
                      onCancel={() => setIsCapturingPhoto(false)} 
                    />
                  ) : returnPhoto ? (
                    <div className="space-y-2">
                      <img src={returnPhoto} alt="Return" className="w-full max-h-48 object-contain bg-slate-900 rounded-[12px] border shadow-inner" style={{ borderColor: 'var(--color-border)' }} />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setIsCapturingPhoto(true)} className="btn-ghost flex-1 py-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg">Retake</button>
                        <label className="btn-ghost flex-1 py-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg text-center cursor-pointer">
                          Change
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, setReturnPhoto)} />
                        </label>
                        <button type="button" onClick={() => setReturnPhoto(null)} className="btn-ghost flex-1 py-2 text-xs font-bold text-red-600 bg-red-50 rounded-lg border border-red-100">Delete</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setIsCapturingPhoto(true)} className="flex-1 btn-ghost p-3 flex items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-slate-300 text-black hover:border-slate-400 hover:bg-slate-50 transition">
                        <span className="text-xl">📷</span>
                        <span className="font-bold text-xs">Capture Photo</span>
                      </button>
                      <label className="flex-1 btn-ghost p-3 flex items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-slate-300 text-black hover:border-slate-400 hover:bg-slate-50 transition cursor-pointer">
                        <span className="text-xl">📁</span>
                        <span className="font-bold text-xs">Upload Photo</span>
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, setReturnPhoto)} />
                      </label>
                    </div>
                  )}
                </div>

                <div>
                  <label className="field-label text-xs mb-2 block">Video</label>
                  {isCapturingVideo ? (
                    <CameraCapture 
                      mode="video" 
                      onCapture={(dataUrl) => { setReturnVideo(dataUrl); setIsCapturingVideo(false); }} 
                      onCancel={() => setIsCapturingVideo(false)} 
                    />
                  ) : returnVideo ? (
                    <div className="space-y-2">
                      <video src={returnVideo} controls className="w-full max-h-48 object-contain bg-slate-900 rounded-[12px] border shadow-inner" style={{ borderColor: 'var(--color-border)' }} />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setIsCapturingVideo(true)} className="btn-ghost flex-1 py-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg">Retake</button>
                        <label className="btn-ghost flex-1 py-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg text-center cursor-pointer">
                          Change
                          <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileUpload(e, setReturnVideo)} />
                        </label>
                        <button type="button" onClick={() => setReturnVideo(null)} className="btn-ghost flex-1 py-2 text-xs font-bold text-red-600 bg-red-50 rounded-lg border border-red-100">Delete</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setIsCapturingVideo(true)} className="flex-1 btn-ghost p-3 flex items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-slate-300 text-black hover:border-slate-400 hover:bg-slate-50 transition">
                        <span className="text-xl">🎥</span>
                        <span className="font-bold text-xs">Record Video</span>
                      </button>
                      <label className="flex-1 btn-ghost p-3 flex items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-slate-300 text-black hover:border-slate-400 hover:bg-slate-50 transition cursor-pointer">
                        <span className="text-xl">📁</span>
                        <span className="font-bold text-xs">Upload Video</span>
                        <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileUpload(e, setReturnVideo)} />
                      </label>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={confirmReturn}
                    disabled={isSubmitting}
                    className="btn-warning flex-1 font-bold text-xs py-3 bg-amber-500 text-white rounded transition hover:opacity-90"
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
                    className="btn-success flex-1 font-bold text-xs py-3 transition hover:opacity-90"
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
