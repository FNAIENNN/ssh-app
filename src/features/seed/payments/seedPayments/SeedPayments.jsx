import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useAuth } from '../../../../hooks/useAuth';
import { useSite } from '../../../../hooks/useSite';
import { useToast } from '../../../../hooks/useToast';
import { nextBillNumber, autosaveBillStep } from '../../../../lib/bills';
import RequestPayment from '../../../../components/payments/RequestPayment';
import HatcheryDetails from './HatcheryDetails';
import VehicleBooking from '../vehicleBooking/VehicleBooking';
import ActivityTimeline from '../../../../components/ui/ActivityTimeline';
import { aggregateTankStates } from '../seedStocking/stockingUtils';

export default function SeedPayments({ siteId, resumeBill, onResumeCleared, onProceedToSeedStocking, resumeMode = null, onResumeModeCleared = null }) {
  console.log("Rendering from: SeedPayments.jsx");
  const { user } = useAuth();
  const { site } = useSite();
  const toast = useToast();

  // Mode: 'list' | 'form' | 'pay' | 'vehicle' | 'readonly'
  const [mode, setMode] = useState('list');
  const [existingBills, setExistingBills] = useState([]);
  const [loadingBills, setLoadingBills] = useState(true);

  // Form state
  const [sections, setSections] = useState([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState([]);
  const [emptyTanks, setEmptyTanks] = useState([]);
  const [tankQtys, setTankQtys] = useState({});
  const [selectedTankIds, setSelectedTankIds] = useState([]);

  const [seedType, setSeedType] = useState('');
  const [plSize, setPlSize] = useState('');
  const [hatchery, setHatchery] = useState('');
  const [perPiecePrice, setPerPiecePrice] = useState('');

  // Active Bill & Hatchery Details State
  const [bill, setBill] = useState(null);
  const [proceeding, setProceeding] = useState(false);

  // Read-only bill view state
  const [readOnlyBill, setReadOnlyBill] = useState(null);
  const [readOnlyPayments, setReadOnlyPayments] = useState([]);
  const [readOnlyVehicles, setReadOnlyVehicles] = useState([]);

  const [selectedHatchery, setSelectedHatchery] = useState(null);
  const [selectedBankAccount, setSelectedBankAccount] = useState(null);

  // Load existing Seed Order Bills
  useEffect(() => {
    if (!siteId) return;
    loadBills();
  }, [siteId]);

  async function loadBills() {
    setLoadingBills(true);
    const { data } = await supabase
      .from(TABLES.bills)
      .select('*')
      .eq('site_id', siteId)
      .eq('type', 'seed')
      .order('created_at', { ascending: false });
    setExistingBills(data ?? []);
    setLoadingBills(false);
  }

  // Load sections & auto-select first section
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
      if (loaded.length > 0 && selectedSectionIds.length === 0) {
        setSelectedSectionIds([loaded[0].id]);
      }
    })();
  }, [siteId]);

  // Load tanks for selected sections
  useEffect(() => {
    if (!selectedSectionIds.length) {
      setEmptyTanks([]);
      return;
    }
    (async () => {
      const { data: tanks } = await supabase
        .from(TABLES.tanks)
        .select('*')
        .in('section_id', selectedSectionIds)
        .order('name');
      const allRaw = tanks ?? [];
      const all = allRaw.filter((t) => {
        const name = String(t.name || "").trim().toUpperCase();
        if (/^[ABC]\d+$/.test(name)) {
          return true;
        } else {
          console.warn("Invalid tank ignored:", t);
          return false;
        }
      });
      const unstocked = all.filter((t) => Number(t.quantity || 0) === 0);
      setEmptyTanks(unstocked.length > 0 ? unstocked : all);
    })();
  }, [selectedSectionIds]);

  // Resume bill handler
  useEffect(() => {
    if (!resumeBill) return;
    setBill(resumeBill);
    setSeedType(resumeBill.seed_type ?? '');
    setHatchery(resumeBill.hatchery ?? '');
    setPlSize(resumeBill.pl_size ?? '');
    setMode('pay');
    toast.info(`Resuming bill ${resumeBill.bill_number}`);
  }, [resumeBill]);

  // Restore mode when navigating back from SeedStocking (e.g. Seed Van Plan → Back → Vehicle Payments)
  useEffect(() => {
    if (!resumeMode) return;
    setMode(resumeMode);
    onResumeModeCleared?.();
  }, [resumeMode]);

  const overallQuantity = useMemo(
    () => selectedTankIds.reduce((sum, id) => sum + (Number(tankQtys[id]) || 0), 0),
    [selectedTankIds, tankQtys]
  );

  const overallPrice = useMemo(
    () => Math.round((Number(perPiecePrice) || 0) * overallQuantity),
    [perPiecePrice, overallQuantity]
  );

  function toggleSection(id) {
    setSelectedSectionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setSelectedTankIds([]);
    setTankQtys({});
  }

  function selectTank(id) {
    const qty = Number(tankQtys[id]) || 0;
    if (!qty) {
      toast.warning('Enter a quantity before selecting the tank');
      return;
    }
    setSelectedTankIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function openReadOnlyView(b) {
    setReadOnlyBill(b);
    setMode('readonly');

    // Fetch payments & vehicle bookings for read-only bill
    const { data: pays } = await supabase.from(TABLES.payments).select('*').eq('bill_id', b.id);
    setReadOnlyPayments(pays ?? []);

    const { data: vehs } = await supabase.from(TABLES.vehicleBookings).select('*').eq('bill_id', b.id);
    setReadOnlyVehicles(vehs ?? []);
  }

  async function proceedToPay() {
    if (!selectedTankIds.length) return toast.warning('Select at least one tank');
    if (!seedType) return toast.warning('Enter seed type');
    if (!perPiecePrice) return toast.warning('Enter per piece price');
    if (!overallQuantity) return toast.warning('Overall quantity is zero');

    setProceeding(true);
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
      site_id: siteId,
      bill_number: billNumber,
      type: 'seed',
      seed_total: overallPrice,
      vehicle_total: 0,
      workers_total: 0,
      per_piece_price: Number(perPiecePrice) || 0,
      overall_quantity: overallQuantity,
      pl_size: Number(plSize) || null,
      seed_type: seedType,
      hatchery: selectedHatchery?.hatchery_name || hatchery || null,
      status: 'Draft',
      stocking_status: 'pending',
      timeline: initialTimeline,
      created_by: user?.id,
    };
    const { data: insertedRows, error } = await supabase
      .from(TABLES.bills)
      .insert(payload)
      .select();
    setProceeding(false);
    if (error) return toast.error(error.message);
    const data = (Array.isArray(insertedRows) ? insertedRows[0] : insertedRows) || { id: payload.bill_number, ...payload };
    
    setBill(data);
    setExistingBills((prev) => [data, ...prev]);
    setMode('pay');
    toast.success(`Bill ${data.bill_number || payload.bill_number} generated successfully`);
  }

  async function onPaid(payment) {
    if (!bill) return;
    const today = new Date().toISOString().slice(0, 10);
    const selectedTanks = emptyTanks.filter((t) => selectedTankIds.includes(t.id));

    await Promise.all(
      selectedTanks.map((t) =>
        supabase.from(TABLES.seedEntries).insert({
          tank_id: t.id,
          site_id: siteId,
          date: today,
          seed_type: seedType,
          quantity: Number(tankQtys[t.id]) || 0,
          pl_size: Number(plSize) || null,
          hatchery: selectedHatchery?.hatchery_name || hatchery,
          source: 'stocked',
          payment_id: payment.id,
          bill_id: bill.id,
          created_by: user?.id,
        })
      )
    );
    await Promise.all(
      selectedTanks.map((t) =>
        supabase
          .from(TABLES.tanks)
          .update({
            quantity: Number(t.quantity || 0) + (Number(tankQtys[t.id]) || 0),
            seed_type: seedType,
            hatchery: selectedHatchery?.hatchery_name || hatchery,
            start_date: t.start_date ?? today,
          })
          .eq('id', t.id)
      )
    );

    const actionName = payment.method === 'cash' ? 'Cash Payment Completed' : 'Advance Payment Submitted';
    const updated = await autosaveBillStep(supabase, TABLES, bill.id, { status: 'Draft' }, actionName, user?.email);
    if (updated) setBill(updated);

    toast.success('Payment recorded and saved');
    if (resumeBill) onResumeCleared?.();
  }

  const formReady = selectedTankIds.length > 0 && seedType && perPiecePrice && overallQuantity;
  const bankAccountAddedRef = useRef(null);

  // Past Orders list displays all bills for the site (Pending Stocking & Completed Records)
  const activePastOrders = useMemo(() => {
    return existingBills.filter((b) => b.type === 'seed' || !b.type);
  }, [existingBills]);

  // Hatchery Details Slot component for RequestPayment with Auto Hatchery Selection
  const hatcherySlot = (
    <HatcheryDetails
      siteId={siteId}
      selectedHatchery={selectedHatchery}
      onSelectHatchery={(h) => {
        setSelectedHatchery(h);
        if (h) setHatchery(h.hatchery_name);
      }}
      selectedBankAccount={selectedBankAccount}
      onSelectBankAccount={setSelectedBankAccount}
      onHatcheryBankAccountAddedRef={bankAccountAddedRef}
      autoHatcheryName={bill?.hatchery || hatchery}
    />
  );

  // ── 1. Initial Screen: Past Seed Order Bills Cards List ──
  if (mode === 'list') {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top bar with Add button */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold flex items-center gap-2">
              <span>🌱</span> Past Orders
            </h2>
            <p className="text-xs text-text-secondary">
              View all generated Seed Order Bills and track their full lifecycle in read-only mode.
            </p>
          </div>
          <button
            onClick={() => {
              setBill(null);
              setMode('form');
            }}
            className="btn-primary text-sm px-4 py-2 font-extrabold flex items-center gap-1.5 shadow-md"
          >
            <span className="text-lg">+</span> Add New Seed Order
          </button>
        </div>

        {/* List of bill cards */}
        {loadingBills ? (
          <p className="text-sm text-text-muted p-4">Loading seed bills...</p>
        ) : activePastOrders.length === 0 ? (
          <div className="card p-8 text-center space-y-3 border-dashed border-2" style={{ borderColor: 'var(--color-border)' }}>
            <div className="text-4xl">📄</div>
            <h3 className="font-bold text-base">No Past Orders Found</h3>
            <p className="text-xs text-text-muted">
              Click "+ Add New Seed Order" to create your first seed order bill.
            </p>
            <button
              onClick={() => setMode('form')}
              className="btn-primary text-xs font-bold px-4 py-2"
            >
              + Add New Seed Order
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activePastOrders.map((b) => {
              const isCompleted = b.status === 'Completed' || b.stocking_status === 'completed';
              const displayStatus = b.status || (isCompleted ? 'Completed' : 'Pending Seed Stocking');

              return (
                <div
                  key={b.id}
                  onClick={() => openReadOnlyView(b)}
                  className="card p-5 border cursor-pointer hover:shadow-lg transition space-y-3"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold px-3 py-1 rounded-full text-white" style={{ background: isCompleted ? '#059669' : 'var(--color-primary)' }}>
                      {b.bill_number}
                    </span>
                    {(() => {
                      const s = b.status || 'Draft';
                      let bg, color, border, label;
                      if (s === 'Completed' || b.stocking_status === 'completed') {
                        bg = '#dcfce7'; color = '#15803d'; border = '#22c55e'; label = '✓ Completed';
                      } else if (s === 'Awaiting Remaining Tanks') {
                        bg = '#fef3c7'; color = '#b45309'; border = '#f59e0b'; label = '⏳ Awaiting Tanks';
                      } else if (s === 'Seed Stocking In Progress') {
                        bg = '#dbeafe'; color = '#1d4ed8'; border = '#3b82f6'; label = '🌱 Stocking...';
                      } else if (s === 'Pending Seed Stocking') {
                        bg = '#fef9c3'; color = '#a16207'; border = '#eab308'; label = '📦 Pending Stocking';
                      } else {
                        bg = '#f1f5f9'; color = '#475569'; border = '#cbd5e1'; label = `📝 ${s}`;
                      }
                      return (
                        <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full" style={{ background: bg, color, border: `1px solid ${border}` }}>
                          {label}
                        </span>
                      );
                    })()}
                  </div>

                  <div className="space-y-1 text-xs text-text-secondary pt-1">
                    <p className="font-bold text-sm text-text-primary">
                      {b.hatchery || 'Hatchery Not Specified'}
                    </p>
                    <p>Seed Type: <strong>{b.seed_type || '—'}</strong></p>
                    <p>Quantity: <strong>{Number(b.overall_quantity || 0).toLocaleString('en-IN')}</strong> pieces</p>
                    <p>Created: {new Date(b.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </div>

                  <div className="pt-2 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-text-muted">Total Price</p>
                      <p className="text-base font-extrabold text-success">
                        ₹{Number(b.seed_total || 0).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
                      View Read-Only Details 👁️
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── 2. Read-Only Past Order Details Screen (Single Bill Model) ──
  if (mode === 'readonly' && readOnlyBill) {
    const isSeedPayment = (p) => !p.type || p.type === 'seed' || p.type === 'seed_order';
    const cashPays = readOnlyPayments.filter((p) => p.method === 'cash' && isSeedPayment(p));
    const advPays = readOnlyPayments.filter((p) => p.method === 'advance' && isSeedPayment(p));

    const vanPlan = readOnlyBill.van_plan;
    const stockingData = readOnlyBill.stocking_status_data;
    const workersData = readOnlyBill.outside_workers_data;
    const isCompleted = readOnlyBill.stocking_status === 'completed';

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back navigation */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMode('list')}
            className="btn-ghost text-xs font-bold flex items-center gap-1"
            style={{ color: '#000' }}
          >
            <span style={{ color: '#000' }}>←</span> <span style={{ color: '#000' }}>Back to Past Orders List</span>
          </button>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-200 text-slate-800">
            🔒 Read-Only Mode
          </span>
        </div>

        {/* Read-Only Banner Header */}
        <div
          className="rounded-[16px] px-6 py-5 flex items-center justify-between shadow-md text-white"
          style={{
            background: isCompleted
              ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
              : 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
          }}
        >
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wider font-semibold text-white/80">
              {isCompleted ? 'Completed Seed Order & Stocking Bill' : 'Seed Order Bill'}
            </span>
            <h2 className="text-3xl font-extrabold">{readOnlyBill.bill_number}</h2>
            <p className="text-xs text-white/90">
              Hatchery: <strong>{readOnlyBill.hatchery || 'N/A'}</strong> · Created: {new Date(readOnlyBill.created_at).toLocaleString('en-IN')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/80">Total Bill Price</p>
            <p className="text-3xl font-extrabold">
              ₹{Number(readOnlyBill.seed_total || 0).toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* 1. Seed Order Details */}
        <div className="card p-5 space-y-3 border">
          <h3 className="font-extrabold text-base border-b pb-2">📋 1. Seed Order Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-text-muted">Hatchery Name</p>
              <p className="font-bold text-sm text-primary">{readOnlyBill.hatchery || 'N/A'}</p>
            </div>
            <div>
              <p className="text-text-muted">Seed Type</p>
              <p className="font-bold text-sm">{readOnlyBill.seed_type || 'N/A'}</p>
            </div>
            <div>
              <p className="text-text-muted">PL Size / Count</p>
              <p className="font-bold text-sm">{readOnlyBill.pl_size || 'N/A'}</p>
            </div>
            <div>
              <p className="text-text-muted">Overall Quantity</p>
              <p className="font-bold text-sm">{Number(readOnlyBill.overall_quantity || 0).toLocaleString('en-IN')} pcs</p>
            </div>
            <div>
              <p className="text-text-muted">Per Piece Price</p>
              <p className="font-bold text-sm">₹{readOnlyBill.per_piece_price ?? 'N/A'}</p>
            </div>
            <div>
              <p className="text-text-muted">Total Price</p>
              <p className="font-extrabold text-sm text-success">₹{Number(readOnlyBill.seed_total || 0).toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>

        {/* 2. Cash Payment Details */}
        <div className="card p-5 space-y-3 border">
          <h3 className="font-extrabold text-base border-b pb-2">💵 2. Cash Payment Details</h3>
          {cashPays.length === 0 ? (
            <p className="text-xs text-text-muted italic">No cash payments recorded for this order.</p>
          ) : (
            <div className="space-y-2">
              {cashPays.map((p) => (
                <div key={p.id} className="p-3 rounded-[10px] bg-slate-50 border flex justify-between items-center text-xs">
                  <div>
                    <p className="font-bold">Payment ID: {p.id.slice(0, 8)}</p>
                    <p className="text-text-muted">{new Date(p.created_at).toLocaleString('en-IN')}</p>
                  </div>
                  <span className="font-extrabold text-sm text-info">₹{Number(p.amount).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. Advance Payment Details */}
        <div className="card p-5 space-y-3 border">
          <h3 className="font-extrabold text-base border-b pb-2">🧾 3. Advance Payment Details</h3>
          {advPays.length === 0 ? (
            <p className="text-xs text-text-muted italic">No advance payments requested for this order.</p>
          ) : (
            <div className="space-y-2">
              {advPays.map((p) => (
                <div key={p.id} className="p-3 rounded-[10px] bg-slate-50 border flex justify-between items-center text-xs">
                  <div>
                    <p className="font-bold">Request ID: {p.id.slice(0, 8)} ({p.advance_mode?.toUpperCase()})</p>
                    <p className="text-text-muted">Status: {p.status} · Date: {new Date(p.created_at).toLocaleString('en-IN')}</p>
                  </div>
                  <span className="font-extrabold text-sm text-success">₹{Number(p.amount).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. Vehicle Transport Details */}
        <div className="card p-5 space-y-3 border">
          <h3 className="font-extrabold text-base border-b pb-2">🚛 4. Vehicle Transport Details</h3>
          {readOnlyVehicles.length === 0 ? (
            <p className="text-xs text-text-muted italic">No vehicle bookings associated with this bill.</p>
          ) : (
            <div className="space-y-2">
              {readOnlyVehicles.map((v, i) => (
                <div key={v.id || i} className="p-3 rounded-[10px] bg-slate-50 border text-xs space-y-1">
                  <div className="flex justify-between items-center font-bold">
                    <span>Vehicle {i + 1}: {v.vehicle_no || 'No Vehicle No'}</span>
                    <span>Charges: ₹{Number(v.transport_charges || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <p className="text-text-muted">Driver: {v.driver_name || 'N/A'} (Phone: {v.driver_phone || 'N/A'})</p>
                  <p className="text-text-muted">Assigned Tanks: {(v.selected_tanks || []).join(', ') || 'None'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 5. Seed Van Plan */}
        {vanPlan && (
          <div className="card p-5 space-y-4 border" style={{ borderColor: 'var(--color-primary)' }}>
            <h3 className="font-extrabold text-base border-b pb-2">🚐 5. Seed Van Plan</h3>
            <div className="p-4 rounded-[14px] bg-slate-100 space-y-3 text-xs">
              <div className="flex justify-center">
                <span className="px-6 py-1 rounded-full text-xs font-black bg-slate-800 text-white uppercase">
                  🚛 CABIN
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center font-bold">
                <span>L (Left Side)</span>
                <span>R (Right Side)</span>
              </div>
              <div className="space-y-2">
                {vanPlan.rows?.map((r) => (
                  <div key={r.rowNum} className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded bg-white border font-semibold">
                      Left {r.rowNum}: {r.left?.tankName || '—'} ({Number(r.left?.count || 0).toLocaleString('en-IN')} pcs)
                    </div>
                    <div className="p-2 rounded bg-white border font-semibold">
                      Right {r.rowNum}: {r.right?.tankName || '—'} ({Number(r.right?.count || 0).toLocaleString('en-IN')} pcs)
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-2 text-right">
                <span className="font-black text-sm text-emerald-700">
                  Van Total: {Number(vanPlan.grandTotal || 0).toLocaleString('en-IN')} pcs
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 6. Seed Stocking Details */}
        {stockingData && (
          <div className="card p-5 space-y-4 border">
            <h3 className="font-extrabold text-base border-b pb-2">🌱 6. Seed Stocking Details</h3>
            <div className="space-y-2 text-xs">
              <p className="font-bold text-slate-700">Tank Stocking Statuses:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {aggregateTankStates(stockingData.tankStates, stockingData.transfers).map((t) => (
                  <div key={t.tankName} className="p-2.5 rounded-[8px] bg-slate-50 border flex justify-between items-center">
                    <span className="font-bold text-slate-800">{t.tankName}</span>
                    <span className="capitalize font-semibold text-slate-700">
                      {t.totalCount.toLocaleString('en-IN')} pcs ({t.status})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 7. Outside Workers Record */}
        {workersData && (
          <div className="card p-5 space-y-4 border">
            <h3 className="font-extrabold text-base border-b pb-2">👷 7. Outside Workers Record</h3>
            {workersData.batches && workersData.batches.length > 0 ? (
              <div className="space-y-4">
                {workersData.batches.map((batch, idx) => (
                  <div key={batch.batchId || idx} className="p-4 rounded-[12px] bg-slate-50 border space-y-3">
                    <div className="flex justify-between items-start border-b pb-2">
                      <h4 className="font-extrabold text-primary text-sm">Batch {idx + 1}</h4>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-500">Supplier: {batch.supplierName || 'N/A'}</span>
                        {batch.selectedTanks && batch.selectedTanks.length > 0 && (
                          <p className="text-xs font-bold text-slate-500 mt-1">
                            Tanks: {batch.selectedTanks.map(t => `${t.vehicleNumber} - ${t.tankName}`).join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-[10px] border text-xs">
                      <table className="w-full text-left border-collapse bg-white">
                        <thead>
                          <tr className="bg-slate-800 text-white">
                            <th className="p-2 font-bold">Category</th>
                            <th className="p-2 font-bold">Qty</th>
                            <th className="p-2 font-bold">Amount</th>
                            <th className="p-2 font-bold text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batch.workers?.filter(w => Number(w.quantity) > 0 || Number(w.amount) > 0).map((w) => (
                            <tr key={w.sNo} className="border-b">
                              <td className="p-2 font-semibold">{w.category}</td>
                              <td className="p-2">{w.quantity || 0}</td>
                              <td className="p-2">₹{Number(w.amount || 0).toLocaleString('en-IN')}</td>
                              <td className="p-2 text-right font-bold text-primary">₹{Number(w.total || 0).toLocaleString('en-IN')}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50">
                            <td colSpan={3} className="p-2 text-right font-bold">Batch Total:</td>
                            <td className="p-2 text-right font-extrabold text-success">
                              ₹{Number(batch.grandTotal || 0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {batch.remarks && (
                      <div className="text-xs">
                        <p className="font-bold text-text-muted">Remarks:</p>
                        <p className="p-2 rounded-[8px] bg-white border italic">{batch.remarks}</p>
                      </div>
                    )}
                    {batch.supervisorSignature && (
                      <div className="pt-2">
                        <p className="text-[10px] font-bold text-text-muted mb-1">Mestri / Supervisor Signature:</p>
                        <img
                          src={batch.supervisorSignature}
                          alt="Supervisor Signature Workers"
                          className="h-16 border rounded-[8px] bg-white p-1 max-w-xs"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-[10px] border text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="p-2 font-bold">Category</th>
                        <th className="p-2 font-bold">Qty</th>
                        <th className="p-2 font-bold">Amount</th>
                        <th className="p-2 font-bold text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workersData.workers?.map((w) => (
                        <tr key={w.sNo} className="border-b">
                          <td className="p-2 font-semibold">{w.category}</td>
                          <td className="p-2">{w.quantity || 0}</td>
                          <td className="p-2">₹{Number(w.amount || 0).toLocaleString('en-IN')}</td>
                          <td className="p-2 text-right font-bold text-primary">₹{Number(w.total || 0).toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {workersData.remarks && (
                  <div className="text-xs">
                    <p className="font-bold text-text-muted">Remarks:</p>
                    <p className="p-3 rounded-[8px] bg-slate-50 border italic">{workersData.remarks}</p>
                  </div>
                )}
                {workersData.supervisorSignature && (
                  <div className="pt-2">
                    <p className="text-xs font-bold text-text-muted mb-1">Supervisor Signature (Outside Workers):</p>
                    <img
                      src={workersData.supervisorSignature}
                      alt="Supervisor Signature Workers"
                      className="h-20 border rounded-[8px] bg-white p-1 max-w-xs"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Activity Timeline */}
        <ActivityTimeline timeline={readOnlyBill.timeline} />

        {/* Proceed to Seed Stocking Button if not yet stocked */}
        {!isCompleted && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => onProceedToSeedStocking?.(readOnlyBill)}
              className="btn-success w-full font-extrabold text-base py-3.5 shadow-lg flex items-center justify-center gap-2"
            >
              <span>Go to Seed Stock</span>
              <span>➔</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── 3. Add New Seed Order Form Screen ──
  if (mode === 'form') {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMode('list')}
            className="btn-ghost text-xs font-bold flex items-center gap-1"
            style={{ color: '#000' }}
          >
            <span style={{ color: '#000' }}>←</span> <span style={{ color: '#000' }}>Back to Past Orders List</span>
          </button>
          <span className="text-xs font-bold text-text-muted">Create Seed Order</span>
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="font-bold text-lg">Seed Order Details</h3>

          {/* Sections — multi-select */}
          <div>
            <label className="field-label">Section (select multiple)</label>
            <div className="flex flex-wrap gap-2">
              {sections.map((s) => {
                const active = selectedSectionIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSection(s.id)}
                    className="px-3 py-1.5 rounded-full text-sm font-semibold border transition"
                    style={
                      active
                        ? { background: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                        : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                    }
                  >
                    Section {s.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tanks */}
          <div>
            <label className="field-label">
              Tank{selectedSectionIds.length ? ' — empty tanks' : ''}
            </label>
            {emptyTanks.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {selectedSectionIds.length
                  ? 'No empty tanks in the selected sections.'
                  : 'Select sections to list their empty tanks.'}
              </p>
            ) : (
              <div className="space-y-2">
                {emptyTanks.map((t) => {
                  const selected = selectedTankIds.includes(t.id);
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-[12px] px-3 py-2 border"
                      style={{
                        borderColor: selected ? 'var(--color-success)' : 'var(--color-border)',
                        background: selected ? 'var(--color-success-bg)' : 'var(--color-surface)',
                      }}
                    >
                      <span className="text-sm font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {t.name}
                        <span className="text-[11px] font-normal" style={{ color: 'var(--color-text-muted)' }}>
                          {' '}· {Number(t.area_acres || 0).toFixed(2)} ac
                        </span>
                      </span>
                      <input
                        type="number"
                        placeholder="Qty"
                        className="field py-1.5 w-28"
                        value={tankQtys[t.id] ?? ''}
                        onChange={(e) =>
                          setTankQtys((p) => ({ ...p, [t.id]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        onClick={() => selectTank(t.id)}
                        className="btn-success px-3 py-1.5 text-xs font-bold"
                      >
                        {selected ? '✓ Selected' : 'Select'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Seed type + PL size */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Seed Type</label>
              <input className="field" value={seedType} onChange={(e) => setSeedType(e.target.value)} placeholder="e.g. Vannamei PL" />
            </div>
            <div>
              <label className="field-label">PL Size</label>
              <input
                type="number"
                className="field"
                value={plSize}
                onChange={(e) => setPlSize(e.target.value)}
                placeholder="Count at stocking"
              />
            </div>
          </div>

          {/* Hatchery Name */}
          <div>
            <label className="field-label">Source Hatchery Name</label>
            <input
              className="field"
              value={hatchery}
              onChange={(e) => setHatchery(e.target.value)}
              placeholder="Source hatchery name"
            />
          </div>

          {/* Overall quantity & Per Piece Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Overall Quantity</label>
              <input
                readOnly
                className="field font-bold"
                style={{ background: 'var(--color-surface-dark)', color: 'var(--color-primary)' }}
                value={overallQuantity ? overallQuantity.toLocaleString('en-IN') : ''}
                placeholder="Σ selected tanks"
              />
            </div>
            <div>
              <label className="field-label">Per Piece Price (₹)</label>
              <input
                type="number"
                className="field"
                value={perPiecePrice}
                onChange={(e) => setPerPiecePrice(e.target.value)}
                placeholder="e.g. 1.10"
              />
            </div>
          </div>

          {/* Overall price */}
          <div>
            <label className="field-label">Overall Price (₹)</label>
            <input
              readOnly
              className="field font-extrabold"
              style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}
              value={overallPrice ? overallPrice.toLocaleString('en-IN') : ''}
              placeholder="per piece × overall quantity"
            />
          </div>

          <button
            type="button"
            onClick={proceedToPay}
            disabled={!formReady || proceeding}
            className="btn-success w-full font-bold text-base py-3"
          >
            {proceeding ? 'Generating bill…' : 'Proceed to Pay (Generate Bill)'}
          </button>
          {!formReady && (
            <p className="text-xs text-text-muted text-center">
              Select tank(s), enter seed type &amp; per piece price to continue.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── 4. Vehicle Booking Screen Step ──
  if (mode === 'vehicle') {
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <VehicleBooking
          siteId={siteId}
          billId={bill?.id}
          tanks={emptyTanks.filter((t) => selectedTankIds.includes(t.id))}
          onBack={() => setMode('pay')}
          onCompleteVehicleBooking={() => setMode('vehicle-payments')}
        />
      </div>
    );
  }

  // ── 4b. Vehicle Payments Screen Step ──
  if (mode === 'vehicle-payments') {
    return (
      <VehiclePaymentsScreen
        siteId={siteId}
        bill={bill}
        user={user}
        toast={toast}
        onBack={() => setMode('vehicle')}
        onProceedToSeedStocking={onProceedToSeedStocking}
        loadBills={loadBills}
      />
    );
  }

  // ── 5. Payment Workflow Screen ('pay') ──
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMode('form')}
          className="btn-ghost text-xs font-bold flex items-center gap-1"
          style={{ color: '#000' }}
        >
          <span style={{ color: '#000' }}>←</span> <span style={{ color: '#000' }}>Back to Seed Order Details</span>
        </button>
        {bill && (
          <span className="text-xs font-extrabold px-3 py-1 rounded-full text-white" style={{ background: 'var(--color-primary)' }}>
            Bill: {bill.bill_number}
          </span>
        )}
      </div>

      {bill && (
        <div
          className="rounded-[16px] px-5 py-4 flex items-center justify-between shadow-lg"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
          }}
        >
          <div className="space-y-1">
            <p className="text-xs font-semibold text-white/80">Active Seed Order Bill</p>
            <p className="text-2xl font-extrabold tracking-wide text-white">{bill.bill_number}</p>
            <p className="text-xs text-white/90">
              {bill.hatchery || 'Hatchery Not Specified'} · {bill.seed_type || 'Seed'} · {Number(bill.overall_quantity || 0).toLocaleString('en-IN')} pcs
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/70">Bill Amount</p>
            <p className="text-2xl font-extrabold text-white">
              ₹{Number(bill.seed_total || overallPrice).toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      )}

      {/* Payment workflow: Cash Payment toggle -> Hatchery Details -> Advance Payment toggle */}
      <RequestPayment
        type="seed"
        siteId={siteId}
        billId={bill?.id}
        totalOrderPrice={Number(bill?.seed_total || overallPrice || 0)}
        prefillAmount={null} // Keep input empty per Requirement #3
        onPaid={onPaid}
        supplierSection={hatcherySlot}
        selectedHatchery={selectedHatchery}
        selectedHatcheryBankAccount={selectedBankAccount}
        onHatcheryBankAccountAdded={(acct) => bankAccountAddedRef.current?.(acct)}
      />

      {/* Proceed to Vehicle Booking Button */}
      <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="btn-ghost text-sm font-bold flex items-center gap-1"
        >
          <span>↑</span> Back to Top
        </button>
        <button
          type="button"
          onClick={() => setMode('vehicle')}
          className="btn-primary text-base px-8 py-3 flex items-center gap-2 font-extrabold shadow-lg"
        >
          <span>Proceed to Vehicle Booking</span>
          <span>➔</span>
        </button>
      </div>
    </div>
  );
}

function VehiclePaymentsScreen({ siteId, bill, user, toast, onBack, onProceedToSeedStocking, loadBills }) {
  const [vehicles, setVehicles] = useState([]);
  const [driverAmounts, setDriverAmounts] = useState({});
  const [driverPayments, setDriverPayments] = useState([]);
  const [submittingDriver, setSubmittingDriver] = useState(null);

  useEffect(() => {
    if (!bill?.id) return;
    loadVehicleData();
  }, [bill?.id]);

  async function loadVehicleData() {
    setLoading(true);
    let loadedVehicles = [];
    const { data: vData } = await supabase
      .from(TABLES.vehicleBookings)
      .select('*')
      .eq('bill_id', bill.id);
      
    if (vData && vData.length > 0) {
      loadedVehicles = vData;
    } else if (bill?.vehicle_booking_data?.vehicles?.length > 0) {
      loadedVehicles = bill.vehicle_booking_data.vehicles.map(v => ({
        ...v,
        id: v.id,
        driver_name: v.driverName || v.driver_name,
        vehicle_no: v.vehicleNo || v.vehicle_no,
        transport_charges: v.transportCharges || v.transport_charges,
        tank_ids: v.selectedTanks || v.tank_ids || [],
        spread: !!v.spread
      }));
    }
    
    setVehicles(loadedVehicles);

    const { data: pData } = await supabase
      .from(TABLES.payments)
      .select('*')
      .eq('bill_id', bill.id)
      .eq('type', 'vehicle');
    setDriverPayments(pData ?? []);
  }

  const overallTransportCharges = useMemo(() => {
    return vehicles.reduce((sum, v) => sum + (Number(v.transport_charges) || 0), 0);
  }, [vehicles]);

  const totalDriverPaid = useMemo(() => {
    return driverPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [driverPayments]);

  const remainingTransportBalance = useMemo(() => {
    return Math.max(0, overallTransportCharges - totalDriverPaid);
  }, [overallTransportCharges, totalDriverPaid]);

  async function handleSubmitDriverPayment(vehicle) {
    const entered = Number(driverAmounts[vehicle.id]) || 0;
    if (entered <= 0) return toast.error('Enter a valid payment amount for driver');

    const reqCharge = Number(vehicle.transport_charges) || 0;
    const existingDriverPaid = driverPayments
      .filter((p) => p.vehicle_booking_id === vehicle.id || p.driver_name === vehicle.driver_name)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const driverRemaining = Math.max(0, reqCharge - (existingDriverPaid + entered));

    setSubmittingDriver(vehicle.id);
    const payload = {
      site_id: siteId,
      bill_id: bill.id,
      type: 'vehicle',
      method: 'cash',
      amount: entered,
      remaining_balance: driverRemaining,
      driver_name: vehicle.driver_name,
      vehicle_no: vehicle.vehicle_no,
      vehicle_booking_id: vehicle.id,
      status: 'requested',
      created_by: user?.id,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from(TABLES.payments).insert(payload).select();
    setSubmittingDriver(null);

    if (error) {
      return toast.error(error.message);
    }

    const inserted = (Array.isArray(data) ? data[0] : data) || payload;
    setDriverPayments((prev) => [inserted, ...prev]);
    setDriverAmounts((prev) => ({ ...prev, [vehicle.id]: '' }));
    toast.success(`Transport payment request submitted for driver ${vehicle.driver_name || 'N/A'}!`);
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="btn-ghost text-xs font-bold flex items-center gap-1"
          style={{ color: '#000' }}
        >
          <span style={{ color: '#000' }}>←</span> <span style={{ color: '#000' }}>Back to Vehicle Booking</span>
        </button>
        {bill && (
          <span className="text-xs font-extrabold px-3 py-1 rounded-full text-white" style={{ background: 'var(--color-primary)' }}>
            Bill: {bill.bill_number}
          </span>
        )}
      </div>

      {/* Banner */}
      <div
        className="rounded-[16px] px-5 py-4 flex items-center justify-between shadow-lg text-white"
        style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)' }}
      >
        <div className="space-y-1">
          <p className="text-xs font-semibold text-white/80">Vehicle Transport Payments</p>
          <p className="text-xl font-extrabold tracking-wide">{bill?.bill_number || 'No Bill'}</p>
          <p className="text-xs text-white/90">Submit driver transport payment requests to the Payments module</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/80">Overall Transport Charges</p>
          <p className="text-2xl font-black">₹{overallTransportCharges.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Driver Payment Input List (Requirement #13) */}
      <div className="card p-5 space-y-4 border" style={{ borderColor: 'var(--color-border)' }}>
        <h3 className="font-extrabold text-base border-b pb-2 flex items-center justify-between">
          <span>🚛 Vehicle &amp; Driver Transport Payments</span>
          <span className="text-xs text-primary font-bold">Total Vehicles: {vehicles.length}</span>
        </h3>

        {vehicles.length === 0 ? (
          <p className="text-xs text-text-muted italic">No vehicle bookings found for this bill.</p>
        ) : (
          <div className="space-y-4">
            {vehicles.map((v, i) => {
              const reqCharge = Number(v.transport_charges) || 0;
              const driverPaid = driverPayments
                .filter((p) => p.vehicle_booking_id === v.id || p.driver_name === v.driver_name)
                .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
              const currentInput = Number(driverAmounts[v.id]) || 0;
              const remainingForDriver = Math.max(0, reqCharge - (driverPaid + currentInput));

              return (
                <div key={v.id || i} className="p-4 rounded-[12px] bg-slate-50 border space-y-3" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-extrabold text-sm text-primary">
                        Vehicle {i + 1}: {v.vehicle_no || 'No Vehicle Number'}
                      </p>
                      <p className="text-xs text-text-secondary">
                        Driver: <strong>{v.driver_name || 'N/A'}</strong>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-text-muted">Transport Charge</p>
                      <p className="text-base font-extrabold text-slate-800">₹{reqCharge.toLocaleString('en-IN')}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="field-label text-xs">Payment Amount for Driver (₹)</label>
                      <input
                        type="number"
                        className="field text-sm"
                        placeholder="Enter amount (₹)"
                        value={driverAmounts[v.id] ?? ''}
                        onChange={(e) => setDriverAmounts((prev) => ({ ...prev, [v.id]: e.target.value }))}
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => handleSubmitDriverPayment(v)}
                        disabled={submittingDriver === v.id || currentInput <= 0}
                        className="btn-primary w-full text-xs font-extrabold py-2.5 shadow"
                      >
                        {submittingDriver === v.id ? 'Submitting…' : 'Submit Driver Request'}
                      </button>
                    </div>
                  </div>

                  {/* Remaining Balance display for this driver */}
                  {currentInput > 0 && (
                    <div className="p-2.5 rounded-[8px] bg-sky-50 border border-sky-200 text-xs flex justify-between items-center">
                      <span className="font-bold text-sky-900">Remaining Balance for {v.driver_name || `Driver ${i + 1}`}:</span>
                      <span className="font-extrabold text-sky-950">₹{remainingForDriver.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Remaining Transport Balance Summary (Requirement #13) */}
        <div className="p-4 rounded-[12px] bg-amber-50 border border-amber-300 flex items-center justify-between text-sm font-extrabold">
          <span className="text-amber-900">Remaining Transport Balance:</span>
          <span className="text-lg text-amber-950">₹{remainingTransportBalance.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* Complete & Go to Seed Stocking Button */}
      <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <button
          type="button"
          onClick={async () => {
            if (bill?.id) {
              await autosaveBillStep(
                supabase, TABLES, bill.id,
                { status: 'Pending Seed Stocking' },
                'Vehicle Payments Step Completed',
                user?.email
              );
              await loadBills();
            }
            toast.success(`Bill ${bill?.bill_number} is now Pending Seed Stocking.`);
            onProceedToSeedStocking?.(bill);
          }}
          className="btn-success w-full text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2"
        >
          <span>Complete &amp; Go to Seed Stocking</span>
          <span>➔</span>
        </button>
      </div>
    </div>
  );
}