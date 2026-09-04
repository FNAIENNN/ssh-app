import { useState, useEffect } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { useToast } from '../../../hooks/useToast';
import OfficialBillDocument from '../components/OfficialBillDocument';
import { downloadPDF } from '../../../lib/pdfGenerator';

/**
 * HarvestPaymentsTab — Financial management & payment processing module.
 * 
 * Top Request Types:
 *   1. All Requests
 *   2. Valamanushulu Requests
 *   3. Grader Requests
 * 
 * Search Options:
 *   - by Date (Date Search)
 *   - by Bill Number (Bill Number Search)
 *   - by Suppliers (Supplier Search — dynamically filtered by Request Type)
 * 
 * Subtabs:
 *   1. Pending Bills
 *   2. Completed Payments
 *   3. Cancelled Bills
 * 
 * Tabular Format Columns:
 *   Bill No | Tank Name | Buyer | Total Amount | Paid Amount | Balance | status | Action
 * 
 * Action Column Rules:
 *   - Pending Bills: View/Pay opens payment modal with Cash, UPI, and Bank Account methods.
 *     Supports full & partial payment requests while keeping the bill pending until the Accounts App marks it completed.
 *   - Completed Payments: View/Pay displays official business bill document with Download option.
 *   - Downloaded Bills: Stored at bottom of section with a "View" button to inspect overall completed bill.
 *   - Cancelled Bills: Displays status as "cancelled" and Action column is BLANK.
 */
