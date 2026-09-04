import React, { useState, useEffect, useRef } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useAuth } from '../../../../hooks/useAuth';
import { useToast } from '../../../../hooks/useToast';
import { autosaveBillStep } from '../../../../lib/bills';
import SeedVanPlanStep1 from './SeedVanPlanStep1';
import StockingStatusStep2 from './StockingStatusStep2';
import OutsideWorkersStep3 from './OutsideWorkersStep3';
import SignaturePad from './SignaturePad';
import { useSeedBill } from '../SeedBillContext';
import PackingPage from '../packing/PackingPage';
import PackingOutsideWorkers from '../packing/PackingOutsideWorkers';
import MixedAllocation from './MixedAllocation';
import { useMixedAllocationState } from './useMixedAllocationState';

export default function SeedStocking({ siteId, stockingOrder = null, onStockingCompleted = null }) {
  const { user } = useAuth();
  const toast = useToast();
  
  const {
    activeBill, setActiveBill,
    seedMode, setSeedMode,
    emptyTanks, newlyAddedTanks,
    orderForm,
    addNewlyAddedTank,
    updateBill
  } = useSeedBill();

  const activeOrder = stockingOrder || activeBill || null;

  // Vehicle states for Packing
  const [vehicles, setVehicles] = useState(() => {
    return activeOrder?.vehicle_booking_data?.vehicles || [];
  });
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [loadingVehicles, setLoadingVehicles] = useState(false);

  // Authoritative Mixed Allocation State
  const mixedState = useMixedAllocationState(activeOrder, vehicles);
  const {
    isMixed,
    isPackingDone,
    isVanPlanDone,
    isMixedComplete,
    packingMaxEditable,
    getSeedVanMaxEditable
  } = mixedState;

  // For non-mixed modes, we need to fallback to form values if they exist, or raw tank qtys
  const getEffectivePackingQtys = () => {
    if (!isMixed) return orderForm?.tankQtys;
    return packingMaxEditable;
  };

  const getEffectiveVanPlanQtys = (vehicleId) => {
    if (!isMixed) return null;
    return getSeedVanMaxEditable(vehicleId);
  };

  const [pendingOrders, setPendingOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // Workflow Step State: 1 | 2 | 3 | 'completed'
  const [step, setStep] = useState(1);


  const [step1Data, setStep1Data] = useState(() => activeOrder?.van_plan || null);
  const [step2Data, setStep2Data] = useState(() => activeOrder?.stocking_status_data || null);

  useEffect(() => {
    if (activeOrder) {
      setStep1Data(activeOrder.van_plan || null);
      setStep2Data(activeOrder.stocking_status_data || null);
    }
  }, [activeOrder?.id]);
  
  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId) || null;
  
  // Supervisor and Completed states
  const [commonSupervisorName, setCommonSupervisorName] = useState('');
  const [commonSupervisorPhone, setCommonSupervisorPhone] = useState('');
  const [commonSupervisorSignature, setCommonSupervisorSignature] = useState('');
  const [isSupervisorSaved, setIsSupervisorSaved] = useState(false);
  const [completedBillData, setCompletedBillData] = useState(null);
  const [exporting, setExporting] = useState(false);
  
  const completedSummaryRef = React.useRef(null);
  
  const handleDownloadPDF = () => { toast.info('PDF download not yet implemented'); };
  const handleDownloadImage = () => { toast.info('Image download not yet implemented'); };
  const handlePrint = () => { window.print(); };



  // Load vehicles based on activeOrder (or activeBill if activeOrder is null)
  const currentOrderId = activeOrder?.id || activeBill?.id;
  useEffect(() => {
    if (currentOrderId) {
      setLoadingVehicles(true);
      supabase.from(TABLES.vehicleBookings).select('*').eq('bill_id', currentOrderId)
        .then(({ data }) => {
          let loadedVehicles = data || [];
          // Fallback to JSON column if table is empty (e.g. after refresh if sync failed or delayed)
          if (loadedVehicles.length === 0 && activeOrder?.vehicle_booking_data?.vehicles) {
            loadedVehicles = activeOrder.vehicle_booking_data.vehicles;
          }
          setVehicles(loadedVehicles);
          if (!selectedVehicleId && loadedVehicles.length > 0) {
            setSelectedVehicleId('');
          }
          setLoadingVehicles(false);
        });
    }
  }, [currentOrderId, activeOrder?.updated_at]);

  useEffect(() => {
    if (!siteId) return;
    loadPendingStockingOrders();
  }, [siteId]);

  async function loadPendingStockingOrders() {
    setLoading(true);
    try {
      // Load bills that are ready for stocking OR in-progress — exclude only fully completed ones
      const { data } = await supabase
        .from(TABLES.bills)
        .select('*')
        .eq('site_id', siteId)
        .eq('type', 'seed')
        .in('status', [
          'Pending Seed Stocking',
          'Seed Stocking In Progress',
          'Awaiting Remaining Tanks',
        ])
        .order('created_at', { ascending: false });
      const loaded = data ?? [];
      setPendingOrders(loaded);
      // Auto-loading of pending orders has been explicitly removed.
      // The workflow now relies strictly on the order passed from Past Orders.
    } catch (err) {
      console.error('loadPendingStockingOrders error:', err);
    } finally {
      setLoading(false);
    }
  }

  function getVehicleData(data, vId) {
    if (!data || !vId) return null;
    if (data[vId]) return data[vId];
    if ((data.drums || data.rows || data.tankStates) && vehicles[0]?.id === vId) {
      return data;
    }
    return null;
  }

  async function handleStep1Next(vehicleId, data) {
    if (!vehicleId) return toast.error('Please select a vehicle first.');
    const newData = { ...(step1Data || {}), [vehicleId]: data };
    setStep1Data(newData);
    
    if (activeOrder?.id) {
      await autosaveBillStep(
        supabase, TABLES, activeOrder.id,
        { van_plan: newData, status: 'Seed Stocking In Progress', current_stage: isMixed ? 'mixed-allocation' : 'stocking-status' },
        'Seed Van Plan Saved',
        user?.email
      );
    }
    toast.success('Seed Van Plan saved for selected vehicle.');

    // Automatically select the next unsaved vehicle to improve workflow
    const nextUnsaved = vehicles.find(v => !newData[v.id]);
    if (nextUnsaved) {
      setSelectedVehicleId(nextUnsaved.id);
    }
  }

  async function handleStep2Next(vehicleId, data) {
    const vehicleData = { ...data };
    const newData = { ...(step2Data || {}), [vehicleId]: vehicleData };
    setStep2Data(newData);
    
    if (activeOrder?.id) {
      await autosaveBillStep(
        supabase, TABLES, activeOrder.id,
        { stocking_status_data: newData, status: 'Seed Stocking In Progress', current_stage: isMixed ? 'mixed-allocation' : 'outside-workers' },
        'Stocking Status Saved',
        user?.email
      );
    }
    toast.success('Stocking Status saved for selected vehicle.');
  }

  async function handleFinalComplete(step3Data) {
    if (!activeOrder) return;
    
    // Safety check: Do not allow a Mixed order to become Completed earlier.
    const { isMixed, isMixedComplete } = mixedState;
    if (isMixed && !isMixedComplete) {
      toast.error('Cannot complete order: Both workflows must be completed first.');
      return;
    }

    const payload = {
      site_id: siteId,
      bill_id: activeOrder.id,
      van_plan: step1Data,
      stocking_status_data: step2Data,
      outside_workers_data: step3Data,
      created_by: user?.id,
      created_at: new Date().toISOString(),
    };

    let newStatus = 'Completed';
    let newStockingStatus = 'completed';

    // 1. Update the EXISTING bill with all Seed Stocking data (Single Bill Model)
    const stockingUpdatePayload = {
      stocking_status: newStockingStatus,
      status: newStatus,
      van_plan: step1Data,
      stocking_status_data: step2Data,
      outside_workers_data: step3Data,
      updated_at: new Date().toISOString(),
    };

    const { error: bErr } = await supabase
      .from(TABLES.bills)
      .update(stockingUpdatePayload)
      .eq('id', activeOrder.id);

    if (bErr) {
      toast.error(bErr.message);
      throw bErr; // rethrow so OutsideWorkersStep3 catches it and resets submitting
    }

    // 2. Save stocking record in seedEntries
    await supabase.from(TABLES.seedEntries).insert({
      site_id: siteId,
      bill_id: activeOrder.id,
      date: new Date().toISOString().slice(0, 10),
      seed_type: activeOrder.seed_type || 'Vannamei',
      quantity: step1Data?.grandTotal || Number(activeOrder.overall_quantity || 0),
      pl_size: Number(activeOrder.pl_size) || null,
      hatchery: activeOrder.hatchery,
      source: 'stocked',
      notes: JSON.stringify(payload),
    });

    // 3. Update tanks with stocked seed counts
    if (step2Data?.tankStates) {
      const { data: siteTanks } = await supabase
        .from(TABLES.tanks)
        .select('id, name')
        .eq('site_id', siteId);

      for (const [tankName, tState] of Object.entries(step2Data.tankStates)) {
        if (tState.status === 'completed' && tState.currentCount > 0) {
          const matchedTank = siteTanks?.find(
            (t) => String(t.name).trim().toLowerCase() === String(tankName).trim().toLowerCase()
          );
          if (matchedTank?.id) {
            await supabase.from(TABLES.tanks).update({
              quantity: tState.currentCount,
              seed_type: activeOrder.seed_type || 'Vannamei',
              hatchery: activeOrder.hatchery || null,
              start_date: new Date().toISOString().slice(0, 10),
              updated_at: new Date().toISOString(),
            }).eq('id', matchedTank.id);
          }
        }
      }
    }

    // 4. Record timeline milestones
    await autosaveBillStep(
      supabase,
      TABLES,
      activeOrder.id,
      {
        stocking_status: newStockingStatus,
        status: newStatus,
        van_plan: step1Data,
        stocking_status_data: step2Data,
        outside_workers_data: step3Data,
      },
      'Outside Workers Submitted',
      user?.email
    );

    const finalBill = await autosaveBillStep(
      supabase,
      TABLES,
      activeOrder.id,
      { status: newStatus, completion_timestamp: newStatus === 'Completed' ? new Date().toISOString() : undefined },
      'Seed Van Plan Step Completed',
      user?.email
    );

    // 5. All saves done — notify parent to redirect to History

    toast.success(`✅ Bill ${activeOrder.bill_number} completed! Redirecting to History…`);
    onStockingCompleted?.(finalBill || activeOrder);
  }

  async function handleSupervisorSave() {
    console.log("SUPERVISOR SAVE CLICKED");
    if (!commonSupervisorName.trim() || !commonSupervisorSignature) {
      return toast.error("Please provide Supervisor Name and Signature.");
    }
    if (activeOrder?.id) {
      try {
        const payload = { 
          stocking_status_data: { 
            ...(step2Data || {}), 
            supervisorName: commonSupervisorName, 
            supervisorPhone: commonSupervisorPhone, 
            supervisorSignature: commonSupervisorSignature, 
            seedVanCompleted: true 
          } 
        };
        console.log("SUPERVISOR SAVE PAYLOAD", payload);
        
        const updated = await updateBill(
          payload,
          'Supervisor details saved',
          user?.email
        );
        
        if (updated) {
          setStep2Data(updated.stocking_status_data);
        }
        
        console.log("SUPERVISOR SAVE SUCCESS");
        toast.success('Supervisor details saved.');
        
        if (isMixed) {
          setSeedMode('mixed-allocation');
        } else {
          setIsSupervisorSaved(true);
        }
      } catch (error) {
        console.error("SUPERVISOR SAVE ERROR", error);
        toast.error("Error saving supervisor details. Check console.");
      }
    }
  }


  // --- EARLY RETURNS FOR STANDALONE MODES ---
  if (seedMode === 'outside-workers-packing') {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <PackingOutsideWorkers
          initialSupervisorName={commonSupervisorName}
          onComplete={async (payload) => {
            if (activeOrder?.id) {
              const newStatus = 'Completed';
              await autosaveBillStep(
                supabase, TABLES, activeOrder.id,
                { packing_outside_workers_data: payload, status: newStatus, completion_timestamp: new Date().toISOString() },
                'Packing Outside Workers Completed',
                user?.email
              );
            }
            toast.success('Packing Outside Workers Completed!');
            if (onStockingCompleted) onStockingCompleted(activeOrder);
            setSeedMode('history');
          }}
          onBack={() => setSeedMode('packing')}
          activeOrder={activeOrder}
          siteId={siteId}
          workSource="Packing"
        />
      </div>
    );
  }

  // --- MAIN SEED STOCKING LAYOUT ---

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* GLOBAL BACK BUTTON (Always at the very top) */}
      {seedMode !== 'packing' && seedMode !== 'outside-workers-packing' && seedMode !== 'mixed-allocation' && (
        <div>
        <button
          type="button"
          onClick={() => {
            if (step === 3) setStep(2);
            else if (step === 2) setStep(1);
            else setSeedMode('vehicle-payments');
          }}
          className="flex items-center gap-1.5 text-sm font-bold"
          style={{ color: '#000', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <span style={{ color: '#000', fontSize: '1.1rem' }}>←</span>
          <span style={{ color: '#000' }}>Back</span>
        </button>
      </div>
      )}

      {/* SEED STOCKING WRAPPER (Header, Tabs, Dropdown) */}
      <div className="card p-4 shadow-sm border" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold flex items-center gap-2">
              <span>🌱</span> Seed Stocking Module
            </h2>
            <p className="text-xs text-text-secondary">
              {step === 'completed_summary'
                ? `Completed Bill: ${completedBillData?.bill_number || activeOrder?.bill_number}`
                : activeOrder
                ? `Order: ${activeOrder.bill_number} · ${activeOrder.hatchery || 'Hatchery N/A'}`
                : 'Select a pending order to start'}
            </p>
          </div>

          {step !== 'completed_summary' && seedMode !== 'mixed-allocation' && !mixedState.isMixed && (
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'packing', label: 'Packing' },
                { id: 'van-plan', label: 'Seed Van Plan' },
                { id: 'outside-workers', label: 'Outside Workers' },
              ].map((tab) => {
                let active = false;
                if (tab.id === 'packing' && seedMode === 'packing') active = true;
                else if (tab.id === 'van-plan' && seedMode !== 'packing' && step !== 3) active = true;
                else if (tab.id === 'outside-workers' && (seedMode === 'outside-workers' || step === 3) && seedMode !== 'packing') active = true;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      if (tab.id === 'packing') {
                        setSeedMode('packing');
                      } else if (tab.id === 'van-plan') {
                        setSeedMode('van-plan');
                        setStep(1);
                      } else if (tab.id === 'outside-workers') {
                        setSeedMode('outside-workers');
                        setStep(3);
                      }
                    }}
                    className="px-4 py-2 rounded-[8px] text-sm font-bold transition border"
                    style={{
                      background: active ? 'var(--color-primary)' : 'var(--color-surface)',
                      color: active ? '#fff' : 'var(--color-text-secondary)',
                      borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-text-muted p-4">Loading pending stocking orders...</p>
      ) : step === 'completed_summary' && completedBillData ? (
        /* ── Completed Bill Summary Page ── */
        <div className="space-y-6">
          <div ref={completedSummaryRef} className="space-y-6 bg-white p-2 rounded-[16px]">
            {/* Top Banner Header */}
            <div
              className="rounded-[16px] px-6 py-5 flex items-center justify-between shadow-lg text-white"
              style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}
            >
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-widest font-semibold text-emerald-100">
                  ✓ Seed Order Workflow Completed
                </span>
                <h2 className="text-3xl font-black">{completedBillData.bill_number}</h2>
                <p className="text-xs text-emerald-100">
                  Hatchery: <strong>{completedBillData.hatchery || 'N/A'}</strong> · Date: {new Date(completedBillData.updated_at || completedBillData.created_at).toLocaleString('en-IN')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-emerald-100">Total Seed Bill Price</p>
                <p className="text-3xl font-black">₹{Number(completedBillData.seed_total || 0).toLocaleString('en-IN')}</p>
              </div>
            </div>

            {/* 1. Seed Order Details */}
            <div className="card p-5 space-y-3 border">
              <h3 className="font-extrabold text-base text-primary border-b pb-2">📋 1. Seed Order Details</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-text-muted">Bill Number</p>
                  <p className="font-bold text-sm text-slate-800">{completedBillData.bill_number}</p>
                </div>
                <div>
                  <p className="text-text-muted">Hatchery Name</p>
                  <p className="font-bold text-sm text-primary">{completedBillData.hatchery || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-text-muted">Seed Type</p>
                  <p className="font-bold text-sm">{completedBillData.seed_type || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-text-muted">PL Size / Count</p>
                  <p className="font-bold text-sm">{completedBillData.pl_size || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-text-muted">Overall Quantity</p>
                  <p className="font-bold text-sm">{Number(completedBillData.overall_quantity || 0).toLocaleString('en-IN')} pcs</p>
                </div>
                <div>
                  <p className="text-text-muted">Per Piece Price</p>
                  <p className="font-bold text-sm">₹{completedBillData.per_piece_price ?? 'N/A'}</p>
                </div>
                <div>
                  <p className="text-text-muted">Total Price</p>
                  <p className="font-extrabold text-sm text-success">₹{Number(completedBillData.seed_total || 0).toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-text-muted">Workflow Status</p>
                  <p className="font-extrabold text-sm text-emerald-600 uppercase">Completed</p>
                </div>
              </div>
            </div>

            {/* 2. Cash Payment Details */}
            <div className="card p-5 space-y-3 border">
              <h3 className="font-extrabold text-base text-primary border-b pb-2">💵 2. Cash Payment Details</h3>
              {(!completedBillData.payments || completedBillData.payments.filter((p) => p.method === 'cash' && (!p.type || p.type === 'seed')).length === 0) ? (
                <p className="text-xs text-text-muted italic">No advance cash payments recorded.</p>
              ) : (
                <div className="space-y-2">
                  {completedBillData.payments.filter((p) => p.method === 'cash' && (!p.type || p.type === 'seed')).map((p) => (
                    <div key={p.id} className="p-3 rounded-[8px] bg-slate-50 border flex justify-between items-center text-xs">
                      <div>
                        <p className="font-semibold">{new Date(p.created_at).toLocaleString()}</p>
                        <p className="text-text-muted">Payment ID: {p.id.slice(0, 8)}</p>
                      </div>
                      <span className="font-extrabold text-sm text-info">₹{Number(p.amount).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Advance Payment Details */}
            <div className="card p-5 space-y-3 border">
              <h3 className="font-extrabold text-base text-primary border-b pb-2">🧾 3. Advance Payment Details</h3>
              {(!completedBillData.payments || completedBillData.payments.filter((p) => p.method === 'advance' && (!p.type || p.type === 'seed')).length === 0) ? (
                <p className="text-xs text-text-muted italic">No advance bank payments recorded.</p>
              ) : (
                <div className="space-y-2">
                  {completedBillData.payments.filter((p) => p.method === 'advance' && (!p.type || p.type === 'seed')).map((p) => (
                    <div key={p.id} className="p-3 rounded-[8px] bg-slate-50 border flex justify-between items-center text-xs">
                      <div>
                        <p className="font-semibold">{new Date(p.created_at).toLocaleString()}</p>
                        <p className="text-text-muted">Payment ID: {p.id.slice(0, 8)}</p>
                        <p className="text-text-muted">Status: {p.status}</p>
                      </div>
                      <span className="font-extrabold text-sm text-success">₹{Number(p.amount).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Vehicle Booking Details */}
            <div className="card p-5 space-y-3 border">
              <h3 className="font-extrabold text-base text-primary border-b pb-2">🚚 4. Vehicle Booking Details</h3>
              {(!completedBillData.vehicles || completedBillData.vehicles.length === 0) ? (
                <p className="text-xs text-text-muted italic">No vehicle bookings recorded for this bill.</p>
              ) : (
                <div className="space-y-3">
                  {completedBillData.vehicles.map((v, i) => (
                    <div key={v.id} className="p-3.5 rounded-[10px] bg-slate-50 border text-xs space-y-1">
                      <p className="font-extrabold text-sm text-primary">Vehicle {i + 1}: {v.vehicle_no || 'No vehicle number'}</p>
                      <p className="text-text-secondary">Driver: <strong>{v.driver_name || 'N/A'}</strong></p>
                      <p className="text-text-secondary">Transport Charges: <strong>₹{Number(v.transport_charges || 0).toLocaleString('en-IN')}</strong></p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 5. Seed Van Plan */}
            {completedBillData.van_plan && (
              <div className="card p-5 space-y-4 border" style={{ borderColor: 'var(--color-primary)' }}>
                <h3 className="font-extrabold text-base text-primary border-b pb-2">🚐 5. Seed Van Plan</h3>
                <div className="p-4 rounded-[14px] bg-slate-100 space-y-3">
                  <div className="flex justify-center">
                    <span className="px-6 py-1.5 rounded-full text-xs font-black bg-slate-800 text-white uppercase tracking-widest">
                      🚛 CABIN
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-center font-bold text-xs border-b pb-2">
                    <span className="text-primary">← L (Left Side)</span>
                    <span className="text-primary">R (Right Side) →</span>
                  </div>
                  <div className="space-y-2">
                    {completedBillData.van_plan.rows?.map((r) => (
                      <div key={r.rowNum} className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 rounded-[8px] bg-white border font-semibold">
                          <span>L-Tank {r.rowNum}: </span>
                          <strong className="text-primary">{r.left.tankName || 'N/A'}</strong> — {Number(r.left.count || 0).toLocaleString('en-IN')} pcs
                        </div>
                        <div className="p-2.5 rounded-[8px] bg-white border font-semibold">
                          <span>R-Tank {r.rowNum}: </span>
                          <strong className="text-primary">{r.right.tankName || 'N/A'}</strong> — {Number(r.right.count || 0).toLocaleString('en-IN')} pcs
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 text-right">
                    <span className="font-black text-sm text-emerald-700">
                      Van Grand Total: {Number(completedBillData.van_plan.grandTotal || 0).toLocaleString('en-IN')} pcs
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 6. Tank Details & Stocking Status */}
            {completedBillData.stocking_status_data && (
              <div className="card p-5 space-y-4 border">
                <h3 className="font-extrabold text-base text-primary border-b pb-2">🌱 6. Tank Details &amp; Stocking Status</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  {Object.values(completedBillData.stocking_status_data.tankStates || {}).map((t) => (
                    <div key={t.tankName} className="p-2.5 rounded-[8px] bg-slate-50 border flex justify-between items-center">
                      <span className="font-bold">{t.tankName}</span>
                      <span className="capitalize font-semibold text-slate-700">
                        {t.status === 'transferred'
                          ? `Transferred From Tank: ${t.tankName} ➔ To Tank: ${t.transferredTo}`
                          : `${t.currentCount.toLocaleString('en-IN')} pcs (${t.status})`}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Transfers */}
                {completedBillData.stocking_status_data.transfers && completedBillData.stocking_status_data.transfers.length > 0 && (
                  <div className="p-4 rounded-[12px] bg-sky-50 border border-sky-200 space-y-2 text-xs">
                    <p className="font-extrabold text-sky-900">🔀 Transfer Details:</p>
                    {completedBillData.stocking_status_data.transfers.map((tr) => (
                      <div key={tr.id} className="p-3 rounded-[8px] bg-white border border-sky-200 space-y-1">
                        <p className="font-bold text-sky-900">
                          🔄 Transferred From Tank: <strong>{tr.transferredFromDrum || tr.from}</strong>
                        </p>
                        <p className="text-sky-800">
                          📍 Original Tank: <strong>{tr.originalTank || tr.from}</strong> ➔ ➡️ Transferred To Tank: <strong>{tr.transferredToTank || tr.to}</strong>
                        </p>
                        <p className="text-sky-800">
                          Transferred Seed Count: {Number(tr.transferredAmount || 0).toLocaleString('en-IN')} pcs
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 7. Supervisor Details & Digital Signature */}
            {completedBillData.stocking_status_data && (
              <div className="card p-5 space-y-3 border">
                <h3 className="font-extrabold text-base text-primary border-b pb-2">✍️ 7. Supervisor Details</h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-text-muted">Supervisor Name</p>
                    <p className="font-bold text-sm text-slate-800">{completedBillData.stocking_status_data.supervisorName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-text-muted">Supervisor Phone</p>
                    <p className="font-bold text-sm text-slate-800">{completedBillData.stocking_status_data.supervisorPhone || 'N/A'}</p>
                  </div>
                </div>
                {completedBillData.stocking_status_data.supervisorSignature && (
                  <div className="pt-2">
                    <p className="text-xs font-bold text-text-muted mb-1">Supervisor Signature:</p>
                    <img
                      src={completedBillData.stocking_status_data.supervisorSignature}
                      alt="Supervisor Signature"
                      className="h-20 border rounded-[8px] bg-white p-1 max-w-xs"
                    />
                  </div>
                )}
              </div>
            )}

            {/* 8. Outside Workers Record */}
            {completedBillData.outside_workers_data && (
              <div className="card p-5 space-y-4 border">
                <h3 className="font-extrabold text-base text-primary border-b pb-2">👷 8. Outside Workers Record</h3>
                {completedBillData.outside_workers_data.batches && completedBillData.outside_workers_data.batches.length > 0 ? (
                  <div className="space-y-6">
                    {completedBillData.outside_workers_data.batches.map((batch, idx) => (
                      <div key={batch.batchId || idx} className="p-4 rounded-[12px] bg-slate-50 border space-y-4">
                        <div className="flex justify-between items-start border-b pb-2">
                          <h4 className="font-extrabold text-primary">Batch {idx + 1}</h4>
                          <div className="text-right">
                            <p className="text-xs font-bold text-slate-500">Supplier: {batch.supplierName || 'N/A'}</p>
                            {batch.selectedTanks && batch.selectedTanks.length > 0 && (
                              <p className="text-xs font-bold text-slate-500 mt-1">
                                Tanks: {batch.selectedTanks.map(t => `${t.vehicleNumber} - ${t.tankName}`).join(', ')}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="overflow-x-auto rounded-[10px] border">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-800 text-white">
                                <th className="p-2.5 font-bold">Serial Number</th>
                                <th className="p-2.5 font-bold">Category</th>
                                <th className="p-2.5 font-bold">Quantity</th>
                                <th className="p-2.5 font-bold">Amount (₹)</th>
                                <th className="p-2.5 font-bold text-right">Total (₹)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {batch.workers?.filter(w => Number(w.quantity) > 0 || Number(w.amount) > 0).map((w) => (
                                <tr key={w.sNo} className="border-b bg-white">
                                  <td className="p-2.5 font-semibold text-center">{w.sNo}</td>
                                  <td className="p-2.5 font-bold">{w.category}</td>
                                  <td className="p-2.5">{w.quantity || 0}</td>
                                  <td className="p-2.5">₹{Number(w.amount || 0).toLocaleString('en-IN')}</td>
                                  <td className="p-2.5 text-right font-extrabold text-primary">₹{Number(w.total || 0).toLocaleString('en-IN')}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-slate-100 font-extrabold">
                                <td colSpan={4} className="p-2.5 text-right">Batch Total:</td>
                                <td className="p-2.5 text-right text-success text-sm">
                                  ₹{Number(batch.grandTotal || 0).toLocaleString('en-IN')}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                        {batch.remarks && (
                          <div className="text-xs">
                            <p className="font-bold text-text-muted">Remarks:</p>
                            <p className="p-3 rounded-[8px] bg-white border italic">{batch.remarks}</p>
                          </div>
                        )}
                        {batch.supervisorSignature && (
                          <div className="pt-2">
                            <p className="text-xs font-bold text-text-muted mb-1">Mestri / Supervisor Signature:</p>
                            <img
                              src={batch.supervisorSignature}
                              alt="Supervisor Signature Workers"
                              className="h-20 border rounded-[8px] bg-white p-1 max-w-xs"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-[10px] border">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-800 text-white">
                            <th className="p-2.5 font-bold">Serial Number</th>
                            <th className="p-2.5 font-bold">Category</th>
                            <th className="p-2.5 font-bold">Quantity</th>
                            <th className="p-2.5 font-bold">Amount (₹)</th>
                            <th className="p-2.5 font-bold text-right">Total (₹)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {completedBillData.outside_workers_data.workers?.map((w) => (
                            <tr key={w.sNo} className="border-b">
                              <td className="p-2.5 font-semibold text-center">{w.sNo}</td>
                              <td className="p-2.5 font-bold">{w.category}</td>
                              <td className="p-2.5">{w.quantity || 0}</td>
                              <td className="p-2.5">₹{Number(w.amount || 0).toLocaleString('en-IN')}</td>
                              <td className="p-2.5 text-right font-extrabold text-primary">₹{Number(w.total || 0).toLocaleString('en-IN')}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 font-extrabold">
                            <td colSpan={4} className="p-2.5 text-right">Grand Total:</td>
                            <td className="p-2.5 text-right text-success text-sm">
                              ₹{Number(completedBillData.outside_workers_data.grandTotal || 0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {completedBillData.outside_workers_data.remarks && (
                      <div className="text-xs">
                        <p className="font-bold text-text-muted">Remarks:</p>
                        <p className="p-3 rounded-[8px] bg-slate-50 border italic">{completedBillData.outside_workers_data.remarks}</p>
                      </div>
                    )}
                    {completedBillData.outside_workers_data.supervisorSignature && (
                      <div className="pt-2">
                        <p className="text-xs font-bold text-text-muted mb-1">Supervisor Signature (Outside Workers):</p>
                        <img
                          src={completedBillData.outside_workers_data.supervisorSignature}
                          alt="Supervisor Signature Workers"
                          className="h-20 border rounded-[8px] bg-white p-1 max-w-xs"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 9. Activity Timeline */}
            <ActivityTimeline timeline={completedBillData.timeline} />
          </div>

          {/* Action Buttons: PDF, Image, Print, Start Next */}
          <div className="pt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={exporting}
              className="btn-primary font-bold text-xs px-4 py-2.5 shadow flex items-center gap-1.5"
            >
              <span>📄</span> Download PDF
            </button>
            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={exporting}
              className="btn-ghost font-bold text-xs px-4 py-2.5 border rounded-[8px] bg-white flex items-center gap-1.5"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <span>🖼️</span> Download Image (PNG)
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="btn-ghost font-bold text-xs px-4 py-2.5 border rounded-[8px] bg-white flex items-center gap-1.5"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <span>🖨️</span> Print Bill
            </button>
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setStep1Data(null);
                setStep2Data(null);
                setCompletedBillData(null);
                loadPendingStockingOrders();
              }}
              className="btn-success flex-1 py-2.5 font-extrabold text-xs shadow-md flex items-center justify-center gap-2"
            >
              <span>🌱 Finish &amp; Start Next Seed Stocking</span>
              <span>➔</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Mixed Allocation */}
          {seedMode === 'mixed-allocation' && activeOrder && (
            <MixedAllocation
              activeOrder={activeOrder}
              vehicles={vehicles}
              siteId={siteId}
              onContinuePacking={() => setSeedMode('packing')}
              onContinueSeedVan={() => {
                setSeedMode('van-plan');
                setStep(1);
              }}
              onProceedToOutsideWorkers={() => setSeedMode('outside-workers')}
              onBack={() => setSeedMode('vehicle-payments')}
            />
          )}

          {/* Vehicle Selection Dropdown */}
          {seedMode !== 'packing' && seedMode !== 'outside-workers-packing' && seedMode !== 'outside-workers' && seedMode !== 'mixed-allocation' && (step === 1 || step === 2) && activeOrder && vehicles.length > 0 && (
            <div className="card p-4">
              <label className="field-label">Select Vehicle</label>
              <select
                className="field text-sm font-semibold"
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
              >
                <option value="">-- Select a Vehicle --</option>
                {vehicles.map((v, i) => (
                  <option key={v.id} value={v.id}>
                    Vehicle {i + 1} · {v.vehicle_no || 'No Reg'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Render Packing */}
          {seedMode === 'packing' && activeOrder && (
            <PackingPage
              initialTanks={activeOrder?.selected_tanks || []}
              tankQtys={getEffectivePackingQtys()}
              activeOrder={activeOrder || activeBill}
              vehicles={vehicles}
              onBack={() => mixedState.isMixed ? setSeedMode('mixed-allocation') : setSeedMode('vehicle-payments')}
              onGoToHistory={(updatedBill) => {
                if (updatedBill) {
                  setActiveBill(updatedBill);
                }
                if (activeOrder?.current_stage === 'mixed-allocation') {
                  setSeedMode('mixed-allocation');
                } else {
                  setSeedMode('outside-workers-packing');
                }
              }}
            />
          )}

          {/* Render Step 1: Seed Van Plan */}
          {seedMode !== 'packing' && seedMode !== 'outside-workers-packing' && seedMode !== 'outside-workers' && seedMode !== 'mixed-allocation' && step === 1 && activeOrder && (
            <div className="space-y-6">
              <button onClick={() => mixedState.isMixed ? setSeedMode('mixed-allocation') : setSeedMode('vehicle-payments')} className="text-sm font-bold text-text-muted hover:text-black flex items-center gap-1">← Back</button>
              {loadingVehicles ? (
                <p className="text-xs text-text-muted mt-2">Loading vehicles…</p>
              ) : vehicles.length === 0 ? (
                <div className="mt-2 p-3 rounded bg-red-50 text-red-700 text-xs font-bold border border-red-200">
                  No booked vehicles available. Please complete Vehicle Booking first.
                </div>
              ) : selectedVehicle ? (
                <SeedVanPlanStep1
                  key={selectedVehicle.id}
                  selectedVehicle={selectedVehicle}
                  isSaved={!!step1Data?.[selectedVehicle.id]}
                  initialVanData={getVehicleData(step1Data, selectedVehicle.id)}
                  activeOrder={activeOrder}
                  siteId={siteId}
                  overrideTankQtys={getEffectiveVanPlanQtys(selectedVehicle.id)}
                  onNext={(data) => handleStep1Next(selectedVehicle.id, data)}
                  onNewTankAdded={addNewlyAddedTank}
                />
              ) : (
                <div className="text-sm font-bold text-text-muted mt-4">Please select a vehicle above to begin.</div>
              )}
              {vehicles.length > 0 && vehicles.every(v => !!step1Data?.[v.id]) && (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="btn-primary w-full text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2 mt-6"
                >
                  <span>Continue to Stocking Status</span>
                  <span>➔</span>
                </button>
              )}
            </div>
          )}

          {/* Render Step 2: Stocking Status */}
          {seedMode !== 'packing' && seedMode !== 'outside-workers-packing' && seedMode !== 'outside-workers' && seedMode !== 'mixed-allocation' && step === 2 && activeOrder && (
            <div className="space-y-6">
              <button onClick={() => setStep(1)} className="text-sm font-bold text-text-muted hover:text-black flex items-center gap-1">← Back</button>
              {loadingVehicles ? (
                <p className="text-xs text-text-muted mt-2">Loading vehicles…</p>
              ) : vehicles.filter((v) => !!step1Data?.[v.id]).length === 0 ? (
                <div className="mt-2 p-3 rounded bg-amber-50 text-amber-800 text-xs font-bold border border-amber-200">
                  No vehicles with a saved Seed Van Plan available. Please complete Seed Van Plan first.
                </div>
              ) : selectedVehicle ? (
                <StockingStatusStep2
                  key={selectedVehicle.id}
                  selectedVehicle={selectedVehicle}
                  isSaved={!!step2Data?.[selectedVehicle.id]}
                  step1Data={getVehicleData(step1Data, selectedVehicle.id)}
                  activeOrder={activeOrder}
                  siteId={siteId}
                  initialStep2Data={getVehicleData(step2Data, selectedVehicle.id)}
                  onNext={(data) => handleStep2Next(selectedVehicle.id, data)}
                  onNewTankAdded={addNewlyAddedTank}
                />
              ) : (
                <div className="text-sm font-bold text-text-muted mt-4">Please select a vehicle above to continue.</div>
              )}

              {/* Common Supervisor Details (Appears only after all vehicles are saved) */}
              {vehicles.length > 0 && vehicles.every(v => !!step2Data?.[v.id]) && (
                <div className="card p-6 border shadow-sm mt-6">
                  <h4 className="font-extrabold text-lg text-primary border-b pb-2 mb-4">✍️ Common Supervisor Sign-off</h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="field-label">Supervisor Name *</label>
                        <input
                          type="text"
                          className="field text-sm"
                          value={commonSupervisorName}
                          onChange={(e) => setCommonSupervisorName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="field-label">Supervisor Phone (Optional)</label>
                        <input
                          type="text"
                          className="field text-sm"
                          value={commonSupervisorPhone}
                          onChange={(e) => setCommonSupervisorPhone(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="field-label">Supervisor Signature *</label>
                      <SignaturePad onSave={(sig) => setCommonSupervisorSignature(sig)} value={commonSupervisorSignature} />
                    </div>
                    <button
                      type="button"
                      onClick={handleSupervisorSave}
                      className="btn-success w-full py-3 font-extrabold mt-4"
                    >
                      Save Supervisor Details
                    </button>
                  </div>
                </div>
              )}

              {/* Continue to Outside Workers (Only for non-mixed modes) */}
              {!isMixed && isSupervisorSaved && (
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="btn-primary w-full text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2 mt-6"
                >
                  <span>Continue to Outside Workers</span>
                  <span>➔</span>
                </button>
              )}
            </div>
          )}





          {/* Render Standalone Outside Workers (direct tab) */}
          {seedMode === 'outside-workers' && (
            <div className="mt-6">
              <OutsideWorkersStep3
                initialSupervisorName={commonSupervisorName}
                onComplete={() => setSeedMode('history')}
                onBack={() => mixedState.isMixed ? setSeedMode('mixed-allocation') : setSeedMode('list')}
                vehicles={vehicles}
                activeOrder={activeOrder}
                siteId={siteId}
                workSource="Seed Stocking"
                step2Data={step2Data}
              />
            </div>
          )}

          {/* Render Step 3: Outside Workers (from Seed Stocking flow) */}
          {seedMode !== 'packing' && seedMode !== 'outside-workers-packing' && seedMode !== 'outside-workers' && seedMode !== 'mixed-allocation' && step === 3 && (
            <OutsideWorkersStep3
              initialSupervisorName={commonSupervisorName}
              onComplete={handleFinalComplete}
              onBack={() => setStep(2)}
              vehicles={vehicles}
              activeOrder={activeOrder}
              siteId={siteId}
              workSource="Seed Stocking"
              step2Data={step2Data}
            />
          )}
        </div>
      )}
    </div>
  );
}