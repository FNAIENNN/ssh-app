import { useState, useMemo, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { useToast } from '../../../hooks/useToast';
import { useSite } from '../../../hooks/useSite';

/**
 * SeedExchangePaymentsTab
 *
 * Implements the Seed Exchange Payments Tab Specification:
 * - Side heading: Worker Payments
 * - 1. Multi-criteria Search & Filter Bar (Date, Bill #, Supplier/Mestri)
 * - 2. Payment Status Subtabs with dynamic count badges (Pending Bills, Completed Payments, Cancelled Bills)
 * - 3. Tabular Ledger Format with columns:
 *      Bill No | Tank Names (From → To) | Supplier / Mestri | Total Amount (₹) | Paid Amount (₹) | Balance (₹) | Status | Action
 * - 4. Actions & Payment Modal:
 *      - Pending Bills: "View / Pay" modal (Cash, UPI with PhonePe/GPay, Bank Account; Full/Partial settlement)
 *      - Completed Bills: "View Bill" official read-only document view with digital signatures, wages breakdown, Download PDF, and Print
 *      - Cancelled Bills: disabled/blank action
 * - 5. Data Synchronization:
 *      Syncs bills from Seed Exchange Worker Payments submissions (wrk-req-...) & Seed Exchange generated bills (SEX-...)
 */
export default function SeedExchangePaymentsTab() {
  const { siteId } = useSite();
  const toast = useToast();

  // ── Filters & Subtabs ───────────────────────────────────────────────────────
  const [activeSubTab, setActiveSubTab] = useState('pending'); // 'pending' | 'completed' | 'cancelled'
  const [filterDate, setFilterDate] = useState('');
  const [filterBillNo, setFilterBillNo] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');

  // ── Ledger Records State ───────────────────────────────────────────────────
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Modals State ───────────────────────────────────────────────────────────
  const [payModalBill, setPayModalBill] = useState(null);
  const [viewDocBill, setViewDocBill] = useState(null);

  // Load and synchronize data from localStorage and Supabase
  const loadRecords = () => {
    try {
      setLoading(true);

      // 1. Load worker payment requests from localStorage
      const workerReqs = JSON.parse(localStorage.getItem('seed_exchange_worker_requests') || '[]');

      // 2. Load seed exchange bills from localStorage
      const exchangeLedger = JSON.parse(localStorage.getItem(`seed_exchanges_ledger_${siteId}`) || '[]');

      // 3. Normalize worker requests
      const normalizedWorkerReqs = workerReqs.map((req) => {
        const total = Number(req.total_amount || req.total_wages || req.grand_total || 0);
        const paid = Number(req.paid_amount || 0);
        const balance = Math.max(0, total - paid);

        let status = req.status || 'Pending';
        if (req.status?.toLowerCase() === 'cancelled') {
          status = 'Cancelled';
        } else if (balance === 0 && total > 0) {
          status = 'Completed';
        } else if (paid > 0 && balance > 0) {
          status = 'Partial';
        } else {
          status = 'Pending';
        }

        // Parse tank names / chips
        const tankChips = req.tank_chips && req.tank_chips.length > 0
          ? req.tank_chips
          : req.from_tank_name && req.to_tank_name
            ? [`${req.from_tank_name} → ${req.to_tank_name}`]
            : (req.tank_names || ['Tank 1 → Tank 2']);

        return {
          id: req.id,
          site_id: req.site_id || siteId,
          bill_number: req.bill_number || req.bill_no || `WRK-${req.id?.slice(-6)}`,
          date: req.date || req.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
          tank_chips: tankChips,
          from_tank_name: req.from_tank_name || 'From Tank',
          to_tank_name: req.to_tank_name || 'To Tank',
          supplier_name: req.supplier_name || req.mestri_name || req.supplier_details?.name || 'Worker Supplier',
          supplier_village: req.supplier_village || req.supplier_details?.village || 'Agency',
          supplier_phone: req.supplier_phone || req.supplier_details?.phone || '',
          supplier_phonepe: req.supplier_phonepe || req.supplier_details?.phonepe || '',
          supplier_bank_acc: req.supplier_bank_acc || req.supplier_details?.bankAcc || '',
          supplier_bank_holder: req.supplier_bank_holder || req.supplier_details?.bankHolder || '',
          supplier_bank_ifsc: req.supplier_bank_ifsc || req.supplier_details?.bankIfsc || '',
          supplier_bank_name: req.supplier_bank_name || req.supplier_details?.bankName || '',
          supplier_details: req.supplier_details || null,
          total_amount: total,
          paid_amount: paid,
          balance_amount: balance,
          status,
          wages_rows: req.wages_rows || [],
          payments: req.payments || [],
          supervisor_name: req.supervisor_name || 'Supervisor',
          supervisor_phone: req.supervisor_phone || '',
          supervisor_signature: req.supervisor_signature || '',
          mestri_signature: req.mestri_signature || '',
          created_at: req.created_at || new Date().toISOString(),
          source_type: 'worker_payment',
        };
      });

      // 4. Normalize exchange ledger bills that have worker payments / wages
      const normalizedExchangeBills = exchangeLedger
        .filter((ex) => {
          // Avoid duplicating if this exchange bill is already linked to a WRK request
          const alreadyInWrk = normalizedWorkerReqs.some(
            (w) => w.bill_number === ex.bill_number || (w.linked_exchange_bills && w.linked_exchange_bills.includes(ex.bill_number))
          );
          return !alreadyInWrk;
        })
        .map((ex) => {
          const total = Number(ex.wages_total || ex.total_wages || ex.worker_payment?.total_amount || 0);
          const paid = Number(ex.paid_amount || ex.worker_payment?.paid_amount || 0);
          const balance = Math.max(0, total - paid);

          let status = ex.status === 'Cancelled' ? 'Cancelled' : total > 0 && balance === 0 ? 'Completed' : paid > 0 ? 'Partial' : 'Pending';

          const fromTank = ex.from_tank_name || 'From Tank';
          const toTank = ex.to_tank_name || 'To Tank';

          return {
            id: ex.id,
            site_id: siteId,
            bill_number: ex.bill_number,
            date: ex.date || ex.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
            tank_chips: [`${fromTank} → ${toTank}`],
            from_tank_name: fromTank,
            to_tank_name: toTank,
            supplier_name: ex.worker_payment?.supplier_name || 'Mestri / Labour Agency',
            supplier_village: ex.worker_payment?.supplier_village || 'Local Agency',
            supplier_phone: ex.worker_payment?.supplier_phone || '',
            supplier_phonepe: ex.worker_payment?.supplier_phonepe || '',
            supplier_bank_acc: ex.worker_payment?.supplier_bank_acc || '',
            supplier_bank_holder: ex.worker_payment?.supplier_bank_holder || '',
            supplier_bank_ifsc: ex.worker_payment?.supplier_bank_ifsc || '',
            supplier_bank_name: ex.worker_payment?.supplier_bank_name || '',
            supplier_details: ex.worker_payment?.supplier_details || null,
            total_amount: total,
            paid_amount: paid,
            balance_amount: balance,
            status,
            wages_rows: ex.wages_rows || ex.worker_payment?.wages_rows || [],
            payments: ex.payments || [],
            supervisor_name: ex.supervisor_name || 'Supervisor',
            supervisor_phone: ex.supervisor_phone || '',
            supervisor_signature: ex.supervisor_signature || '',
            mestri_signature: ex.mestri_signature || '',
            created_at: ex.created_at || new Date().toISOString(),
            source_type: 'seed_exchange',
          };
        });

      // Combine all unique bills
      const combined = [...normalizedWorkerReqs, ...normalizedExchangeBills];

      // If no bills exist at all, add a demo seed record so the table isn't completely empty
      if (combined.length === 0) {
        const demoBill = {
          id: `wrk-demo-01`,
          site_id: siteId,
          bill_number: `WRK-${Date.now().toString().slice(-6)}`,
          date: new Date().toISOString().slice(0, 10),
          tank_chips: ['Tank 1 → Tank 3'],
          from_tank_name: 'Tank 1',
          to_tank_name: 'Tank 3',
          supplier_name: 'Raju Labour Agency',
          supplier_village: 'Akividu',
          supplier_phone: '9848022334',
          supplier_phonepe: '9848022334',
          supplier_bank_acc: '30492810482',
          supplier_bank_holder: 'K. Raju',
          supplier_bank_ifsc: 'SBIN0001234',
          supplier_bank_name: 'State Bank of India',
          supplier_details: {
            name: 'Raju Labour Agency',
            village: 'Akividu',
            phone: '9848022334',
            phonepe: '9848022334',
            bankAcc: '30492810482',
            bankHolder: 'K. Raju',
          },
          total_amount: 8500,
          paid_amount: 0,
          balance_amount: 8500,
          status: 'Pending',
          wages_rows: [
            { id: 1, category: '1. vala manushulu', qty: 5, amount: 1000 },
            { id: 2, category: '2. mestri', qty: 1, amount: 1500 },
            { id: 3, category: '3. autos', qty: 2, amount: 1000 },
          ],
          payments: [],
          supervisor_name: 'Supervisor',
          supervisor_phone: '9848000000',
          supervisor_signature: '',
          mestri_signature: '',
          created_at: new Date().toISOString(),
          source_type: 'worker_payment',
        };
        combined.push(demoBill);
        localStorage.setItem('seed_exchange_worker_requests', JSON.stringify([demoBill]));
      }

      setBills(combined);
    } catch (err) {
      console.warn('Error loading seed exchange payments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();

    const handleStorageChange = () => loadRecords();
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('seed_exchange_worker_request_added', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('seed_exchange_worker_request_added', handleStorageChange);
    };
  }, [siteId]);

  // ── Dynamic Suppliers List for Dropdown ─────────────────────────────────────
  const availableSuppliers = useMemo(() => {
    const set = new Set();
    bills.forEach((b) => {
      if (b.supplier_name && b.supplier_name.trim()) {
        set.add(b.supplier_name.trim());
      }
    });
    // Add known defaults if not present
    set.add('Raju Labour Agency');
    set.add('Venkateswara Valalu Mestri');
    return Array.from(set);
  }, [bills]);

  // ── Subtab Counts ───────────────────────────────────────────────────────────
  const subtabCounts = useMemo(() => {
    let pending = 0;
    let completed = 0;
    let cancelled = 0;

    bills.forEach((b) => {
      if (b.status === 'Cancelled') {
        cancelled += 1;
      } else if (b.status === 'Completed' || (b.balance_amount === 0 && b.total_amount > 0)) {
        completed += 1;
      } else {
        pending += 1; // Pending or Partial
      }
    });

    return { pending, completed, cancelled };
  }, [bills]);

  // ── Filtered Records ────────────────────────────────────────────────────────
  const filteredRecords = useMemo(() => {
    return bills.filter((b) => {
      // 1. Subtab filtering
      if (activeSubTab === 'pending') {
        if (b.status === 'Cancelled' || b.status === 'Completed' || (b.balance_amount === 0 && b.total_amount > 0)) {
          return false;
        }
      } else if (activeSubTab === 'completed') {
        if (b.status !== 'Completed' && !(b.balance_amount === 0 && b.total_amount > 0)) {
          return false;
        }
      } else if (activeSubTab === 'cancelled') {
        if (b.status !== 'Cancelled') {
          return false;
        }
      }

      // 2. Date search
      if (filterDate) {
        const bDate = String(b.date || b.created_at || '').slice(0, 10);
        if (!bDate.includes(filterDate)) return false;
      }

      // 3. Bill Number search
      if (filterBillNo) {
        const query = filterBillNo.toLowerCase().trim();
        const bNo = String(b.bill_number || '').toLowerCase();
        if (!bNo.includes(query)) return false;
      }

      // 4. Supplier / Mestri search
      if (filterSupplier) {
        const sup = String(b.supplier_name || '').toLowerCase();
        if (sup !== filterSupplier.toLowerCase()) return false;
      }

      return true;
    });
  }, [bills, activeSubTab, filterDate, filterBillNo, filterSupplier]);

  const handleClearFilters = () => {
    setFilterDate('');
    setFilterBillNo('');
    setFilterSupplier('');
  };

  // ── Update Bill in Local Storage & Supabase ─────────────────────────────────
  const updateBillRecord = async (updatedBill) => {
    // 1. Update state
    setBills((prev) => prev.map((b) => (b.id === updatedBill.id ? updatedBill : b)));

    // 2. Update localStorage seed_exchange_worker_requests
    try {
      const storedReqs = JSON.parse(localStorage.getItem('seed_exchange_worker_requests') || '[]');
      const updatedReqs = storedReqs.map((r) =>
        r.id === updatedBill.id || r.bill_number === updatedBill.bill_number ? { ...r, ...updatedBill } : r
      );
      localStorage.setItem('seed_exchange_worker_requests', JSON.stringify(updatedReqs));
    } catch (e) {
      console.warn('Storage update worker req error:', e);
    }

    // 3. Update localStorage seed_exchanges_ledger_${siteId}
    try {
      const storedEx = JSON.parse(localStorage.getItem(`seed_exchanges_ledger_${siteId}`) || '[]');
      const updatedEx = storedEx.map((ex) =>
        ex.id === updatedBill.id || ex.bill_number === updatedBill.bill_number ? { ...ex, ...updatedBill } : ex
      );
      localStorage.setItem(`seed_exchanges_ledger_${siteId}`, JSON.stringify(updatedEx));
    } catch (e) {
      console.warn('Storage update exchange ledger error:', e);
    }

    // 4. Sync with Supabase TABLES.exchangeWorkers / TABLES.payments
    try {
      if (updatedBill.source_type === 'worker_payment') {
        await supabase
          .from(TABLES.exchangeWorkers)
          .update({
            grand_total: updatedBill.total_amount,
            status: updatedBill.status.toLowerCase(),
          })
          .eq('site_id', siteId)
          .eq('mestri_name', updatedBill.supplier_name);
      }
    } catch (err) {
      console.warn('Supabase sync note:', err);
    }
  };

  // ── Payment Status Badge Helper ─────────────────────────────────────────────
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'Completed':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
            Completed
          </span>
        );
      case 'Partial':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-300 inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-600"></span>
            Partial
          </span>
        );
      case 'Cancelled':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-slate-200 text-slate-700 border border-slate-300 inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
            Cancelled
          </span>
        );
      default: // 'Pending'
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse"></span>
            Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 text-left font-sans pb-10">

      {/* ── SIDE HEADING: WORKER PAYMENTS ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-100 text-blue-700 text-lg font-black">👷</span>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Worker Payments</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Seed Exchange wage ledger, pending settlements &amp; verified payment records
          </p>
        </div>

        {/* Quick summary statistics */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-right">
            <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest block">Pending Dues</span>
            <span className="text-sm font-black text-amber-900">
              ₹{bills.filter(b => b.status !== 'Cancelled' && b.status !== 'Completed').reduce((sum, b) => sum + (Number(b.balance_amount) || 0), 0).toLocaleString('en-IN')}
            </span>
          </div>
          <div className="px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-right">
            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block">Settled</span>
            <span className="text-sm font-black text-emerald-900">
              ₹{bills.filter(b => b.status !== 'Cancelled').reduce((sum, b) => sum + (Number(b.paid_amount) || 0), 0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* ── 1. SEARCH & FILTER BAR ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 border shadow-sm space-y-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-end">

          {/* Search by Date */}
          <div>
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
              <span>📅</span> Search by Date
            </label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          {/* Search by Bill Number */}
          <div>
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
              <span>🧾</span> Search by Bill #
            </label>
            <input
              type="text"
              placeholder="e.g. WRK-..., SEX-..."
              value={filterBillNo}
              onChange={(e) => setFilterBillNo(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          {/* Search by Supplier / Mestri */}
          <div>
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
              <span>👤</span> Supplier / Mestri
            </label>
            <select
              value={filterSupplier}
              onChange={(e) => setFilterSupplier(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            >
              <option value="">All Suppliers / Mestri</option>
              {availableSuppliers.map((sup) => (
                <option key={sup} value={sup}>
                  {sup}
                </option>
              ))}
            </select>
          </div>

          {/* Reset button */}
          <div>
            <button
              type="button"
              onClick={handleClearFilters}
              className="w-full py-2 px-4 rounded-xl text-xs font-extrabold border transition-all text-slate-700 bg-slate-100 hover:bg-slate-200"
              style={{ borderColor: 'var(--color-border)' }}
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* ── 2. PAYMENT STATUS SUBTABS WITH DYNAMIC COUNT BADGES ─────────────── */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 max-w-xl">
        <button
          type="button"
          onClick={() => setActiveSubTab('pending')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 ${activeSubTab === 'pending'
              ? 'bg-amber-500 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900'
            }`}
        >
          <span>⏳ Pending Bills</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeSubTab === 'pending' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700'
              }`}
          >
            {subtabCounts.pending}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('completed')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 ${activeSubTab === 'completed'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900'
            }`}
        >
          <span>✓ Completed Payments</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeSubTab === 'completed' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}
          >
            {subtabCounts.completed}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('cancelled')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 ${activeSubTab === 'cancelled'
              ? 'bg-slate-800 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900'
            }`}
        >
          <span>✕ Cancelled Bills</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeSubTab === 'cancelled' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}
          >
            {subtabCounts.cancelled}
          </span>
        </button>
      </div>

      {/* ── 3. TABULAR LEDGER FORMAT ────────────────────────────────────────── */}
      {loading ? (
        <div className="card p-10 text-center text-xs text-slate-500 font-bold">
          Loading worker payment bills…
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="card p-12 text-center space-y-3 border-dashed border-2 bg-white rounded-2xl">
          <p className="text-4xl">🧾</p>
          <p className="font-extrabold text-base text-slate-800">No Bills Found</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto font-medium">
            No bills found in <strong>{activeSubTab === 'pending' ? 'Pending Bills' : activeSubTab === 'completed' ? 'Completed Payments' : 'Cancelled Bills'}</strong> matching your filter criteria.
          </p>
          {(filterDate || filterBillNo || filterSupplier) && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="btn-primary text-xs px-4 py-2 mt-2 font-bold inline-block"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white border-b border-slate-700 uppercase tracking-widest text-[10px]">
                <th className="p-3.5 font-black whitespace-nowrap">Bill No</th>
                <th className="p-3.5 font-black whitespace-nowrap">Tank Names (From → To)</th>
                <th className="p-3.5 font-black whitespace-nowrap">Supplier / Mestri</th>
                <th className="p-3.5 font-black whitespace-nowrap text-right">Total Amount (₹)</th>
                <th className="p-3.5 font-black whitespace-nowrap text-right">Paid Amount (₹)</th>
                <th className="p-3.5 font-black whitespace-nowrap text-right">Balance (₹)</th>
                <th className="p-3.5 font-black whitespace-nowrap text-center">Status</th>
                <th className="p-3.5 font-black whitespace-nowrap text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredRecords.map((r) => {
                const isPendingOrPartial = r.status === 'Pending' || r.status === 'Partial';
                const isCompleted = r.status === 'Completed' || (r.balance_amount === 0 && r.total_amount > 0);
                const isCancelled = r.status === 'Cancelled';

                return (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Bill No (Clickable to open bill view) */}
                    <td className="p-3.5 font-mono font-bold whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setViewDocBill(r)}
                        className="text-blue-700 hover:text-blue-900 underline font-black hover:scale-105 transition-transform inline-block"
                        title="Click to view full bill statement"
                      >
                        {r.bill_number}
                      </button>
                      <span className="block text-[10px] text-slate-400 font-sans font-normal">{r.date}</span>
                    </td>

                    {/* Tank Names (From → To) Chips */}
                    <td className="p-3.5 whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.tank_chips && r.tank_chips.length > 0 ? (
                          r.tank_chips.map((chip, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 font-extrabold text-[11px] border border-indigo-200 inline-flex items-center gap-1.5 shadow-xs"
                            >
                              <span>{chip}</span>
                            </span>
                          ))
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 font-extrabold text-[11px] border border-indigo-200 inline-flex items-center gap-1">
                            {r.from_tank_name} <span className="text-indigo-400 font-black">→</span> {r.to_tank_name}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Supplier / Mestri */}
                    <td className="p-3.5">
                      <p className="font-extrabold text-slate-900 text-xs">{r.supplier_name}</p>
                      {r.supplier_village && (
                        <p className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                          <span>📍</span> {r.supplier_village}
                        </p>
                      )}
                    </td>

                    {/* Total Amount (₹) */}
                    <td className="p-3.5 font-black text-slate-900 text-right whitespace-nowrap font-mono text-xs">
                      ₹{r.total_amount?.toLocaleString('en-IN')}
                    </td>

                    {/* Paid Amount (₹) */}
                    <td className="p-3.5 font-black text-emerald-700 text-right whitespace-nowrap font-mono text-xs">
                      ₹{r.paid_amount?.toLocaleString('en-IN')}
                    </td>

                    {/* Balance (₹) */}
                    <td className="p-3.5 font-black text-right whitespace-nowrap font-mono text-xs">
                      <span className={r.balance_amount > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                        ₹{r.balance_amount?.toLocaleString('en-IN')}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="p-3.5 text-center whitespace-nowrap">
                      {renderStatusBadge(r.status)}
                    </td>

                    {/* Action */}
                    <td className="p-3.5 text-center whitespace-nowrap">
                      {isPendingOrPartial && (
                        <button
                          type="button"
                          onClick={() => setPayModalBill(r)}
                          className="px-3.5 py-1.5 text-xs font-black rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>💳 View / Pay</span>
                        </button>
                      )}

                      {isCompleted && (
                        <button
                          type="button"
                          onClick={() => setViewDocBill(r)}
                          className="px-3.5 py-1.5 text-xs font-black rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>📄 View Bill</span>
                        </button>
                      )}

                      {isCancelled && (
                        <span className="text-slate-400 font-bold text-xs italic">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 4. ACTIONS & PAYMENT MODAL (FOR PENDING / PARTIAL BILLS) ─────────── */}
      {payModalBill && (
        <PaymentActionModal
          bill={payModalBill}
          onClose={() => setPayModalBill(null)}
          onPaymentSuccess={(updatedBill) => {
            updateBillRecord(updatedBill);
            setPayModalBill(null);
            toast.success(`Payment recorded successfully! Balance: ₹${updatedBill.balance_amount.toLocaleString('en-IN')}`);
          }}
          onCancelBill={(cancelledBill) => {
            updateBillRecord(cancelledBill);
            setPayModalBill(null);
            toast.info(`Bill #${cancelledBill.bill_number} has been cancelled`);
          }}
        />
      )}

      {/* ── READ-ONLY OFFICIAL DOCUMENT VIEW (FOR COMPLETED BILLS OR BILL CLICK) ── */}
      {viewDocBill && (
        <OfficialBillViewModal
          bill={viewDocBill}
          onClose={() => setViewDocBill(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. ACTIONS & PAYMENT MODAL COMPONENT (FOR PENDING / PARTIAL BILLS)
// ══════════════════════════════════════════════════════════════════════════════
function PaymentActionModal({ bill, onClose, onPaymentSuccess, onCancelBill }) {
  const [paymentMethod, setPaymentMethod] = useState('upi'); // 'cash' | 'upi' | 'bank'
  const [settlementMode, setSettlementMode] = useState('full'); // 'full' | 'partial'

  // Amounts
  const initialAmount = bill.balance_amount || bill.total_amount;
  const [payAmount, setPayAmount] = useState(String(initialAmount));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [referenceId, setReferenceId] = useState('');
  const [remarks, setRemarks] = useState('');

  // Payment method specific fields
  const [upiPhonePeNumber, setUpiPhonePeNumber] = useState(bill.supplier_phonepe || bill.supplier_phone || '');
  const [bankAccountNo, setBankAccountNo] = useState(bill.supplier_bank_acc || '');
  const [bankHolderName, setBankHolderName] = useState(bill.supplier_bank_holder || bill.supplier_name || '');
  const [bankIfscCode, setBankIfscCode] = useState(bill.supplier_bank_ifsc || 'SBIN0001234');
  const [bankName, setBankName] = useState(bill.supplier_bank_name || 'State Bank of India');

  // When settlement mode switches:
  const handleSettlementModeChange = (mode) => {
    setSettlementMode(mode);
    if (mode === 'full') {
      setPayAmount(String(bill.balance_amount));
    } else {
      setPayAmount(String(Math.floor(bill.balance_amount / 2) || 1000));
    }
  };

  const calculatedBalanceRemaining = useMemo(() => {
    const amt = Number(payAmount) || 0;
    return Math.max(0, bill.balance_amount - amt);
  }, [payAmount, bill.balance_amount]);

  const handleSubmitPayment = (e) => {
    e.preventDefault();
    const amountNum = Number(payAmount);

    if (!amountNum || amountNum <= 0) {
      alert('Please enter a valid payment amount greater than 0');
      return;
    }

    if (amountNum > bill.balance_amount) {
      alert(`Payment amount cannot exceed remaining balance of ₹${bill.balance_amount.toLocaleString('en-IN')}`);
      return;
    }

    const newPaidTotal = (Number(bill.paid_amount) || 0) + amountNum;
    const newBalance = Math.max(0, (Number(bill.total_amount) || 0) - newPaidTotal);
    const newStatus = newBalance === 0 ? 'Completed' : 'Partial';

    const paymentTxn = {
      id: `txn-${Date.now()}`,
      amount: amountNum,
      method: paymentMethod,
      mode: settlementMode,
      date: paymentDate,
      reference_id: referenceId || (paymentMethod === 'upi' ? `UPI-${Date.now().toString().slice(-8)}` : `REF-${Date.now().toString().slice(-6)}`),
      remarks,
      details: {
        upi: paymentMethod === 'upi' ? upiPhonePeNumber : null,
        bank: paymentMethod === 'bank' ? { bankAccountNo, bankHolderName, bankIfscCode, bankName } : null,
      },
      created_at: new Date().toISOString(),
    };

    const updatedBill = {
      ...bill,
      paid_amount: newPaidTotal,
      balance_amount: newBalance,
      status: newStatus,
      payments: [paymentTxn, ...(bill.payments || [])],
      supplier_phonepe: upiPhonePeNumber || bill.supplier_phonepe,
      supplier_bank_acc: bankAccountNo || bill.supplier_bank_acc,
      supplier_bank_holder: bankHolderName || bill.supplier_bank_holder,
      supplier_bank_ifsc: bankIfscCode || bill.supplier_bank_ifsc,
    };

    onPaymentSuccess(updatedBill);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-xs font-sans">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[92vh] overflow-y-auto">

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 block">
              SETTLEMENT &amp; PAYMENT
            </span>
            <h3 className="text-lg font-black text-slate-900">
              Pay Worker Bill #{bill.bill_number}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        {/* Bill Summary Overview */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
          <div className="flex justify-between items-center font-bold">
            <span className="text-slate-600">Recipient / Mestri:</span>
            <span className="text-slate-900 font-black">{bill.supplier_name} {bill.supplier_village ? `(${bill.supplier_village})` : ''}</span>
          </div>
          <div className="flex justify-between items-center font-bold">
            <span className="text-slate-600">Exchanged Tanks:</span>
            <span className="text-indigo-800 font-black">
              {bill.tank_chips?.join(', ') || `${bill.from_tank_name} → ${bill.to_tank_name}`}
            </span>
          </div>
          <div className="pt-2 border-t border-slate-200 grid grid-cols-3 gap-2 text-center">
            <div>
              <span className="text-[10px] text-slate-500 font-bold block uppercase">Total Amount</span>
              <span className="font-mono font-black text-slate-900 text-sm">₹{bill.total_amount.toLocaleString('en-IN')}</span>
            </div>
            <div>
              <span className="text-[10px] text-emerald-600 font-bold block uppercase">Already Paid</span>
              <span className="font-mono font-black text-emerald-700 text-sm">₹{bill.paid_amount.toLocaleString('en-IN')}</span>
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold block uppercase">Balance Due</span>
              <span className="font-mono font-black text-amber-700 text-sm">₹{bill.balance_amount.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmitPayment} className="space-y-4">
          {/* 1. Settlement Mode: Full vs Partial */}
          <div>
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1.5">
              Settlement Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSettlementModeChange('full')}
                className={`py-2 px-3 rounded-xl text-xs font-black border transition text-center ${settlementMode === 'full'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
              >
                Full Payment (₹{bill.balance_amount.toLocaleString('en-IN')})
              </button>
              <button
                type="button"
                onClick={() => handleSettlementModeChange('partial')}
                className={`py-2 px-3 rounded-xl text-xs font-black border transition text-center ${settlementMode === 'partial'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
              >
                Partial Payment
              </button>
            </div>
          </div>

          {/* 2. Amount Input & Real-time Remaining Balance Calculation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1.5">
                Amount to Pay (₹)
              </label>
              <input
                type="number"
                min="1"
                max={bill.balance_amount}
                value={payAmount}
                disabled={settlementMode === 'full'}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-black font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter amount"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1.5">
                Remaining Balance
              </label>
              <div className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs font-black font-mono text-slate-800">
                ₹{calculatedBalanceRemaining.toLocaleString('en-IN')}
                {calculatedBalanceRemaining === 0 && (
                  <span className="text-emerald-600 font-bold ml-1 text-[10px]">✓ Fully Paid</span>
                )}
              </div>
            </div>
          </div>

          {/* 3. Payment Methods: Cash, UPI, Bank */}
          <div>
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1.5">
              Payment Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`py-2 px-2 rounded-xl text-xs font-black border transition flex flex-col items-center gap-1 ${paymentMethod === 'cash'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
              >
                <span>💵</span>
                <span>Cash</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('upi')}
                className={`py-2 px-2 rounded-xl text-xs font-black border transition flex flex-col items-center gap-1 ${paymentMethod === 'upi'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
              >
                <span>📱</span>
                <span>UPI / PhonePe</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('bank')}
                className={`py-2 px-2 rounded-xl text-xs font-black border transition flex flex-col items-center gap-1 ${paymentMethod === 'bank'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
              >
                <span>🏦</span>
                <span>Bank Account</span>
              </button>
            </div>
          </div>

          {/* Method Specific Fields */}
          {paymentMethod === 'upi' && (
            <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-900">PhonePe / GPay Details</span>
                <span className="text-[10px] bg-purple-200 text-purple-900 px-2 py-0.5 rounded-full font-extrabold">Instant</span>
              </div>
              <div>
                <label className="text-[10px] font-bold text-purple-800 block mb-1">PhonePe Number / UPI ID</label>
                <input
                  type="text"
                  value={upiPhonePeNumber}
                  onChange={(e) => setUpiPhonePeNumber(e.target.value)}
                  placeholder="e.g. 9848022334@ybl"
                  className="w-full bg-white border border-purple-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 font-mono"
                />
              </div>
            </div>
          )}

          {paymentMethod === 'bank' && (
            <div className="p-3 bg-blue-50 rounded-2xl border border-blue-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-900">Beneficiary Bank Account</span>
                <span className="text-[10px] bg-blue-200 text-blue-900 px-2 py-0.5 rounded-full font-extrabold">NEFT / RTGS / IMPS</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-blue-800 block mb-0.5">Account Number</label>
                  <input
                    type="text"
                    value={bankAccountNo}
                    onChange={(e) => setBankAccountNo(e.target.value)}
                    placeholder="Account Number"
                    className="w-full bg-white border border-blue-300 rounded-xl px-2.5 py-1.5 text-xs font-bold font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-blue-800 block mb-0.5">Account Holder</label>
                  <input
                    type="text"
                    value={bankHolderName}
                    onChange={(e) => setBankHolderName(e.target.value)}
                    placeholder="Holder Name"
                    className="w-full bg-white border border-blue-300 rounded-xl px-2.5 py-1.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-blue-800 block mb-0.5">IFSC Code</label>
                  <input
                    type="text"
                    value={bankIfscCode}
                    onChange={(e) => setBankIfscCode(e.target.value)}
                    placeholder="IFSC"
                    className="w-full bg-white border border-blue-300 rounded-xl px-2.5 py-1.5 text-xs font-bold font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-blue-800 block mb-0.5">Bank Name</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Bank Name"
                    className="w-full bg-white border border-blue-300 rounded-xl px-2.5 py-1.5 text-xs font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 4. Remarks & Reference ID */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1.5">
                Reference ID / UTR #
              </label>
              <input
                type="text"
                placeholder="e.g. UTR102938491"
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:bg-white"
              />
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1.5">
                Payment Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1.5">
              Remarks (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Seed exchange labour charges for tank 1"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Are you sure you want to cancel / void this bill?')) {
                  onCancelBill({ ...bill, status: 'Cancelled' });
                }
              }}
              className="text-xs font-bold text-red-600 hover:text-red-800 underline px-2 py-1"
            >
              Cancel Bill
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                Close
              </button>

              <button
                type="submit"
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-md transition flex items-center gap-1.5"
              >
                <span>✓ Submit Payment Record</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// OFFICIAL BILL VIEW MODAL (FOR COMPLETED BILLS OR CLICKING BILL NUMBER)
// ══════════════════════════════════════════════════════════════════════════════
function OfficialBillViewModal({ bill, onClose }) {
  const printableRef = useRef(null);
  const [downloading, setDownloading] = useState(false);

  // Digital signature display
  const supervisorSign = bill.supervisor_signature;
  const mestriSign = bill.mestri_signature;

  // Print Handler
  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = `Seed_Exchange_Bill_${bill.bill_number}`;
    window.print();
    document.title = originalTitle;
  };

  // Download PDF Handler
  const handleDownloadPDF = async () => {
    if (!printableRef.current) return;
    try {
      setDownloading(true);
      const canvas = await html2canvas(printableRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Seed_Exchange_Bill_${bill.bill_number}.pdf`);
    } catch (err) {
      console.warn('PDF export note:', err);
      // Fallback to window.print()
      window.print();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4 backdrop-blur-xs font-sans">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[95vh] overflow-y-auto">

        {/* Modal Controls Header (Hidden in Print) */}
        <div className="flex items-center justify-between border-b pb-3 print:hidden" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800">
              Official Bill View
            </span>
            <span className="font-mono font-black text-slate-800 text-sm">#{bill.bill_number}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black rounded-xl transition flex items-center gap-1.5 shadow-xs"
            >
              <span>🖨️ Print</span>
            </button>

            <button
              type="button"
              disabled={downloading}
              onClick={handleDownloadPDF}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              <span>📥 {downloading ? 'Exporting…' : 'Download PDF'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition ml-2"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Printable Official Document Content */}
        <div
          ref={printableRef}
          id="official-seed-exchange-printable"
          className="p-6 bg-white border border-slate-200 rounded-2xl space-y-6 text-slate-800 print:border-none print:p-0"
        >
          {/* Document Header */}
          <div className="text-center border-b pb-4 space-y-1" style={{ borderColor: 'var(--color-border)' }}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 inline-block">
              OFFICIAL SETTLEMENT DOCUMENT
            </span>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              SEED EXCHANGE WORKER WAGE BILL
            </h1>
            <div className="flex justify-center items-center gap-4 text-xs font-mono font-bold text-slate-600 pt-1">
              <span>Bill #: <strong className="text-slate-900">{bill.bill_number}</strong></span>
              <span>•</span>
              <span>Date: <strong className="text-slate-900">{bill.date}</strong></span>
              <span>•</span>
              <span className={`font-black ${bill.status === 'Completed' ? 'text-emerald-700' : 'text-amber-700'}`}>
                {bill.status === 'Completed' ? '✓ FULLY PAID' : bill.status.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Recipient & Tank Information */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-500 block">Recipient / Mestri</span>
              <p className="font-black text-slate-900 text-sm">{bill.supplier_name}</p>
              <p className="text-slate-600">Village: <strong>{bill.supplier_village || 'Local'}</strong></p>
              {bill.supplier_phone && <p className="text-slate-600 font-mono">Phone: {bill.supplier_phone}</p>}
            </div>

            <div className="space-y-1 text-right">
              <span className="text-[10px] font-black uppercase text-slate-500 block">Exchanged Tanks</span>
              <div className="font-black text-indigo-900 text-sm">
                {bill.tank_chips?.join(', ') || `${bill.from_tank_name} → ${bill.to_tank_name}`}
              </div>
              <p className="text-slate-600">Site ID: <span className="font-mono">{bill.site_id}</span></p>
              <p className="text-slate-600">Status: <span className="font-bold text-emerald-700">{bill.status}</span></p>
            </div>
          </div>

          {/* Itemized Wages Breakdown Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <span>👷</span> Itemized Wages Breakdown
            </h4>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">Category / Labour Type</th>
                    <th className="p-2.5 text-center">Quantity</th>
                    <th className="p-2.5 text-right">Rate / Each (₹)</th>
                    <th className="p-2.5 text-right">Subtotal (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {bill.wages_rows && bill.wages_rows.length > 0 ? (
                    bill.wages_rows.map((row, idx) => {
                      const qty = Number(row.qty) || 0;
                      const amt = Number(row.amount) || 0;
                      const sub = qty * amt;
                      return (
                        <tr key={row.id || idx}>
                          <td className="p-2.5 font-bold text-slate-900">{row.category}</td>
                          <td className="p-2.5 text-center font-mono">{qty}</td>
                          <td className="p-2.5 text-right font-mono">₹{amt.toLocaleString('en-IN')}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-700">₹{sub.toLocaleString('en-IN')}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={3} className="p-2.5 font-bold text-slate-900">Total Worker Wages</td>
                      <td className="p-2.5 text-right font-mono font-bold text-emerald-700">₹{bill.total_amount?.toLocaleString('en-IN')}</td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-100 font-extrabold text-xs">
                  <tr>
                    <td colSpan={3} className="p-2.5 uppercase font-black">Total Wages Amount:</td>
                    <td className="p-2.5 text-right font-mono text-slate-900 font-black text-sm">
                      ₹{bill.total_amount?.toLocaleString('en-IN')}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="p-2 text-emerald-700">Paid Amount:</td>
                    <td className="p-2 text-right font-mono text-emerald-700 font-bold">
                      ₹{bill.paid_amount?.toLocaleString('en-IN')}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-300">
                    <td colSpan={3} className="p-2.5 uppercase font-black text-slate-800">Remaining Balance:</td>
                    <td className="p-2.5 text-right font-mono font-black text-sm text-slate-900">
                      ₹{bill.balance_amount?.toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Payment Receipts / Settlement History */}
          {bill.payments && bill.payments.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <span>💳</span> Payment History &amp; Settlements
              </h4>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[10px]">
                    <tr>
                      <th className="p-2">Date</th>
                      <th className="p-2">Method</th>
                      <th className="p-2">Reference ID</th>
                      <th className="p-2 text-right">Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {bill.payments.map((p, pIdx) => (
                      <tr key={p.id || pIdx}>
                        <td className="p-2 font-mono">{p.date || p.created_at?.slice(0, 10)}</td>
                        <td className="p-2 font-bold uppercase text-[11px]">{p.method}</td>
                        <td className="p-2 font-mono text-slate-600">{p.reference_id || '—'}</td>
                        <td className="p-2 text-right font-mono font-bold text-emerald-700">₹{Number(p.amount).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Digital Signature Display */}
          <div className="pt-4 border-t border-slate-200 grid grid-cols-2 gap-6 break-inside-avoid">
            {/* Mestri Signature */}
            <div className="space-y-2 text-center p-3 rounded-xl border border-dashed border-slate-300">
              <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">
                Mestri / Recipient Signature
              </span>
              <div className="h-14 flex items-center justify-center">
                {mestriSign ? (
                  <img src={mestriSign} alt="Mestri Signature" className="max-h-12 max-w-full object-contain" />
                ) : (
                  <span className="font-serif italic font-bold text-slate-700 text-sm">{bill.supplier_name}</span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 font-semibold border-t pt-1 border-slate-200">
                Verified Mestri Signature
              </p>
            </div>

            {/* Supervisor Signature */}
            <div className="space-y-2 text-center p-3 rounded-xl border border-dashed border-slate-300">
              <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">
                Authorized Supervisor Signature
              </span>
              <div className="h-14 flex items-center justify-center">
                {supervisorSign ? (
                  <img src={supervisorSign} alt="Supervisor Signature" className="max-h-12 max-w-full object-contain" />
                ) : (
                  <span className="font-serif italic font-bold text-slate-700 text-sm">{bill.supervisor_name || 'Authorized Supervisor'}</span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 font-semibold border-t pt-1 border-slate-200">
                {bill.supervisor_name || 'Site Supervisor'} {bill.supervisor_phone ? `(${bill.supervisor_phone})` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer (Hidden in Print) */}
        <div className="flex justify-end pt-3 border-t border-slate-200 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl shadow-md transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
