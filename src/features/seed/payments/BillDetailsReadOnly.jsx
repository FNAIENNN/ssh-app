/**
 * BillDetailsReadOnly — Shared canonical read-only Bill Details view.
 *
 * Used by both Past Orders (SeedOrderWorkflow 'readonly' mode) and History.
 * Renders ALL sections of the full Seed Stock workflow in read-only format.
 *
 * Props:
 *   bill           — the bill DB row (required)
 *   payments       — array of payment rows fetched from DB
 *   vehicles       — array of vehicle_bookings rows
 *   vehiclePayments — array of payment rows typed 'vehicle'
 *   onBack         — callback when Back is pressed
 *   showExport     — if true, show PDF/Image export buttons (default true)
 *   exportRef      — optional ref to pass for html2canvas export target
 */
import { useRef, useState, useMemo } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import ActivityTimeline from '../../../components/ui/ActivityTimeline';
import { aggregateTankStates } from './seedStocking/stockingUtils';

// ── Helpers ──────────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children }) {
  return (
    <div
      className="card p-5 space-y-3 border"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <h3 className="font-extrabold text-base border-b pb-2 flex items-center gap-2" style={{ borderColor: 'var(--color-border)' }}>
        {icon && <span>{icon}</span>}
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoField({ label, value, bold, highlight, success, mono }) {
  const colorStyle = highlight
    ? { color: 'var(--color-primary)' }
    : success
    ? { color: 'var(--color-success)' }
    : {};
  return (
    <div>
      <p className="text-text-muted mb-0.5" style={{ fontSize: '11px' }}>{label}</p>
      <p
        className={`text-sm ${bold ? 'font-extrabold' : 'font-semibold'} ${mono ? 'font-mono' : ''}`}
        style={colorStyle}
      >
        {value ?? 'N/A'}
      </p>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    completed: { bg: '#dcfce7', color: '#15803d', label: '✓ Completed' },
    pending: { bg: '#fef9c3', color: '#a16207', label: '⏳ Pending' },
    returned: { bg: '#fee2e2', color: '#dc2626', label: '↩ Returned' },
    transferred: { bg: '#ede9fe', color: '#6d28d9', label: '⇄ Transferred' },
  };
  const s = map[status] || { bg: '#f1f5f9', color: '#475569', label: status };
  return (
    <span
      className="px-2.5 py-0.5 rounded-full font-bold text-[11px] capitalize"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function EmptyNote({ text }) {
  return <p className="text-xs text-text-muted italic">{text}</p>;
}

// ── Drum allocation helper — supports both old row format and new drums[] format ──
function getDrums(vanPlan) {
  if (!vanPlan) return [];

  // New format: { drums: [{drumNum, tankName, count}] }
  if (Array.isArray(vanPlan.drums)) {
    return vanPlan.drums.map((d) => ({
      label: `Drum ${d.drumNum}`,
      tankName: d.tankName,
      count: Number(d.count) || 0,
    }));
  }

  // Old format: { rows: [{rowNum, left:{tankName,count}, right:{tankName,count}}] }
  if (Array.isArray(vanPlan.rows)) {
    const result = [];
    vanPlan.rows.forEach((r) => {
      if (r.left?.tankName) result.push({ label: `L${r.rowNum}`, tankName: r.left.tankName, count: Number(r.left.count) || 0 });
      if (r.right?.tankName) result.push({ label: `R${r.rowNum}`, tankName: r.right.tankName, count: Number(r.right.count) || 0 });
    });
    return result;
  }

  return [];
}

function isLegacyData(data) {
  if (!data) return false;
  return !!(data.drums || data.rows || data.tankStates);
}

function VanPlanView({ vanPlan }) {
  const drums = getDrums(vanPlan);
  if (!vanPlan) return <EmptyNote text="No Seed Van Plan recorded yet." />;
  if (drums.length === 0) return <EmptyNote text="No drum allocations found." />;
  
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-[10px] border text-xs" style={{ borderColor: 'var(--color-border)' }}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white uppercase text-[11px] tracking-wider">
              <th className="p-2.5 font-bold w-12 text-center border-r border-slate-700">Row</th>
              <th className="p-2.5 font-bold text-center border-r border-slate-700 w-1/2">🛢️ Left Drum</th>
              <th className="p-2.5 font-bold text-center w-1/2">🛢️ Right Drum</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.ceil(drums.length / 2) }).map((_, idx) => {
              const rowNum = idx + 1;
              const isCabinRow = idx === 0;
              const left = drums[idx * 2];
              const right = drums[idx * 2 + 1];
              return (
                <tr key={idx} className="border-b hover:bg-slate-50 transition" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="p-2.5 border-r text-center font-bold text-slate-500 bg-slate-50" style={{ borderColor: 'var(--color-border)' }}>
                    {isCabinRow ? (
                      <span className="text-[10px] font-black text-sky-800 uppercase">Cabin</span>
                    ) : (
                      <span>#{rowNum}</span>
                    )}
                  </td>
                  <td className="p-2.5 border-r w-1/2 align-top" style={{ borderColor: 'var(--color-border)' }}>
                    {left ? (
                      <div className="flex items-center justify-between p-2 rounded-[8px] border bg-white" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-primary">
                            {isCabinRow ? `Cabin Drum 1` : left.label}
                          </span>
                          <span className="px-2 py-0.5 rounded-full font-bold text-[10px]" style={{ background: 'var(--color-primary)15', color: 'var(--color-primary)' }}>
                            Tank {left.tankName}
                          </span>
                        </div>
                        <span className="font-extrabold text-emerald-700">{left.count.toLocaleString('en-IN')} pcs</span>
                      </div>
                    ) : (
                      <div className="p-2 text-center text-slate-400 italic bg-slate-50/50 rounded-[8px]">
                        — Empty Slot —
                      </div>
                    )}
                  </td>
                  <td className="p-2.5 w-1/2 align-top">
                    {right ? (
                      <div className="flex items-center justify-between p-2 rounded-[8px] border bg-white" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-primary">
                            {isCabinRow ? `Cabin Drum 2` : right.label}
                          </span>
                          <span className="px-2 py-0.5 rounded-full font-bold text-[10px]" style={{ background: 'var(--color-primary)15', color: 'var(--color-primary)' }}>
                            Tank {right.tankName}
                          </span>
                        </div>
                        <span className="font-extrabold text-emerald-700">{right.count.toLocaleString('en-IN')} pcs</span>
                      </div>
                    ) : (
                      <div className="p-2 text-center text-slate-400 italic bg-slate-50/50 rounded-[8px]">
                        — Empty Slot —
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-emerald-50">
              <td colSpan={3} className="p-2.5 text-right font-extrabold text-emerald-800 text-xs">
                Grand Total: {Number(vanPlan.grandTotal || 0).toLocaleString('en-IN')} pcs
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function StockingStatusView({ stockingData }) {
  if (!stockingData) return <EmptyNote text="Stocking status not yet recorded." />;
  
  const aggregatedTanks = aggregateTankStates(stockingData.tankStates, stockingData.transfers);
  const completedTanks   = aggregatedTanks.filter((t) => t.status === 'completed');
  const pendingTanks     = aggregatedTanks.filter((t) => t.status === 'pending');
  const returnedTanks    = aggregatedTanks.filter((t) => t.status === 'returned');
  const transferredTanks = aggregatedTanks.filter((t) => t.status === 'transferred');

  return (
    <div className="space-y-4">
      {/* Summary counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Completed', count: completedTanks.length, bg: '#dcfce7', color: '#15803d' },
          { label: 'Pending', count: pendingTanks.length, bg: '#fef9c3', color: '#a16207' },
          { label: 'Returned', count: returnedTanks.length, bg: '#fee2e2', color: '#dc2626' },
          { label: 'Transferred', count: transferredTanks.length, bg: '#ede9fe', color: '#6d28d9' },
        ].map((item) => (
          <div
            key={item.label}
            className="p-3 rounded-[10px] text-center"
            style={{ background: item.bg, color: item.color }}
          >
            <p className="text-2xl font-extrabold">{item.count}</p>
            <p className="text-xs font-bold uppercase tracking-wider">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Grouped Tank Display (One entry per tank) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        {aggregatedTanks.map((t) => (
          <div
            key={t.tankName}
            className="p-3 rounded-[10px] border flex items-center justify-between gap-2"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            <div>
              <p className="font-extrabold text-sm text-text-primary">
                {t.tankName}
              </p>
              <p className="text-xs font-semibold text-text-muted">
                {t.totalCount?.toLocaleString('en-IN')} pcs
              </p>
            </div>
            <StatusPill status={t.status} />
          </div>
        ))}
      </div>

      {/* Transfers Summary (if any) */}
      {stockingData.transfers && stockingData.transfers.length > 0 && (
        <div className="p-4 rounded-[10px] bg-sky-50 border border-sky-200 mt-4 space-y-3">
          <h4 className="font-extrabold text-sm text-sky-900 border-b border-sky-200 pb-2 flex items-center gap-2">
            <span>🔀</span> Detailed Transfer Summary &amp; History
          </h4>
          <div className="space-y-2">
            {stockingData.transfers.map((t) => (
              <div key={t.id} className="p-3 bg-white rounded border border-sky-100 text-xs shadow-sm space-y-1 text-sky-900">
                <p className="font-bold">
                  🔄 Transferred From Drum: <strong>{t.transferredFromDrum}</strong>
                </p>
                <p>
                  📍 Original Tank: <strong>{t.originalTank}</strong> ➔ ➡️ Target: <strong>{t.transferredToTank}</strong>
                </p>
                <p>
                  Transferred Quantity: <strong className="text-sky-700">{Number(t.transferredAmount || 0).toLocaleString('en-IN')} pcs</strong>
                </p>
                <p className="font-extrabold mt-1 pt-1 border-t border-sky-50 text-[11px]">
                  Final Target Total: {Number(t.finalTargetTotal || 0).toLocaleString('en-IN')} pcs
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supervisor */}
      {(stockingData.supervisorName || stockingData.supervisorPhone) && (
        <div className="p-3 rounded-[10px] bg-slate-50 border text-xs space-y-1" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Supervisor Details</p>
          <p>
            <strong>{stockingData.supervisorName}</strong>
            {stockingData.supervisorPhone ? ` · ${stockingData.supervisorPhone}` : ''}
          </p>
          {stockingData.supervisorSignature && (
            <div className="pt-1">
              <p className="text-[10px] text-text-muted font-bold mb-1">Digital Signature:</p>
              <img
                src={stockingData.supervisorSignature}
                alt="Supervisor Signature"
                className="h-16 border rounded-[8px] bg-white p-1 max-w-xs"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BillDetailsReadOnly({
  bill,
  payments = [],
  vehicles = [],
  vehiclePayments = [],
  onBack,
  showExport = true,
}) {
  const detailRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  if (!bill) return null;

  // ── Data extraction ───────────────────────────────────────────────────────
  const isSeedPayment = (p) => !p.type || p.type === 'seed' || p.type === 'seed_order';
  const cashPays = payments.filter((p) => p.method === 'cash' && isSeedPayment(p));
  const advPays  = payments.filter((p) => p.method === 'advance' && isSeedPayment(p));
  const vanPlan      = bill.van_plan;
  const stockingData = bill.stocking_status_data;
  const workersData  = bill.outside_workers_data;
  const packingData  = bill.packing_data;
  const outsideWorkerPayments = payments.filter((p) => p.type?.toLowerCase() === 'outside_worker' || p.type?.toLowerCase() === 'outside worker');

  const isCompleted = bill.status === 'Completed' || bill.stocking_status === 'completed';

  const selectedTanks    = bill.selected_tanks || [];
  const newlyAddedTanks  = bill.newly_added_tanks || [];

  // ── Special View for Return Bills ──
  if (bill.type === 'return') {
    const pd = bill.packing_data || {};
    return (
      <div className="bg-slate-50 min-h-full">
        {onBack && (
          <div className="max-w-4xl mx-auto p-4 pb-0">
            <button type="button" onClick={onBack} className="btn-primary text-xs px-4 py-2 font-bold flex items-center gap-1">
              ← Back
            </button>
          </div>
        )}
        <div className="max-w-4xl mx-auto p-4 space-y-4">
          <div
            ref={detailRef}
            className="bg-white rounded-[24px] shadow-2xl overflow-hidden flex flex-col font-sans"
            style={{ border: '1px solid var(--color-border)' }}
          >
            {/* Header */}
            <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center relative overflow-hidden">
              <div className="relative z-10">
                <span className="text-[10px] uppercase tracking-widest font-bold text-red-300">
                  Return Bill
                </span>
                <h2 className="text-2xl font-black mt-1">
                  {bill.bill_number}
                </h2>
                <p className="text-slate-300 text-xs mt-1 font-semibold">
                  Date: {new Date(bill.created_at).toLocaleString('en-IN')}
                </p>
              </div>
              <div className="relative z-10 text-right">
                <StatusPill status={bill.status || 'returned'} />
              </div>
            </div>

            {/* Body */}
            <div className="p-8 space-y-6">
              <SectionCard title="Return Details" icon="↩">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <InfoField label="Source Tank" value={pd.tank_name} bold />
                  <InfoField label="Vehicle" value={pd.vehicle_no || '—'} bold />
                  <InfoField label="Returned Quantity" value={pd.quantity != null ? `${Number(pd.quantity).toLocaleString('en-IN')} pcs` : '—'} bold highlight />
                  <InfoField label="Returned Packets" value={pd.packets != null ? pd.packets : '—'} bold />
                </div>
                <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <InfoField label="Reason for Return" value={pd.reason || '—'} bold />
                </div>
                {pd.order_number && (
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                    <InfoField label="Original Seed Order" value={pd.order_number} />
                  </div>
                )}
              </SectionCard>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Export ────────────────────────────────────────────────────────────────
  async function handleDownloadPDF() {
    if (!detailRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(detailRef.current, { scale: 2, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`Bill_${bill.bill_number || 'detail'}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadImage() {
    if (!detailRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(detailRef.current, { scale: 2, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `Bill_${bill.bill_number || 'detail'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setExporting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-bold"
            style={{ color: '#000', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span style={{ color: '#000', fontSize: '1.1rem' }}>←</span>
            <span style={{ color: '#000' }}>Back</span>
          </button>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {showExport && (
            <>
              <button
                type="button"
                onClick={handleDownloadPDF}
                disabled={exporting}
                className="btn-primary text-xs px-3 py-1.5 font-bold flex items-center gap-1"
              >
                📄 PDF
              </button>
              <button
                type="button"
                onClick={handleDownloadImage}
                disabled={exporting}
                className="btn-ghost text-xs px-3 py-1.5 font-bold flex items-center gap-1 border rounded-[8px]"
                style={{ borderColor: 'var(--color-border)', color: '#000000' }}
              >
                🖼️ <span style={{ color: '#000000' }}>Image</span>
              </button>
            </>
          )}
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-200 text-slate-800">
            🔒 Read-Only
          </span>
        </div>
      </div>

      <div ref={detailRef} className="space-y-6">
        {/* ── Bill Banner ── */}
        <div
          className="rounded-[16px] px-6 py-5 flex items-center justify-between shadow-md text-white"
          style={{
            background: isCompleted
              ? 'linear-gradient(135deg,#059669 0%,#10b981 100%)'
              : 'linear-gradient(135deg,var(--color-primary) 0%,var(--color-primary-light) 100%)',
          }}
        >
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wider font-semibold text-white/80">
              {isCompleted ? '✓ Completed Seed Order Bill' : 'Seed Order Bill'}
            </span>
            <h2 className="text-3xl font-extrabold">{bill.bill_number}</h2>
            <p className="text-xs text-white/90">
              Created: {new Date(bill.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/80">Total Bill Price</p>
            <p className="text-3xl font-extrabold">₹{Number(bill.seed_total || 0).toLocaleString('en-IN')}</p>
            <p className="text-xs text-white/80 mt-1">Status: <strong>{bill.status || 'Draft'}</strong></p>
          </div>
        </div>

        {/* ── 1. Seed Order Details ── */}
        <SectionCard title="Seed Order Details" icon="📋">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <InfoField label="Bill Number" value={bill.bill_number} bold highlight />
            <InfoField label="Date & Time" value={bill.created_at ? new Date(bill.created_at).toLocaleString('en-IN') : '—'} />
            <InfoField label="Status" value={bill.status || 'Draft'} />
            <InfoField label="Hatchery (Supplier)" value={bill.hatchery} bold highlight />
            <InfoField label="Seed Type" value={bill.seed_type} />
            <InfoField label="PL Size / Count" value={bill.pl_size} />
            <InfoField label="Overall Quantity" value={`${Number(bill.overall_quantity || 0).toLocaleString('en-IN')} pcs`} />
            <InfoField label="Per Piece Price" value={`₹${bill.per_piece_price ?? 'N/A'}`} />
            <InfoField label="Total Price" value={`₹${Number(bill.seed_total || 0).toLocaleString('en-IN')}`} bold success />
          </div>

          {/* Selected Tanks */}
          {selectedTanks.length > 0 && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-2">
                Selected Tanks ({selectedTanks.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedTanks.map((t) => (
                  <span
                    key={t.id || t.name}
                    className="text-xs px-3 py-1.5 rounded-full font-bold"
                    style={{
                      background: 'var(--color-primary)15',
                      color: 'var(--color-primary)',
                      border: '1px solid var(--color-primary)40',
                    }}
                  >
                    {t.name}
                    {t.qty ? ` · ${Number(t.qty).toLocaleString('en-IN')} pcs` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Newly Added Tanks */}
          {newlyAddedTanks.length > 0 && (
            <div className="mt-2 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-2">
                Newly Added Tanks ({newlyAddedTanks.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {newlyAddedTanks.map((t) => (
                  <span
                    key={t.id || t.name}
                    className="text-xs px-3 py-1.5 rounded-full font-bold"
                    style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }}
                  >
                    {t.name}
                    {t.qty ? ` · ${Number(t.qty).toLocaleString('en-IN')} pcs` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Remarks */}
          {bill.remarks && (
            <div className="mt-2 p-3 rounded-[8px] bg-slate-50 border text-xs" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-1">Remarks</p>
              <p className="text-text-primary">{bill.remarks}</p>
            </div>
          )}
        </SectionCard>

        {/* ── 2. Advance Cash Payments ── */}
        <SectionCard title="Advance Cash Payments" icon="💵">
          {cashPays.length === 0 ? (
            <EmptyNote text="No advance cash payments recorded." />
          ) : (
            <div className="overflow-x-auto rounded-[10px] border text-xs" style={{ borderColor: 'var(--color-border)' }}>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="p-2 font-bold">Payment ID</th>
                    <th className="p-2 font-bold">Requested</th>
                    <th className="p-2 font-bold">Paid</th>
                    <th className="p-2 font-bold">Remaining</th>
                    <th className="p-2 font-bold">Status</th>
                    <th className="p-2 font-bold">Date & Time</th>
                  </tr>
                </thead>
                <tbody>
                  {cashPays.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-slate-50 transition" style={{ borderColor: 'var(--color-border)' }}>
                      <td className="p-2 font-mono text-[11px]">{p.id?.slice(0, 8)}</td>
                      <td className="p-2 font-bold text-info">₹{Number(p.amount || 0).toLocaleString('en-IN')}</td>
                      <td className="p-2 font-semibold text-success">₹{Number(p.paid_amount ?? p.amount ?? 0).toLocaleString('en-IN')}</td>
                      <td className="p-2">{p.remaining_balance != null ? `₹${Number(p.remaining_balance).toLocaleString('en-IN')}` : '—'}</td>
                      <td className="p-2 capitalize font-semibold">{p.status || 'requested'}</td>
                      <td className="p-2 text-text-muted">{p.created_at ? new Date(p.created_at).toLocaleString('en-IN') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* ── 3. Advance Bank Payments ── */}
        <SectionCard title="Advance Bank Payments" icon="🧾">
          {advPays.length === 0 ? (
            <EmptyNote text="No advance bank payments recorded." />
          ) : (
            <div className="overflow-x-auto rounded-[10px] border text-xs" style={{ borderColor: 'var(--color-border)' }}>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="p-2 font-bold">Payment ID</th>
                    <th className="p-2 font-bold">Mode</th>
                    <th className="p-2 font-bold">Requested</th>
                    <th className="p-2 font-bold">Paid</th>
                    <th className="p-2 font-bold">Remaining</th>
                    <th className="p-2 font-bold">Status</th>
                    <th className="p-2 font-bold">Details</th>
                    <th className="p-2 font-bold">Date & Time</th>
                  </tr>
                </thead>
                <tbody>
                  {advPays.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-slate-50 transition" style={{ borderColor: 'var(--color-border)' }}>
                      <td className="p-2 font-mono text-[11px]">{p.id?.slice(0, 8)}</td>
                      <td className="p-2 font-semibold uppercase">{p.advance_mode || 'advance'}</td>
                      <td className="p-2 font-bold text-info">₹{Number(p.amount || 0).toLocaleString('en-IN')}</td>
                      <td className="p-2 font-semibold text-success">₹{Number(p.paid_amount ?? p.amount ?? 0).toLocaleString('en-IN')}</td>
                      <td className="p-2">{p.remaining_balance != null ? `₹${Number(p.remaining_balance).toLocaleString('en-IN')}` : '—'}</td>
                      <td className="p-2 capitalize font-semibold">{p.status || 'requested'}</td>
                      <td className="p-2 text-text-muted">{p.upi_id || p.account_number || '—'}</td>
                      <td className="p-2 text-text-muted">{p.created_at ? new Date(p.created_at).toLocaleString('en-IN') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* ── 4. Vehicle Booking ── */}
        <SectionCard title="Vehicle Booking" icon="🚛">
          {vehicles.length === 0 ? (
            <EmptyNote text="No vehicle bookings associated." />
          ) : (
            <div className="space-y-3">
              {vehicles.map((v, i) => {
                const vPays = vehiclePayments.filter((p) => p.vehicle_booking_id === v.id);
                const paidAmt = vPays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
                const remaining = Math.max(0, Number(v.transport_charges || 0) - paidAmt);
                const assignedTanks = v.assigned_tanks || v.selectedTanks || [];
                return (
                  <div
                    key={v.id || i}
                    className="p-4 rounded-[12px] border space-y-3"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-extrabold text-sm text-primary">Vehicle {i + 1}: {v.vehicle_no || 'N/A'}</p>
                      <span
                        className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                        style={{
                          background: remaining === 0 ? '#dcfce7' : '#fef9c3',
                          color: remaining === 0 ? '#15803d' : '#a16207',
                        }}
                      >
                        {remaining === 0 ? '✓ Paid' : '⏳ Pending'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <InfoField label="Driver Name" value={v.driver_name} bold />
                      <InfoField label="Vehicle Number" value={v.vehicle_no} />
                      <InfoField label="Transport Charges" value={`₹${Number(v.transport_charges || 0).toLocaleString('en-IN')}`} />
                      <InfoField label="Remaining Balance" value={`₹${remaining.toLocaleString('en-IN')}`} />
                    </div>
                    {assignedTanks.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-1">Assigned Tanks</p>
                        <div className="flex flex-wrap gap-1.5">
                          {assignedTanks.map((t, ti) => (
                            <span
                              key={ti}
                              className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: 'var(--color-primary)15', color: 'var(--color-primary)', border: '1px solid var(--color-primary)30' }}
                            >
                              {typeof t === 'string' ? t : t.name || t.id}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {vPays.length > 0 && (
                      <div className="mt-3 bg-slate-50 p-3 rounded border border-slate-200">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Payment History</p>
                        <div className="space-y-2">
                          {vPays.map((p, idx) => (
                            <div key={idx} className="flex justify-between items-center border-b border-slate-200 pb-2 last:border-0 last:pb-0">
                              <span className="text-[11px] font-semibold text-slate-600">{new Date(p.created_at).toLocaleString()}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">{p.advance_mode || p.method}</span>
                                {p.upi_id && <span className="text-[10px] font-mono font-bold text-slate-500">{p.upi_id}</span>}
                                {p.account_number && <span className="text-[10px] font-mono font-bold text-slate-500">AC: {p.account_number}</span>}
                                <span className="text-xs font-black text-emerald-600">₹{Number(p.amount || 0).toLocaleString('en-IN')}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* ── 5. Seed Van Plan ── */}
        {!vanPlan ? (
          <SectionCard title="Seed Van Plan" icon="🚐">
            <EmptyNote text="No Seed Van Plan recorded yet." />
          </SectionCard>
        ) : isLegacyData(vanPlan) ? (
          <SectionCard title="Seed Van Plan" icon="🚐">
            <VanPlanView vanPlan={vanPlan} />
          </SectionCard>
        ) : (
          vehicles.map((v, i) => {
            const vData = vanPlan[v.id];
            if (!vData) return null;
            return (
              <SectionCard key={v.id} title={`Seed Van Plan (Vehicle ${i + 1}: ${v.vehicle_no || 'N/A'})`} icon="🚐">
                <VanPlanView vanPlan={vData} />
              </SectionCard>
            );
          })
        )}

        {/* ── 5.5. Packing Details ── */}
        <SectionCard title="Packing Details" icon="📦">
          {!packingData ? (
            <EmptyNote text="Packing data not yet recorded." />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-[8px] border text-center border-blue-200">
                  <p className="text-xs font-bold text-blue-600 uppercase">Total Quantity</p>
                  <p className="text-xl font-black text-blue-800">{Number(packingData.totalQuantity || 0).toLocaleString('en-IN')}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-[8px] border text-center border-green-200">
                  <p className="text-xs font-bold text-green-600 uppercase">Total Packets</p>
                  <p className="text-xl font-black text-green-800">{Number(packingData.totalPackets || 0).toLocaleString('en-IN')}</p>
                </div>
              </div>
              
              <div className="overflow-x-auto rounded-[8px] border" style={{ borderColor: 'var(--color-border)' }}>
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      <th className="p-3 font-bold border-r" style={{ borderColor: 'var(--color-border)' }}>Tank</th>
                      <th className="p-3 font-bold border-r" style={{ borderColor: 'var(--color-border)' }}>Vehicle</th>
                      <th className="p-3 font-bold border-r" style={{ borderColor: 'var(--color-border)' }}>Quantity</th>
                      <th className="p-3 font-bold border-r" style={{ borderColor: 'var(--color-border)' }}>Packets</th>
                      <th className="p-3 font-bold">Status & Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(packingData.tanks || []).map((t, idx) => {
                      const isFullyDone = t.quantity <= 0 && t.numberOfPackets <= 0 && (t.status === 'Transferred' || t.status === 'Returned');
                      const vIndex = vehicles.findIndex(v => (v.tank_ids || v.selectedTanks || []).includes(t.id));
                      const vehicleStr = t.isTransferTarget ? 'Target Tank' : (vIndex !== -1 ? `Vehicle ${vIndex + 1}` : 'Unassigned');
                      
                      return (
                        <tr key={idx} className="border-t hover:bg-slate-50 transition" style={{ borderColor: 'var(--color-border)' }}>
                          <td className="p-3 font-bold text-slate-800 border-r align-top" style={{ borderColor: 'var(--color-border)' }}>
                            {t.name}
                          </td>
                          <td className="p-3 font-bold text-slate-500 border-r text-xs uppercase align-top" style={{ borderColor: 'var(--color-border)' }}>
                            {vehicleStr}
                          </td>
                          <td className="p-3 font-extrabold text-primary border-r align-top" style={{ borderColor: 'var(--color-border)' }}>
                            {isFullyDone ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              Number(t.quantity).toLocaleString('en-IN')
                            )}
                          </td>
                          <td className="p-3 font-bold text-slate-700 border-r align-top" style={{ borderColor: 'var(--color-border)' }}>
                            {isFullyDone ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              t.numberOfPackets
                            )}
                          </td>
                          <td className="p-3 font-bold text-slate-700 align-top">
                            {isFullyDone ? (
                              <span className="font-extrabold uppercase tracking-wide text-xs">
                                {t.status}
                              </span>
                            ) : (
                              <div className="space-y-1">
                                <span className="uppercase tracking-wide text-[10px] px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-300 inline-block">
                                  {t.status === 'Stocking Completed' ? '✓ Completed' : (t.status || 'Pending')}
                                </span>
                                {t.isTransferTarget && t.transferredFrom && (
                                  <p className="text-[10px] font-bold text-blue-700 mt-1">
                                    Transferred From: {t.transferredFrom}
                                  </p>
                                )}
                                {!t.isTransferTarget && t.transferredPackets > 0 && (
                                  <p className="text-[10px] font-bold text-blue-700 mt-1">
                                    Transferred: {t.transferredPackets} pkts
                                  </p>
                                )}
                                {!t.isTransferTarget && t.returnedPackets > 0 && (
                                  <p className="text-[10px] font-bold text-red-700 mt-1">
                                    Returned: {t.returnedPackets} pkts
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SectionCard>

        {/* ── 6. Stocking Status ── */}
        {!stockingData ? (
          <SectionCard title="Stocking Status" icon="🌱">
            <EmptyNote text="Stocking status not yet recorded." />
          </SectionCard>
        ) : isLegacyData(stockingData) ? (
          <SectionCard title="Stocking Status" icon="🌱">
            <StockingStatusView stockingData={stockingData} />
          </SectionCard>
        ) : (
          vehicles.map((v, i) => {
            const vData = stockingData[v.id];
            if (!vData) return null;
            return (
              <SectionCard key={v.id} title={`Stocking Status (Vehicle ${i + 1}: ${v.vehicle_no || 'N/A'})`} icon="🌱">
                <StockingStatusView stockingData={vData} />
              </SectionCard>
            );
          })
        )}

        {/* ── 7. Outside Workers ── */}
        <SectionCard title="Outside Workers" icon="👷">
          {!workersData && outsideWorkerPayments.length === 0 ? (
            <EmptyNote text="Outside workers data not yet recorded." />
          ) : (
            <div className="space-y-3">
              {workersData && workersData.batches && workersData.batches.length > 0 ? (
                <div className="space-y-4">
                  {workersData.batches.map((batch, idx) => (
                    <div key={batch.batchId || idx} className="p-3 rounded-[12px] bg-slate-50 border space-y-3">
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
                      <div className="overflow-x-auto rounded-[10px] border text-xs bg-white" style={{ borderColor: 'var(--color-border)' }}>
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-800 text-white">
                              <th className="p-2.5 font-bold">Category</th>
                              <th className="p-2.5 font-bold">Qty</th>
                              <th className="p-2.5 font-bold">Amount (₹)</th>
                              <th className="p-2.5 font-bold text-right">Total (₹)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(batch.workers || []).filter(w => Number(w.quantity) > 0 || Number(w.amount) > 0).map((w) => (
                              <tr key={w.sNo} className="border-b hover:bg-slate-50 transition" style={{ borderColor: 'var(--color-border)' }}>
                                <td className="p-2.5 font-semibold">{w.category}</td>
                                <td className="p-2.5">{w.quantity || 0}</td>
                                <td className="p-2.5">₹{Number(w.amount || 0).toLocaleString('en-IN')}</td>
                                <td className="p-2.5 text-right font-bold text-primary">₹{Number(w.total || 0).toLocaleString('en-IN')}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-100 font-extrabold">
                              <td colSpan={3} className="p-2.5 text-right">Batch Total:</td>
                              <td className="p-2.5 text-right text-success">₹{Number(batch.grandTotal || 0).toLocaleString('en-IN')}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      {batch.remarks && (
                        <div className="p-2 rounded-[8px] bg-white border text-xs" style={{ borderColor: 'var(--color-border)' }}>
                          <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-1">Remarks</p>
                          <p>{batch.remarks}</p>
                        </div>
                      )}
                      {batch.supervisorSignature && (
                        <div className="pt-2 text-xs">
                          <p className="text-[10px] text-text-muted font-bold mb-1">Mestri / Supervisor Signature:</p>
                          <img
                            src={batch.supervisorSignature}
                            alt="Supervisor Signature"
                            className="h-16 border rounded-[8px] bg-white p-1 max-w-xs"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {outsideWorkerPayments.length > 0 && (
                    <div className="mt-3 bg-slate-50 p-3 rounded border border-slate-200">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Payment History</p>
                      <div className="space-y-2">
                        {outsideWorkerPayments.map((p, idx) => (
                          <div key={idx} className="flex justify-between items-center border-b border-slate-200 pb-2 last:border-0 last:pb-0">
                            <span className="text-[11px] font-semibold text-slate-600">{new Date(p.created_at).toLocaleString()}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">{p.method}</span>
                              {p.upi_id && <span className="text-[10px] font-mono font-bold text-slate-500">{p.upi_id}</span>}
                              {p.bank_account_id && <span className="text-[10px] font-mono font-bold text-slate-500">Bank Transfer</span>}
                              <span className="text-xs font-black text-emerald-600">₹{Number(p.amount || 0).toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : workersData ? (
                <>
                  <div className="overflow-x-auto rounded-[10px] border text-xs" style={{ borderColor: 'var(--color-border)' }}>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-800 text-white">
                          <th className="p-2.5 font-bold">Category</th>
                          <th className="p-2.5 font-bold">Qty</th>
                          <th className="p-2.5 font-bold">Amount (₹)</th>
                          <th className="p-2.5 font-bold text-right">Total (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(workersData.workers || []).map((w) => (
                          <tr key={w.sNo} className="border-b hover:bg-slate-50 transition" style={{ borderColor: 'var(--color-border)' }}>
                            <td className="p-2.5 font-semibold">{w.category}</td>
                            <td className="p-2.5">{w.quantity || 0}</td>
                            <td className="p-2.5">₹{Number(w.amount || 0).toLocaleString('en-IN')}</td>
                            <td className="p-2.5 text-right font-bold text-primary">₹{Number(w.total || 0).toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 font-extrabold">
                          <td colSpan={3} className="p-2.5 text-right">Grand Total:</td>
                          <td className="p-2.5 text-right text-success">₹{Number(workersData.grandTotal || 0).toLocaleString('en-IN')}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Payments & Remaining */}
                  {(workersData.upiId || workersData.totalPaid != null) && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                      {workersData.upiId && <InfoField label="Payment UPI ID" value={workersData.upiId} mono />}
                      {workersData.totalPaid != null && (
                        <InfoField label="Amount Paid" value={`₹${Number(workersData.totalPaid || 0).toLocaleString('en-IN')}`} success bold />
                      )}
                      {workersData.remainingBalance != null && (
                        <InfoField label="Remaining Balance" value={`₹${Number(workersData.remainingBalance || 0).toLocaleString('en-IN')}`} />
                      )}
                    </div>
                  )}

                  {outsideWorkerPayments.length > 0 && (
                    <div className="mt-3 bg-slate-50 p-3 rounded border border-slate-200">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Payment History</p>
                      <div className="space-y-2">
                        {outsideWorkerPayments.map((p, idx) => (
                          <div key={idx} className="flex justify-between items-center border-b border-slate-200 pb-2 last:border-0 last:pb-0">
                            <span className="text-[11px] font-semibold text-slate-600">{new Date(p.created_at).toLocaleString()}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">{p.method}</span>
                              {p.upi_id && <span className="text-[10px] font-mono font-bold text-slate-500">{p.upi_id}</span>}
                              {p.bank_account_id && <span className="text-[10px] font-mono font-bold text-slate-500">Bank Transfer</span>}
                              <span className="text-xs font-black text-emerald-600">₹{Number(p.amount || 0).toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Supervisor */}
                  {(workersData.supervisorName || workersData.supervisorPhone) && (
                    <div className="p-3 rounded-[10px] bg-slate-50 border text-xs space-y-1 mt-3" style={{ borderColor: 'var(--color-border)' }}>
                      <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Supervisor Details</p>
                      <p>
                        <strong>{workersData.supervisorName}</strong>
                        {workersData.supervisorPhone ? ` · ${workersData.supervisorPhone}` : ''}
                      </p>
                      {workersData.supervisorSignature && (
                        <div className="pt-1">
                          <p className="text-[10px] text-text-muted font-bold mb-1">Digital Signature:</p>
                          <img
                            src={workersData.supervisorSignature}
                            alt="Supervisor Signature"
                            className="h-16 border rounded-[8px] bg-white p-1 max-w-xs"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Remarks */}
                  {workersData.remarks && (
                    <div className="p-3 rounded-[8px] bg-slate-50 border text-xs" style={{ borderColor: 'var(--color-border)' }}>
                      <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-1">Remarks</p>
                      <p>{workersData.remarks}</p>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </SectionCard>

        {/* ── 7.5. Packing History ── */}
        {bill.timeline && bill.timeline.some(t => t.process === 'Packing') && (
          <SectionCard title="Packing History" icon="📦">
            <div className="overflow-x-auto rounded-[10px] border text-xs" style={{ borderColor: 'var(--color-border)' }}>
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="p-2 font-bold">Date & Time</th>
                    <th className="p-2 font-bold">Process</th>
                    <th className="p-2 font-bold">Action</th>
                    <th className="p-2 font-bold">Vehicle</th>
                    <th className="p-2 font-bold">Source Tank</th>
                    <th className="p-2 font-bold">Target Tank</th>
                    <th className="p-2 font-bold text-right">Quantity</th>
                    <th className="p-2 font-bold text-right">Packets</th>
                    <th className="p-2 font-bold text-right">Remaining Qty</th>
                    <th className="p-2 font-bold text-right">Remaining Pkts</th>
                    <th className="p-2 font-bold">Reason</th>
                    <th className="p-2 font-bold">Bill Number</th>
                    <th className="p-2 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.timeline.filter(t => t.process === 'Packing').map(t => (
                    <tr key={t.id} className="border-b hover:bg-slate-50 transition" style={{ borderColor: 'var(--color-border)' }}>
                      <td className="p-2">{t.date} {t.time}</td>
                      <td className="p-2 font-semibold text-slate-700">{t.process}</td>
                      <td className="p-2 font-bold text-primary">{t.action}</td>
                      <td className="p-2">{t.vehicle || '—'}</td>
                      <td className="p-2 font-semibold">{t.sourceTank || '—'}</td>
                      <td className="p-2 font-semibold">{t.targetTank || '—'}</td>
                      <td className="p-2 text-right text-info font-bold">{t.quantity != null ? Number(t.quantity).toLocaleString('en-IN') : '—'}</td>
                      <td className="p-2 text-right font-bold">{t.packets != null ? t.packets : '—'}</td>
                      <td className="p-2 text-right text-emerald-600 font-bold">{t.remainingQty != null ? Number(t.remainingQty).toLocaleString('en-IN') : '—'}</td>
                      <td className="p-2 text-right font-bold text-emerald-600">{t.remainingPackets != null ? t.remainingPackets : '—'}</td>
                      <td className="p-2 text-slate-500 max-w-[150px] truncate" title={t.reason}>{t.reason !== '—' && t.reason ? t.reason : '—'}</td>
                      <td className="p-2 font-mono text-[10px] text-slate-500">{t.billNumber !== '—' && t.billNumber ? t.billNumber : '—'}</td>
                      <td className="p-2 capitalize font-semibold">
                        <StatusPill status={t.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {/* ── 8. Activity Timeline ── */}
        <ActivityTimeline timeline={bill.timeline} />
      </div>
    </div>
  );
}