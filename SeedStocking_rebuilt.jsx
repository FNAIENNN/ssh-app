import { useState, useEffect } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useAuth } from '../../../../hooks/useAuth';
import { useToast } from '../../../../hooks/useToast';
import { autosaveBillStep } from '../../../../lib/bills';
import SeedVanPlanStep1 from './SeedVanPlanStep1';
import StockingStatusStep2 from './StockingStatusStep2';
import OutsideWorkersStep3 from './OutsideWorkersStep3';

export default function SeedStocking({ siteId, stockingOrder = null, onStockingCompleted = null }) {
  const { user } = useAuth();
  const toast = useToast();

  const [pendingOrders, setPendingOrders] = useState([]);
  const [activeOrder, setActiveOrder] = useState(stockingOrder);
  const [loading, setLoading] = useState(false);

  // Workflow Step State: 1 | 2 | 3 | 'completed'
  const [step, setStep] = useState(1);

  // Data accumulated across steps
  const [step1Data, setStep1Data] = useState(null);
  const [step2Data, setStep2Data] = useState(null);

  useEffect(() => {
    if (stockingOrder) setActiveOrder(stockingOrder);
  }, [stockingOrder]);

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
      if (!activeOrder && loaded.length > 0) {
        setActiveOrder(loaded[0]);
      }
    } catch (err) {
      console.error('loadPendingStockingOrders error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleStep1Next(data) {
    setStep1Data(data);
    setStep(2);
    if (activeOrder?.id) {
      await autosaveBillStep(
        supabase,
        TABLES,
        activeOrder.id,
        { van_plan: data, status: 'Seed Stocking In Progress' },
        'Seed Van Plan Saved',
        user?.email
      );
    }
    toast.info('Seed Van Plan saved. Proceeding to Stocking Status.');
  }

  async function handleStep2Next(data) {
    setStep2Data(data);
    setStep(3);
    const isAnyTankPending = Object.values(data?.tankStates || {}).some(
      (t) => t.status === 'pending' || t.status === 'transferred'
    );
    const nextStatus = isAnyTankPending ? 'Awaiting Remaining Tanks' : 'Seed Stocking In Progress';
    if (activeOrder?.id) {
      await autosaveBillStep(
        supabase,
        TABLES,
        activeOrder.id,
        { stocking_status_data: data, status: nextStatus },
        'Stocking Status Submitted',
        user?.email
      );
    }
    toast.info('Stocking Status saved. Proceeding to Outside Workers.');
  }

  async function handleFinalComplete(step3Data) {
    if (!activeOrder) return;

    const payload = {
      site_id: siteId,
      bill_id: activeOrder.id,
      van_plan: step1Data,
      stocking_status_data: step2Data,
      outside_workers_data: step3Data,
      created_by: user?.id,
      created_at: new Date().toISOString(),
    };

    // 1. Update the EXISTING bill with all Seed Stocking data (Single Bill Model)
    const stockingUpdatePayload = {
      stocking_status: 'completed',
      status: 'Completed',
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
        stocking_status: 'completed',
        status: 'Completed',
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
      { status: 'Completed', completion_timestamp: new Date().toISOString() },
      'Bill Completed',
      user?.email
    );

    // 5. All saves done — notify parent to redirect to History
    toast.success(`✅ Bill ${activeOrder.bill_number} completed! Redirecting to History…`);
    onStockingCompleted?.(finalBill || activeOrder);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Step Navigation Header */}
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

          {step !== 'completed_summary' && (
            <div className="flex items-center gap-2">
              {[
                { id: 1, label: '1. Van Plan' },
                { id: 2, label: '2. Stocking Status' },
                { id: 3, label: '3. Outside Workers' },
              ].map((s) => {
                const active = step === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (s.id < step) setStep(s.id);
                    }}
                    className="px-3 py-1 rounded-full text-xs font-bold transition border"
                    style={{
                      background: active ? 'var(--color-primary)' : 'var(--color-surface)',
                      color: active ? '#fff' : 'var(--color-text-secondary)',
                      borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                    }}
                  >
                    {s.label}
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
          );
          if (matchedTank?.id) {
            await supabase.from(TABLES.tanks).update({
              quantity: tState.totalCount,
              seed_type: activeOrder.seed_type || 'Vannamei',
              hatchery: activeOrder.hatchery || null,
              start_date: new Date().toISOString().slice(0, 10),
              updated_at: new Date().toISOString(),
            }).eq('id', matchedTank.id);
          }
        }
      }
    }

    await autosaveBillStep(
      supabase, TABLES, activeOrder.id,
      { status: 'Completed', completion_timestamp: new Date().toISOString() },
      'Bill Completed',
      user?.email
    );

    await loadBills();
    toast.success(`✅ Bill ${activeOrder.bill_number} completed!`);
    onStockingCompleted?.();
  }

  const orderBill = activeOrder || activeBill;

  if (seedMode === 'packing') {
    const selectedTanks = [...(emptyTanks || []), ...(newlyAddedTanks || [])].filter((t) => orderForm?.selectedTankIds?.includes(t.id));
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="card p-4 shadow-sm border" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold flex items-center gap-2">
                <span>🌱</span> Seed Stocking Module
              </h2>
              <p className="text-xs text-text-secondary">
                {orderBill
                  ? `Order: ${orderBill.bill_number} · ${orderBill.hatchery || 'Hatchery N/A'}`
                  : 'Packing'}
              </p>
            </div>
            <div className="px-3 py-1 bg-primary text-white text-xs font-bold rounded-full">
              📦 Packing Flow
            </div>
          </div>
        </div>
        <PackingPage
          initialTanks={selectedTanks}
          tankQtys={orderForm?.tankQtys}
          activeOrder={orderBill}
          vehicles={vehicles}
          onBack={() => setSeedMode('vehicle-payments')}
          onGoToHistory={() => setSeedMode('history')}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* GLOBAL BACK BUTTON (Always at the very top) */}
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

      {/* Step navigation header */}
      <div className="card p-4 shadow-sm border" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold flex items-center gap-2">
              <span>🌱</span> Seed Stocking Module
            </h2>
            <p className="text-xs text-text-secondary">
              {orderBill
                ? `Order: ${orderBill.bill_number} · ${orderBill.hatchery || 'Hatchery N/A'}`
                : 'Select a pending order to start'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[
              { id: 1, label: '1. Van Plan' },
              { id: 2, label: '2. Stocking Status' },
              { id: 3, label: '3. Outside Workers' },
            ].map((s) => {
          }}
        />
      )}

      {activeTab === 'van-plan' && (
        <>
          {vanPlanStep === 1 && (
            <SeedVanPlanStep1
              vehicles={vehicles}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={setSelectedVehicleId}
              step1Data={getVehicleData(step1Data, selectedVehicleId)}
              onNext={handleStep1Next}
              activeOrder={orderBill}
              pendingOrders={pendingOrders}
              onSelectOrder={setActiveOrder}
            />
          )}

          {vanPlanStep === 2 && (
            <StockingStatusStep2
              vehicles={vehicles}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={setSelectedVehicleId}
              step2Data={step2Data?.[selectedVehicleId]}
              vanPlanData={step1Data?.[selectedVehicleId]}
              onNext={handleStep2Next}
              supervisorName={supervisorName}
              setSupervisorName={setSupervisorName}
              supervisorPhone={supervisorPhone}
              setSupervisorPhone={setSupervisorPhone}
              supervisorSignature={supervisorSignature}
              setSupervisorSignature={setSupervisorSignature}
              onCompleteAll={handleCompleteStockingStatus}
              submitting={loading}
            />
          )}

          {vanPlanStep === 3 && (
            <div className="card p-10 text-center space-y-6 shadow-sm border border-green-200 bg-green-50">
              <p className="text-6xl">✅</p>
              <div>
                <h2 className="text-2xl font-black text-green-800 mb-2">Stocking Completed</h2>
                <p className="text-sm text-green-700 font-bold max-w-sm mx-auto">
                  Stocking status and tank updates have been successfully saved.
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  setCommonWorkSource('Seed Stocking');
                  setActiveTab('outside-workers');
                }}
                className="btn-primary px-8 py-3 font-black text-base shadow-lg animate-pulse hover:animate-none transition"
              >
                Continue to Outside Workers ➔
              </button>
            </div>
          )}
        </>
      )}

      {activeTab === 'outside-workers' && (
        <OutsideWorkersStep3
          siteId={siteId}
          activeOrder={orderBill}
          commonWorkSource={commonWorkSource}
          onWorkSourceChange={setCommonWorkSource}
          onBack={() => setActiveTab('van-plan')}
        />
      )}
    </div>
  );
}

      {loading ? (
        <p className="text-sm text-text-muted p-4">Loading pending stocking orders…</p>
      ) : (
        <div className="space-y-6">
          {/* Order picker (when multiple pending and no active from context) */}
          {pendingOrders.length > 1 && !activeBill && step === 1 && (
            <div className="card p-4">
              <label className="field-label">Select Pending Seed Order</label>
              <select
                className="field text-sm font-semibold"
                value={activeOrder?.id || ''}
                onChange={(e) => {
                  const found = pendingOrders.find((o) => o.id === e.target.value);
                  setActiveOrder(found || null);
                }}
              >
                {pendingOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.bill_number} · {o.hatchery || 'Hatchery N/A'} ({o.seed_type || 'Seed'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {!orderBill && pendingOrders.length === 0 && !loading && (
            <div className="card p-8 text-center space-y-2">
              <div className="text-3xl">📭</div>
              <p className="font-bold">No orders pending stocking</p>
              <p className="text-xs text-text-muted">Complete the Seed Order and Vehicle Payments first.</p>
            </div>
          )}

          {/* Step 1 Vehicle Selector */}
          {step === 1 && orderBill && (
            <div className="card p-4 shadow-sm border" style={{ borderColor: 'var(--color-border)' }}>
              <label className="field-label flex items-center gap-2">
                <span>🚛</span> Select Vehicle Context
              </label>
              {loadingVehicles ? (
                <p className="text-xs text-text-muted mt-2">Loading vehicles…</p>
              ) : vehicles.length === 0 ? (
                <div className="mt-2 p-3 rounded bg-red-50 text-red-700 text-xs font-bold border border-red-200">
                  No booked vehicles available. Please complete Vehicle Booking first.
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <select
                    className="field text-sm font-extrabold"
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                  >
                    <option value="" disabled>[ Select Booked Vehicle ▼ ]</option>
                    {vehicles.map((v, i) => (
                      <option key={v.id} value={v.id}>
                        Vehicle {i + 1} — {v.vehicle_no || 'No Reg'} — {v.driver_name || 'No Driver'}
                      </option>
                    ))}
                  </select>
                  {!selectedVehicleId && (
                    <p className="text-amber-600 text-[11px] font-bold">⚠️ Please select a vehicle before continuing.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2 Vehicle Selector */}
          {step === 2 && orderBill && (
            <div className="card p-4 shadow-sm border" style={{ borderColor: 'var(--color-border)' }}>
              <label className="field-label flex items-center gap-2">
                <span>🚛</span> Select Vehicle
              </label>
              {loadingVehicles ? (
                <p className="text-xs text-text-muted mt-2">Loading vehicles…</p>
              ) : vehicles.filter((v) => !!step1Data?.[v.id]).length === 0 ? (
                <div className="mt-2 p-3 rounded bg-amber-50 text-amber-800 text-xs font-bold border border-amber-200">
                  No vehicles with a saved Seed Van Plan available. Please complete Seed Van Plan first.
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <select
                    className="field text-sm font-extrabold"
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                  >
                    <option value="" disabled>[ Select Vehicle ▼ ]</option>
                    {vehicles.map((v, i) => ({ v, i })).filter(({ v }) => !!step1Data?.[v.id]).map(({ v, i }) => (
                      <option key={v.id} value={v.id}>
                        Vehicle {i + 1} — {v.vehicle_no || 'No Reg'} — {v.driver_name || 'No Driver'}
                      </option>
                    ))}
                  </select>
                  {!selectedVehicleId && (
                    <p className="text-amber-600 text-[11px] font-bold">⚠️ Please select a vehicle before continuing.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 1: Seed Van Plan */}
          {step === 1 && orderBill && (
            selectedVehicleId ? (
              <SeedVanPlanStep1
                key={selectedVehicleId}
                selectedVehicle={vehicles.find(v => v.id === selectedVehicleId)}
                isSaved={!!step1Data?.[selectedVehicleId]}
                initialVanData={getVehicleData(step1Data, selectedVehicleId)}
                activeOrder={orderBill}
                siteId={siteId}
                onNext={handleStep1Next}
                onContinue={() => setStep(2)}
                onBack={() => setSeedMode('vehicle-payments')}
                onNewTankAdded={addNewlyAddedTank}
              />
            ) : (
              <div className="card p-8 text-center text-text-muted text-sm border-dashed border-2 opacity-60">
                Select a vehicle above to enter Seed Van Plan.
              </div>
            )
          )}

          {/* Step 2: Stocking Status */}
          {step === 2 && (
            <div className="space-y-6">
              {selectedVehicleId ? (
              <StockingStatusStep2
                key={selectedVehicleId}
                selectedVehicle={vehicles.find(v => v.id === selectedVehicleId)}
                isSaved={!!step2Data?.[selectedVehicleId]}
                onContinue={() => setStep(3)}
                step1Data={getVehicleData(step1Data, selectedVehicleId)}
                activeOrder={orderBill}
                siteId={siteId}
                initialStep2Data={getVehicleData(step2Data, selectedVehicleId)}
                onNext={handleStep2Next}
                onBack={() => setStep(1)}
                onNewTankAdded={addNewlyAddedTank}
              />
            ) : (
              <div className="card p-8 text-center text-text-muted text-sm border-dashed border-2 opacity-60">
                Select a vehicle above to enter Stocking Status.
              </div>
            )}

            {/* Common Supervisor Section (Only visible after ALL vehicles have completed Stocking Status) */}
            {(() => {
              const completedVehicleIds = Object.keys(step2Data || {}).filter(k => k !== 'supervisorName' && k !== 'supervisorPhone' && k !== 'supervisorSignature');
              const validVehicles = vehicles.filter(v => !!step1Data?.[v.id]); // Vehicles that made it past Seed Van Plan
              const allVehiclesCompleted = validVehicles.length > 0 && validVehicles.every(v => completedVehicleIds.includes(v.id));

              if (!allVehiclesCompleted) return null;

              return (
                <>
                  <div className="card p-5 space-y-4 border mt-6 bg-slate-50" style={{ borderColor: 'var(--color-primary)' }}>
                    <h4 className="font-extrabold text-base text-primary border-b pb-2">✍️ Common Supervisor Sign-off</h4>
                    <p className="text-xs text-text-muted">All vehicles have been saved successfully. Please provide the single supervisor sign-off for this stocking operation.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="field-label">Supervisor Name *</label>
                        <input
                          className="field text-sm"
                          placeholder="Enter Supervisor Name"
                          value={supervisorName}
                          onChange={(e) => setSupervisorName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="field-label">Supervisor Phone Number *</label>
                        <input
                          type="tel"
                          className="field text-sm"
                          placeholder="Numeric Phone Number"
                          value={supervisorPhone}
                          onChange={(e) => setSupervisorPhone(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="field-label">Supervisor Signature *</label>
                      <SignaturePad onSave={(sig) => setSupervisorSignature(sig)} value={supervisorSignature} />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleContinueToStep3}
                    className="btn-primary w-full text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2 mt-4"
                  >
                    <span>Continue to Outside Workers</span>
                    <span>➔</span>
                  </button>
                </>
              );
            })()}
            </div>
          )}

          {/* Step 3: Outside Workers */}
          {step === 3 && (
            <OutsideWorkersStep3
              initialStep3Data={step3Data}
              onSaveState={(data) => setStep3Data(data)}
              initialSupervisorName={step2Data?.[selectedVehicleId]?.supervisorName || Object.values(step2Data || {})[0]?.supervisorName || ''}
              initialSupervisorPhone={step2Data?.[selectedVehicleId]?.supervisorPhone || Object.values(step2Data || {})[0]?.supervisorPhone || ''}
              siteId={siteId}
              activeOrder={orderBill}
              onComplete={handleFinalComplete}
              onBack={() => setStep(2)}
            />
          )}
        </div>
      )}
    </div>
  );
}

