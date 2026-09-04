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
import { useState, useMemo, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptyDrum(num) {
  return { drumNum: num, tankName: '', count: '' };
}

function buildAvailableTanks(activeOrder, overrideTankQtys = null) {
  if (
    activeOrder?.selected_tanks &&
    Array.isArray(activeOrder.selected_tanks) &&
    activeOrder.selected_tanks.length > 0
  ) {
    return activeOrder.selected_tanks.map((t) => {
      const initialQty = overrideTankQtys ? (overrideTankQtys[t.id] || 0) : (Number(t.qty) || 0);
      return {
        id: t.id,
        name: t.name,
        initialQty,
      };
    }).filter(t => overrideTankQtys ? t.initialQty > 0 : true);
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
  overrideTankQtys = null,
}) {
  const vanPlanRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  // Available tanks sourced exclusively from Seed Order selected_tanks
  // AND filtered by the current selectedVehicle's assigned tanks
  const availableTanks = useMemo(() => {
    const orderTanks = buildAvailableTanks(activeOrder, overrideTankQtys);
    if (selectedVehicle) {
      const assignedIds = selectedVehicle.tank_ids || selectedVehicle.selectedTanks || [];
      return orderTanks.filter((t) => assignedIds.some(id => String(id) === String(t.id)));
    }
    return orderTanks;
  }, [activeOrder?.id, selectedVehicle, overrideTankQtys]);

  // --- DEBUG LOGS FOR USER ---
  useEffect(() => {
    console.log('--- SEED VAN PLAN LOADED / UPDATED ---');
    availableTanks.forEach(t => {
      console.log(`Tank: ${t.name} | Calculated Remaining Available for Van: ${t.initialQty}`);
    });
  }, [availableTanks]);
  // ---------------------------

  // Show new-tank modal
  const [showAddNewTankModal, setShowAddNewTankModal] = useState(false);
  const [newTankNameInput, setNewTankNameInput] = useState('');
  const [newTankQtyInput, setNewTankQtyInput] = useState('');
  const [extraTanks, setExtraTanks] = useState(() => {
    // Restore any extra tanks that were added in a previous session
    if (initialVanData?.extraTanks) return initialVanData.extraTanks;
    return [];
  });

  // All tanks available in dropdown = selected + newly added via modal
  const allTanks = useMemo(() => [...availableTanks, ...extraTanks], [availableTanks, extraTanks]);

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

  function handleNext() {
    if (!isValid) return;
    const completedDrums = drums.filter((d) => d.tankName && Number(d.count) > 0);
    onNext({
      drums: completedDrums.map((d) => ({ drumNum: d.drumNum, tankName: d.tankName, count: Number(d.count) })),
      grandTotal,
      extraTanks,
      availableTanks: allTanks,
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

      {/* Tank Summary — shows remaining per tank */}
      {allTanks.length > 0 && (
        <div className="p-4 rounded-[12px] border bg-slate-50 space-y-2" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-[10px] uppercase tracking-wider font-bold text-text-muted">
            Available Tanks — Remaining Quantities
          </p>
          <div className="flex flex-wrap gap-2">
            {allTanks.map((t) => {
              const rem = tankRemainingMap[t.name] ?? t.initialQty;
              const exhausted = rem === 0;
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border"
                  style={{
                    background: exhausted ? '#f1f5f9' : 'var(--color-primary)10',
                    color: exhausted ? '#94a3b8' : 'var(--color-primary)',
                    borderColor: exhausted ? '#cbd5e1' : 'var(--color-primary)40',
                  }}
                >
                  <span>{t.name}</span>
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold"
                    style={{
                      background: exhausted ? '#e2e8f0' : 'var(--color-primary)',
                      color: exhausted ? '#94a3b8' : '#fff',
                    }}
                  >
                    {exhausted ? '✓ Done' : `${rem.toLocaleString('en-IN')} rem`}
                  </span>
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
    </div>
  );
}