import { useState, useMemo } from 'react';
import SignaturePad from './SignaturePad';
import { useToast } from '../../../../hooks/useToast';
import { useAuth } from '../../../../hooks/useAuth';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import CameraCapture from '../../../../components/ui/CameraCapture';
import { aggregateTankStates } from './stockingUtils';
import { generateReturnBill } from '../returnBillHelper';

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
          returnCount: Number(d.count) || 0,
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
              returnCount: Number(item.count) || 0,
            };
          }
        });
      });
    }
    return map;
  });

  const { user } = useAuth();
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
  const [returnPhoto, setReturnPhoto] = useState(null);
  const [returnVideo, setReturnVideo] = useState(null);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [isCapturingVideo, setIsCapturingVideo] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileUpload = (e, setFileState) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFileState(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Apply Status Update
  async function applyStatusUpdate(tankKey, status, transferTarget = null) {
    if (isSubmitting) return;
    const currentTank = tankStates[tankKey];
    if (!currentTank) return;

    if (status === 'returned') {
      const returnedSeedCount = Number(returnCountInput) || currentTank.currentCount;
      if (returnedSeedCount <= 0 || returnedSeedCount > currentTank.currentCount) {
        return toast.error(`Invalid return amount! Must be between 1 and ${currentTank.currentCount}.`);
      }

      setIsSubmitting(true);
      try {
        const remainingAmt = currentTank.currentCount - returnedSeedCount;
        const newStatus = remainingAmt === 0 ? 'returned' : 'Partial Return';

        const isMixed = activeOrder?.current_stage === 'mixed-allocation' || activeOrder?.seed_mode === 'mixed-allocation';
        const source = isMixed ? 'Mixed - Seed Van' : 'Seed Van';

        const { bill: savedRetBill } = await generateReturnBill({
          siteId,
          userId: user?.id,
          activeOrder,
          vehicleNo: selectedVehicle?.vehicle_no || 'N/A',
          tankId: currentTank.tankId || currentTank.drumKey,
          tankName: currentTank.tankName,
          sourceQty: currentTank.originalCount || currentTank.currentCount,
          returnedQty: returnedSeedCount,
          remainingQty: remainingAmt,
          reason: returnReason || 'Return during stocking',
          photo: returnPhoto,
          video: returnVideo,
          source
        });

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

        setActiveModalTankKey(null);
        setSelectedAction(null);
        setOtherSubAction(null);
        setReturnCountInput('');
        setReturnReason('');
        setReturnPhoto(null);
        setReturnVideo(null);
      } catch (err) {
        console.error(err);
        toast.error('Failed to generate return bill: ' + (err.message || ''));
      } finally {
        setIsSubmitting(false);
      }
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
        toast.success(`Transferred ${transferAmt.toLocaleString('en-IN')} pcs to ${targetLogName}`);
      }

      setTransfers((prev) => [...prev, transferLog]);

      setTankStates((prev) => ({
        ...prev,
        [tankKey]: {
          ...currentTank,
          status: newStatus,
          currentCount: remainingAmt,
          originalCount: currentTank.originalCount || currentTank.currentCount,
          transferredTo: targetLogName,
          transferredOut: (currentTank.transferredOut || 0) + transferAmt,
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
    <div className="card p-4 sm:p-6 space-y-6 max-w-4xl mx-auto shadow-md border" style={{ borderColor: 'var(--color-primary)' }}>
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
        {/* Dynamic Clickable Drum Grid (Restored Left/Right layout) */}
        <div className="rounded-[12px] border shadow-sm bg-white overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex bg-slate-900 text-white text-[9px] sm:text-xs uppercase tracking-wider">
            <div className="flex-1 p-2 sm:p-3 font-extrabold border-r border-slate-700 text-center flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2">
              <span className="text-sm sm:text-base leading-none">🛢️</span>
              <span>Left Drum</span>
            </div>
            <div className="flex-1 p-2 sm:p-3 font-extrabold text-center flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2">
              <span className="text-sm sm:text-base leading-none">🛢️</span>
              <span>Right Drum</span>
            </div>
          </div>
          <div className="flex flex-col bg-slate-50">
            {(() => {

              const sortedDrums = Object.values(tankStates).sort((a, b) => a.drumNum - b.drumNum);
              return Array.from({ length: Math.ceil(sortedDrums.length / 2) }).map((_, idx) => {
                const leftDrum = sortedDrums[idx * 2];
                const rightDrum = sortedDrums[idx * 2 + 1];

                const renderDrumCell = (state) => {
                  if (!state) {
                    return (
                      <div className="p-2 sm:p-4 rounded-[8px] sm:rounded-[12px] border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center h-full min-h-[120px] sm:min-h-[190px] text-center space-y-1.5 sm:space-y-2 opacity-50">
                        <span className="text-xl sm:text-2xl leading-none">🛢️</span>
                        <p className="text-[9px] sm:text-xs font-bold text-slate-400 leading-tight">Empty Slot</p>
                      </div>
                    );
                  }

                  const tankKey = state.drumKey;

                  const actualTransferred = state.transferredOut || 0;
                  const actualReturned = returnBills
                    .filter(r => r.drum_name === state.tankName || r.original_tank === state.tankName)
                    .reduce((sum, r) => sum + Number(r.seed_count_returned), 0);

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
                      className={`p-1.5 sm:p-4 rounded-[8px] sm:rounded-[12px] border space-y-1 text-center h-full flex flex-col justify-center overflow-hidden ${state.status !== 'transferred' ? 'cursor-pointer hover:shadow-md transition' : ''}`}
                      style={{ background: bgColor, borderColor, borderWidth: 2 }}
                    >
                      <p className="text-[9px] sm:text-[11px] font-extrabold uppercase text-text-muted truncate">Drum {state.drumNum}</p>
                      <p className="font-extrabold text-[11px] sm:text-base truncate" style={{ color: textColor }}>
                        {state.tankName}
                      </p>
                      {state.status === 'returned' ? (
                        <p className="text-[9px] sm:text-[11px] font-black text-amber-700 leading-tight">Returned ({actualReturned > 0 ? actualReturned : state.originalCount} pcs)</p>
                      ) : state.status === 'transferred' ? (
                        <div className="text-[9px] sm:text-[11px] font-bold mt-0.5 sm:mt-1" style={{ color: '#1d4ed8' }}>
                          🔵 Transferred
                        </div>
                      ) : (
                        <>
                          {state.status === 'pending' || (state.status === 'completed' && actualTransferred === 0 && actualReturned === 0) ? (
                            <div className="text-[10px] sm:text-xs font-semibold text-center mt-1 sm:mt-2 truncate w-full" style={{ color: textColor }}>
                              <span className="block text-[8px] sm:text-[10px] font-extrabold uppercase text-slate-500 mb-0.5">Source Qty</span>
                              {(state.originalCount || state.currentCount).toLocaleString('en-IN')} pcs
                            </div>
                          ) : (actualTransferred > 0 || actualReturned > 0) ? (
                            <div className="text-[9px] sm:text-[10px] text-left bg-white/60 p-1.5 sm:p-2 rounded mt-1 sm:mt-2 space-y-0.5 sm:space-y-1 mx-auto w-full max-w-[200px] break-words">
                              <p className="truncate"><strong>Src:</strong> {state.tankName}</p>
                              {state.transferredTo && <p className="truncate"><strong>Tgt:</strong> {state.transferredTo}</p>}
                              <p><strong>Src Qty:</strong> {(state.originalCount || state.currentCount).toLocaleString('en-IN')}</p>
                              {actualTransferred > 0 && <p><strong>Trnsf:</strong> {actualTransferred.toLocaleString('en-IN')}</p>}
                              {actualReturned > 0 && <p><strong>Rtn:</strong> {actualReturned.toLocaleString('en-IN')}</p>}
                              <p><strong>Rem:</strong> {state.currentCount?.toLocaleString('en-IN')}</p>
                            </div>
                          ) : (
                            <div className="text-[10px] sm:text-xs font-semibold text-center mt-1 sm:mt-2 truncate w-full" style={{ color: textColor }}>
                              <span className="block text-[8px] sm:text-[10px] font-extrabold uppercase text-slate-500 mb-0.5">Source Qty</span>
                              {(state.originalCount || state.currentCount).toLocaleString('en-IN')} pcs
                            </div>
                          )}
                        </>
                      )}
                      <span className="inline-block mt-0.5 sm:mt-1 text-[8px] sm:text-[10px] font-extrabold px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded-full capitalize mx-auto max-w-full truncate" style={{ background: `${borderColor}30`, color: textColor }}>
                        {state.status}
                      </span>
                    </div>
                  );
                };

                return (
                  <div key={idx} className="flex flex-row border-b last:border-b-0 w-full" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="p-1.5 sm:p-4 border-r w-1/2 min-w-0" style={{ borderColor: 'var(--color-border)' }}>
                      {renderDrumCell(leftDrum)}
                    </div>
                    <div className="p-1.5 sm:p-4 w-1/2 min-w-0">
                      {renderDrumCell(rightDrum)}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Drum Action Modal */}
      {activeModalTankKey && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="card p-4 sm:p-6 max-w-md w-full space-y-4 bg-white rounded-[16px] shadow-2xl">
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
                {/* Photo upload/capture */}
                <div>
                  <label className="field-label text-xs mb-1 block">Photo Evidence (Optional)</label>
                  {isCapturingPhoto ? (
                    <CameraCapture
                      mode="photo"
                      onCapture={(dataUrl) => { setReturnPhoto(dataUrl); setIsCapturingPhoto(false); }}
                      onCancel={() => setIsCapturingPhoto(false)}
                    />
                  ) : returnPhoto ? (
                    <div className="space-y-2">
                      <img src={returnPhoto} alt="Return Evidence" className="w-full max-h-36 object-contain bg-slate-900 rounded-[8px] border" />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setIsCapturingPhoto(true)} className="btn-ghost flex-1 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 rounded">Retake</button>
                        <button type="button" onClick={() => setReturnPhoto(null)} className="btn-ghost flex-1 py-1.5 text-xs font-bold text-red-600 bg-red-50 rounded border border-red-100">Delete</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setIsCapturingPhoto(true)} className="flex-1 btn-ghost p-2.5 flex items-center justify-center gap-1.5 rounded-[8px] border-2 border-dashed border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50">
                        📷 Capture
                      </button>
                      <label className="flex-1 btn-ghost p-2.5 flex items-center justify-center gap-1.5 rounded-[8px] border-2 border-dashed border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
                        📁 Upload
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, setReturnPhoto)} />
                      </label>
                    </div>
                  )}
                </div>

                {/* Video upload/capture */}
                <div>
                  <label className="field-label text-xs mb-1 block">Video Evidence (Optional)</label>
                  {isCapturingVideo ? (
                    <CameraCapture
                      mode="video"
                      onCapture={(dataUrl) => { setReturnVideo(dataUrl); setIsCapturingVideo(false); }}
                      onCancel={() => setIsCapturingVideo(false)}
                    />
                  ) : returnVideo ? (
                    <div className="space-y-2">
                      <video src={returnVideo} controls className="w-full max-h-36 object-contain bg-slate-900 rounded-[8px] border" />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setIsCapturingVideo(true)} className="btn-ghost flex-1 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 rounded">Retake</button>
                        <button type="button" onClick={() => setReturnVideo(null)} className="btn-ghost flex-1 py-1.5 text-xs font-bold text-red-600 bg-red-50 rounded border border-red-100">Delete</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setIsCapturingVideo(true)} className="flex-1 btn-ghost p-2.5 flex items-center justify-center gap-1.5 rounded-[8px] border-2 border-dashed border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50">
                        🎥 Record
                      </button>
                      <label className="flex-1 btn-ghost p-2.5 flex items-center justify-center gap-1.5 rounded-[8px] border-2 border-dashed border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
                        📁 Upload
                        <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileUpload(e, setReturnVideo)} />
                      </label>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => applyStatusUpdate(activeModalTankKey, 'returned')}
                    disabled={isSubmitting}
                    className="btn-warning flex-1 font-bold text-xs py-2.5 bg-amber-500 text-white rounded disabled:opacity-50"
                  >
                    {isSubmitting ? 'Processing...' : 'Confirm & Generate Return Bill'}
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