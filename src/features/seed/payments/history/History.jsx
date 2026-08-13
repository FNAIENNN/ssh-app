import { useEffect, useMemo, useState } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { formatDate } from '../../../../hooks/useTrailNettingCadence';
import LedgerTable from '../../../../components/payments/LedgerTable';

/**
 * Payment History (PRD §7.2).
 *
 * Lists every bill number for the site with a search box. Selecting a bill
 * shows three category tables one below the other — Seed, Vehicle, Workers —
 * each with: Total amount · Advance payment · Cash payment · Pending amount.
 *
 * If a category has a pending amount, a button sends the user back to the
 * Payments tab (via `onPayPending(bill)`) to clear it, prefilled with the bill.
 */
export default function History({ siteId, onPayPending }) {
  const [bills, setBills] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    (async () => {
      const { data: b } = await supabase
        .from(TABLES.bills)
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false });
      const { data: p } = await supabase
        .from(TABLES.payments)
        .select('*')
        .eq('site_id', siteId);
      setBills(b ?? []);
      setPayments(p ?? []);
      setLoading(false);
      if (b?.length && !selectedId) setSelectedId(b[0].id);
    })();
  }, [siteId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bills;
    return bills.filter((b) => String(b.bill_number ?? '').toLowerCase().includes(q));
  }, [bills, query]);

  const bill = bills.find((b) => b.id === selectedId) ?? null;

  if (loading) {
    return <p className="text-sm text-text-muted p-2">Loading history…</p>;
  }
  if (!bills.length) {
    return (
      <div className="card p-6 text-sm text-text-muted">
        No bills yet. Generate one from <strong>Seed Payments → Proceed to Pay</strong>.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Bill list + search */}
      <div className="card p-4 lg:col-span-1">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-bold">History</h3>
          <span
            className="chip ml-auto"
            style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}
          >
            {bills.length} bill{bills.length === 1 ? '' : 's'}
          </span>
        </div>
        <input
          className="field mb-3"
          placeholder="Search bill number…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="space-y-1 max-h-[60vh] overflow-y-auto scroll-thin">
          {filtered.map((b) => {
            const active = b.id === selectedId;
            return (
              <button
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                className="w-full text-left rounded-[10px] px-3 py-2 border transition"
                style={{
                  borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                  background: active ? 'rgba(26,26,46,0.06)' : 'transparent',
                }}
              >
                <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  {b.bill_number}
                </span>
                <span className="block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  {formatDate(b.created_at)}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-xs text-text-muted p-2">No bills match “{query}”.</p>
          )}
        </div>
      </div>

      {/* Bill detail — 3 category tables */}
      <div className="lg:col-span-2 space-y-4">
        {bill ? (
          <BillDetail
            bill={bill}
            payments={payments.filter((p) => p.bill_id === bill.id)}
            onPayPending={onPayPending}
          />
        ) : (
          <div className="card p-6 text-sm text-text-muted">Select a bill to view its details.</div>
        )}
      </div>
    </div>
  );
}

/**
 * Renders the three category tables (Seed / Vehicle / Workers) for a bill.
 * Each row aggregates that category's payments.
 */
function BillDetail({ bill, payments, onPayPending }) {
  // Seed total is the bill's own seed_total; vehicle/workers totals come from
  // linked payments of that type (a seed bill may also carry linked advances).
  const rows = [
    categoryRow('seed', 'Seed Payments', '🌱', 'var(--color-success)', bill.seed_total, payments),
    categoryRow('vehicle', 'Vehicle Payments', '🚚', 'var(--color-info)', bill.vehicle_total, payments),
    categoryRow('outside_worker', 'Workers Payments', '👷', 'var(--color-warning)', bill.workers_total, payments),
  ];

  return (
    <>
      <div
        className="rounded-[16px] px-5 py-4 flex items-center justify-between"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
          boxShadow: '0 4px 16px rgba(26,26,46,0.25)',
        }}
      >
        <div>
          <p className="text-xs font-semibold text-white/70">Bill</p>
          <p className="text-xl font-extrabold text-white tracking-wide">{bill.bill_number}</p>
        </div>
        <p className="text-xs text-white/80">{formatDate(bill.created_at)}</p>
      </div>

      {rows.map((r) => (
        <CategoryTable key={r.type} {...r} onPayPending={onPayPending ? () => onPayPending(bill) : null} bill={bill} />
      ))}
    </>
  );
}

function CategoryTable({ label, icon, color, total, advance, cash, pending, onPayPending }) {
  const columns = ['Total Amount', 'Advance Payment', 'Cash Payment', 'Pending Amount'];
  const fmt = (n) => (n ? `₹${Number(n).toLocaleString('en-IN')}` : '—');
  const cells = [
    <span className="text-xs font-extrabold">{fmt(total)}</span>,
    <span className="text-xs font-semibold">{fmt(advance)}</span>,
    <span className="text-xs font-semibold">{fmt(cash)}</span>,
    pending > 0 ? (
      <span className="inline-flex items-center gap-2">
        <span className="chip" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
          {fmt(pending)}
        </span>
        {onPayPending && (
          <button onClick={onPayPending} className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
            Pay →
          </button>
        )}
      </span>
    ) : (
      <span className="chip" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
        Cleared
      </span>
    ),
  ];

  return (
    <LedgerTable
      title={`${icon} ${label}`}
      color={color}
      icon={icon}
      columns={columns}
      rows={[cells]}
    />
  );
}

/**
 * Compute one category row's totals from a bill + its linked payments.
 *   total    = bill seed_total for seed, else Σ payments of that type
 *   advance  = Σ advance-method payments of that type
 *   cash     = Σ cash-method payments of that type
 *   pending  = total − (advance + cash)
 */
function categoryRow(type, label, icon, color, billFieldTotal, payments) {
  const cat = payments.filter((p) => p.type === type);
  const advance = cat.filter((p) => p.method === 'advance').reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const cash = cat.filter((p) => p.method === 'cash').reduce((s, p) => s + (Number(p.amount) || 0), 0);
  // Seed: prefer the bill's own seed_total; otherwise fall back to Σ seed payments.
  const total = type === 'seed' && billFieldTotal ? Number(billFieldTotal) : cat.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const pending = Math.max(0, total - advance - cash);
  return { type, label, icon, color, total, advance, cash, pending };
}
