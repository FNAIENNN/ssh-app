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
              {(!completedBillData.payments || completedBillData.payments.filter((p) => p.method === 'cash').length === 0) ? (
                <p className="text-xs text-text-muted italic">No cash payments recorded for this order.</p>
              ) : (
                <div className="space-y-2">
                  {completedBillData.payments.filter((p) => p.method === 'cash').map((p) => (
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
              <h3 className="font-extrabold text-base text-primary border-b pb-2">🧾 3. Advance Payment Details</h3>
              {(!completedBillData.payments || completedBillData.payments.filter((p) => p.method === 'advance').length === 0) ? (
                <p className="text-xs text-text-muted italic">No advance payments requested for this order.</p>
              ) : (
                <div className="space-y-2">
                  {completedBillData.payments.filter((p) => p.method === 'advance').map((p) => (
                    <div key={p.id} className="p-3 rounded-[10px] bg-slate-50 border flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold">Request ID: {p.id.slice(0, 8)} ({p.advance_mode?.toUpperCase()})</p>
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
                setActiveOrder(null);
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
          {/* Order Selection Picker if multiple pending */}
          {pendingOrders.length > 1 && step === 1 && (
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

          {/* Render Step 1: Seed Van Plan */}
          {step === 1 && (
            <SeedVanPlanStep1
              initialVanData={step1Data}
              onNext={handleStep1Next}
              onBack={() => {
                setActiveOrder(null);
                setStep(1);
              }}
            />
          )}

          {/* Render Step 2: Stocking Status */}
          {step === 2 && (
            <StockingStatusStep2
              step1Data={step1Data}
              activeOrder={activeOrder}
              siteId={siteId}
              onNext={handleStep2Next}
              onBack={() => setStep(1)}
            />
          )}

          {/* Render Step 3: Outside Workers */}
          {step === 3 && (
            <OutsideWorkersStep3
              initialSupervisorName={step2Data?.supervisorName || ''}
              onComplete={handleFinalComplete}
              onBack={() => setStep(2)}
            />
          )}
        </div>
      )}
    </div>
  );
}
