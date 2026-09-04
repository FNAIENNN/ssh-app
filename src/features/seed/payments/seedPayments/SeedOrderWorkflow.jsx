/**
 * SeedOrderWorkflow — handles modes:
 *   'list'             → Past Orders list
 *   'form'             → Seed Order form
 *   'pay'              → Payments step (Advance Cash / Bank)
 *   'vehicle'          → Vehicle Booking
 *   'vehicle-payments' → Vehicle Payments
 *   'readonly'         → Read-only bill view from Past Orders
 *
 * All state lives in SeedBillContext. Back always preserves entered data.
 */
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useAuth } from '../../../../hooks/useAuth';
import { useToast } from '../../../../hooks/useToast';
import { nextBillNumber } from '../../../../lib/bills';
import { useSite } from '../../../../hooks/useSite';
import { useSeedBill } from '../SeedBillContext';
import RequestPayment from '../../../../components/payments/RequestPayment';
import HatcheryDetails from './HatcheryDetails';
import VehicleBooking from '../vehicleBooking/VehicleBooking';
import BillDetailsReadOnly from '../BillDetailsReadOnly';

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(b) {
  const s = b.status || 'Draft';
  if (s === 'Completed' || b.stocking_status === 'completed')
    return { bg: '#dcfce7', color: '#15803d', border: '#22c55e', label: '✓ Completed' };
  if (s === 'Returned')
    return { bg: '#fee2e2', color: '#b91c1c', border: '#ef4444', label: '↩ Returned' };
  if (s === 'Seed Stocking In Progress')
    return { bg: '#dbeafe', color: '#1d4ed8', border: '#3b82f6', label: '🌱 Stocking…' };
  if (s === 'Vehicle Payment Requested')
    return { bg: '#ede9fe', color: '#6d28d9', border: '#8b5cf6', label: '🚛 Veh. Payment Req.' };
  if (s === 'Payment Requested')
    return { bg: '#fef3c7', color: '#b45309', border: '#f59e0b', label: '💳 Payment Req.' };
  if (s === 'Pending Seed Stocking')
    return { bg: '#fef9c3', color: '#a16207', border: '#eab308', label: '📦 Pending Stocking' };
  return { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', label: `📝 ${s}` };
}

function BackButton({ onClick, label = 'Back' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-sm font-bold"
      style={{ color: '#000', background: 'none', border: 'none', cursor: 'pointer' }}
    >
      <span style={{ color: '#000', fontSize: '1.1rem' }}>←</span>
      <span style={{ color: '#000' }}>{label}</span>
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SeedOrderWorkflow({ siteId }) {
  console.log("Rendering from: SeedOrderWorkflow.jsx");
  const { user } = useAuth();
  const { site } = useSite();
  const toast = useToast();

  const {
    activeBill, setActiveBill,
    allBills, setAllBills, loadBills, loadingBills,
    orderForm, setOrderForm,
    emptyTanks, setEmptyTanks,
    newlyAddedTanks, addNewlyAddedTank,
    seedMode, setSeedMode,
    deleteBill,
    updateBill,
    setStep1Data, setStep2Data,
  } = useSeedBill();

  // Local state for sections
  const [sections, setSections] = useState([]);
  const [proceeding, setProceeding] = useState(false);
  const [billToDelete, setBillToDelete] = useState(null);

  // Read-only bill view
  const [readOnlyBill, setReadOnlyBill] = useState(null);
  const [readOnlyPayments, setReadOnlyPayments] = useState([]);
  const [readOnlyVehicles, setReadOnlyVehicles] = useState([]);

  const bankAccountAddedRef = useRef(null);

  // ── Load sections ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!siteId) return;
    (async () => {
      const { data: secs } = await supabase
        .from(TABLES.sections)
        .select('*')
        .eq('site_id', siteId)
        .order('name');
      const loaded = secs ?? [];
      setSections(loaded);
      // Auto-select first section tab if none set
      if (loaded.length > 0 && (!orderForm.selectedSectionIds || orderForm.selectedSectionIds.length === 0)) {
        setOrderForm((f) => ({ ...f, selectedSectionIds: [loaded[0].id] }));
      }
    })();
  }, [siteId]);

  // ── Load tanks when section selection changes ─────────────────────────────
  useEffect(() => {
    const selectedSectionIds = orderForm.selectedSectionIds || [];
    if (selectedSectionIds.length === 0) {
      setEmptyTanks([]);
      return;
    }
    (async () => {
      // Fetch tanks only by the selected section_id from Supabase.
      const { data: tanks, error: tanksErr } = await supabase
        .from(TABLES.tanks)
        .select('*')
        .in('section_id', selectedSectionIds); // order removed here to rely on custom natural sort
        
      if (tanksErr) console.error("Error fetching tanks:", tanksErr);

      console.log("Section:", selectedSectionIds);
      console.log("Fetched Tanks:", tanks);

      const validTanks = (tanks || []).filter((tank) => {
        const name = String(tank.name || "").trim();
      
        if (!/^[ABC][0-9]+$/.test(name)) {
          console.warn("Invalid tank name found:", tank.name);
          return false;
        }
      
        return true;
      });

      // Sort tanks naturally by their numeric part
      validTanks.sort((a, b) => {
        // Extract section letter and numeric part
        const letterA = a.name.charAt(0);
        const letterB = b.name.charAt(0);
        
        if (letterA !== letterB) {
          return letterA.localeCompare(letterB);
        }
        
        const numA = parseInt(a.name.slice(1), 10);
        const numB = parseInt(b.name.slice(1), 10);
        return numA - numB;
      });

      setEmptyTanks(validTanks);
    })();
  }, [orderForm.selectedSectionIds]);

  // ── Computed values ───────────────────────────────────────────────────────
  const overallQuantity = useMemo(
    () => Object.values(orderForm.tankQtys || {}).reduce((sum, qty) => sum + (Number(qty) || 0), 0),
    [orderForm.tankQtys]
  );

  const overallPrice = useMemo(
    () => Math.round((Number(orderForm.perPiecePrice) || 0) * overallQuantity),
    [orderForm.perPiecePrice, overallQuantity]
  );

  // Past orders — bills visible in UI
  const pastOrders = useMemo(
    () => allBills,
    [allBills]
  );

  // Removed groupedTanks to display flat list of tanks

  // ── Helpers ───────────────────────────────────────────────────────────────
  function updateForm(field, value) {
    setOrderForm((f) => ({ ...f, [field]: value }));
  }

  function toggleSection(id) {
    setOrderForm((f) => {
      const current = f.selectedSectionIds || [];
      const newIds = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      return { ...f, selectedSectionIds: newIds };
    });
  }

  function setNewlyAddedTab() {
    // We treat 'newly-added' as a special pseudo-section in the array for UI purposes
    setOrderForm((f) => {
      const current = f.selectedSectionIds || [];
      return { ...f, selectedSectionIds: current.includes('newly-added') ? current.filter(x => x !== 'newly-added') : [...current, 'newly-added'] };
    });
  }

  function selectTank(id) {
    const qty = Number(orderForm.tankQtys[id]) || 0;
    if (!qty) {
      toast.warning('Enter a quantity before selecting the tank');
      return;
    }
    setOrderForm((f) => ({
      ...f,
      selectedTankIds: f.selectedTankIds.includes(id)
        ? f.selectedTankIds.filter((x) => x !== id)
        : [...f.selectedTankIds, id],
    }));
  }

  // ── Proceed to Pay — creates the Bill ────────────────────────────────────
  async function proceedToPay() {
    if (!orderForm.selectedTankIds.length) return toast.warning('Select at least one tank');
    if (!orderForm.seedType) return toast.warning('Enter seed type');
    if (!orderForm.perPiecePrice) return toast.warning('Enter per piece price');
    if (!overallQuantity) return toast.warning('Overall quantity is zero');

    setProceeding(true);
    try {
      // Persist selected tank names + quantities in bill.
      // Include both DB-tank selections AND manually-added tanks.
      const selectedTankNames = [
        ...emptyTanks
          .filter((t) => orderForm.selectedTankIds.includes(t.id))
          .map((t) => ({ id: t.id, name: t.name, qty: Number(orderForm.tankQtys[t.id]) || 0 })),
        ...newlyAddedTanks
          .filter((t) => orderForm.selectedTankIds.includes(t.id))
          .map((t) => ({ id: t.id, name: t.name, qty: Number(orderForm.tankQtys[t.id]) || 0, isNewlyAdded: true })),
      ];

      const sharedPayload = {
        seed_total: overallPrice,
        per_piece_price: Number(orderForm.perPiecePrice) || 0,
        overall_quantity: overallQuantity,
        pl_size: Number(orderForm.plSize) || null,
        seed_type: orderForm.seedType,
        hatchery: orderForm.selectedHatchery?.hatchery_name || orderForm.hatchery || null,
        selected_tanks: selectedTankNames,
        newly_added_tanks: newlyAddedTanks
          .filter((t) => orderForm.selectedTankIds.includes(t.id))
          .map((t) => ({ id: t.id, name: t.name, qty: Number(orderForm.tankQtys[t.id]) || 0 })),
        newly_added_tank_ids: newlyAddedTanks
          .filter((t) => orderForm.selectedTankIds.includes(t.id))
          .map((t) => t.id),
      };

      // If bill already exists for this session, update it and move to pay mode
      if (activeBill) {
        const { data: updatedRows, error } = await supabase
          .from(TABLES.bills)
          .update({ ...sharedPayload, current_stage: 'pay', updated_at: new Date().toISOString() })
          .eq('id', activeBill.id)
          .select();

        if (error) {
          toast.error(error.message);
          return;
        }

        const data = (Array.isArray(updatedRows) ? updatedRows[0] : updatedRows) || { ...activeBill, ...sharedPayload };
        setActiveBill(data);
        setAllBills((prev) => prev.map((b) => (b.id === data.id ? data : b)));
        toast.success(`Bill ${data.bill_number} updated successfully`);
        setSeedMode('pay');
        return;
      }

      const { data: existing } = await supabase
        .from(TABLES.bills)
        .select('bill_number')
        .eq('site_id', siteId);
      const billNumber = nextBillNumber(site?.name, existing ?? []);

      const now = new Date();
      const initialTimeline = [
        {
          id: `tl-${Date.now()}`,
          date: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
          time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
          userName: user?.email || 'Field User',
          action: 'Bill Created',
        },
      ];

      const payload = {
        ...sharedPayload,
        site_id: siteId,
        bill_number: billNumber,
        type: 'seed',
        vehicle_total: 0,
        workers_total: 0,
        status: 'Draft',
        current_stage: 'pay',
        stocking_status: 'pending',
        timeline: initialTimeline,
        created_by: user?.id,
      };

      const { data: insertedRows, error } = await supabase
        .from(TABLES.bills)
        .insert(payload)
        .select();

      if (error) {
        toast.error(error.message);
        return;
      }

      const data = (Array.isArray(insertedRows) ? insertedRows[0] : insertedRows) || { id: billNumber, ...payload };
      setActiveBill(data);
      setAllBills((prev) => [data, ...prev]);
      toast.success(`Bill ${data.bill_number} generated successfully`);
      setSeedMode('pay');
    } finally {
      setProceeding(false);
    }
  }

  // ── Open read-only view ───────────────────────────────────────────────────
  async function openReadOnlyView(b) {
    setReadOnlyBill(b);
    setSeedMode('readonly');
    const { data: pays } = await supabase.from(TABLES.payments).select('*').eq('bill_id', b.id);
    setReadOnlyPayments(pays ?? []);
    const { data: vehs } = await supabase.from(TABLES.vehicleBookings).select('*').eq('bill_id', b.id);
    setReadOnlyVehicles(vehs ?? []);
  }

  // ── Resume a bill from Past Orders into active workflow ───────────────────
  function resumeBill(b) {
    setActiveBill(b);
    setOrderForm((f) => ({
      ...f,
      seedType: b.seed_type ?? '',
      hatchery: b.hatchery ?? '',
      plSize: b.pl_size ?? '',
      perPiecePrice: b.per_piece_price ?? '',
      selectedTankIds: (b.selected_tanks || []).map((t) => t.id),
      tankQtys: Object.fromEntries((b.selected_tanks || []).map((t) => [t.id, t.qty])),
    }));
    
    if (b.van_plan) setStep1Data(b.van_plan);
    if (b.stocking_status_data) setStep2Data(b.stocking_status_data);
    
    if (b.current_stage) {
      setSeedMode(b.current_stage);
    } else {
      setSeedMode('pay');
    }
  }

  // ── Hatchery slot for RequestPayment ─────────────────────────────────────
  const hatcherySlot = (
    <HatcheryDetails
      siteId={siteId}
      selectedHatchery={orderForm.selectedHatchery}
      onSelectHatchery={(h) => {
        updateForm('selectedHatchery', h);
        if (h) updateForm('hatchery', h.hatchery_name);
      }}
      selectedBankAccount={orderForm.selectedBankAccount}
      onSelectBankAccount={(a) => updateForm('selectedBankAccount', a)}
      onHatcheryBankAccountAddedRef={bankAccountAddedRef}
      autoHatcheryName={activeBill?.hatchery || orderForm.hatchery}
    />
  );

  const renderSelectedTanksBanner = () => {
    if (!orderForm.selectedTankIds || orderForm.selectedTankIds.length === 0) return null;
    return (
      <div className="p-3 mb-4 rounded-[10px] border bg-slate-50 space-y-2" style={{ borderColor: 'var(--color-border)' }}>
        <p className="text-[10px] uppercase tracking-wider font-bold text-text-muted">
          Active Selected Tanks ({orderForm.selectedTankIds.length})
        </p>
        <div className="flex flex-wrap gap-2">
          {emptyTanks
            .filter((t) => orderForm.selectedTankIds.includes(t.id))
            .map((t) => (
              <span
                key={t.id}
                className="text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1"
                style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success)' }}
              >
                <span className="text-[10px]">✓</span>
                {t.name}
              </span>
            ))}
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Past Orders List
  // ══════════════════════════════════════════════════════════════════════════
  if (seedMode === 'list') {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold flex items-center gap-2">
              <span>🌱</span> Past Orders
            </h2>
            <p className="text-xs text-text-secondary">
              View all seed order bills and track their lifecycle.
            </p>
          </div>
          <button
            onClick={() => { setActiveBill(null); setSeedMode('form'); }}
            className="btn-primary text-sm px-4 py-2 font-extrabold flex items-center gap-1.5 shadow-md"
          >
            <span className="text-lg">+</span> Add New Seed Order
          </button>
        </div>

        {billToDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-800">Delete Bill</h3>
              <p className="text-sm text-slate-600">Are you sure you want to delete this bill?</p>
              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button"
                  className="px-5 py-2.5 bg-slate-100 text-slate-800 font-bold text-sm rounded-lg hover:bg-slate-200 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBillToDelete(null);
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  className="px-5 py-2.5 bg-red-600 text-white font-bold text-sm rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const success = await deleteBill(billToDelete.id);
                    if (success) {
                      toast.success('Bill deleted successfully');
                    } else {
                      toast.error('Failed to delete bill');
                    }
                    setBillToDelete(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}



        {loadingBills ? (
          <p className="text-sm text-text-muted p-4">Loading seed bills…</p>
        ) : pastOrders.length === 0 ? (
          <div className="card p-8 text-center space-y-3 border-dashed border-2" style={{ borderColor: 'var(--color-border)' }}>
            <div className="text-4xl">📄</div>
            <h3 className="font-bold text-base">No Past Orders Found</h3>
            <p className="text-xs text-text-muted">
              Click "+ Add New Seed Order" to create your first seed order bill.
            </p>
            <button onClick={() => setSeedMode('form')} className="btn-primary text-xs font-bold px-4 py-2">
              + Add New Seed Order
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pastOrders.map((b) => {
              const badge = statusBadge(b);
              const isCompleted = b.status === 'Completed' || b.stocking_status === 'completed';
              return (
                <div
                  key={b.id}
                  className="card p-5 border cursor-pointer hover:shadow-lg transition space-y-3 relative"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  {/* Delete button (UI only) */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setBillToDelete(b); }}
                    className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: '#fee2e2', color: '#dc2626' }}
                    title="Remove from this list"
                  >
                    ✕ Delete
                  </button>

                  <div className="flex items-center justify-between pr-16" onClick={() => openReadOnlyView(b)}>
                    <span className="text-sm font-extrabold px-3 py-1 rounded-full text-white"
                      style={{ background: isCompleted ? '#059669' : 'var(--color-primary)' }}>
                      {b.bill_number}
                    </span>
                    <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full"
                      style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-text-secondary pt-1" onClick={() => openReadOnlyView(b)}>
                    <p className="font-bold text-sm text-text-primary">{b.hatchery || 'Hatchery Not Specified'}</p>
                    <p>Seed Type: <strong>{b.seed_type || '—'}</strong></p>
                    <p>Quantity: <strong>{Number(b.overall_quantity || 0).toLocaleString('en-IN')}</strong> pieces</p>
                    <p>Created: {new Date(b.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </div>

                  <div className="pt-2 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}
                    onClick={() => openReadOnlyView(b)}>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-text-muted">Total Price</p>
                      <p className="text-base font-extrabold text-success">₹{Number(b.seed_total || 0).toLocaleString('en-IN')}</p>
                    </div>
                    {!isCompleted && b.status !== 'Pending Seed Stocking' && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); resumeBill(b); }}
                        className="btn-primary text-xs font-bold px-3 py-1.5"
                      >
                        Resume →
                      </button>
                    )}
                    {b.status === 'Pending Seed Stocking' && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); resumeBill(b); }}
                        className="btn-success text-xs font-bold px-3 py-1.5"
                      >
                        Continue Stocking →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Read-Only Bill View (Past Orders)
  // ══════════════════════════════════════════════════════════════════════════
  if (seedMode === 'readonly' && readOnlyBill) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {renderSelectedTanksBanner()}
        <BillDetailsReadOnly
          bill={readOnlyBill}
          payments={readOnlyPayments}
          vehicles={readOnlyVehicles}
          vehiclePayments={[]}
          onBack={() => setSeedMode('list')}
          showExport
        />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Seed Order Form
  // ══════════════════════════════════════════════════════════════════════════
  if (seedMode === 'form') {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <BackButton onClick={() => setSeedMode('list')} label="Back" />
          <span className="text-xs font-bold text-text-muted">Create Seed Order</span>
        </div>

        <div className="card p-5 space-y-5">
          <h3 className="font-bold text-lg">Seed Order Details</h3>

          {/* 1. Section Selection */}
          <div>
            <label className="field-label">Sections</label>
            <div className="flex flex-wrap gap-2">
              {sections.map((s) => {
                const isSelected = (orderForm.selectedSectionIds || []).includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSection(s.id)}
                    className="px-4 py-2 rounded-[8px] text-sm font-bold border transition shadow-sm"
                    style={
                      isSelected
                        ? { background: 'var(--color-success)', color: '#fff', borderColor: 'var(--color-success)' }
                        : { background: '#f8fafc', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                    }
                  >
                    {isSelected ? '✓ ' : '☐ '}
                    Section {s.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Tank Selection */}
          <div>
            <label className="field-label">Tanks</label>
            
            {(!orderForm.selectedSectionIds || orderForm.selectedSectionIds.length === 0) ? (
              <p className="text-xs text-text-muted">Select at least one section to see tanks.</p>
            ) : emptyTanks.length === 0 ? (
              <p className="text-xs text-text-muted">No tanks found in the selected sections.</p>
            ) : (
              <div className="space-y-3">
                {emptyTanks.map((t) => {
                  const isSelected = orderForm.selectedTankIds.includes(t.id);
                  return (
                    <div
                      key={t.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-[12px] border bg-white shadow-sm transition"
                      style={{
                        borderColor: isSelected ? 'var(--color-success)' : 'var(--color-border)',
                        background: isSelected ? 'var(--color-success-bg)' : '#fff',
                      }}
                    >
                      <div className="flex-1">
                        <span className="text-lg font-extrabold text-slate-800">Tank : {t.name}</span>
                        <p className="text-[11px] text-text-muted font-semibold mt-0.5">
                          {Number(t.area_acres || 0).toFixed(2)} acres
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="w-32">
                          <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Quantity</label>
                          <input
                            type="number"
                            placeholder="Qty"
                            className="field py-2 text-sm font-bold"
                            value={orderForm.tankQtys[t.id] ?? ''}
                            onChange={(e) =>
                              setOrderForm((f) => ({ ...f, tankQtys: { ...f.tankQtys, [t.id]: e.target.value } }))
                            }
                          />
                        </div>
                        <div className="mt-4 sm:mt-0">
                          <button
                            type="button"
                            onClick={() => selectTank(t.id)}
                            className="px-4 py-2 font-bold text-sm rounded-[8px] transition"
                            style={
                              isSelected
                                ? { background: 'var(--color-success)', color: '#fff', border: '1px solid var(--color-success)' }
                                : { background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }
                            }
                          >
                            {isSelected ? '✓ Selected' : 'Select'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected summary chips */}
          {renderSelectedTanksBanner()}

          {/* 3. Seed Details */}
          <div className="space-y-4 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
            
            {/* Row 1 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">Seed Type</label>
                <input className="field" value={orderForm.seedType}
                  onChange={(e) => updateForm('seedType', e.target.value)} placeholder="e.g. Vannamei PL" />
              </div>
              <div>
                <label className="field-label">PL Size</label>
                <input type="number" className="field" value={orderForm.plSize}
                  onChange={(e) => updateForm('plSize', e.target.value)} placeholder="Numeric value only" />
              </div>
            </div>

            {/* Row 2 */}
            <div>
              <label className="field-label">Source Hatchery Name</label>
              <input className="field" value={orderForm.hatchery}
                onChange={(e) => updateForm('hatchery', e.target.value)} placeholder="Hatchery Name" />
            </div>

            {/* Row 3 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">Σ Overall Quantity</label>
                <input
                  readOnly
                  className="field font-extrabold text-base"
                  style={{ background: '#f8fafc', color: 'var(--color-primary)' }}
                  value={overallQuantity ? overallQuantity.toLocaleString('en-IN') : '0'}
                  placeholder="Σ Selected Tanks"
                />
              </div>
              <div>
                <label className="field-label">Per Piece Price (₹)</label>
                <input type="number" className="field font-bold" value={orderForm.perPiecePrice}
                  onChange={(e) => updateForm('perPiecePrice', e.target.value)} placeholder="e.g. 1.10" />
              </div>
            </div>

            {/* Row 4 */}
            <div>
              <label className="field-label">Overall Price (₹)</label>
              <input
                readOnly
                className="field font-extrabold text-lg"
                style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}
                value={overallPrice ? overallPrice.toLocaleString('en-IN') : '0'}
                placeholder="Per Piece Price × Overall Quantity"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={proceedToPay}
            disabled={!(orderForm.selectedTankIds.length && orderForm.seedType && orderForm.perPiecePrice && overallQuantity) || proceeding}
            className="btn-success w-full font-bold text-base py-3"
          >
            {proceeding ? 'Generating bill…' : 'Proceed to Pay'}
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Vehicle Booking
  // ══════════════════════════════════════════════════════════════════════════
  if (seedMode === 'vehicle') {
    const selectedTanks = [...emptyTanks, ...newlyAddedTanks].filter((t) => orderForm.selectedTankIds.includes(t.id));
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <VehicleBooking
          siteId={siteId}
          billId={activeBill?.id}
          initialVehicles={activeBill?.vehicle_booking_data?.vehicles}
          tanks={selectedTanks}
          onBack={() => setSeedMode('pay')}
          onCompleteVehicleBooking={async () => {
            if (activeBill?.id) await updateBill({ current_stage: 'vehicle-payments' });
            setSeedMode('vehicle-payments');
          }}
          onNewTankAdded={addNewlyAddedTank}
        />
      </div>
    );
  }


  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Pending Stocking Choice
  // ══════════════════════════════════════════════════════════════════════════
  if (seedMode === 'pending') {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <BackButton onClick={() => setSeedMode('list')} label="Back to Past Orders" />
          <span className="text-xs font-extrabold px-3 py-1 rounded-full text-white" style={{ background: 'var(--color-primary)' }}>
            Bill: {activeBill?.bill_number}
          </span>
        </div>
        <div className="card p-6 space-y-6 text-center shadow-lg border border-slate-200 rounded-[16px]">
          <h3 className="text-xl font-extrabold text-slate-800">Choose Stocking Method</h3>
          <p className="text-sm text-slate-500">Select how you want to proceed with stocking for this order.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <button
              type="button"
              onClick={async () => {
                await updateBill({ current_stage: 'packing' }, 'Proceeding to Packing', user?.email);
                setSeedMode('packing');
              }}
              className="btn-primary py-6 rounded-[12px] text-lg font-extrabold shadow flex flex-col items-center justify-center gap-2"
            >
              <span className="text-2xl">📦</span>
              <span>Packing</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                await updateBill({ current_stage: 'van-plan' }, 'Proceeding to Seed Van Plan', user?.email);
                setSeedMode('van-plan');
              }}
              className="btn-success py-6 rounded-[12px] text-lg font-extrabold shadow flex flex-col items-center justify-center gap-2"
            >
              <span className="text-2xl">🚐</span>
              <span>Seed Van Plan</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Payments step ('pay') — Advance Cash + Advance Bank
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <BackButton onClick={() => setSeedMode('form')} label="Back" />
        {activeBill && (
          <span className="text-xs font-extrabold px-3 py-1 rounded-full text-white"
            style={{ background: 'var(--color-primary)' }}>
            Bill: {activeBill.bill_number}
          </span>
        )}
      </div>

      {/* Bill banner */}
      {activeBill && (
        <div className="rounded-[16px] px-5 py-4 flex items-center justify-between shadow-lg text-white"
          style={{ background: 'linear-gradient(135deg,var(--color-primary) 0%,var(--color-primary-light) 100%)' }}>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-white/80">Active Seed Order Bill</p>
            <p className="text-2xl font-extrabold tracking-wide">{activeBill.bill_number}</p>
            <p className="text-xs text-white/90">
              {activeBill.hatchery || 'Hatchery Not Specified'} · {activeBill.seed_type || 'Seed'} · {Number(activeBill.overall_quantity || 0).toLocaleString('en-IN')} pcs
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/70">Bill Amount</p>
            <p className="text-2xl font-extrabold">₹{Number(activeBill.seed_total || overallPrice).toLocaleString('en-IN')}</p>
          </div>
        </div>
      )}

      {/* Advance Cash + Advance Bank Payments */}
      <RequestPayment
        type="seed"
        siteId={siteId}
        billId={activeBill?.id}
        totalOrderPrice={Number(activeBill?.seed_total || overallPrice || 0)}
        prefillAmount={null}
        onPaid={async (payment) => {
          await updateBill({ status: 'Payment Requested' }, 'Advance Payment Submitted', user?.email);
          await loadBills();
        }}
        supplierSection={hatcherySlot}
        selectedHatchery={orderForm.selectedHatchery}
        selectedHatcheryBankAccount={orderForm.selectedBankAccount}
        onHatcheryBankAccountAdded={(acct) => bankAccountAddedRef.current?.(acct)}
        hideMachineIdBook
      />

      {/* Proceed to Vehicle Booking */}
      <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="btn-ghost text-sm font-bold flex items-center gap-1"
        >
          ↑ Back to Top
        </button>
        <button
          type="button"
          onClick={async () => {
            if (activeBill?.id) await updateBill({ current_stage: 'vehicle' });
            setSeedMode('vehicle');
          }}
          className="btn-primary text-base px-8 py-3 flex items-center gap-2 font-extrabold shadow-lg"
        >
          <span>Proceed to Vehicle Booking</span>
          <span>➔</span>
        </button>
      </div>
    </div>
  );
}

