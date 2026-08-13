import { useState, useEffect } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { useToast } from '../../../hooks/useToast';
import RequestPayment from '../../../components/payments/RequestPayment';

/**
 * HarvestPaymentsTab — Financial management of all harvest bills.
 * Features:
 *   - Summary cards (Pending / Completed / Cancelled counts)
 *   - Filterable bills table (Search by bill #, buyer, status)
 *   - Detailed bill view + complete payment audit trail
 *   - Integrated payment recording using the established RequestPayment pattern
 *   - Auto-status transition to 'Completed' when balance = 0
 */
export default function HarvestPaymentsTab({ siteId }) {
  const toast = useToast();

  const [bills, setBills] = useState([]);
  const [tanksMap, setTanksMap] = useState({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'completed' | 'cancelled'
  const [selectedBill, setSelectedBill] = useState(null);
  const [billPayments, setBillPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBills = async () => {
    if (!siteId) return;
    setLoading(true);
    const [{ data: bData }, { data: tData }] = await Promise.all([
      supabase
        .from(TABLES.bills)
        .select('*')
        .eq('site_id', siteId)
        .eq('type', 'harvest')
        .order('created_at', { ascending: false }),
      supabase.from(TABLES.tanks).select('id, name').eq('site_id', siteId),
    ]);

    const tMap = {};
    (tData || []).forEach((t) => (tMap[t.id] = t.name));
    setTanksMap(tMap);

    setBills(bData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchBills();
  }, [siteId]);

  // Load payment history when a bill is selected
  useEffect(() => {
    if (!selectedBill) return;
    (async () => {
      const { data } = await supabase
        .from(TABLES.payments)
        .select('*')
        .eq('bill_id', selectedBill.id)
        .order('created_at', { ascending: false });
      setBillPayments(data || []);
    })();
  }, [selectedBill]);

  // Summary counts
  const pendingCount = bills.filter((b) => b.status === 'pending').length;
  const completedCount = bills.filter((b) => b.status === 'completed').length;
  const cancelledCount = bills.filter((b) => b.status === 'cancelled').length;

  // Filtered bills
  const filteredBills = bills.filter((b) => {
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    const matchesSearch =
      !search ||
      b.bill_number?.toLowerCase().includes(search.toLowerCase()) ||
      b.buyer_name?.toLowerCase().includes(search.toLowerCase()) ||
      (tanksMap[b.tank_id] || '').toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handlePaymentRecorded = async (payTxn) => {
    if (!selectedBill) return;
    const newPaid = Number(selectedBill.paid_amount || 0) + Number(payTxn.amount || 0);
    const newBalance = Math.max(0, Number(selectedBill.total_amount || 0) - newPaid);
    const newStatus = newBalance === 0 ? 'completed' : selectedBill.status;

    // Update bill in DB
    const { error } = await supabase
      .from(TABLES.bills)
      .update({
        paid_amount: newPaid,
        balance_amount: newBalance,
        status: newStatus,
      })
      .eq('id', selectedBill.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Payment recorded. New Balance: ₹${newBalance.toLocaleString('en-IN')}`);
    const updated = { ...selectedBill, paid_amount: newPaid, balance_amount: newBalance, status: newStatus };
    setSelectedBill(updated);
    setBills((prev) => prev.map((b) => (b.id === selectedBill.id ? updated : b)));
    fetchBills();
  };

  return (
    <div className="space-y-6">
      {/* Summary KPI Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => setStatusFilter('pending')}
          className={`rounded-2xl p-4 border transition cursor-pointer flex items-center justify-between ${
            statusFilter === 'pending'
              ? 'bg-amber-100 border-amber-400 shadow-md'
              : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div>
            <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider block">
              Pending Bills
            </span>
            <span className="text-2xl font-black font-mono text-amber-900">{pendingCount}</span>
          </div>
          <span className="text-2xl">⏳</span>
        </div>

        <div
          onClick={() => setStatusFilter('completed')}
          className={`rounded-2xl p-4 border transition cursor-pointer flex items-center justify-between ${
            statusFilter === 'completed'
              ? 'bg-emerald-100 border-emerald-400 shadow-md'
              : 'bg-emerald-50 border-emerald-200'
          }`}
        >
          <div>
            <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider block">
              Completed Payments
            </span>
            <span className="text-2xl font-black font-mono text-emerald-900">{completedCount}</span>
          </div>
          <span className="text-2xl">✅</span>
        </div>

        <div
          onClick={() => setStatusFilter('cancelled')}
          className={`rounded-2xl p-4 border transition cursor-pointer flex items-center justify-between ${
            statusFilter === 'cancelled'
              ? 'bg-rose-100 border-rose-400 shadow-md'
              : 'bg-rose-50 border-rose-200'
          }`}
        >
          <div>
            <span className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider block">
              Cancelled Bills
            </span>
            <span className="text-2xl font-black font-mono text-rose-900">{cancelledCount}</span>
          </div>
          <span className="text-2xl">🚫</span>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Searchable Bills Table */}
        <div className={`${selectedBill ? 'lg:col-span-6' : 'lg:col-span-12'} transition-all space-y-4`}>
          <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-slate-900">Harvest Bills Ledger</h3>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Search bill #, buyer, tank..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="field py-1.5 text-xs w-full sm:w-48"
                />

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs font-bold bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-700 font-extrabold border-b border-slate-200">
                    <th className="p-3">Bill Number</th>
                    <th className="p-3">Tank</th>
                    <th className="p-3">Buyer</th>
                    <th className="p-3 text-right">Total (₹)</th>
                    <th className="p-3 text-right">Balance (₹)</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {filteredBills.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-6 text-center text-slate-400">
                        No harvest bills match your search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredBills.map((b) => {
                      const isSel = selectedBill?.id === b.id;
                      const tankName = tanksMap[b.tank_id] || 'A1';
                      const balance = Number(b.balance_amount ?? b.total_amount - b.paid_amount);

                      return (
                        <tr
                          key={b.id}
                          className={`transition ${isSel ? 'bg-blue-50/80 font-bold' : 'hover:bg-slate-50/60'}`}
                        >
                          <td className="p-3 font-mono font-extrabold text-blue-700">{b.bill_number}</td>
                          <td className="p-3 font-bold text-slate-900">Tank {tankName}</td>
                          <td className="p-3 text-slate-600">{b.buyer_name || 'N/A'}</td>
                          <td className="p-3 text-right font-mono font-bold">
                            ₹{Number(b.total_amount).toLocaleString('en-IN')}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-amber-700">
                            ₹{balance.toLocaleString('en-IN')}
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase ${
                                b.status === 'completed'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : b.status === 'pending'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : 'bg-rose-100 text-rose-800 border border-rose-300'
                              }`}
                            >
                              {b.status}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedBill(b)}
                              className="text-xs font-bold text-blue-600 hover:text-blue-800 underline"
                            >
                              View / Pay
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Bill Detail & Payment Recording Panel */}
        {selectedBill && (
          <div className="lg:col-span-6 space-y-4">
            <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <span className="text-[10px] font-extrabold text-blue-600 uppercase block">
                    BILL DETAILS & PAYMENT RECORDING
                  </span>
                  <h3 className="text-lg font-black text-slate-900">
                    Bill #{selectedBill.bill_number}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedBill(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-sm"
                >
                  ✕ Close
                </button>
              </div>

              {/* Financial Status Box */}
              <div className="grid grid-cols-3 gap-3 bg-slate-900 text-white p-4 rounded-xl font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">Total Amount</span>
                  <span className="text-base font-black">
                    ₹{Number(selectedBill.total_amount).toLocaleString('en-IN')}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">Total Paid</span>
                  <span className="text-base font-black text-emerald-400">
                    ₹{Number(selectedBill.paid_amount || 0).toLocaleString('en-IN')}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-amber-300 uppercase block">Balance Due</span>
                  <span className="text-base font-black text-amber-400">
                    ₹{Number(selectedBill.balance_amount || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Integrated Payment Method (RequestPayment) */}
              <div className="pt-2">
                <h4 className="text-xs font-extrabold text-slate-800 mb-2">
                  Record New Payment Transaction:
                </h4>
                <RequestPayment
                  type="vehicle"
                  siteId={siteId}
                  relatedTankId={selectedBill.tank_id}
                  billId={selectedBill.id}
                  prefillAmount={selectedBill.balance_amount}
                  onPaid={handlePaymentRecorded}
                />
              </div>

              {/* Payment History Log */}
              <div className="pt-4 border-t border-slate-200 space-y-2">
                <h4 className="text-xs font-extrabold text-slate-900">Payment Audit History</h4>
                {billPayments.length === 0 ? (
                  <p className="text-xs text-slate-400">No payment transactions recorded yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs">
                    {billPayments.map((p) => (
                      <div key={p.id} className="py-2 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-900 capitalize">
                            {p.method} Payment ({p.advance_mode || 'cash'})
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {new Date(p.created_at).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <span className="font-mono font-black text-emerald-700">
                          + ₹{Number(p.amount).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