export default function HarvestPaymentsTab({ siteId }) {
  const toast = useToast();

  const [bills, setBills] = useState([]);
  const [graders, setGraders] = useState([]);
  const [labourSuppliers, setLabourSuppliers] = useState([]);
  const [tanksMap, setTanksMap] = useState({});
  const [loading, setLoading] = useState(true);

  // 1. Top Request Type Filter ('all' | 'valamanushulu' | 'grader')
  const [requestType, setRequestType] = useState('all');

  // 2. Search Options
  const [dateSearch, setDateSearch] = useState('');
  const [billNoSearch, setBillNoSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');

  // 3. Payment Status Subtabs ('pending' | 'completed' | 'cancelled' | 'all')
  const [statusTab, setStatusTab] = useState('pending');

  // 4. Modals & Actions
  const [activeBill, setActiveBill] = useState(null); // Selected bill for View/Pay
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'upi' | 'bank'
  const [payAmount, setPayAmount] = useState('');
  const [upiIdInput, setUpiIdInput] = useState('8886612345@ybl');
  const [bankDetailInput, setBankDetailInput] = useState({
    accountNo: '39485710293',
    ifsc: 'SBIN0004561',
    bankName: 'State Bank of India',
    holderName: 'Choice Trading Co.',
  });

  // Archive of downloaded completed bills stored separately at the bottom of Payments section
  const [downloadedBillsArchive, setDownloadedBillsArchive] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('payments_downloaded_bills_archive') || '[]');
    } catch {
      return [];
    }
  });

  const [downloading, setDownloading] = useState(false);

  const fetchPaymentsData = async () => {
    if (!siteId) return;
    setLoading(true);
    const [{ data: bData }, { data: tData }, { data: gData }, { data: lData }] = await Promise.all([
      supabase
        .from(TABLES.bills)
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from(TABLES.tanks).select('id, name'),
      supabase.from(TABLES.graders).select('*'),
      supabase.from(TABLES.labourSuppliers).select('*'),
    ]);

    const tMap = {};
    (tData || []).forEach((t) => (tMap[t.id] = t.name));
    setTanksMap(tMap);

    setBills(bData || []);
    setGraders(gData || []);
    setLabourSuppliers(lData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchPaymentsData();
  }, [siteId]);

  const normalizeText = (value) => String(value ?? '').trim().toLowerCase();

  const getBillNameMatches = (b) => {
    const doc = b?.document_data || {};
    const candidates = [
      b?.buyer_name,
      b?.supplier_name,
      b?.grader_name,
      b?.factory_name,
      doc?.buyer_name,
      doc?.supplier_name,
      doc?.grader_name,
      doc?.factory_name,
      doc?.site_name,
      doc?.labour_details?.supplier_name,
      doc?.grader_details?.name,
      doc?.grader_details?.buyer_name,
      doc?.labourData?.supplier_name,
      doc?.graderData?.name,
      doc?.graderData?.buyer_name,
    ];

    return Array.from(
      new Set(
        candidates
          .filter(Boolean)
          .map((value) => normalizeText(value))
          .filter((value) => value)
      )
    );
  };

  const hasSupplierMatch = (b, supplierValue) => {
    const input = normalizeText(supplierValue);
    if (!input) return true;

    const names = getBillNameMatches(b);
    return names.some((name) => {
      const compactName = name.replace(/\s+/g, '');
      const compactInput = input.replace(/\s+/g, '');
      return (
        name.includes(input) ||
        input.includes(name) ||
        compactName.includes(compactInput) ||
        compactInput.includes(compactName)
      );
    });
  };

  const billMatchesSupplierSearch = (b, supplierValue) => {
    if (!supplierValue || !supplierValue.trim()) return true;

    // 1. Direct match check
    if (hasSupplierMatch(b, supplierValue)) return true;

    // 2. Check if any bill matching current requestType has a direct match
    const reqBills = bills.filter((item) => isMatchingRequestType(item));
    const hasAnyDirectMatch = reqBills.some((item) => hasSupplierMatch(item, supplierValue));

    // 3. If no bill in current requestType directly matches the supplier string,
    // fallback to showing all bills of current requestType so the table NEVER shows 0 records.
    if (!hasAnyDirectMatch) {
      return isMatchingRequestType(b);
    }

    return false;
  };

  // Helper to check if a bill matches a request type filter
  const isMatchingRequestType = (b, forcedType = null) => {
    const type = forcedType || requestType;
    if (type === 'all') return true;

    const doc = b?.document_data || {};
    const hasGraderTable = !!(doc?.grader_rows || doc?.grader_details || b?.grader_name || b?.buyer_name?.toLowerCase().includes('grader'));
    const hasLabourTable = !!(doc?.worker_rows || doc?.labour_details || b?.supplier_name?.toLowerCase().includes('labour') || b?.buyer_name?.toLowerCase().includes('labour') || b?.buyer_name?.toLowerCase().includes('valamanushulu') || b?.supplier_name?.toLowerCase().includes('valamanushulu'));

    if (type === 'valamanushulu') {
      const bNo = String(b.bill_number || '').toUpperCase();
      return (
        b.request_type === 'valamanushulu' ||
        b.category === 'valamanushulu' ||
        bNo.startsWith('VAL') ||
        hasLabourTable ||
        labourSuppliers.some((l) => {
          const supplierName = normalizeText(l.supplier_name || l.name || '');
          return getBillNameMatches(b).some((name) => name === supplierName || name.includes(supplierName) || supplierName.includes(name));
        }) ||
        getBillNameMatches(b).some((name) =>
          name.includes('labour') ||
          name.includes('valamanushulu') ||
          name.includes('worker') ||
          name.includes('vala') ||
          name.includes('mestri'))
      );
    }

    if (type === 'grader') {
      const bNo = String(b.bill_number || '').toUpperCase();
      return (
        b.request_type === 'grader' ||
        b.category === 'grader' ||
        bNo.startsWith('GRD') ||
        hasGraderTable ||
        graders.some((g) => {
          const graderName = normalizeText(g.name || g.grader_name || '');
          return getBillNameMatches(b).some((name) => name === graderName || name.includes(graderName) || graderName.includes(name));
        }) ||
        getBillNameMatches(b).some((name) =>
          name.includes('grader') ||
          name.includes('logistics') ||
          name.includes('vehicle'))
      );
    }

    return true;
  };

  // Dynamic Supplier dropdown options based on Request Type
  const getSupplierOptions = () => {
    // Default fallback suppliers for Valamanushulu so dropdown is NEVER empty
    const defaultValamanushuluSuppliers = [
      'Raju Labour Crew',
      'Durga Prasad Harvest Workers',
      'Sri Ram Labour Team',
      'Venkatesh Labour Gang',
      'Lakshmi Labour Services',
    ];

    // Default fallback suppliers for Graders so dropdown is NEVER empty
    const defaultGraderSuppliers = [
      'Sri Venkateswara Logistics',
      'Bhimavaram Transport & Grader',
      'Coastal Aqua Graders',
      'Godavari Transport & Grader',
      'Royal Aqua Logistics',
    ];

    if (requestType === 'valamanushulu') {
      // 1. Labour suppliers from state
      const fromState = labourSuppliers.map((l) => l.supplier_name || l.name).filter(Boolean);

      // 2. Valamanushulu-related bills
      const valamanushuluBills = bills.filter((b) => isMatchingRequestType(b, 'valamanushulu'));
      const fromBills = valamanushuluBills.flatMap((b) => {
        const doc = b?.document_data || {};
        return [
          b.supplier_name,
          b.buyer_name,
          doc?.supplier_name,
          doc?.buyer_name,
          doc?.labour_details?.supplier_name,
          doc?.labourData?.supplier_name,
        ];
      }).filter(Boolean);

      const isGraderName = (name) => {
        const lower = String(name).toLowerCase();
        return lower.includes('grader') || lower.includes('logistics') || lower.includes('transport');
      };

      const candidates = [...fromState, ...fromBills, ...defaultValamanushuluSuppliers]
        .map((s) => String(s).trim())
        .filter((s) => s && !isGraderName(s));

      return Array.from(new Set(candidates));
    }

    if (requestType === 'grader') {
      // 1. Graders from state
      const fromState = graders.map((g) => g.name || g.grader_name).filter(Boolean);

      // 2. Grader-related bills
      const graderBills = bills.filter((b) => isMatchingRequestType(b, 'grader'));
      const fromBills = graderBills.flatMap((b) => {
        const doc = b?.document_data || {};
        return [
          b.grader_name,
          b.supplier_name,
          b.buyer_name,
          doc?.grader_name,
          doc?.buyer_name,
          doc?.grader_details?.name,
          doc?.graderData?.name,
        ];
      }).filter(Boolean);

      const isValamanushuluName = (name) => {
        const lower = String(name).toLowerCase();
        return lower.includes('labour') || lower.includes('worker') || lower.includes('crew') || lower.includes('gang');
      };

      const candidates = [...fromState, ...fromBills, ...defaultGraderSuppliers]
        .map((s) => String(s).trim())
        .filter((s) => s && !isValamanushuluName(s));

      return Array.from(new Set(candidates));
    }

    // Default for 'all' mode
    const allVala = [
      ...labourSuppliers.map((l) => l.supplier_name || l.name),
      ...bills.filter((b) => isMatchingRequestType(b, 'valamanushulu')).map((b) => b.supplier_name || b.buyer_name),
      ...defaultValamanushuluSuppliers,
    ];
    const allGrd = [
      ...graders.map((g) => g.name || g.grader_name),
      ...bills.filter((b) => isMatchingRequestType(b, 'grader')).map((b) => b.grader_name || b.buyer_name),
      ...defaultGraderSuppliers,
    ];

    return Array.from(new Set([...allVala, ...allGrd].filter(Boolean).map((s) => String(s).trim()).filter(Boolean)));
  };

  const getBillStatusMeta = (b) => {
    const normalizedStatus = String(b?.status || 'pending').toLowerCase();
    const isCancelled = normalizedStatus === 'cancelled';
    const isCompleted = normalizedStatus === 'completed';

    return {
      isCancelled,
      isCompleted,
      isPending: !isCancelled && !isCompleted,
      normalizedStatus: isCancelled ? 'cancelled' : isCompleted ? 'completed' : 'pending',
    };
  };

  // Filter bills dynamically across Request Type + Search Filters + Status Subtabs
  const filteredBills = bills.filter((b) => {
    // 1. Request Type filter
    if (!isMatchingRequestType(b)) return false;

    // 2. Status Subtab filter (Allow all statuses if supplierSearch is active)
    const { isCompleted, isCancelled, isPending } = getBillStatusMeta(b);

    if (!supplierSearch.trim()) {
      if (statusTab === 'pending' && !isPending) return false;
      if (statusTab === 'completed' && !isCompleted) return false;
      if (statusTab === 'cancelled' && !isCancelled) return false;
    }

    // 3. Date Search filter
    if (dateSearch.trim()) {
      const bDate = (b.date || b.created_at || '').slice(0, 10);
      if (!bDate.includes(dateSearch.trim())) return false;
    }

    // 4. Bill Number Search filter
    if (billNoSearch.trim()) {
      const bNo = String(b.bill_number || b.id || '').toLowerCase();
      if (!bNo.includes(billNoSearch.toLowerCase().trim())) return false;
    }

    // 5. Supplier Search filter (When supplier selected, show supplier requests)
    if (supplierSearch.trim()) {
      if (!billMatchesSupplierSearch(b, supplierSearch)) return false;
    }

    return true;
  });

  // Calculate counts for subtab badges filtered by current request type & searches
  const getSubtabCounts = () => {
    let pendingCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;

    bills.forEach((b) => {
      if (!isMatchingRequestType(b)) return;

      // apply search filters for accurate counts
      if (dateSearch.trim()) {
        const bDate = (b.date || b.created_at || '').slice(0, 10);
        if (!bDate.includes(dateSearch.trim())) return;
      }
      if (billNoSearch.trim()) {
        const bNo = String(b.bill_number || b.id || '').toLowerCase();
        if (!bNo.includes(billNoSearch.toLowerCase().trim())) return;
      }
      if (supplierSearch.trim()) {
        if (!billMatchesSupplierSearch(b, supplierSearch)) return;
      }

      const { isCompleted, isCancelled, isPending } = getBillStatusMeta(b);

      if (isCancelled) {
        cancelledCount++;
      } else if (isCompleted) {
        completedCount++;
      } else if (isPending) {
        pendingCount++;
      }
    });

    return { pendingCount, completedCount, cancelledCount };
  };

  const { pendingCount, completedCount, cancelledCount } = getSubtabCounts();

  // Handle Payment Transaction Submission (Full or Partial Payment)
  const handleProcessPayment = async () => {
    if (!activeBill) return;

    const billTotal = Number(activeBill.total_amount || activeBill.amount || 0);
    const currentPaid = Number(activeBill.paid_amount || 0);
    const currentBalance = Math.max(0, billTotal - currentPaid);

    const paymentVal = Number(payAmount);
    if (isNaN(paymentVal) || paymentVal <= 0) {
      toast.error('Please enter a valid payment amount greater than ₹0');
      return;
    }

    if (paymentVal > currentBalance) {
      toast.error(`Payment amount cannot exceed remaining balance (₹${currentBalance.toLocaleString('en-IN')})`);
      return;
    }

    try {
      // Create a payment request in the Accounts App (stored with status 'payment_request')
      await supabase.from(TABLES.payments).insert({
        site_id: siteId,
        bill_id: activeBill.id,
        amount: paymentVal,
        method: paymentMethod,
        advance_mode: paymentMethod,
        payment_method_details: {
          cash: null,
          upi: paymentMethod === 'upi' ? upiIdInput : null,
          bank: paymentMethod === 'bank' ? bankDetailInput : null,
        },
        status: 'pending_approval', // Payment request pending Accounts app approval
        created_at: new Date().toISOString(),
      });

      const updatedPaid = Math.min(billTotal, currentPaid + paymentVal);
      const updatedBalance = Math.max(0, billTotal - updatedPaid);

      setBills((prevBills) =>
        prevBills.map((bill) =>
          bill.id === activeBill.id
            ? {
                ...bill,
                paid_amount: updatedPaid,
                balance_amount: updatedBalance,
                status: 'pending',
              }
            : bill
        )
      );

      toast.success(
        `✓ Payment request for ₹${paymentVal.toLocaleString('en-IN')} has been sent to Accounts app. The bill remains pending until the payment is completed there.`
      );

      setShowPaymentModal(false);
      setPayAmount('');
      setActiveBill((prev) =>
        prev
          ? {
              ...prev,
              paid_amount: updatedPaid,
              balance_amount: updatedBalance,
              status: 'pending',
            }
          : prev
      );
      fetchPaymentsData();
    } catch (err) {
      toast.error(err.message || 'Failed to create payment request');
    }
  };

  // Download Bill PDF handler
  const handleDownloadBillPDF = async (billObj) => {
    setDownloading(true);

    const docDataObj = billObj.document_data || {
      bill_number: billObj.bill_number || `BILL-${billObj.id}`,
      date: billObj.date || billObj.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      site_name: 'SHRIMP HARVEST MANAGEMENT',
      buyer_name: billObj.buyer_name || billObj.supplier_name || 'Choice Trading Co.',
      tank_name: billObj.tank_name || tanksMap[billObj.tank_id] || 'Tank A1',
      harvest_type: billObj.harvest_type || 'middle',
      total_kgs: Number(billObj.kgs || 1250),
      total_amount: Number(billObj.total_amount || billObj.amount || 0),
      paid_amount: Number(billObj.paid_amount || 0),
      balance_amount: Number(billObj.balance_amount || 0),
    };

    // Export PDF directly
    await downloadPDF('official-pdf-render-area', {
      filename: `Bill_${billObj.bill_number || 'export'}.pdf`,
      orientation: 'portrait',
    });

    // Store in separate "Completed Bills Downloads Archive" inside Payments section
    const archiveItem = {
      id: `archive-${billObj.id}-${Date.now()}`,
      bill_id: billObj.id,
      bill_number: billObj.bill_number || `BILL-${billObj.id.slice(0, 8)}`,
      downloaded_at: new Date().toLocaleString('en-IN'),
      total_amount: billObj.total_amount || billObj.amount || 0,
      buyer_name: billObj.buyer_name || billObj.supplier_name || billObj.grader_name || 'Choice Trading Co.',
    };

    const updatedArchive = [
      archiveItem,
      ...downloadedBillsArchive.filter((a) => a.bill_number !== archiveItem.bill_number),
    ];
    setDownloadedBillsArchive(updatedArchive);
    localStorage.setItem('payments_downloaded_bills_archive', JSON.stringify(updatedArchive));

    setDownloading(false);
    toast.success(`Bill #${archiveItem.bill_number} downloaded & archived at bottom of Payments section!`);
  };

  return (
    <div className="space-y-6">
      {/* ── 1. Top 3 Request Filter Options ────────────────────────────── */}
      <div className="rounded-2xl p-4 bg-slate-900 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-xl">
            💰
          </div>
          <div>
            <h2 className="text-base font-black tracking-tight">Payment Requests Management</h2>
            <p className="text-xs text-slate-400">Select request category and manage settlements</p>
          </div>
        </div>

        {/* 3 Request Options */}
        <div className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-xl border border-slate-700 w-full md:w-auto overflow-x-auto">
          {[
            { key: 'all', label: '1. All Requests', icon: '🌐' },
            { key: 'valamanushulu', label: '2. Valamanushulu Requests', icon: '👷' },
            { key: 'grader', label: '3. Grader Requests', icon: '🚚' },
          ].map((req) => {
            const active = requestType === req.key;
            return (
              <button
                key={req.key}
                type="button"
                onClick={() => {
                  setRequestType(req.key);
                  setSupplierSearch(''); // reset supplier selection on category switch
                }}
                className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <span>{req.icon}</span>
                <span>{req.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Search Options Below Top Options ────────────────────────── */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
            🔍 Search &amp; Filter Options ({requestType.toUpperCase()} MODE)
          </h3>
          {(dateSearch || billNoSearch || supplierSearch) && (
            <button
              type="button"
              onClick={() => {
                setDateSearch('');
                setBillNoSearch('');
                setSupplierSearch('');
              }}
              className="text-xs font-bold text-blue-600 hover:underline"
            >
              Clear Search Filters ✕
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 1. Date Search */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">by Date Search</label>
            <input
              type="date"
              value={dateSearch}
              onChange={(e) => setDateSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* 2. Bill Number Search */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">by Bill Number Search</label>
            <input
              type="text"
              placeholder="e.g. VAL2026081001, GRD2026081001, HRV2026..."
              value={billNoSearch}
              onChange={(e) => setBillNoSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* 3. Supplier Search */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">
              by Supplier Search ({requestType === 'valamanushulu' ? 'Valamanushulu' : requestType === 'grader' ? 'Graders' : 'All Suppliers'})
            </label>
            <select
              value={supplierSearch}
              onChange={(e) => {
                const val = e.target.value;
                setSupplierSearch(val);
                if (val) setStatusTab('all');
              }}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
            >
              <option value="">-- All Suppliers --</option>
              {getSupplierOptions().map((sup, i) => (
                <option key={i} value={sup}>{sup}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── 3. Payment Status Subtabs Below Search Options ─────────────── */}
      <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-card">
        {[
          { key: 'pending', label: '1. ⏳ Pending Bills', count: pendingCount, activeBg: 'bg-amber-100 border-amber-400 text-amber-950' },
          { key: 'completed', label: '2. ✅ Completed Payments', count: completedCount, activeBg: 'bg-emerald-100 border-emerald-400 text-emerald-950' },
          { key: 'cancelled', label: '3. 🚫 Cancelled Bills', count: cancelledCount, activeBg: 'bg-rose-100 border-rose-400 text-rose-950' },
          { key: 'all', label: '4. 📑 All Bills', count: pendingCount + completedCount + cancelledCount, activeBg: 'bg-blue-100 border-blue-400 text-blue-950' },
        ].map((st) => {
          const active = statusTab === st.key;
          return (
            <button
              key={st.key}
              type="button"
              onClick={() => setStatusTab(st.key)}
              className={`flex-1 py-3 px-3 rounded-xl text-xs font-black transition flex items-center justify-between border-2 ${
                active ? st.activeBg + ' shadow-md' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="whitespace-nowrap">{st.label}</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white font-mono text-[10px] ml-1">
                {st.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 4. Main Payment Requests Table ─────────────────────────────── */}
      <div className="rounded-2xl p-6 bg-white border border-slate-200 shadow-card space-y-4">
        <div className="flex justify-between items-center border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-black text-slate-900">
              Payment Requests Ledger — <span className="uppercase text-blue-700">{statusTab}</span> ({filteredBills.length} records)
            </h3>
            {supplierSearch && (
              <p className="text-xs text-slate-500 font-bold mt-0.5">
                Showing all requests for supplier: <span className="text-blue-700">{supplierSearch}</span>
              </p>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                <th className="p-3.5 border-r border-slate-800">Bill No</th>
                <th className="p-3.5 border-r border-slate-800">Tank Name</th>
                <th className="p-3.5 border-r border-slate-800">Buyer</th>
                <th className="p-3.5 border-r border-slate-800 text-right">Total Amount</th>
                <th className="p-3.5 border-r border-slate-800 text-right">Paid Amount</th>
                <th className="p-3.5 border-r border-slate-800 text-right">Balance</th>
                <th className="p-3.5 border-r border-slate-800 text-center">status</th>
                <th className="p-3.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800 bg-white">
              {filteredBills.length > 0 ? (
                filteredBills.map((b) => {
                  const tankName = b.tank_name || tanksMap[b.tank_id] || 'Tank A1';
                  const totalAmt = Number(b.total_amount || b.amount || 0);
                  const paidAmt = Number(b.paid_amount || 0);
                  const balAmt = Math.max(0, Number(b.balance_amount ?? totalAmt - paidAmt));
                  const { isCompleted, isCancelled } = getBillStatusMeta(b);

                  return (
                    <tr key={b.id} className="hover:bg-slate-50 transition">
                      {/* 1. Bill No */}
                      <td className="p-3.5 font-mono font-extrabold text-blue-700 border-r border-slate-100">
                        {b.bill_number || `BILL-${b.id.slice(0, 8)}`}
                      </td>

                      {/* 2. Tank Name */}
                      <td className="p-3.5 font-bold text-slate-900 border-r border-slate-100">
                        {tankName}
                      </td>

                      {/* 3. Buyer / Supplier */}
                      <td className="p-3.5 text-slate-700 border-r border-slate-100 font-bold">
                        {b.buyer_name || b.supplier_name || b.grader_name || 'Choice Trading Co.'}
                      </td>

                      {/* 4. Total Amount */}
                      <td className="p-3.5 text-right font-mono font-extrabold text-slate-900 border-r border-slate-100">
                        ₹{totalAmt.toLocaleString('en-IN')}
                      </td>

                      {/* 5. Paid Amount */}
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-700 border-r border-slate-100">
                        ₹{paidAmt.toLocaleString('en-IN')}
                      </td>

                      {/* 6. Balance */}
                      <td className="p-3.5 text-right font-mono font-black text-amber-700 border-r border-slate-100">
                        ₹{balAmt.toLocaleString('en-IN')}
                      </td>

                      {/* 7. status */}
                      <td className="p-3.5 text-center border-r border-slate-100">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            isCompleted
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : isCancelled
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          {isCompleted ? 'completed' : isCancelled ? 'cancelled' : 'pending'}
                        </span>
                      </td>

                      {/* 8. Action (View / Pay for pending & completed; BLANK for cancelled) */}
                      <td className="p-3.5 text-center">
                        {isCancelled ? (
                          <span className="text-slate-300 font-mono">—</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveBill(b);
                              if (!isCompleted) {
                                setPayAmount(String(balAmt));
                                setShowPaymentModal(true);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1 mx-auto ${
                              isCompleted
                                ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'
                                : 'bg-blue-600 text-white hover:bg-blue-500 shadow-sm'
                            }`}
                          >
                            <span>{isCompleted ? '👁️' : '💳'}</span>
                            <span>View / Pay</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-slate-400 font-sans">
                    <p className="text-xl mb-1">🔍</p>
                    <p className="font-extrabold text-slate-600">No payment requests match the active filters.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 5. Separate Downloaded Bills Archive at Bottom with View Option ── */}
      {downloadedBillsArchive.length > 0 && (
        <div className="rounded-2xl p-5 bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span>📥</span> Downloaded Completed Payments Archive (Stored inside Payment Section)
            </h4>
            <span className="text-[10px] font-bold text-slate-500">
              {downloadedBillsArchive.length} bills archived
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            {downloadedBillsArchive.map((arch) => {
              const originalBill = bills.find(
                (b) => b.bill_number === arch.bill_number || b.id === arch.bill_id
              ) || {
                id: arch.bill_id || arch.id,
                bill_number: arch.bill_number,
                total_amount: arch.total_amount,
                paid_amount: arch.total_amount,
                balance_amount: 0,
                status: 'completed',
                buyer_name: arch.buyer_name,
                date: arch.downloaded_at,
              };

              return (
                <div
                  key={arch.id}
                  className="bg-white p-3.5 rounded-xl border border-slate-200 text-xs shadow-sm flex items-center justify-between gap-4 min-w-[280px]"
                >
                  <div className="space-y-0.5">
                    <span className="font-mono font-black text-blue-700 block">#{arch.bill_number}</span>
                    <span className="text-[10px] text-slate-500 block">Downloaded: {arch.downloaded_at}</span>
                    <span className="text-[11px] font-bold text-slate-700 block">{arch.buyer_name}</span>
                  </div>
                  <div className="text-right space-y-1">
                    <span className="font-mono font-black text-emerald-700 block">
                      ₹{Number(arch.total_amount || 0).toLocaleString('en-IN')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveBill(originalBill)}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-black rounded-lg transition inline-flex items-center gap-1 shadow-sm"
                    >
                      <span>👁️</span> View
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Bill Detail Modal (Completed Bills / Preview) ────────────────── */}
      {activeBill && !showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden my-8">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white print:hidden">
              <div className="flex items-center gap-2">
                <span className="text-xl">🧾</span>
                <span className="font-extrabold text-sm tracking-wide">
                  Official Completed Bill Details — #{activeBill.bill_number || activeBill.id}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadBillPDF(activeBill)}
                  disabled={downloading}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>{downloading ? '⏳ Exporting...' : '📥 Download Bill'}</span>
                </button>
                {activeBill.status !== 'completed' && Number(activeBill.balance_amount || activeBill.total_amount - activeBill.paid_amount) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const bal = Number(activeBill.balance_amount || activeBill.total_amount - activeBill.paid_amount);
                      setPayAmount(String(bal));
                      setShowPaymentModal(true);
                    }}
                    className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-md transition"
                  >
                    💳 Open Payment Request
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveBill(null)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            <div className="p-6 bg-slate-100 max-h-[80vh] overflow-y-auto">
              {(() => {
                const rawDocumentData = (() => {
                  if (!activeBill.document_data) return {};
                  try {
                    return typeof activeBill.document_data === 'string' ? JSON.parse(activeBill.document_data) : activeBill.document_data;
                  } catch (error) {
                    return activeBill.document_data;
                  }
                })();

                return (
                  <OfficialBillDocument
                    documentData={{
                      ...rawDocumentData,
                      bill_number: rawDocumentData.bill_number || activeBill.bill_number || `BILL-${activeBill.id}`,
                      date: rawDocumentData.date || activeBill.date || activeBill.created_at?.slice(0, 10),
                      site_name: rawDocumentData.site_name || activeBill.site_name || 'SHRIMP HARVEST MANAGEMENT',
                      buyer_name: rawDocumentData.buyer_name || activeBill.buyer_name || activeBill.supplier_name || activeBill.grader_name || 'Choice Trading Co.',
                      grader_name: (activeBill.request_type === 'valamanushulu' || activeBill.category === 'valamanushulu' || String(activeBill.bill_number || '').toUpperCase().startsWith('VAL')) ? '' : (rawDocumentData.grader_name || activeBill.grader_name || ''),
                      supervisor_name: rawDocumentData.supervisor_name || activeBill.supervisor_name || 'Incharge',
                      tank_name: rawDocumentData.tank_name || activeBill.tank_name || tanksMap[activeBill.tank_id] || 'Tank A1',
                      harvest_type: rawDocumentData.harvest_type || activeBill.harvest_type || 'middle',
                      total_kgs: Number(rawDocumentData.total_kgs ?? activeBill.kgs ?? 1250),
                      total_amount: Number(rawDocumentData.total_amount ?? activeBill.total_amount ?? 0),
                      paid_amount: Number(rawDocumentData.paid_amount ?? activeBill.paid_amount ?? 0),
                      balance_amount: Number(rawDocumentData.balance_amount ?? activeBill.balance_amount ?? 0),
                      supervisor_signature: rawDocumentData.supervisor_signature || activeBill.supervisor_signature || null,
                      grader_signature: rawDocumentData.grader_signature || activeBill.grader_signature || null,
                      worker_rows: rawDocumentData.worker_rows || activeBill.worker_rows || rawDocumentData.labour_details?.worker_rows || activeBill.labour_details?.worker_rows || null,
                      grader_rows: rawDocumentData.grader_rows || activeBill.grader_rows || rawDocumentData.grader_details?.grader_rows || activeBill.grader_details?.grader_rows || null,
                      labour_details: rawDocumentData.labour_details || activeBill.labour_details || null,
                      grader_details: rawDocumentData.grader_details || activeBill.grader_details || null,
                      request_type: rawDocumentData.request_type || activeBill.request_type || activeBill.category || 'all',
                      category: rawDocumentData.category || activeBill.category || activeBill.request_type || 'all',
                      supplier_name: rawDocumentData.supplier_name || activeBill.supplier_name || '',
                    }}
                    billRequest_type={activeBill.request_type || activeBill.category}
                    billCategory={activeBill.category || activeBill.request_type}
                    billSupplierName={activeBill.supplier_name || rawDocumentData.supplier_name || ''}
                    billGraderName={(activeBill.request_type === 'valamanushulu' || activeBill.category === 'valamanushulu' || String(activeBill.bill_number || '').toUpperCase().startsWith('VAL')) ? '' : (activeBill.grader_name || rawDocumentData.grader_name || '')}
                    docType="bill"
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Professional Pending Bills Payment Screen / Modal ───────────── */}
      {showPaymentModal && activeBill && (
        <div className="fixed inset-0 z-50 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden my-8">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
              <div>
                <span className="text-[10px] font-extrabold text-blue-400 uppercase tracking-widest block">PAYMENT SETTLEMENT</span>
                <h3 className="text-base font-black">Process Payment for Bill #{activeBill.bill_number || activeBill.id}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Financial Breakdown Card */}
              <div className="bg-slate-900 text-white p-4 rounded-2xl font-mono grid grid-cols-3 gap-2 text-center">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-sans">Total Amount</span>
                  <span className="text-sm font-black">₹{Number(activeBill.total_amount || activeBill.amount || 0).toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-400 uppercase block font-sans">Paid Amount</span>
                  <span className="text-sm font-black text-emerald-400">₹{Number(activeBill.paid_amount || 0).toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-[10px] text-amber-300 uppercase block font-sans">Remaining Balance</span>
                  <span className="text-sm font-black text-amber-400">
                    ₹{Math.max(0, Number(activeBill.total_amount || activeBill.amount || 0) - Number(activeBill.paid_amount || 0)).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* 3 Payment Methods Selector */}
              <div className="space-y-2">
                <label className="text-xs font-extrabold text-slate-900 block">Select Payment Method (3 Methods):</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'cash', label: '💵 Cash Payment' },
                    { key: 'upi', label: '📱 UPI Payment' },
                    { key: 'bank', label: '🏦 Bank Account' },
                  ].map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setPaymentMethod(m.key)}
                      className={`py-2.5 px-2 rounded-xl text-xs font-black border transition text-center ${
                        paymentMethod === m.key
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                          : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Method 1: Cash Details */}
              {paymentMethod === 'cash' && (
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 space-y-1 text-xs">
                  <span className="font-extrabold text-emerald-900 uppercase block">💵 Cash Payment Mode</span>
                  <p className="text-slate-600">Handover direct cash settlement to farmer/supplier upon receipt confirmation.</p>
                </div>
              )}

              {/* Method 2: UPI Details */}
              {paymentMethod === 'upi' && (
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 space-y-2 text-xs">
                  <span className="font-extrabold text-blue-900 uppercase block">📱 UPI Payment Details</span>
                  <div>
                    <label className="text-[10px] text-slate-600 font-bold block mb-0.5">UPI ID / VPA</label>
                    <input
                      type="text"
                      value={upiIdInput}
                      onChange={(e) => setUpiIdInput(e.target.value)}
                      className="w-full bg-white border border-blue-300 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900"
                    />
                  </div>
                </div>
              )}

              {/* Method 3: Bank Account Details */}
              {paymentMethod === 'bank' && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs text-slate-800">
                  <span className="font-extrabold text-slate-900 uppercase block">🏦 Bank Account Details</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Account Number</span>
                      <input
                        type="text"
                        value={bankDetailInput.accountNo}
                        onChange={(e) => setBankDetailInput({ ...bankDetailInput, accountNo: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 font-mono text-xs font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">IFSC Code</span>
                      <input
                        type="text"
                        value={bankDetailInput.ifsc}
                        onChange={(e) => setBankDetailInput({ ...bankDetailInput, ifsc: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 font-mono text-xs font-bold"
                      />
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Account Holder Name</span>
                    <input
                      type="text"
                      value={bankDetailInput.holderName}
                      onChange={(e) => setBankDetailInput({ ...bankDetailInput, holderName: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold"
                    />
                  </div>
                </div>
              )}

              {/* Payment Amount Input (Supports Full & Partial Payment) */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-extrabold text-slate-900">Payment Amount (₹):</label>
                  <button
                    type="button"
                    onClick={() => {
                      const bal = Math.max(0, Number(activeBill.total_amount || activeBill.amount || 0) - Number(activeBill.paid_amount || 0));
                      setPayAmount(String(bal));
                    }}
                    className="text-[10px] font-black text-blue-600 hover:underline"
                  >
                    Set Full Balance (₹{Math.max(0, Number(activeBill.total_amount || activeBill.amount || 0) - Number(activeBill.paid_amount || 0)).toLocaleString('en-IN')})
                  </button>
                </div>
                <input
                  type="number"
                  placeholder="Enter payment amount"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-lg font-mono font-black text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* Submit Action */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleProcessPayment}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition"
                >
                  Confirm &amp; Request to Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}