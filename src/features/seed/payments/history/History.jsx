/**
 * History — Complete bill archive for the Seed module.
 *
 * Shows ALL bills (Past Orders + Completed). Clicking a bill shows a
 * full read-only audit view using the shared BillDetailsReadOnly component.
 *
 * Search: Bill Number, Hatchery, Driver, Vehicle, Tank
 * Filters: Day / Week / Month / Year
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import BillDetailsReadOnly from '../BillDetailsReadOnly';

// ── Date filter helpers ────────────────────────────────────────────────────

function isWithin(dateStr, range) {
  if (!dateStr || range === 'all') return true;
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (range === 'day') return diffDays <= 1;
  if (range === 'week') return diffDays <= 7;
  if (range === 'month') return diffDays <= 31;
  if (range === 'year') return diffDays <= 365;
  return true;
}

function statusBadgeStyle(b) {
  const s = b.status || 'Draft';
  if (s === 'Completed' || b.stocking_status === 'completed')
    return { bg: '#dcfce7', color: '#15803d', border: '#22c55e', label: '✓ Completed' };
  if (s === 'Seed Stocking In Progress')
    return { bg: '#dbeafe', color: '#1d4ed8', border: '#3b82f6', label: '🌱 Stocking…' };
  if (s === 'Vehicle Payment Requested')
    return { bg: '#ede9fe', color: '#6d28d9', border: '#8b5cf6', label: '🚛 Vehicle Pay Req.' };
  if (s === 'Payment Requested')
    return { bg: '#fef3c7', color: '#b45309', border: '#f59e0b', label: '💳 Payment Req.' };
  if (s === 'Pending Seed Stocking')
    return { bg: '#fef9c3', color: '#a16207', border: '#eab308', label: '📦 Pending Stocking' };
  return { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', label: `📝 ${s}` };
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function History({ siteId }) {
  const [allBills, setAllBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');

  // Selected bill for detail view
  const [selectedBill, setSelectedBill] = useState(null);
  const [billPayments, setBillPayments] = useState([]);
  const [billVehicles, setBillVehicles] = useState([]);
  const [vehiclePayments, setVehiclePayments] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    loadHistory();
  }, [siteId]);

  async function loadHistory() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from(TABLES.bills)
        .select('*')
        .eq('site_id', siteId)
        .in('type', ['seed', 'seed_order', 'return'])
        .order('created_at', { ascending: false });
      setAllBills(data ?? []);
    } catch (err) {
      console.error('loadHistory error:', err);
      setAllBills([]);
    } finally {
      setLoading(false);
    }
  }

  async function openBill(bill) {
    setSelectedBill(bill);
    setLoadingDetail(true);
    try {
      const [{ data: pays }, { data: vehs }] = await Promise.all([
        supabase
          .from(TABLES.payments)
          .select('*')
          .eq('bill_id', bill.id)
          .order('created_at', { ascending: true }),
        supabase.from(TABLES.vehicleBookings).select('*').eq('bill_id', bill.id),
      ]);

      setBillPayments(pays ?? []);
      setBillVehicles(vehs ?? []);

      // Load vehicle payments separately
      const { data: vPays } = await supabase
        .from(TABLES.payments)
        .select('*')
        .eq('bill_id', bill.id)
        .eq('type', 'vehicle');
      setVehiclePayments(vPays ?? []);
    } finally {
      setLoadingDetail(false);
    }
  }

  function closeDetail() {
    setSelectedBill(null);
    setBillPayments([]);
    setBillVehicles([]);
    setVehiclePayments([]);
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filteredBills = useMemo(() => {
    let result = allBills.filter((b) => isWithin(b.created_at, dateFilter));

    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((b) => {
        if ((b.bill_number || '').toLowerCase().includes(q)) return true;
        if ((b.hatchery || '').toLowerCase().includes(q)) return true;
        if ((b.selected_tanks || []).some((t) => t.name?.toLowerCase().includes(q))) return true;
        // Search in new drum format
        if (b.van_plan?.drums) {
          if (b.van_plan.drums.some((d) => d.tankName?.toLowerCase().includes(q))) return true;
        }
        // Search in old row format
        if (b.van_plan?.rows) {
          for (const r of b.van_plan.rows) {
            if (r.left?.tankName?.toLowerCase().includes(q)) return true;
            if (r.right?.tankName?.toLowerCase().includes(q)) return true;
          }
        }
        return false;
      });
    }
    return result;
  }, [allBills, query, dateFilter]);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Bill Detail View — uses shared BillDetailsReadOnly
  // ══════════════════════════════════════════════════════════════════════════
  if (selectedBill) {
    if (loadingDetail) {
      return (
        <div className="max-w-4xl mx-auto p-8 text-center">
          <p className="text-sm text-text-muted animate-pulse">Loading bill details…</p>
        </div>
      );
    }
    return (
      <BillDetailsReadOnly
        bill={selectedBill}
        payments={billPayments}
        vehicles={billVehicles}
        vehiclePayments={vehiclePayments}
        onBack={closeDetail}
        showExport
      />
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: History List
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-extrabold flex items-center gap-2">
          <span>🕓</span> History
        </h2>
        <p className="text-xs text-text-secondary">Complete archive of all seed order bills.</p>
      </div>

      {/* Search & Filters */}
      <div
        className="flex flex-wrap items-center gap-3 p-4 rounded-[12px] bg-white border"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <input
          type="text"
          className="field text-xs py-1.5 flex-1 min-w-[180px]"
          placeholder="🔍 Search by bill no., hatchery, tank…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'all', label: 'All Time' },
            { id: 'day', label: 'Today' },
            { id: 'week', label: 'This Week' },
            { id: 'month', label: 'This Month' },
            { id: 'year', label: 'This Year' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setDateFilter(f.id)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border transition"
              style={{
                background: dateFilter === f.id ? 'var(--color-primary)' : 'transparent',
                color: dateFilter === f.id ? '#fff' : 'var(--color-text-secondary)',
                borderColor: dateFilter === f.id ? 'var(--color-primary)' : 'var(--color-border)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-text-muted p-4 animate-pulse">Loading history…</p>
      ) : filteredBills.length === 0 ? (
        <div className="card p-8 text-center space-y-2 border-dashed border-2">
          <div className="text-4xl">📂</div>
          <p className="font-bold">No bills found</p>
          <p className="text-xs text-text-muted">
            {query || dateFilter !== 'all'
              ? 'Try changing filters or search terms.'
              : 'Complete a Seed Order workflow to see bills here.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredBills.map((b) => {
            const badge = statusBadgeStyle(b);
            const isCompleted = b.status === 'Completed' || b.stocking_status === 'completed';
            return (
              <div
                key={b.id}
                onClick={() => openBill(b)}
                className="card p-5 border cursor-pointer hover:shadow-lg transition space-y-3"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-sm font-extrabold px-3 py-1 rounded-full text-white"
                    style={{ background: isCompleted ? '#059669' : 'var(--color-primary)' }}
                  >
                    {b.bill_number}
                  </span>
                  <span
                    className="text-xs font-extrabold px-2.5 py-0.5 rounded-full"
                    style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                  >
                    {badge.label}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-text-secondary">
                  <p className="font-bold text-sm text-text-primary">{b.hatchery || 'Hatchery Not Specified'}</p>
                  <p>Seed Type: <strong>{b.seed_type || '—'}</strong></p>
                  <p>Quantity: <strong>{Number(b.overall_quantity || 0).toLocaleString('en-IN')}</strong> pcs</p>
                  {(b.selected_tanks || []).length > 0 && (
                    <p>
                      Tanks: <strong>{(b.selected_tanks || []).map((t) => t.name).join(', ')}</strong>
                    </p>
                  )}
                  <p>Created: {new Date(b.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                </div>

                <div
                  className="pt-2 border-t flex items-center justify-between"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-text-muted">Total Price</p>
                    <p className="text-base font-extrabold text-success">
                      ₹{Number(b.seed_total || 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <span
                    className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}
                  >
                    View Details 👁️
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