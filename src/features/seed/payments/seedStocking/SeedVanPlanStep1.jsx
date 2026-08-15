/**
 * SeedVanPlanStep1 — Dynamic drum-list Seed Van Plan.
 *
 * Key behaviours:
 * - Tank dropdown shows ONLY tanks selected during Seed Order (from activeOrder.selected_tanks)
 * - One tank can be split across multiple drums
 * - Remaining count per tank updates live after every drum entry
 * - Tanks with 0 remaining are disabled in the dropdown
 * - Validation: cannot enter count > remaining for that tank
 * - "Add Drum" button adds a new row; each row has a Remove button
 * - Grand Total shown live
 * - Saves as { drums: [{drumNum, tankName, count}], grandTotal }
 */
import { useState, useMemo, useRef } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { supabase } from '../../../../lib/supabaseClient';
import CameraCapture from '../../../../components/ui/CameraCapture';

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptyDrum(num) {
  return { drumNum: num, tankName: '', count: '' };
}

function buildAvailableTanks(activeOrder) {
  if (
    activeOrder?.selected_tanks &&
    Array.isArray(activeOrder.selected_tanks) &&
    activeOrder.selected_tanks.length > 0
  ) {
    return activeOrder.selected_tanks.map((t) => ({
      ...t,
      id: t.id,
      name: t.name,
      initialQty: Number(t.qty) || Number(t.quantity) || 0,
    }));
  }
  return [];
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SeedVanPlanStep1({
  initialVanData = null,
  activeOrder = null,
  siteId = null,
  selectedVehicle = null,
  isSaved = false,
  onNext,
  onContinue = null,
  onBack = null,
  onNewTankAdded = null,
}) {
  const vanPlanRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  // Available tanks sourced exclusively from Seed Order selected_tanks
  // AND filtered by the current selectedVehicle's assigned tanks
  const availableTanks = useMemo(() => {
    const orderTanks = buildAvailableTanks(activeOrder);
    if (selectedVehicle) {
      const assignedIds = selectedVehicle.tank_ids || selectedVehicle.selectedTanks || [];
      return orderTanks.filter((t) => assignedIds.some(id => String(id) === String(t.id)));
    }
    return orderTanks;
  }, [activeOrder?.id, selectedVehicle]);

  // Show new-tank modal
  const [showAddNewTankModal, setShowAddNewTankModal] = useState(false);
  const [newTankNameInput, setNewTankNameInput] = useState('');
  const [newTankQtyInput, setNewTankQtyInput] = useState('');
  const [extraTanks, setExtraTanks] = useState(() => {
    // Restore any extra tanks that were added in a previous session
    if (initialVanData?.extraTanks) return initialVanData.extraTanks;
    return [];
  });

  const [tankMods, setTankMods] = useState(() => initialVanData?.tankMods || {});

  // Active modals
  const [activeModal, setActiveModal] = useState(null);
  const [modalQty, setModalQty] = useState('');
  const [modalPackets, setModalPackets] = useState('');
  const [modalTargetTank, setModalTargetTank] = useState('');
  const [modalReason, setModalReason] = useState('');
  const [modalPhoto, setModalPhoto] = useState(null);
  const [modalVideo, setModalVideo] = useState(null);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [isCapturingVideo, setIsCapturingVideo] = useState(false);

  const baseTanks = useMemo(() => [...availableTanks, ...extraTanks], [availableTanks, extraTanks]);

  // All tanks available in dropdown = selected + newly added via modal + applied mods
  const allTanks = useMemo(() => {
    return baseTanks.map(t => {
      const mod = tankMods[t.name];
      if (mod) {
        return {
          ...t,
          returns: [...(t.returns || []), ...(mod.returns || [])],
          transfers: [...(t.transfers || []), ...(mod.transfers || [])],
          returnedQuantity: (Number(t.returnedQuantity) || 0) + (mod.returnedQuantity || 0),
          transferredQuantity: (Number(t.transferredQuantity) || 0) + (mod.transferredQuantity || 0),
          status: mod.status || t.status,
          initialQty: Number(t.initialQty) + (mod.receivedQuantity || 0)
        };
      }
      return t;
    });
  }, [baseTanks, tankMods]);

  // Drum list — restores from saved van_plan or starts with one empty drum
  const [drums, setDrums] = useState(() => {
    // Restore from new format
    if (initialVanData?.drums && Array.isArray(initialVanData.drums) && initialVanData.drums.length > 0) {
      return initialVanData.drums.map((d) => ({
        drumNum: d.drumNum,
        tankName: d.tankName || '',
        count: d.count !== undefined ? String(d.count) : '',
      }));
    }
    // Restore from old format (rows with left/right)
    if (initialVanData?.rows && Array.isArray(initialVanData.rows)) {
      const result = [];
      let idx = 1;
      initialVanData.rows.forEach((r) => {
        if (r.left?.tankName) result.push({ drumNum: idx++, tankName: r.left.tankName, count: String(r.left.count || '') });
        if (r.right?.tankName) result.push({ drumNum: idx++, tankName: r.right.tankName, count: String(r.right.count || '') });
      });
      if (result.length > 0) return result;
    }
    return [emptyDrum(1)];
  });

  // Per-drum validation errors
  const [drumErrors, setDrumErrors] = useState({});

  // ── Computed: remaining qty per tank (across all drums) ──────────────────
  const tankRemainingMap = useMemo(() => {
    const map = {};
    allTanks.forEach((t) => {
      map[t.name] = Number(t.initialQty) || 0;
    });
    drums.forEach((d) => {
      const cnt = Number(d.count) || 0;
      if (d.tankName && map[d.tankName] !== undefined) {
        map[d.tankName] = Math.max(0, map[d.tankName] - cnt);
      }
    });
    return map;
  }, [allTanks, drums]);

  // Grand total
  const grandTotal = useMemo(
    () => drums.reduce((sum, d) => sum + (Number(d.count) || 0), 0),
    [drums]
  );

  // Validation: at least 1 complete drum, no partial rows, no count errors
  const { isValid, completedCount } = useMemo(() => {
    let complete = 0;
    let hasError = false;
    for (const d of drums) {
      const hasName = d.tankName.trim().length > 0;
      const rawCount = d.count;
      const countNum = Number(rawCount);
      const hasCount = rawCount !== '' && !isNaN(countNum) && countNum > 0;

      if (!hasName && !hasCount) continue; // empty slot — ok
      if (hasName && hasCount) {
        // Check against remaining (excluding this drum's own contribution)
        const baseRemaining = (() => {
          let r = 0;
          allTanks.forEach((t) => { if (t.name === d.tankName) r = Number(t.initialQty) || 0; });
          // subtract all OTHER drums using same tank
          drums.forEach((other) => {
            if (other !== d && other.tankName === d.tankName) r = Math.max(0, r - (Number(other.count) || 0));
          });
          return r;
        })();
        if (countNum > baseRemaining) {
          hasError = true;
        } else {
          complete++;
        }
      } else {
        hasError = true; // partial
      }
    }
    return { isValid: complete >= 1 && !hasError, completedCount: complete };
  }, [drums, allTanks]);

  // ── Drum actions ──────────────────────────────────────────────────────────

  function addDrum() {
    const nextNum = drums.length > 0 ? Math.max(...drums.map((d) => d.drumNum)) + 1 : 1;
    setDrums((prev) => [...prev, emptyDrum(nextNum)]);
  }

  function removeDrum(drumNum) {
    setDrums((prev) => {
      const filtered = prev.filter((d) => d.drumNum !== drumNum);
      // Re-number sequentially
      return filtered.map((d, idx) => ({ ...d, drumNum: idx + 1 }));
    });
    setDrumErrors((prev) => {
      const next = { ...prev };
      delete next[drumNum];
      return next;
    });
  }

  function updateDrumTank(drumNum, tankName) {
    setDrums((prev) =>
      prev.map((d) => (d.drumNum === drumNum ? { ...d, tankName, count: '' } : d))
    );
    setDrumErrors((prev) => {
      const next = { ...prev };
      delete next[drumNum];
      return next;
    });
  }

  function updateDrumCount(drumNum, rawValue) {
    const countNum = Number(rawValue);
    setDrums((prev) =>
      prev.map((d) => (d.drumNum === drumNum ? { ...d, count: rawValue } : d))
    );

    // Validate immediately
    setDrumErrors((prev) => {
      const drum = drums.find((d) => d.drumNum === drumNum);
      if (!drum || !drum.tankName) return { ...prev, [drumNum]: null };
      if (rawValue === '' || isNaN(countNum) || countNum <= 0) return { ...prev, [drumNum]: null };

      // Compute remaining excluding this drum
      let remaining = 0;
      allTanks.forEach((t) => { if (t.name === drum.tankName) remaining = Number(t.initialQty) || 0; });
      drums.forEach((other) => {
        if (other.drumNum !== drumNum && other.tankName === drum.tankName) {
          remaining = Math.max(0, remaining - (Number(other.count) || 0));
        }
      });

      if (countNum > remaining) {
        return {
          ...prev,
          [drumNum]: `Entered count exceeds the remaining quantity available for Tank ${drum.tankName}. (Remaining: ${remaining.toLocaleString('en-IN')})`,
        };
      }
      const next = { ...prev };
      delete next[drumNum];
      return next;
    });
  }

  // ── Add New Tank modal ────────────────────────────────────────────────────

  function handleAddNewTank() {
    const clean = newTankNameInput.trim().toUpperCase();
    if (!clean) return;
    if (allTanks.some((t) => t.name === clean)) {
      setNewTankNameInput('');
      setShowAddNewTankModal(false);
      return;
    }
    const qty = Number(newTankQtyInput) || 0;
    const newT = { id: `t-new-${Date.now()}`, name: clean, initialQty: qty };
    setExtraTanks((prev) => [...prev, newT]);
    setNewTankNameInput('');
    setNewTankQtyInput('');
    setShowAddNewTankModal(false);
    onNewTankAdded?.(newT);
  }

  // ── Export ────────────────────────────────────────────────────────────────

  async function handleDownloadImage() {
    if (!vanPlanRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(vanPlanRef.current, { scale: 2, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `Seed_Van_Plan_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadPDF() {
    if (!vanPlanRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(vanPlanRef.current, { scale: 2, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.setFontSize(16);
      pdf.text('Seed Van Plan', 15, 15);
      pdf.setFontSize(10);
      pdf.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 15, 22);
      pdf.addImage(imgData, 'PNG', 10, 28, imgWidth, imgHeight);
      pdf.save(`Seed_Van_Plan_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────

    const handleReturnSubmit = (tankName, qty, packets, maxQty, reason, photo, video) => {
      const q = Number(qty);
      const tankObj = allTanks.find(t => t.name === tankName);
      const originalQty = tankObj ? Number(tankObj.initialQty) : maxQty;

      setTankMods(prev => {
        const existing = prev[tankName] || {};
        const newReturns = [...(existing.returns || []), { quantity: q, packets: packets ? Number(packets) : null, reason, photo, video }];
        const newReturnedQty = (existing.returnedQuantity || 0) + q;
        const totalTransferred = (existing.transferredQuantity || 0);
        
        const remaining = originalQty - newReturnedQty - totalTransferred;
        const isComplete = remaining <= 0;

        return {
          ...prev,
          [tankName]: {
            ...existing,
            returns: newReturns,
            returnedQuantity: newReturnedQty,
            status: isComplete ? 'Returned' : (existing.status || '')
          }
        };
      });
      setActiveModal(null);
    };

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

    const handleTransferSubmit = (tankName, targetTank, qty, packets, maxQty, photo, video) => {
      const q = Number(qty);
      const cleanTarget = targetTank.trim().toUpperCase();
      
      const tankObj = allTanks.find(t => t.name === tankName);
      const originalQty = tankObj ? Number(tankObj.initialQty) : maxQty;

      setExtraTanks(prev => {
         if (!prev.some(t => t.name === cleanTarget) && !availableTanks.some(t => t.name === cleanTarget)) {
           return [...prev, { id: `t-new-${Date.now()}`, name: cleanTarget, initialQty: 0 }];
         }
         return prev;
      });
      
      setTankMods(prev => {
        const existing = prev[tankName] || {};
        const newTransfers = [...(existing.transfers || []), { target: cleanTarget, quantity: q, packets: packets ? Number(packets) : null, photo, video }];
        const newTransferredQty = (existing.transferredQuantity || 0) + q;
        const totalReturned = (existing.returnedQuantity || 0);
        
        const remaining = originalQty - totalReturned - newTransferredQty;
        const isComplete = remaining <= 0;

        const existingTarget = prev[cleanTarget] || {};
        const newReceived = (existingTarget.receivedQuantity || 0) + q;

        return {
          ...prev,
          [tankName]: {
            ...existing,
            transfers: newTransfers,
            transferredQuantity: newTransferredQty,
            status: isComplete ? 'Transferred' : (existing.status || '')
          },
          [cleanTarget]: {
            ...existingTarget,
            receivedQuantity: newReceived
          }
        };
      });
      setActiveModal(null);
    };

    function handleNext() {
      if (!isValid) return;
      const completedDrums = drums.filter((d) => d.tankName && Number(d.count) > 0);
      onNext({
        drums: completedDrums.map((d) => ({ drumNum: d.drumNum, tankName: d.tankName, count: Number(d.count) })),
        grandTotal,
        extraTanks,
        availableTanks: allTanks,
        tankMods,
      });
    }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="card p-6 space-y-6 max-w-4xl mx-auto shadow-md border"
      style={{ borderColor: 'var(--color-primary)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div>
            <h3 className="text-2xl font-black text-primary uppercase tracking-wide flex items-center gap-2">
              <span>🚐</span> Seed Van Plan
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Allocate seed into drums. Only tanks selected in Seed Order are available.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowAddNewTankModal(true)}
          className="btn-primary text-xs font-extrabold px-3 py-2 flex items-center gap-1 shadow"
        >
          <span>+</span> Add New Tank
        </button>
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

      {selectedVehicle && availableTanks.length === 0 && (
        <div className="p-4 rounded-[12px] border bg-amber-50 text-amber-800 border-amber-200 text-sm font-bold text-center">
          No tanks were assigned to this vehicle during Vehicle Booking.
        </div>
      )}

      {/* Add New Tank Modal */}
      {showAddNewTankModal && (
        <div className="p-4 rounded-[12px] bg-sky-50 border border-sky-300 space-y-3">
          <p className="text-xs font-bold text-sky-950">Add Extra Tank to Van Plan</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label text-[11px]">Tank Name</label>
              <input
                type="text"
                className="field text-xs font-bold uppercase"
                placeholder="e.g. C1"
                value={newTankNameInput}
                onChange={(e) => setNewTankNameInput(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label text-[11px]">Initial Quantity</label>
              <input
                type="number"
                className="field text-xs"
                placeholder="e.g. 10000"
                value={newTankQtyInput}
                onChange={(e) => setNewTankQtyInput(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleAddNewTank} className="btn-success text-xs px-3 py-1.5 font-bold">
              Add Tank
            </button>
            <button type="button" onClick={() => setShowAddNewTankModal(false)} className="btn-ghost text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Seed Van Plan Summary */}
      {allTanks.length > 0 && (
        <div className="p-4 rounded-[12px] border bg-slate-50 space-y-4" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-[12px] uppercase tracking-wider font-extrabold text-slate-800 border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>
            Seed Van Plan Summary
          </p>
          <div className="space-y-6">
            {['COMPLETED', 'PENDING', 'RETURNED', 'TRANSFERRED'].map(groupName => {
              let allTransfers = [];
              if (groupName === 'TRANSFERRED') {
                allTanks.forEach(t => {
                  if (t.transfers && t.transfers.length > 0) {
                    t.transfers.forEach(tr => {
                      allTransfers.push({
                        source: t.name,
                        target: tr.target,
                        quantity: tr.quantity,
                        packets: tr.packets
                      });
                    });
                  }
                });
              }

              const groupTanks = allTanks.filter(t => {
                const baseRem = tankRemainingMap[t.name] ?? t.initialQty;
                const effRem = baseRem - (t.returnedQuantity || 0) - (t.transferredQuantity || 0);
                
                const origRemaining = (t.initialQty || 0) - (t.returnedQuantity || 0) - (t.transferredQuantity || 0);

                // A tank is ONLY RETURNED if its original remaining quantity is exhausted AND it has a return
                const isFullyReturned = ((t.returnedQuantity || 0) > 0) && (origRemaining <= 0);
                
                // A tank is ONLY TRANSFERRED if its original remaining quantity is exhausted AND it has a transfer (and not already returned)
                const isFullyTransferred = ((t.transferredQuantity || 0) > 0) && (origRemaining <= 0) && !isFullyReturned;

                if (isFullyReturned) return groupName === 'RETURNED';
                if (isFullyTransferred) return groupName === 'TRANSFERRED';

                // If the tank is fully allocated to drums, it goes to COMPLETED
                if (effRem <= 0) return groupName === 'COMPLETED';

                // Otherwise, it is active
                return groupName === 'PENDING';
              });

              if (groupTanks.length === 0 && allTransfers.length === 0) return null;

              const colors = {
                COMPLETED: 'text-emerald-700 bg-emerald-100 border-emerald-300',
                PENDING: 'text-slate-700 bg-slate-100 border-slate-300',
                RETURNED: 'text-red-700 bg-red-100 border-red-300',
                TRANSFERRED: 'text-blue-700 bg-blue-100 border-blue-300'
              };

              return (
                <div key={groupName} className="space-y-3">
                  <div className={`px-3 py-1 rounded-[6px] font-black text-[10px] border uppercase tracking-wider ${colors[groupName]} inline-block`}>
                    {groupName}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {groupName === 'TRANSFERRED' && allTransfers.map((tr, idx) => (
                      <div key={`tr-${idx}`} className="p-3 rounded-[8px] bg-blue-50 border border-blue-300 shadow-sm">
                         <div className="flex justify-between items-center mb-2 border-b border-blue-200 pb-2">
                           <span className="font-extrabold text-slate-800 text-sm">Transfer Record</span>
                         </div>
                         <div className="text-xs text-slate-600 space-y-1">
                           <p>Source Tank: <span className="font-extrabold text-slate-800">{tr.source}</span></p>
                           <p>Target Tank: <span className="font-extrabold text-slate-800">{tr.target}</span></p>
                           <p>Transferred Quantity: <span className="font-extrabold text-blue-700">{Number(tr.quantity).toLocaleString('en-IN')} pcs</span></p>
                           {tr.packets != null && <p>Transferred Packets: <span className="font-extrabold text-blue-700">{tr.packets}</span></p>}
                         </div>
                      </div>
                    ))}

                    {groupTanks.map(t => {
                      const baseRem = tankRemainingMap[t.name] ?? t.initialQty;
                      const effRem = baseRem - (t.returnedQuantity || 0) - (t.transferredQuantity || 0);
                      const packets = t.numberOfPackets;
                      
                      const isReturned = groupName === 'RETURNED';
                      const isTransferred = groupName === 'TRANSFERRED';
                      
                      const isPartialReturn = !isReturned && (t.returnedQuantity || 0) > 0;
                      const isPartialTransfer = !isTransferred && (t.transferredQuantity || 0) > 0;

                      let boxClass = 'bg-white border-slate-200';
                      let headBorder = 'border-slate-200';
                      if (isReturned) { boxClass = 'bg-red-50 border-red-300'; headBorder = 'border-red-200'; }
                      if (isTransferred) { boxClass = 'bg-blue-50 border-blue-300'; headBorder = 'border-blue-200'; }

                      return (
                        <div key={t.id} className={`p-3 rounded-[8px] border shadow-sm ${boxClass}`}>
                          <div className={`flex justify-between items-center mb-2 border-b pb-2 ${headBorder}`}>
                             <span className="font-extrabold text-slate-800 text-sm">{t.name}</span>
                             <div className="flex gap-1 items-center">
                               {isReturned && (
                                 <span className="text-[10px] font-black uppercase text-red-600 bg-red-100 px-2 py-0.5 rounded border border-red-200">
                                   Returned
                                 </span>
                               )}
                               {isPartialReturn && (
                                 <span className="text-[10px] font-black uppercase text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                   Partial Return
                                 </span>
                               )}
                               {isTransferred && (
                                 <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                                   Transferred
                                 </span>
                               )}
                               {isPartialTransfer && (
                                 <span className="text-[10px] font-black uppercase text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                   Partial Transfer
                                 </span>
                               )}
                             </div>
                          </div>

                          {groupName === 'PENDING' && (
                            <div className="text-xs text-slate-600 space-y-1">
                              {((t.returnedQuantity || 0) > 0 || (t.transferredQuantity || 0) > 0) ? (
                                <>
                                  <p>Original: <span className="font-extrabold text-slate-800">{Number(baseRem).toLocaleString('en-IN')} pcs</span></p>
                                  {(t.returnedQuantity || 0) > 0 && (
                                    <p>Returned: <span className="font-extrabold text-red-700">{Number(t.returnedQuantity).toLocaleString('en-IN')} pcs</span></p>
                                  )}
                                  {(t.transferredQuantity || 0) > 0 && (
                                    <p>Transferred: <span className="font-extrabold text-blue-700">{Number(t.transferredQuantity).toLocaleString('en-IN')} pcs</span></p>
                                  )}
                                  <p>Remaining: <span className="font-extrabold text-emerald-700">{effRem.toLocaleString('en-IN')} pcs</span></p>
                                </>
                              ) : (
                                <p>Quantity: <span className="font-extrabold text-slate-800">{effRem.toLocaleString('en-IN')} pcs</span></p>
                              )}
                              {packets != null && <p>Packets: <span className="font-extrabold text-slate-800">{packets}</span></p>}
                              
                              <div className="flex gap-2 mt-3 pt-2 border-t border-slate-100">
                                <button onClick={() => { setActiveModal({ type: 'return', tankName: t.name, maxQty: effRem }); setModalQty(''); setModalPackets(''); setModalReason(''); setModalPhoto(null); setModalVideo(null); setIsCapturingPhoto(false); setIsCapturingVideo(false); }} className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition">
                                   Return
                                </button>
                                <button onClick={() => { setActiveModal({ type: 'transfer', tankName: t.name, maxQty: effRem }); setModalQty(''); setModalPackets(''); setModalTargetTank(''); setModalPhoto(null); setModalVideo(null); setIsCapturingPhoto(false); setIsCapturingVideo(false); }} className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition">
                                   Transfer
                                </button>
                              </div>
                            </div>
                          )}

                          {groupName === 'COMPLETED' && (
                            <div className="text-xs text-slate-600 space-y-1">
                              <p>Quantity: <span className="font-extrabold text-slate-800">{(t.initialQty || 0).toLocaleString('en-IN')} pcs</span></p>
                              {packets != null && <p>Packets: <span className="font-extrabold text-slate-800">{packets}</span></p>}
                            </div>
                          )}

                          {groupName === 'RETURNED' && (
                            <div className="text-xs text-slate-600 space-y-1">
                              <p>Returned Quantity: <span className="font-extrabold text-red-700">{Number(t.returnedQuantity || t.initialQty).toLocaleString('en-IN')} pcs</span></p>
                              {t.returnedPackets != null && <p>Returned Packets: <span className="font-extrabold text-red-700">{t.returnedPackets}</span></p>}
                              <p>Status: <span className="font-extrabold text-red-700">Returned</span></p>
                            </div>
                          )}

                          {groupName === 'TRANSFERRED' && (
                            <div className="text-xs text-slate-600 space-y-1">
                              <p>Transferred Quantity: <span className="font-extrabold text-blue-700">{Number(t.transferredQuantity || t.initialQty).toLocaleString('en-IN')} pcs</span></p>
                              {t.transferredPackets != null && <p>Transferred Packets: <span className="font-extrabold text-blue-700">{t.transferredPackets}</span></p>}
                              <p>Status: <span className="font-extrabold text-blue-700">Transferred</span></p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Exportable drum list */}
      {/* Exportable drum list */}
      <div
        ref={vanPlanRef}
        className="p-4 rounded-[16px] border space-y-4 bg-white"
        style={{ borderColor: 'var(--color-border)' }}
      >
        {/* Van header */}
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <span className="text-xl">🚛</span>
            <div>
              <h4 className="font-extrabold text-sm text-primary uppercase tracking-wide">
                Seed Van Layout Plan
              </h4>
              <p className="text-[11px] text-text-muted">
                Drums organized by Left Side & Right Side
              </p>
            </div>
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

        {/* Dynamic Drum Table */}
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
              {Array.from({ length: Math.ceil(drums.length / 2) }).map((_, idx) => {
                const rowNum = idx + 1;
                const isCabinRow = idx === 0;
                const leftDrum = drums[idx * 2];
                const rightDrum = drums[idx * 2 + 1];

                const renderDrumCell = (drum, side) => {
                  if (!drum) {
                    return (
                      <div className="p-4 rounded-[12px] border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center min-h-[190px] text-center space-y-2">
                        <span className="text-2xl opacity-40">🛢️</span>
                        <p className="text-xs font-bold text-slate-400">
                          Empty Slot ({isCabinRow ? 'Cabin ' : ''}{side === 'left' ? 'Left' : 'Right'} Side)
                        </p>
                        <button
                          type="button"
                          onClick={addDrum}
                          className="text-xs font-extrabold px-3 py-1.5 rounded-full bg-white border border-slate-300 text-slate-700 shadow-sm hover:bg-slate-100 transition"
                        >
                          + Add Drum Box
                        </button>
                      </div>
                    );
                  }

                  const selTank = allTanks.find((t) => t.name === drum.tankName);
                  const remExcludingThis = (() => {
                    let r = selTank ? Number(selTank.initialQty) || 0 : 0;
                    drums.forEach((other) => {
                      if (other.drumNum !== drum.drumNum && other.tankName === drum.tankName) {
                        r = Math.max(0, r - (Number(other.count) || 0));
                      }
                    });
                    return r;
                  })();

                  const err = drumErrors[drum.drumNum];

                  return (
                    <div
                      className="p-4 rounded-[12px] border space-y-3 h-full flex flex-col transition-all shadow-xs"
                      style={{
                        borderColor: err ? '#f87171' : isCabinRow ? '#38bdf8' : 'var(--color-border)',
                        background: err ? '#fff5f5' : isCabinRow ? '#f0f9ff' : 'var(--color-surface)',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="text-xs font-extrabold px-3 py-1 rounded-full text-white shadow-xs flex items-center gap-1"
                          style={{ background: isCabinRow ? '#0284c7' : 'var(--color-primary)' }}
                        >
                          {isCabinRow && <span>🚐</span>}
                          <span>Drum {drum.drumNum}</span>
                        </span>
                        {drums.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeDrum(drum.drumNum)}
                            className="text-[11px] font-bold px-2 py-0.5 rounded-full transition hover:opacity-80"
                            style={{ background: '#fee2e2', color: '#dc2626' }}
                          >
                            ✕ Remove
                          </button>
                        )}
                      </div>

                      <div className="space-y-3 flex-1">
                        <div>
                          <label className="field-label text-[11px]">Select Tank *</label>
                          <select
                            className="field py-1.5 text-xs font-bold uppercase"
                            value={drum.tankName}
                            onChange={(e) => updateDrumTank(drum.drumNum, e.target.value)}
                          >
                            <option value="">— Select Tank —</option>
                            {allTanks.map((t) => {
                              let remForOption = Number(t.initialQty) || 0;
                              drums.forEach((other) => {
                                if (other.drumNum !== drum.drumNum && other.tankName === t.name) {
                                  remForOption = Math.max(0, remForOption - (Number(other.count) || 0));
                                }
                              });
                              const exhausted = remForOption === 0;
                              return (
                                <option
                                  key={t.id}
                                  value={t.name}
                                  disabled={exhausted && drum.tankName !== t.name}
                                >
                                  Tank {t.name}{exhausted ? ' (Done)' : ` — ${remForOption.toLocaleString('en-IN')} rem`}
                                </option>
                              );
                            })}
                          </select>
                          {drum.tankName && (
                            <p
                              className="text-[10px] font-extrabold pt-1"
                              style={{ color: remExcludingThis === 0 ? '#dc2626' : '#059669' }}
                            >
                              {remExcludingThis === 0
                                ? '✓ All seed allocated for this tank'
                                : `Available Remaining: ${remExcludingThis.toLocaleString('en-IN')} pcs`}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="field-label text-[11px]">Drum Seed Count *</label>
                          <input
                            type="number"
                            className="field py-1.5 text-xs font-semibold"
                            placeholder={drum.tankName ? `Max ${remExcludingThis.toLocaleString('en-IN')}` : 'Select tank first'}
                            disabled={!drum.tankName}
                            value={drum.count}
                            onChange={(e) => updateDrumCount(drum.drumNum, e.target.value)}
                            min={1}
                            max={remExcludingThis}
                          />
                          {drum.count && !err && Number(drum.count) > 0 && (
                            <p className="text-[10px] text-emerald-700 font-semibold pt-1">
                              ✓ {Number(drum.count).toLocaleString('en-IN')} pcs
                            </p>
                          )}
                        </div>
                      </div>

                      {err && (
                        <div className="p-2.5 rounded-[8px] text-xs font-semibold text-red-800 bg-red-50 border border-red-300 flex items-start gap-1.5 mt-2">
                          <span>⚠️</span>
                          <span>{err}</span>
                        </div>
                      )}
                    </div>
                  );
                };

                return (
                  <tr key={idx} className="border-b last:border-0 hover:bg-slate-50/50 transition" style={{ borderColor: 'var(--color-border)' }}>
                    <td className="p-3 border-r align-top w-1/2" style={{ borderColor: 'var(--color-border)' }}>
                      {renderDrumCell(leftDrum, 'left')}
                    </td>
                    <td className="p-3 align-top w-1/2">
                      {renderDrumCell(rightDrum, 'right')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Add Drum button */}
        <button
          type="button"
          onClick={addDrum}
          className="w-full py-2.5 rounded-[10px] text-xs font-extrabold border-2 border-dashed transition hover:bg-primary/5 flex items-center justify-center gap-1.5"
          style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
        >
          <span>+</span>
          <span>Add Another Drum</span>
        </button>
      </div>

      {/* Grand Total */}
      <div
        className="p-5 rounded-[16px] flex items-center justify-between shadow-md"
        style={{ background: 'linear-gradient(135deg, var(--color-success) 0%, #16a34a 100%)' }}
      >
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-white/80">
            Grand Total Seed Count
          </p>
          <p className="text-3xl font-black text-white">{grandTotal.toLocaleString('en-IN')}</p>
          <p className="text-xs text-white/70 mt-0.5">
            {completedCount} drum{completedCount !== 1 ? 's' : ''} allocated
          </p>
        </div>
        <div className="text-white text-3xl">🧮</div>
      </div>

      {/* Export section */}
      <div className="p-4 rounded-[12px] border bg-slate-50 space-y-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-extrabold text-sm text-primary flex items-center gap-1.5">
              <span>📥</span> Download Seed Van Plan
            </h4>
            <p className="text-xs text-text-muted">Export the complete drum allocation plan.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={exporting}
              className="btn-primary text-xs font-bold px-3.5 py-2 shadow flex items-center gap-1"
            >
              <span>📄</span> PDF
            </button>
            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={exporting}
              className="btn-ghost text-xs font-bold px-3.5 py-2 border rounded-[8px] bg-white flex items-center gap-1"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              <span>🖼️</span> Image (PNG)
            </button>
          </div>
        </div>
      </div>

      {/* Validation hint */}
      {!isValid && (
        <div className="p-3 rounded-[10px] text-xs font-semibold text-center text-amber-800 bg-amber-50 border border-amber-200">
          ⚠️ Add at least 1 drum with a valid tank and positive count. Fix any errors above before proceeding.
        </div>
      )}

      {/* Navigation */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={handleNext}
          disabled={!isValid}
          className="btn-success w-full sm:flex-1 text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>Save Seed Van Plan</span>
          <span>💾</span>
        </button>

        {isSaved && onContinue && (
          <button
            type="button"
            onClick={onContinue}
            className="btn-primary w-full sm:flex-1 text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2"
          >
            <span>Continue to Stocking Status</span>
            <span>➔</span>
          </button>
        )}
      </div>

      {/* Return Modal */}
      {activeModal?.type === 'return' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-lg font-black text-red-700 uppercase tracking-wide border-b pb-2">Return Seed</h3>
            
            <div className="space-y-3">
              <div>
                <p className="text-[11px] uppercase font-bold text-slate-500">Tank</p>
                <p className="text-sm font-extrabold text-slate-900">{activeModal.tankName}</p>
              </div>
              
              <div>
                <p className="text-[11px] uppercase font-bold text-slate-500">Available Quantity</p>
                <p className="text-sm font-extrabold text-emerald-700">{activeModal.maxQty.toLocaleString('en-IN')} pcs</p>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label text-[11px]">Return Qty *</label>
                  <input 
                    type="number" 
                    className="field text-xs font-bold" 
                    value={modalQty}
                    onChange={e => setModalQty(e.target.value)}
                    max={activeModal.maxQty}
                  />
                </div>
                <div>
                  <label className="field-label text-[11px]">Return Packets</label>
                  <input 
                    type="number" 
                    className="field text-xs font-bold" 
                    value={modalPackets}
                    onChange={e => setModalPackets(e.target.value)}
                  />
                </div>
              </div>
              
              <div>
                <label className="field-label text-[11px]">Reason for Return</label>
                <input 
                  type="text" 
                  className="field text-xs" 
                  value={modalReason}
                  onChange={e => setModalReason(e.target.value)}
                  placeholder="Optional reason..."
                />
              </div>
            </div>

            <div>
              <label className="field-label text-xs mb-2 block">Photo</label>
              {isCapturingPhoto ? (
                <CameraCapture
                  mode="photo"
                  onCapture={(dataUrl) => { setModalPhoto(dataUrl); setIsCapturingPhoto(false); }}
                  onCancel={() => setIsCapturingPhoto(false)}
                />
              ) : modalPhoto ? (
                <div className="space-y-2">
                  <img src={modalPhoto} alt="Return" className="w-full max-h-48 object-contain bg-slate-900 rounded-[12px] border shadow-inner" style={{ borderColor: 'var(--color-border)' }} />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setIsCapturingPhoto(true)} className="btn-ghost flex-1 py-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg">Retake</button>
                    <label className="btn-ghost flex-1 py-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg text-center cursor-pointer">
                      Change
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, setModalPhoto)} />
                    </label>
                    <button type="button" onClick={() => setModalPhoto(null)} className="btn-ghost flex-1 py-2 text-xs font-bold text-red-600 bg-red-50 rounded-lg border border-red-100">Delete</button>
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
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, setModalPhoto)} />
                  </label>
                </div>
              )}
            </div>

            <div>
              <label className="field-label text-xs mb-2 block">Video</label>
              {isCapturingVideo ? (
                <CameraCapture
                  mode="video"
                  onCapture={(dataUrl) => { setModalVideo(dataUrl); setIsCapturingVideo(false); }}
                  onCancel={() => setIsCapturingVideo(false)}
                />
              ) : modalVideo ? (
                <div className="space-y-2">
                  <video src={modalVideo} controls className="w-full max-h-48 object-contain bg-slate-900 rounded-[12px] border shadow-inner" style={{ borderColor: 'var(--color-border)' }} />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setIsCapturingVideo(true)} className="btn-ghost flex-1 py-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg">Retake</button>
                    <label className="btn-ghost flex-1 py-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg text-center cursor-pointer">
                      Change
                      <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileUpload(e, setModalVideo)} />
                    </label>
                    <button type="button" onClick={() => setModalVideo(null)} className="btn-ghost flex-1 py-2 text-xs font-bold text-red-600 bg-red-50 rounded-lg border border-red-100">Delete</button>
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
                    <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileUpload(e, setModalVideo)} />
                  </label>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3 pt-3 border-t">
              <button 
                type="button" 
                onClick={() => {
                  if (!modalQty || Number(modalQty) <= 0 || Number(modalQty) > activeModal.maxQty) {
                    alert('Invalid return quantity. Must be greater than 0 and less than or equal to available quantity.');
                    return;
                  }
                  handleReturnSubmit(activeModal.tankName, modalQty, modalPackets, activeModal.maxQty, modalReason, modalPhoto, modalVideo);
                }}
                className="btn-primary bg-red-600 hover:bg-red-700 text-white text-xs px-4 py-2 font-bold"
              >
                Confirm Return
              </button>
              <button 
                type="button" 
                onClick={() => setActiveModal(null)}
                className="btn-ghost text-xs px-4 py-2 font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {activeModal?.type === 'transfer' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-lg font-black text-blue-700 uppercase tracking-wide border-b pb-2">Transfer Seed</h3>
            
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] uppercase font-bold text-slate-500">Source Tank</p>
                  <p className="text-sm font-extrabold text-slate-900">{activeModal.tankName}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase font-bold text-slate-500">Available Qty</p>
                  <p className="text-sm font-extrabold text-emerald-700">{activeModal.maxQty.toLocaleString('en-IN')} pcs</p>
                </div>
              </div>
              
              <div>
                <label className="field-label text-[11px]">Target Tank *</label>
                <input 
                  type="text" 
                  className="field text-xs font-bold uppercase" 
                  value={modalTargetTank}
                  onChange={e => setModalTargetTank(e.target.value)}
                  placeholder="e.g. C2"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label text-[11px]">Transfer Qty *</label>
                  <input 
                    type="number" 
                    className="field text-xs font-bold" 
                    value={modalQty}
                    onChange={e => setModalQty(e.target.value)}
                    max={activeModal.maxQty}
                  />
                </div>
                <div>
                  <label className="field-label text-[11px]">Transfer Packets</label>
                  <input 
                    type="number" 
                    className="field text-xs font-bold" 
                    value={modalPackets}
                    onChange={e => setModalPackets(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="field-label text-xs mb-2 block">Photo</label>
              {isCapturingPhoto ? (
                <CameraCapture
                  mode="photo"
                  onCapture={(dataUrl) => { setModalPhoto(dataUrl); setIsCapturingPhoto(false); }}
                  onCancel={() => setIsCapturingPhoto(false)}
                />
              ) : modalPhoto ? (
                <div className="space-y-2">
                  <img src={modalPhoto} alt="Transfer" className="w-full max-h-48 object-contain bg-slate-900 rounded-[12px] border shadow-inner" style={{ borderColor: 'var(--color-border)' }} />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setIsCapturingPhoto(true)} className="btn-ghost flex-1 py-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg">Retake</button>
                    <label className="btn-ghost flex-1 py-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg text-center cursor-pointer">
                      Change
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, setModalPhoto)} />
                    </label>
                    <button type="button" onClick={() => setModalPhoto(null)} className="btn-ghost flex-1 py-2 text-xs font-bold text-red-600 bg-red-50 rounded-lg border border-red-100">Delete</button>
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
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, setModalPhoto)} />
                  </label>
                </div>
              )}
            </div>

            <div>
              <label className="field-label text-xs mb-2 block">Video</label>
              {isCapturingVideo ? (
                <CameraCapture
                  mode="video"
                  onCapture={(dataUrl) => { setModalVideo(dataUrl); setIsCapturingVideo(false); }}
                  onCancel={() => setIsCapturingVideo(false)}
                />
              ) : modalVideo ? (
                <div className="space-y-2">
                  <video src={modalVideo} controls className="w-full max-h-48 object-contain bg-slate-900 rounded-[12px] border shadow-inner" style={{ borderColor: 'var(--color-border)' }} />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setIsCapturingVideo(true)} className="btn-ghost flex-1 py-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg">Retake</button>
                    <label className="btn-ghost flex-1 py-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg text-center cursor-pointer">
                      Change
                      <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileUpload(e, setModalVideo)} />
                    </label>
                    <button type="button" onClick={() => setModalVideo(null)} className="btn-ghost flex-1 py-2 text-xs font-bold text-red-600 bg-red-50 rounded-lg border border-red-100">Delete</button>
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
                    <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileUpload(e, setModalVideo)} />
                  </label>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3 pt-3 border-t">
              <button 
                type="button" 
                onClick={() => {
                  if (!modalTargetTank.trim()) {
                    alert('Target tank is required');
                    return;
                  }
                  if (!modalQty || Number(modalQty) <= 0 || Number(modalQty) > activeModal.maxQty) {
                    alert('Invalid transfer quantity. Must be greater than 0 and less than or equal to available quantity.');
                    return;
                  }
                  if (modalTargetTank.trim().toUpperCase() === activeModal.tankName.toUpperCase()) {
                    alert('Target tank cannot be the same as source tank');
                    return;
                  }
                  handleTransferSubmit(activeModal.tankName, modalTargetTank, modalQty, modalPackets, activeModal.maxQty, modalPhoto, modalVideo);
                }}
                className="btn-primary bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 font-bold"
              >
                Confirm Transfer
              </button>
              <button 
                type="button" 
                onClick={() => setActiveModal(null)}
                className="btn-ghost text-xs px-4 py-2 font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
