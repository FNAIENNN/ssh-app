import { useState, useMemo } from 'react';
import SignaturePad from './SignaturePad';
import { useToast } from '../../../../hooks/useToast';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { aggregateTankStates } from './stockingUtils';

export default function StockingStatusStep2({ step1Data, activeOrder, siteId, selectedVehicle = null, isSaved = false, initialStep2Data = null, onNext, onContinue = null, onBack = null }) {
  const toast = useToast();

  // Initialize independent drum states from step1Data.
  // Supports BOTH new format (drums[]) and old format (rows[] with left/right).
  const [tankStates, setTankStates] = useState(() => {
    if (initialStep2Data?.tankStates) return initialStep2Data.tankStates;

    const map = {};

    // ── New format: { drums: [{drumNum, tankName, count}] } ──
    if (step1Data?.drums && Array.isArray(step1Data.drums)) {
      step1Data.drums.forEach((d) => {
        if (!d.tankName) return;
        const drumKey = `DRUM-${d.drumNum}-${String(d.tankName).trim().toUpperCase()}`;
        map[drumKey] = {
          drumKey,
          tankName: d.tankName,
          originalCount: Number(d.count) || 0,
          currentCount: Number(d.count) || 0,
          status: 'pending', // 'completed' | 'pending' | 'returned' | 'transferred'
          transferredTo: null,
          transferredFrom: [],
          drumNum: d.drumNum,
          returnReason: '',
          returnCount: 0,
        };
      });
      return map;
    }

    // ── Old format: { rows: [{rowNum, left:{tankName,count}, right:{tankName,count}}] } ──
    if (step1Data?.rows) {
      step1Data.rows.forEach((r) => {
        ['left', 'right'].forEach((side) => {
          const item = r[side];
          if (item?.tankName) {
            const drumKey = `${side.toUpperCase()}-R${r.rowNum}-${item.tankName.trim().toUpperCase()}`;
            map[drumKey] = {
              drumKey,
              tankName: item.tankName,
              originalCount: Number(item.count) || 0,
              currentCount: Number(item.count) || 0,
              status: 'pending',
              transferredTo: null,
              transferredFrom: [],
              side,
              rowNum: r.rowNum,
              returnReason: '',
              returnCount: 0,
            };
          }
        });
      });
    }
    return map;
  });

  const [transfers, setTransfers] = useState(() => initialStep2Data?.transfers || []);
  const [returnBills, setReturnBills] = useState(() => initialStep2Data?.returnBills || []);

  // Active drum selected for modal
  const [activeModalTankKey, setActiveModalTankKey] = useState(null);
  const [selectedAction, setSelectedAction] = useState(null); // 'completed' | 'pending' | 'others'
  const [otherSubAction, setOtherSubAction] = useState(null); // 'return' | 'transfer'
  const [transferTargetType, setTransferTargetType] = useState('new'); // 'new' | 'existing'
  const [targetTransferTankName, setTargetTransferTankName] = useState('');
  const [targetTransferDrumKey, setTargetTransferDrumKey] = useState('');
  const [transferAmountInput, setTransferAmountInput] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returnCountInput, setReturnCountInput] = useState('');


  // Apply Status Update
  async function applyStatusUpdate(tankKey, status, transferTarget = null) {
    const currentTank = tankStates[tankKey];
    if (!currentTank) return;

    if (status === 'returned') {
      const returnedSeedCount = Number(returnCountInput) || currentTank.currentCount;
      if (returnedSeedCount <= 0 || returnedSeedCount > currentTank.currentCount) {
        return toast.error(`Invalid return amount! Must be between 1 and ${currentTank.currentCount}.`);
      }

      const remainingAmt = currentTank.currentCount - returnedSeedCount;
      const newStatus = remainingAmt === 0 ? 'returned' : 'Partial Return';

      const retBillPayload = {
        site_id: siteId,
        original_bill_id: activeOrder?.id || null,
        original_bill_number: activeOrder?.bill_number || 'N/A',
        bill_number: `RET-${activeOrder?.bill_number || 'ORD'}-${Date.now().toString().slice(-4)}`,
        type: 'return_bill',
        date: new Date().toISOString(),
        drum_name: currentTank.tankName,
        original_tank: currentTank.tankName,
        seed_count_returned: returnedSeedCount,
        hatchery: activeOrder?.hatchery || 'N/A',
        supervisor_name: 'Field Supervisor',
        supervisor_phone: 'N/A',
        reason: returnReason || 'Return during stocking',
        status: 'pending_finance',
        created_at: new Date().toISOString(),
      };

      const { data: bRes } = await supabase.from(TABLES.bills).insert(retBillPayload).select();
      const savedRetBill = (Array.isArray(bRes) ? bRes[0] : bRes) || { id: retBillPayload.bill_number, ...retBillPayload };

      setReturnBills((prev) => [savedRetBill, ...prev]);
      toast.success(`Generated Return Bill ${savedRetBill.bill_number} for Finance module!`);

      setTankStates((prev) => ({
        ...prev,
        [tankKey]: {
          ...currentTank,
          status: newStatus,
          originalCount: currentTank.originalCount || currentTank.currentCount,
          currentCount: remainingAmt,
          returnReason: returnReason || 'Return during stocking',
          returnCount: (currentTank.returnCount || 0) + returnedSeedCount,
        },
      }));
    } else if (status === 'transferred') {
      const transferAmt = Number(transferAmountInput) || currentTank.currentCount;
      if (transferAmt <= 0 || transferAmt > currentTank.currentCount) {
        return toast.error(`Invalid transfer amount! Must be between 1 and ${currentTank.currentCount}.`);
      }

      const remainingAmt = currentTank.currentCount - transferAmt;
      const newStatus = remainingAmt === 0 ? 'transferred' : 'Partial Transfer';
      
      let targetName = '';
      let targetLogName = '';
      let newTankStateUpdates = {};
      let transferLog = null;

      if (transferTargetType === 'new') {
        const newTankName = targetTransferTankName.trim().toUpperCase();
        if (!newTankName) return toast.error('Enter a valid Target Tank Name.');
        
        targetName = newTankName;
        targetLogName = newTankName;

        transferLog = {
          id: `t-${Date.now()}`,
          transferredFromDrum: `Drum ${currentTank.drumNum} (${currentTank.tankName})`,
          originalTank: currentTank.tankName,
          transferredToTank: targetName,
          transferredAmount: transferAmt,
          originalFromCount: currentTank.currentCount,
          originalToCount: 0,
          finalTargetTotal: transferAmt,
        };

        const maxDrumNum = Math.max(0, ...Object.values(tankStates).map(d => Number(d.drumNum) || 0));
        const newDrumNum = maxDrumNum + 1;
        const newDrumKey = `DRUM-${newDrumNum}-${newTankName}`;

        newTankStateUpdates[newDrumKey] = {
          drumKey: newDrumKey,
          tankName: newTankName,
          originalCount: transferAmt,
          currentCount: transferAmt,
          status: 'unassigned', // User must click and assign status
          transferredTo: null,
          transferredFrom: [currentTank.tankName],
          drumNum: newDrumNum,
          returnReason: '',
          returnCount: 0,
        };

        toast.success(`Transferred ${transferAmt.toLocaleString('en-IN')} pcs to Tank ${newTankName}`);
      } else {
        if (!targetTransferDrumKey) return toast.error('Please select an existing target drum.');
        const existingTarget = tankStates[targetTransferDrumKey];
        if (!existingTarget) return toast.error('Target drum not found!');

        targetName = existingTarget.tankName;
        targetLogName = `Drum ${existingTarget.drumNum} (${existingTarget.tankName})`;
        const origTargetAmt = existingTarget.currentCount;
        const newTargetAmt = origTargetAmt + transferAmt;

        newTankStateUpdates[targetTransferDrumKey] = {
          ...existingTarget,
          currentCount: newTargetAmt,
          transferredFrom: [...(existingTarget.transferredFrom || []), currentTank.tankName],
        };

        transferLog = {
          id: `t-${Date.now()}`,
          transferredFromDrum: `Drum ${currentTank.drumNum} (${currentTank.tankName})`,
          originalTank: currentTank.tankName,
          transferredToTank: targetLogName,
          transferredAmount: transferAmt,
          originalFromCount: currentTank.currentCount,
          originalToCount: origTargetAmt,
          finalTargetTotal: newTargetAmt,
        };

        toast.success(`Merged ${transferAmt.toLocaleString('en-IN')} pcs into ${targetLogName}. Total: ${newTargetAmt.toLocaleString('en-IN')} pcs`);
      }

      setTransfers((prevT) => [...prevT, transferLog]);

      setTankStates((prev) => ({
        ...prev,
        [tankKey]: {
          ...currentTank,
          status: newStatus,
          originalCount: currentTank.originalCount || currentTank.currentCount,
          currentCount: remainingAmt,
          transferredOut: (currentTank.transferredOut || 0) + transferAmt,
          transferredTo: targetName,
        },
        ...newTankStateUpdates,
      }));
    } else {
      setTankStates((prev) => ({
        ...prev,
        [tankKey]: {
          ...currentTank,
          status,
        },
      }));
      toast.info(`Updated Tank ${currentTank.tankName} status to ${status}`);
    }

    closeModal();
  }

  function closeModal() {
    setActiveModalTankKey(null);
    setSelectedAction(null);
    setOtherSubAction(null);
    setTargetTransferTankName('');
    setTransferTargetType('new');
    setTargetTransferDrumKey('');
    setTransferAmountInput('');
    setReturnReason('');
    setReturnCountInput('');
  }

  const drumSummaries = useMemo(() => {
    return aggregateTankStates(tankStates, transfers)
      .filter(s => s.totalCount > 0)
      .map((s) => ({
        ...s,
        label: `${s.tankName} - ${s.totalCount.toLocaleString('en-IN')} pcs`,
      }));
  }, [tankStates, transfers]);

  function handleSubmit() {
    // Validate newly created tanks have selected status (Pending or Completed)
    const unassignedTank = Object.values(tankStates).find((t) => t.status === 'unassigned');
    if (unassignedTank) {
      return toast.error(`Please click on new Tank ${unassignedTank.tankName} and select its status (Pending or Completed).`);
    }

    onNext({
      tankStates,
      transfers,
      returnBills,
    });
  }

  return (
    <div className="card p-6 space-y-6 max-w-4xl mx-auto shadow-md border" style={{ borderColor: 'var(--color-primary)' }}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div>
            <h3 className="text-2xl font-black text-primary uppercase tracking-wide flex items-center gap-2">
              <span>📋</span> Step 2: Stocking Status
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Click any drum box to set status (Stocking Completed, Pending, Return, or Transfer).
            </p>
          </div>
        </div>
      </div>

      {/* Selected Vehicle Details */}
      {selectedVehicle && (
        <div className="p-4 rounded-[12px] bg-slate-50 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-black text-slate-800">Selected Vehicle</p>
            {isSaved && (
              <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200 shadow-sm">
                <span>✓</span> Saved
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] uppercase font-bold text-slate-500">Vehicle</p>
              <p className="text-sm font-extrabold text-slate-900">
                {selectedVehicle.vehicle_no || 'N/A'} — {selectedVehicle.driver_name || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase font-bold text-slate-500">Vehicle Number</p>
              <p className="text-sm font-extrabold text-slate-900">
                {selectedVehicle.vehicle_no || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase font-bold text-slate-500">Driver Name</p>
              <p className="text-sm font-extrabold text-slate-900">
                {selectedVehicle.driver_name || 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Van Visual Layout Header & Summary */}
      <div className="p-4 rounded-[16px] border space-y-4 bg-slate-50" style={{ borderColor: 'var(--color-border)' }}>
        
        {/* Read-only Van Plan Summary (Requirement #3) */}
        <div className="bg-white rounded-[10px] border shadow-sm overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
          <div className="bg-slate-100 px-4 py-2 border-b font-extrabold text-sm text-slate-800 flex items-center gap-2" style={{ borderColor: 'var(--color-border)' }}>
            <span>🚐</span> Seed Van Plan Summary
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <th className="p-2 font-bold">Drum #</th>
                  <th className="p-2 font-bold">Tank Name</th>
                  <th className="p-2 font-bold text-right">Seed Count</th>
                </tr>
              </thead>
              <tbody>
                {(step1Data?.drums || []).map((d) => (
                  <tr key={d.drumNum} className="border-b last:border-0 hover:bg-slate-50" style={{ borderColor: 'var(--color-border)' }}>
                    <td className="p-2 font-bold">Drum {d.drumNum}</td>
                    <td className="p-2">
                      <span className="px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 border" style={{ borderColor: 'var(--color-border)' }}>
                        {d.tankName}
                      </span>
                    </td>
                    <td className="p-2 text-right font-semibold">{Number(d.count || 0).toLocaleString('en-IN')} pcs</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* L/Cabin/R Headings */}
        <div className="w-full relative pt-2 mb-4">
          <div className="flex justify-center mb-6">
            <div className="flex flex-col items-center">
              <span className="font-extrabold text-xl text-primary tracking-widest uppercase">Cabin</span>
            </div>
          </div>
          
          <div className="flex justify-between px-20">
            <div className="flex flex-col items-center">
              <span className="font-bold text-sm text-primary tracking-widest uppercase">Left</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-bold text-sm text-primary tracking-widest uppercase">Right</span>
            </div>
          </div>
        </div>

        {/* Dynamic Clickable Drum Grid (Restored Left/Right layout) */}
        <div className="overflow-x-auto rounded-[12px] border shadow-sm bg-white" style={{ borderColor: 'var(--color-border)' }}>
          <table className="w-full text-left border-collapse min-w-[650px]">
            <thead>
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider">
                <th className="p-3 font-extrabold w-1/2 border-r border-slate-700 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-base">🛢️</span>
                    <span>Left Drum Section</span>
                  </div>
                </th>
                <th className="p-3 font-extrabold w-1/2 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-base">🛢️</span>
                    <span>Right Drum Section</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                
                const sortedDrums = Object.values(tankStates).sort((a, b) => a.drumNum - b.drumNum);
                return Array.from({ length: Math.ceil(sortedDrums.length / 2) }).map((_, idx) => {
                  const leftDrum = sortedDrums[idx * 2];
                  const rightDrum = sortedDrums[idx * 2 + 1];

                  const renderDrumCell = (state) => {
                    if (!state) {
                      return (
                        <div className="p-4 rounded-[12px] border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center min-h-[190px] text-center space-y-2 opacity-50">
                          <span className="text-2xl">🛢️</span>
                          <p className="text-xs font-bold text-slate-400">Empty Slot</p>
                        </div>
                      );
                    }

                    const tankKey = state.drumKey;
                    let bgColor = '#f8fafc';
                    let borderColor = 'var(--color-border)';
                    let textColor = '#0f172a';

                    if (state.status === 'completed') {
                      bgColor = '#dcfce7';
                      borderColor = '#22c55e';
                      textColor = '#14532d';
                    } else if (state.status === 'pending' || state.status === 'Partial Return' || state.status === 'Partial Transfer') {
                      bgColor = '#fef9c3';
                      borderColor = '#eab308';
                      textColor = '#713f12';
                    } else if (state.status === 'returned') {
                      bgColor = '#ffedd5';
                      borderColor = '#f97316';
                      textColor = '#7c2d12';
                    } else if (state.status === 'transferred') {
                      bgColor = '#eff6ff';
                      borderColor = '#3b82f6';
                      textColor = '#1e3a8a';
                    }

                    return (
                      <div
                        key={tankKey}
                        onClick={() => {
                          if (state.status !== 'transferred') {
                            setActiveModalTankKey(tankKey);
                            setReturnCountInput(String(state.currentCount));
                          }
                        }}
                        className={`p-4 rounded-[12px] border space-y-1 text-center h-full flex flex-col justify-center ${state.status !== 'transferred' ? 'cursor-pointer hover:shadow-md transition' : ''}`}
                        style={{ background: bgColor, borderColor, borderWidth: 2 }}
                      >
                        <p className="text-[11px] font-extrabold uppercase text-text-muted">Drum {state.drumNum}</p>
                        <p className="font-extrabold text-base" style={{ color: textColor }}>
                          {state.tankName}
                        </p>
                        {state.status === 'returned' ? (
                          <p className="text-[11px] font-black text-amber-700">Returned ({state.returnCount} pcs)</p>
                        ) : state.status === 'transferred' ? (
                          <div className="text-[11px] font-bold mt-1" style={{ color: '#1d4ed8' }}>
                            🔵 Transferred
                          </div>
                        ) : (
                          <>
                            {(state.transferredOut > 0 || state.returnCount > 0) ? (
                              <div className="text-[10px] text-left bg-white/60 p-2 rounded mt-2 space-y-1 mx-auto max-w-[200px]">
                                <p><strong>Source:</strong> {state.tankName}</p>
                                {state.transferredTo && <p><strong>Target:</strong> {state.transferredTo}</p>}
                                <p><strong>Original Qty:</strong> {state.originalCount?.toLocaleString('en-IN') || (state.currentCount + (state.transferredOut||0) + (state.returnCount||0)).toLocaleString('en-IN')} pcs</p>
                                {state.transferredOut > 0 && <p><strong>Transferred:</strong> {state.transferredOut?.toLocaleString('en-IN')} pcs</p>}
                                {state.returnCount > 0 && <p><strong>Returned:</strong> {state.returnCount?.toLocaleString('en-IN')} pcs</p>}
                                <p><strong>Remaining:</strong> {state.currentCount?.toLocaleString('en-IN')} pcs</p>
                              </div>
                            ) : (
                              <p className="text-xs font-semibold" style={{ color: textColor }}>
                                {state.currentCount.toLocaleString('en-IN')} pcs
                              </p>
                            )}
                          </>
                        )}
                        <span className="inline-block mt-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full capitalize mx-auto" style={{ background: `${borderColor}30`, color: textColor }}>
                          {state.status}
                        </span>
                      </div>
                    );
                  };

                  return (
                    <tr key={idx} className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                      <td className="w-1/2 align-top p-4 border-r" style={{ borderColor: 'var(--color-border)' }}>
                        {renderDrumCell(leftDrum)}
                      </td>
                      <td className="w-1/2 align-top p-4">
                        {renderDrumCell(rightDrum)}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drum Action Modal */}
      {activeModalTankKey && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="card p-6 max-w-md w-full space-y-4 bg-white rounded-[16px] shadow-2xl">
            {/* Global Navigation Header */}
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
              Drum Status Selection for {activeModalTankKey}
            </h4>

            {!selectedAction && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => applyStatusUpdate(activeModalTankKey, 'completed')}
                  className="w-full btn p-3 text-left font-bold rounded-[10px] flex items-center justify-between"
                  style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #22c55e' }}
                >
                  <span>1. Stocking Completed</span>
                  <span>✓</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyStatusUpdate(activeModalTankKey, 'pending')}
                  className="w-full btn p-3 text-left font-bold rounded-[10px] flex items-center justify-between"
                  style={{ background: '#fef9c3', color: '#a16207', border: '1px solid #eab308' }}
                >
                  <span>2. Pending</span>
                  <span>⏳</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAction('others')}
                  className="w-full btn p-3 text-left font-bold rounded-[10px] flex items-center justify-between"
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
                    className="btn p-3 font-bold rounded-[10px] text-center"
                    style={{ background: '#ffedd5', color: '#c2410c', border: '1px solid #f97316' }}
                  >
                    ↩️ Return
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOtherSubAction('transfer');
                      setTransferAmountInput(String(tankStates[activeModalTankKey]?.currentCount || ''));
                    }}
                    className="btn p-3 font-bold rounded-[10px] text-center"
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
                    placeholder="e.g. 50000"
                    value={returnCountInput}
                    onChange={(e) => setReturnCountInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label text-xs">Reason for Return (Optional)</label>
                  <input
                    className="field text-sm"
                    placeholder="e.g. Quality issue / Hatchery excess"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => applyStatusUpdate(activeModalTankKey, 'returned')}
                    className="btn-warning flex-1 font-bold text-xs py-2.5 bg-amber-500 text-white rounded"
                  >
                    Confirm &amp; Generate Return Bill
                  </button>
                </div>
              </div>
            )}

            {otherSubAction === 'transfer' && (
              <div className="space-y-3">
                <h5 className="font-extrabold text-sm text-sky-800">🔀 Transfer Seed Quantity</h5>
                
                <div>
                  <label className="field-label text-xs">Quantity to Transfer *</label>
                  <input
                    type="number"
                    className="field text-sm"
                    placeholder={`Max: ${tankStates[activeModalTankKey]?.currentCount}`}
                    value={transferAmountInput}
                    onChange={(e) => setTransferAmountInput(e.target.value)}
                  />
                  <p className="text-[10px] text-text-muted mt-1">Available in Drum: {tankStates[activeModalTankKey]?.currentCount} pcs</p>
                </div>

                <div>
                  <label className="field-label text-xs">New Target Tank Name *</label>
                  <input
                    className="field text-sm"
                    placeholder="e.g. Tank A3"
                    value={targetTransferTankName}
                    onChange={(e) => setTargetTransferTankName(e.target.value)}
                  />
                </div>

                <div className="p-2.5 rounded bg-sky-50 text-[11px] text-sky-800 border border-sky-200">
                  <p><strong>Transferring From:</strong> Drum {tankStates[activeModalTankKey]?.drumNum} ({tankStates[activeModalTankKey]?.tankName})</p>
                  <p><strong>Quantity:</strong> {transferAmountInput || 0} pcs</p>
                  <p><strong>Target:</strong> {targetTransferTankName || 'New Drum'}</p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => applyStatusUpdate(activeModalTankKey, 'transferred')}
                    disabled={!targetTransferTankName.trim()}
                    className="btn-success flex-1 font-bold text-xs py-2.5"
                  >
                    Confirm Transfer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tank Summary Section */}
      <div className="card p-5 space-y-3 border">
        <h4 className="font-extrabold text-base text-primary border-b pb-2">📊 Tank Summary</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {drumSummaries.map((s) => (
            <div
              key={s.tankName}
              onClick={() => {
                if (s.drumKeys && s.drumKeys.length > 0) {
                  setActiveModalTankKey(s.drumKeys[0]);
                  setReturnCountInput(String(s.totalCount));
                }
              }}
              className="p-3 rounded-[8px] bg-slate-50 border flex justify-between items-center cursor-pointer hover:shadow-md transition"
              style={{
                borderColor: s.status === 'unassigned' ? '#eab308' : 'var(--color-border)',
                background: s.status === 'unassigned' ? '#fef9c3' : '#f8fafc',
              }}
            >
              <span className="font-bold text-slate-800">{s.label}</span>
              <span
                className="chip text-[10px] uppercase font-bold px-2 py-0.5 rounded-full"
                style={{
                  background:
                    s.status === 'completed'
                      ? '#dcfce7'
                      : s.status === 'unassigned'
                      ? '#ef4444'
                      : '#fef9c3',
                  color:
                    s.status === 'completed'
                      ? '#15803d'
                      : s.status === 'unassigned'
                      ? '#ffffff'
                      : '#a16207',
                }}
              >
                {s.status === 'unassigned' ? 'Select Status' : s.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Transfer Summary Section (Requirement #8) */}
      {transfers.length > 0 && (
        <div className="card p-5 space-y-3 border" style={{ borderColor: 'var(--color-info)' }}>
          <h4 className="font-extrabold text-base text-info border-b pb-2 flex items-center gap-2">
            <span>🔀</span> Detailed Transfer Summary &amp; History
          </h4>
          <div className="space-y-2">
            {transfers.map((t) => (
              <div key={t.id} className="p-3 rounded-[10px] bg-sky-50 border border-sky-200 text-xs space-y-1">
                <p className="font-bold text-sky-900">
                  🔄 Transferred From Drum: <strong>{t.transferredFromDrum}</strong>
                </p>
                <p className="text-sky-800">
                  📍 Original Tank: <strong>{t.originalTank}</strong> ➔ ➡️ Transferred To Tank: <strong>{t.transferredToTank}</strong>
                </p>
                <p className="text-sky-800">
                  Transferred Seed Count: {t.transferredAmount.toLocaleString('en-IN')} pcs
                </p>
                <p className="font-extrabold text-sky-950">
                  Final Target Tank Total: {t.finalTargetTotal.toLocaleString('en-IN')} pcs
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Return Bills Generated Summary (Requirement #6) */}
      {returnBills.length > 0 && (
        <div className="card p-5 space-y-3 border border-amber-300 bg-amber-50/50">
          <h4 className="font-extrabold text-base text-amber-900 border-b border-amber-200 pb-2 flex items-center gap-2">
            <span>↩️</span> Return Bills Generated for Finance Module
          </h4>
          <div className="space-y-2">
            {returnBills.map((rb) => (
              <div key={rb.id} className="p-3 rounded-[10px] bg-white border border-amber-200 text-xs space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-extrabold text-amber-900">{rb.bill_number}</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    {rb.status}
                  </span>
                </div>
                <p className="text-slate-700">Drum / Tank: <strong>{rb.drum_name}</strong> · Returned Seed Count: <strong>{Number(rb.seed_count_returned).toLocaleString('en-IN')}</strong></p>
                <p className="text-text-muted">Reason: {rb.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Navigation Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          className="btn-success w-full text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2"
        >
          <span>Save Stocking Status</span>
          <span>💾</span>
        </button>
      </div>
    </div>
  );
}
