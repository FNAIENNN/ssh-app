import { useEffect, useState, useMemo } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { Empty } from '../../../../components/ui/State';
import RequestPayment from '../../../../components/payments/RequestPayment';

/**
 * Outside Workers (PRD §7.2) — ad-hoc labor payments & Seed Exchange worker payment requests.
 */
export default function OutsideWorkers({ siteId }) {
  const [note, setNote] = useState('');
  const [bills, setBills] = useState([]);
  const [billId, setBillId] = useState('');
  const [workerRequests, setWorkerRequests] = useState([]);
  
  // Search parameters for worker payment requests
  const [searchBillNo, setSearchBillNo] = useState('');
  const [searchDate, setSearchDate] = useState('');

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      const { data } = await supabase
        .from(TABLES.bills)
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false });
      setBills(data ?? []);

      // Load Seed Exchange worker requests from LocalStorage
      try {
        const storedReqs = JSON.parse(localStorage.getItem('seed_exchange_worker_requests') || '[]');
        setWorkerRequests(storedReqs);
      } catch {
        setWorkerRequests([]);
      }
    })();
  }, [siteId]);

  // Filtered requests by Bill Number or Date
  const filteredWorkerRequests = useMemo(() => {
    return workerRequests.filter((r) => {
      const rDate = String(r.date || r.created_at || '').slice(0, 10);
      if (searchDate && !rDate.includes(searchDate)) return false;
      const query = searchBillNo.toLowerCase().trim();
      if (query) {
        const matchBill = String(r.bill_number || '').toLowerCase().includes(query);
        const matchLinked = String(r.linked_exchange_bills || '').toLowerCase().includes(query);
        const matchSupplier = String(r.supplier_name || '').toLowerCase().includes(query);
        return matchBill || matchLinked || matchSupplier;
      }
      return true;
    });
  }, [workerRequests, searchBillNo, searchDate]);

  return (
    <div className="space-y-6 text-left font-sans">
      
      {/* Seed Exchange Worker Payment Requests Ledger (Search & Pay) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>👷</span> Seed Exchange Worker Payment Requests
            </h3>
            <p className="text-xs text-slate-500">Search and pay submitted worker payment requests from Seed Exchange module.</p>
          </div>

          {/* Search Inputs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1 rounded-xl border border-slate-300">
              <span className="text-xs font-bold text-slate-700">📅 Date:</span>
              <input
                type="date"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
                className="bg-white text-slate-900 font-mono text-xs p-1 rounded-lg border border-slate-300 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1 rounded-xl border border-slate-300">
              <span className="text-xs font-bold text-slate-700">🧾 Bill #:</span>
              <input
                type="text"
                placeholder="Search Bill #"
                value={searchBillNo}
                onChange={(e) => setSearchBillNo(e.target.value)}
                className="bg-white text-slate-900 font-mono text-xs px-2 py-1 rounded-lg border border-slate-300 focus:outline-none w-36"
              />
            </div>
          </div>
        </div>

        {filteredWorkerRequests.length === 0 ? (
          <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
            <p>No worker payment requests found matching your search query.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Request Bill #</th>
                  <th className="p-3">Linked Seed Exchange Bills</th>
                  <th className="p-3">Supplier Name</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Total Wages (₹)</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white font-medium text-slate-800">
                {filteredWorkerRequests.map((r) => (
                  <tr key={r.id || r.bill_number} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-extrabold text-blue-700">{r.bill_number}</td>
                    <td className="p-3 font-mono text-slate-600">{r.linked_exchange_bills || 'N/A'}</td>
                    <td className="p-3 font-bold text-slate-900">{r.supplier_name || 'N/A'}</td>
                    <td className="p-3 font-mono text-slate-500">{r.date}</td>
                    <td className="p-3 text-right font-mono font-black text-emerald-700">
                      ₹{(r.total_wages || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-extrabold uppercase">
                        {r.status || 'Pending'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          alert(`Processing Payment for ${r.bill_number} (₹${r.total_wages}) to ${r.supplier_name}`);
                        }}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] rounded-lg shadow-sm"
                      >
                        💳 Pay Now
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Main Request Payment Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-1">
          <h3 className="font-bold mb-3 text-slate-900">Worker details</h3>
          <label className="field-label">Work / worker note</label>
          <textarea
            className="field min-h-[120px]"
            placeholder="e.g. 4 workers, net mending, Section C — 2 days"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {bills.length > 0 && (
            <div className="mt-3">
              <label className="field-label">Link to Bill (optional)</label>
              <select
                className="field"
                value={billId}
                onChange={(e) => setBillId(e.target.value)}
              >
                <option value="">Not linked</option>
                {bills.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bill_number}
                  </option>
                ))}
              </select>
            </div>
          )}

          <p className="text-xs text-text-muted mt-2">
            Payment is captured via the Request Payment panel.
          </p>
          {!siteId && <Empty title="Select a site" />}
        </div>

        <div className="lg:col-span-2">
          <RequestPayment type="outside_worker" siteId={siteId} billId={billId || null} />
        </div>
      </div>

    </div>
  );
}
