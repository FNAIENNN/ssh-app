/**
 * CentralPayments — Payments tab (Finance-facing module).
 *
 * Displays all payments organized by MODULE (Seed Stock, Seed Exchange, Food)
 * and STATUS (ALL, PENDING, COMPLETED, CANCELLED) with keyword search, single-date search,
 * Payment Amount Summary, Bill column (opens Total Bill), Payment Bill column (opens Payment Bill),
 * an empty Action column, and Download Bill button at the bottom of Payment Bill view.
 *
 * Amount columns: Total Amount, Paid Amount, Remaining Amount (obligation-level totals).
 * Retrieves real saved data from vehicle bookings, labour suppliers, hatcheries, and bills.
 */
import { useEffect, useState, useMemo } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { useSite } from '../../../hooks/useSite';
import { useToast } from '../../../hooks/useToast';
import { Empty } from '../../../components/ui/State';
import BillDetailsReadOnly from './BillDetailsReadOnly';

// Helper to normalize status values into: 'completed', 'pending', 'cancelled'
function normalizeStatus(status) {
  if (!status) return 'pending';
  const s = String(status).toLowerCase().trim();
  if (['completed', 'paid', 'approved', 'success'].includes(s)) return 'completed';
  if (['cancelled', 'canceled', 'rejected', 'failed'].includes(s)) return 'cancelled';
  if (['returned', 'return'].includes(s)) return 'returned';
  return 'pending';
}

// Status chip styling
function getStatusBadge(status) {
  const norm = normalizeStatus(status);
  if (norm === 'completed') {
    return { label: 'COMPLETED', bg: '#dcfce7', color: '#15803d', border: '#22c55e' };
  }
  if (norm === 'cancelled') {
    return { label: 'CANCELLED', bg: '#fee2e2', color: '#dc2626', border: '#f87171' };
  }
  if (norm === 'returned') {
    return { label: 'RETURNED', bg: '#fee2e2', color: '#b91c1c', border: '#ef4444' };
  }
  return { label: 'PENDING', bg: '#fef9c3', color: '#a16207', border: '#eab308' };
}

// Helper to format Date & Time
function formatDateDisplay(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

// Helper to get local YYYY-MM-DD from date string
function toLocalDateString(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to generate obligation key for grouping related payments
function getObligationKey(p, vBookingMap = {}) {
  const typeStr = (p.type || '').toLowerCase().trim();
  if (typeStr === 'vehicle') {
    if (p.vehicle_booking_id) return `vb_${p.vehicle_booking_id}`;
    const vb = vBookingMap[p.vehicle_booking_id];
    const vNo = (p.vehicle_no || vb?.vehicle_no || '').toLowerCase().trim();
    const dName = (p.driver_name || vb?.driver_name || '').toLowerCase().trim();
    if (vNo || dName) return `veh_${vNo}_${dName}`;
    if (p.bill_id) return `bill_veh_${p.bill_id}`;
  }
  if (typeStr === 'outside_worker' || typeStr === 'outside_workers') {
    if (p.supplier_id) return `sup_${p.supplier_id}`;
    if (p.holder_name) return `ow_${p.holder_name.toLowerCase().trim()}`;
    if (p.bill_id) return `bill_ow_${p.bill_id}`;
  }
  if (p.bill_id) {
    return `bill_${p.bill_id}`;
  }
  const party = (p.holder_name || p.driver_name || p.supervisor_name || 'party').toLowerCase().trim();
  return `${typeStr}_${party}`;
}

// Helper to download the current opened Payment Bill as a file
function downloadPaymentBill(payment) {
  const badge = getStatusBadge(payment.status);
  const p = payment;

  const lines = [
    '==================================================',
    '                  PAYMENT BILL                    ',
    '==================================================',
    `Payment ID       : ${p.id}`,
    `Date & Time      : ${formatDateDisplay(p.created_at)}`,
    `Status           : ${badge.label}`,
    '--------------------------------------------------',
    `Module           : ${p.module === 'seed_stock' ? 'Seed Stock' : p.module === 'seed_exchange' ? 'Seed Exchange' : 'Food'}`,
    `Process          : ${p.process}`,
    `Payment Type     : ${p.payment_type}`,
    `Payment Method   : ${p.method}`,
    p.bill_number && p.bill_number !== '—' ? `Bill Number      : ${p.bill_number}` : null,
    '--------------------------------------------------',
    'FINANCIAL SUMMARY:',
    `  Transaction Amt: ₹${p.amount.toLocaleString('en-IN')}`,
    `  Total Order Amt: ₹${p.total_order_amount.toLocaleString('en-IN')}`,
    `  Paid Order Amt : ₹${p.paid_order_amount.toLocaleString('en-IN')}`,
    `  Remaining Amt  : ₹${p.remaining_order_amount.toLocaleString('en-IN')}`,
    '--------------------------------------------------',
    'BENEFICIARY DETAILS:',
    `  Party / Worker : ${p.party}`,
    p.driver_name ? `  Driver Name    : ${p.driver_name}` : null,
    p.vehicle_no ? `  Vehicle No.    : ${p.vehicle_no}` : null,
    p.supervisor_name ? `  Supervisor     : ${p.supervisor_name}` : null,
  ];

  if (p.upi_id || p.account_number || p.bank_name || p.ifsc_code || p.holder_name) {
    lines.push('--------------------------------------------------');
    lines.push('SAVED ACCOUNT & TRANSACTION DETAILS:');
    if (p.upi_id) lines.push(`  UPI ID         : ${p.upi_id}`);
    if (p.holder_name) lines.push(`  Account Holder : ${p.holder_name}`);
    if (p.bank_name) lines.push(`  Bank Name      : ${p.bank_name}`);
    if (p.account_number) lines.push(`  Account Number : ${p.account_number}`);
    if (p.ifsc_code) lines.push(`  IFSC Code      : ${p.ifsc_code}`);
  }

  if (p.note) {
    lines.push('--------------------------------------------------');
    lines.push(`Remarks / Notes : "${p.note}"`);
  }

  lines.push('==================================================');
  lines.push(`Downloaded on    : ${new Date().toLocaleString('en-IN')}`);
  lines.push('==================================================');

  const content = lines.filter(Boolean).join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Payment_Bill_${p.id.slice(0, 8)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const MODULE_TABS = [
  { id: 'seed_stock', label: 'Seed Stock', icon: '🌱' },
  { id: 'seed_exchange', label: 'Seed Exchange', icon: '🔁' },
  { id: 'food', label: 'Food', icon: '🍱' },
];

const STATUS_TABS = [
  { id: 'all', label: 'ALL' },
  { id: 'pending', label: 'PENDING' },
  { id: 'completed', label: 'COMPLETED' },
  { id: 'cancelled', label: 'CANCELLED' },
  { id: 'returned', label: 'RETURNED' },
];

export default function CentralPayments() {
  const { siteId } = useSite();
  const toast = useToast();

  // Active module tab
  const [activeModule, setActiveModule] = useState('seed_stock');

  // Filter states
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDate, setSearchDate] = useState(''); // single date YYYY-MM-DD

  // View Payment Modal state & View Bill Modal state
  const [selectedPaymentModal, setSelectedPaymentModal] = useState(null);
  const [selectedBillModal, setSelectedBillModal] = useState(null);

  // Raw data state
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;
    loadData();
  }, [siteId]);

  async function loadData() {
    setLoading(true);
    try {
      const [
        { data: pData },
        { data: bData },
        { data: vBookingsData },
        { data: supData },
        { data: hatchData },
        { data: bankData },
        { data: exWorkersData },
        { data: foodOrdersData },
      ] = await Promise.all([
        supabase.from(TABLES.payments).select('*').eq('site_id', siteId).order('created_at', { ascending: false }),
        supabase.from(TABLES.bills).select('*').eq('site_id', siteId),
        supabase.from(TABLES.vehicleBookings).select('*').eq('site_id', siteId),
        supabase.from(TABLES.labourSuppliers).select('id, name, phone').eq('site_id', siteId),
        supabase.from(TABLES.hatcheries).select('*'),
        supabase.from(TABLES.bankAccounts).select('*'),
        supabase.from(TABLES.exchangeWorkers).select('*').eq('site_id', siteId).order('created_at', { ascending: false }),
        supabase.from(TABLES.foodOrders).select('*').eq('site_id', siteId).order('created_at', { ascending: false }),
      ]);

      const billMap = {};
      (bData ?? []).forEach((b) => { billMap[b.id] = b; });

      const vBookingMap = {};
      (vBookingsData ?? []).forEach((vb) => { vBookingMap[vb.id] = vb; });

      const supMap = {};
      (supData ?? []).forEach((s) => { supMap[s.id] = s.name; });

      const hatchMap = {};
      (hatchData ?? []).forEach((h) => { hatchMap[h.id] = h.hatchery_name || h.name; });

      const bankMap = {};
      (bankData ?? []).forEach((bk) => { bankMap[bk.id] = bk.holder_name || bk.bank_name; });

      // Pre-calculate obligation-level completed paid amounts and payment records
      const obligationPaidMap = {};
      const obligationPaymentsMap = {};

      (pData ?? []).forEach((p) => {
        const key = getObligationKey(p, vBookingMap);
        if (!obligationPaymentsMap[key]) obligationPaymentsMap[key] = [];
        obligationPaymentsMap[key].push(p);

        if (normalizeStatus(p.status) === 'completed') {
          obligationPaidMap[key] = (obligationPaidMap[key] || 0) + (Number(p.amount) || 0);
        }
      });

      const records = [];

      // 1. Process records from TABLES.payments
      (pData ?? []).forEach((p) => {
        let module = 'seed_stock';
        let processName = 'Hatchery Details';
        let paymentType = 'Advance Cash';
        let partyName = 'Supplier';
        let resolved_tank_name = null;

        const typeStr = (p.type || '').toLowerCase();
        const vb = p.vehicle_booking_id ? vBookingMap[p.vehicle_booking_id] : null;

        if (typeStr === 'seed_exchange' || typeStr === 'exchange' || typeStr === 'exchange_worker') {
          module = 'seed_exchange';
          processName = 'Seed Exchange';
          paymentType = 'Worker Payment';
          partyName = p.holder_name || p.supervisor_name || p.note || 'Exchange Worker';
        } else if (typeStr === 'food' || typeStr === 'food_order' || typeStr === 'canteen') {
          module = 'food';
          processName = 'Food';
          paymentType = 'Food Order Payment';
          partyName = p.holder_name || p.supervisor_name || p.note || 'Canteen Vendor';
        } else if (typeStr === 'vehicle') {
          module = 'seed_stock';
          processName = 'Vehicle Payments';
          const isCash = p.method === 'cash' || p.advance_mode === 'cash';
          const isUpi = p.advance_mode === 'upi';
          paymentType = isCash ? 'Advance Cash' : (isUpi ? 'Advance Bank (UPI)' : 'Advance Bank');

          const driver = p.driver_name || vb?.driver_name || 'Driver';
          const vNo = p.vehicle_no || vb?.vehicle_no || '';
          partyName = vNo ? `${driver} (${vNo})` : driver;
        } else if (typeStr === 'outside_worker' || typeStr === 'outside_workers') {
          module = 'seed_stock';
          
          let parsedSource = 'Outside Workers';
          if (p.note && p.note.includes('Work Source: Packing')) {
            parsedSource = 'Packing';
          } else if (p.note && p.note.includes('Work Source: Seed Stocking')) {
            parsedSource = 'Seed Stocking';
          }
          processName = parsedSource;
          
          paymentType = 'Outside Worker Payment';
          partyName = p.supplier_id ? (supMap[p.supplier_id] || p.holder_name) : (p.supervisor_name || p.holder_name || p.note || 'Outside Workers');
          
          // Clean up the partyName if it contains Work Source
          if (partyName && partyName.includes('Work Source:')) {
             partyName = 'Outside Workers';
          }
        } else {
          // Hatchery Details (Seed Order)
          module = 'seed_stock';
          processName = 'Hatchery Details';
          const isCash = p.method === 'cash' || p.advance_mode === 'cash';
          const isUpi = p.advance_mode === 'upi';
          paymentType = isCash ? 'Advance Cash' : (isUpi ? 'Advance Bank (UPI)' : 'Advance Bank');
          const b = p.bill_id ? billMap[p.bill_id] : null;
          partyName = b?.hatchery_name || (p.supplier_id ? hatchMap[p.supplier_id] : null) || p.holder_name || p.note || 'Hatchery Supplier';
        }

        let methodStr = 'Cash';
        if (p.advance_mode === 'upi') methodStr = 'UPI';
        else if (p.method === 'advance' || p.advance_mode === 'bank' || p.advance_mode === 'bank_transfer') methodStr = 'Bank';
        else if (p.method === 'upi') methodStr = 'UPI';
        else if (p.method === 'cash') methodStr = 'Cash';

        const billObj = p.bill_id ? billMap[p.bill_id] : null;
        const key = getObligationKey(p, vBookingMap);

        // Obligation-level calculations
        let totalOrderAmount = Number(p.amount) || 0;
        let paidOrderAmount = obligationPaidMap[key] || 0;
        let remainingOrderAmount = 0;

        if (typeStr === 'vehicle') {
          const vCharge = Number(vb?.transport_charges || vb?.per_tank_amount || 0);
          totalOrderAmount = vCharge > 0 ? vCharge : (p.remaining_balance != null ? Number(p.amount) + Number(p.remaining_balance) : Number(p.amount));
          remainingOrderAmount = Math.max(0, totalOrderAmount - paidOrderAmount);
        } else if (typeStr === 'return') {
          module = 'seed_stock';
          processName = 'Return';
          paymentType = 'Return Transaction';
          const b = p.bill_id ? billMap[p.bill_id] : null;
          const pd = p.packing_data || b?.packing_data || {};
          
          let tName = pd?.tank_name || p.note || p.holder_name;
          
          if (!tName && pd?.tank_id && pd?.order_id) {
             const origOrder = billMap[pd.order_id];
             if (origOrder && origOrder.selected_tanks) {
                 const st = origOrder.selected_tanks.find(t => String(t.id) === String(pd.tank_id) || String(t.originalTankId) === String(pd.tank_id));
                 if (st && st.name) tName = st.name;
             }
          }
          
          if (!tName && p.related_tank_id) {
             for (const bill of Object.values(billMap)) {
                 if ((bill.type === 'seed' || bill.type === 'seed_order') && bill.selected_tanks) {
                     const st = bill.selected_tanks.find(t => String(t.id) === String(p.related_tank_id) || String(t.originalTankId) === String(p.related_tank_id));
                     if (st && st.name) {
                         tName = st.name;
                         break;
                     }
                 }
             }
          }
          
          resolved_tank_name = tName || '—';
          const vNo = pd?.vehicle_no || p.vehicle_no || p.driver_name || '—';
          partyName = resolved_tank_name !== '—' ? `${resolved_tank_name} · Tank` : '— · Tank —';
          methodStr = 'Return';

          // Set financial amounts for the refund to display properly in Central Payments
          totalOrderAmount = Number(p.amount) || 0;
          paidOrderAmount = normalizeStatus(p.status) === 'completed' || normalizeStatus(p.status) === 'returned' ? totalOrderAmount : 0;
          remainingOrderAmount = 0;
        } else if (p.bill_id && billObj) {
          const bPayments = obligationPaymentsMap[key] || [];
          const bTotalPayments = bPayments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
          const bTotalRemaining = bPayments.reduce((sum, item) => sum + (Number(item.remaining_balance) || 0), 0);

          totalOrderAmount = Number(billObj.total_price || billObj.grand_total || (bTotalPayments + bTotalRemaining) || p.amount || 0);
          remainingOrderAmount = Math.max(0, totalOrderAmount - paidOrderAmount);
        } else {
          const sPayments = obligationPaymentsMap[key] || [];
          const sTotalPayments = sPayments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
          const sMaxRemaining = Math.max(0, ...sPayments.map((item) => Number(item.remaining_balance) || 0));

          totalOrderAmount = Number(p.total_amount || p.grand_total || (sTotalPayments + sMaxRemaining) || (p.amount + (p.remaining_balance || 0)));
          remainingOrderAmount = Math.max(0, totalOrderAmount - paidOrderAmount);
        }

        records.push({
          id: p.id,
          site_id: p.site_id,
          created_at: p.created_at || new Date().toISOString(),
          module,
          process: processName,
          payment_type: paymentType,
          party: partyName,
          amount: Number(p.amount) || 0,
          total_order_amount: totalOrderAmount,
          paid_order_amount: paidOrderAmount,
          remaining_order_amount: remainingOrderAmount,
          method: methodStr,
          status: normalizeStatus(p.status),
          raw_status: p.status || 'requested',
          bill_number: p.bill_id ? (billMap[p.bill_id]?.bill_number || p.bill_id.slice(0, 8)) : '—',
          bill_object: billObj,
          upi_id: p.upi_id || '',
          account_number: p.account_number || '',
          bank_name: p.bank_name || '',
          ifsc_code: p.ifsc_code || p.ifsc || '',
          holder_name: p.holder_name || '',
          driver_name: p.driver_name || vb?.driver_name || '',
          vehicle_no: p.vehicle_no || vb?.vehicle_no || '',
          supervisor_name: p.supervisor_name || '',
          note: p.note || p.remarks || '',
          remaining_balance: p.remaining_balance != null ? Number(p.remaining_balance) : null,
          obligation_key: key,
          source_table: 'payments',
          raw_record: p,
          packing_data: billObj?.packing_data || p.packing_data || null,
          resolved_tank_name,
        });
      });

      // 2. Process records from TABLES.exchangeWorkers (not linked in payments)
      const existingPaymentIds = new Set((pData ?? []).map((p) => p.id));
      (exWorkersData ?? []).forEach((ew) => {
        if (!ew.payment_id || !existingPaymentIds.has(ew.payment_id)) {
          const amt = Number(ew.grand_total) || 0;
          const isDone = ew.payment_id || ew.status === 'completed';
          const paidAmt = isDone ? amt : 0;
          records.push({
            id: ew.id,
            site_id: ew.site_id,
            created_at: ew.created_at || new Date().toISOString(),
            module: 'seed_exchange',
            process: 'Seed Exchange',
            payment_type: 'Worker Payment',
            party: ew.mestri_name || 'Mestri / Workers',
            amount: amt,
            total_order_amount: amt,
            paid_order_amount: paidAmt,
            remaining_order_amount: Math.max(0, amt - paidAmt),
            method: 'Bank',
            status: normalizeStatus(ew.status || (ew.payment_id ? 'completed' : 'pending')),
            raw_status: ew.status || (ew.payment_id ? 'completed' : 'pending'),
            bill_number: '—',
            bill_object: null,
            upi_id: '',
            account_number: '',
            bank_name: '',
            ifsc_code: '',
            holder_name: ew.mestri_name || '',
            driver_name: '',
            vehicle_no: '',
            supervisor_name: '',
            note: ew.remarks || '',
            remaining_balance: null,
            obligation_key: `exworker_${ew.id}`,
            source_table: 'exchange_workers',
            raw_record: ew,
          });
        }
      });

      // 3. Process records from TABLES.foodOrders (not in payments)
      (foodOrdersData ?? []).forEach((fo) => {
        const payload = fo.payload || {};
        const amt = Number(payload.amount || (payload.count ? payload.count * 100 : 0)) || 0;
        const normSt = normalizeStatus(fo.status || payload.status || 'completed');
        const paidAmt = normSt === 'completed' ? amt : 0;
        records.push({
          id: fo.id,
          site_id: fo.site_id,
          created_at: fo.created_at || new Date().toISOString(),
          module: 'food',
          process: 'Food',
          payment_type: 'Food Order Sync',
          party: payload.supplier || payload.canteen || 'Canteen Vendor',
          amount: amt,
          total_order_amount: amt,
          paid_order_amount: paidAmt,
          remaining_order_amount: Math.max(0, amt - paidAmt),
          method: 'Cash',
          status: normSt,
          raw_status: fo.status || payload.status || 'completed',
          bill_number: '—',
          bill_object: null,
          upi_id: '',
          account_number: '',
          bank_name: '',
          ifsc_code: '',
          holder_name: payload.supplier || payload.canteen || '',
          driver_name: '',
          vehicle_no: '',
          supervisor_name: '',
          note: payload.meal ? `Meal: ${payload.meal}, Count: ${payload.count ?? '—'}` : '',
          remaining_balance: null,
          obligation_key: `food_${fo.id}`,
          source_table: 'food_orders',
          raw_record: fo,
        });
      });

      setAllRecords(records);
    } catch (err) {
      console.error('loadData error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Clear filters helper (does NOT change selected module)
  function handleClearFilters() {
    setStatusFilter('all');
    setSearchQuery('');
    setSearchDate('');
  }

  // Scoped records filtered by Module, Status, Search Query, and Exact Calendar Date
  const filteredRecords = useMemo(() => {
    return allRecords.filter((item) => {
      // 1. Module filter
      if (item.module !== activeModule) return false;

      // 2. Status filter
      if (statusFilter !== 'all') {
        if (item.status !== statusFilter) return false;
      }

      // 3. Exact Date Search filter
      if (searchDate) {
        const itemLocalDate = toLocalDateString(item.created_at);
        if (itemLocalDate !== searchDate) return false;
      }

      // 4. Keyword Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchParty = (item.party || '').toLowerCase().includes(q);
        const matchProcess = (item.process || '').toLowerCase().includes(q);
        const matchType = (item.payment_type || '').toLowerCase().includes(q);
        const matchId = (item.id || '').toLowerCase().includes(q);
        const matchBill = (item.bill_number || '').toLowerCase().includes(q);
        const matchMethod = (item.method || '').toLowerCase().includes(q);
        const matchStatus = (item.status || '').toLowerCase().includes(q);
        const matchUpi = (item.upi_id || '').toLowerCase().includes(q);
        const matchAccount = (item.account_number || '').toLowerCase().includes(q);
        const matchDriver = (item.driver_name || '').toLowerCase().includes(q);
        const matchVehicle = (item.vehicle_no || '').toLowerCase().includes(q);
        const matchSupervisor = (item.supervisor_name || '').toLowerCase().includes(q);
        const matchAmount = (item.total_order_amount || '').toString().includes(q);

        if (
          !matchParty &&
          !matchProcess &&
          !matchType &&
          !matchId &&
          !matchBill &&
          !matchMethod &&
          !matchStatus &&
          !matchUpi &&
          !matchAccount &&
          !matchDriver &&
          !matchVehicle &&
          !matchSupervisor &&
          !matchAmount
        ) {
          return false;
        }
      }

      return true;
    });
  }, [allRecords, activeModule, statusFilter, searchDate, searchQuery]);

  // Payment Amount Summary for currently selected module & filters: Total Amount, Paid Amount, Remaining Amount
  const summaryStats = useMemo(() => {
    const uniqueKeys = new Set(filteredRecords.map((r) => r.obligation_key));
    let totalAmount = 0;
    let paidAmount = 0;

    uniqueKeys.forEach((key) => {
      const rep = filteredRecords.find((r) => r.obligation_key === key);
      if (rep) {
        totalAmount += rep.total_order_amount;
        paidAmount += rep.paid_order_amount;
      }
    });

    const remainingAmount = Math.max(0, totalAmount - paidAmount);

    return { totalAmount, paidAmount, remainingAmount };
  }, [filteredRecords]);

  if (!siteId) return <Empty icon="🗺️" title="Select a site first" />;

  const activeModuleLabel = MODULE_TABS.find((m) => m.id === activeModule)?.label || 'Module';

  // Render Full Bill View Modal if selected
  if (selectedBillModal) {
    return (
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        <button
          type="button"
          onClick={() => setSelectedBillModal(null)}
          className="btn-primary text-xs px-4 py-2 font-bold flex items-center gap-1"
        >
          ← Back to Payments
        </button>
        <BillDetailsReadOnly
          bill={selectedBillModal}
          onBack={() => setSelectedBillModal(null)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── 1. MAIN PAYMENTS MODULE HEADER & MODULE TABS ── */}
      <div className="flex flex-col space-y-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">PAYMENTS</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Centralized payment requests and approvals organized by module and status
          </p>
        </div>

        {/* Module Selection Tabs */}
        <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-2xl border" style={{ borderColor: 'var(--color-border)' }}>
          {MODULE_TABS.map((tab) => {
            const isActive = activeModule === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveModule(tab.id)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-extrabold transition-all shadow-sm"
                style={{
                  background: isActive ? 'var(--color-primary)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--color-text-secondary)',
                  boxShadow: isActive ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. PAYMENT AMOUNT SUMMARY (TOTAL AMOUNT / PAID AMOUNT / REMAINING AMOUNT) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5 border space-y-1 bg-white rounded-[16px] shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs text-text-muted uppercase font-black tracking-wider">Total Amount</p>
          <p className="text-2xl font-black text-blue-700">₹{summaryStats.totalAmount.toLocaleString('en-IN')}</p>
        </div>
        <div className="card p-5 border space-y-1 bg-white rounded-[16px] shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs text-text-muted uppercase font-black tracking-wider">Paid Amount</p>
          <p className="text-2xl font-black text-emerald-600">₹{summaryStats.paidAmount.toLocaleString('en-IN')}</p>
        </div>
        <div className="card p-5 border space-y-1 bg-white rounded-[16px] shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs text-text-muted uppercase font-black tracking-wider">Remaining Amount</p>
          <p className="text-2xl font-black text-amber-600">₹{summaryStats.remainingAmount.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* ── STATUS FILTERS (SCOPED TO CURRENT MODULE) ── */}
      <div className="space-y-4 bg-white p-5 rounded-[16px] border shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
            Status Filter — {activeModuleLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((tab) => {
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className="px-4 py-2 rounded-xl text-xs font-extrabold transition-all border"
                  style={{
                    background: isActive ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: isActive ? '#ffffff' : 'var(--color-text-secondary)',
                    borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border)',
                    boxShadow: isActive ? '0 2px 8px rgba(37, 99, 235, 0.2)' : 'none',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── SEARCH & SEARCH BY DATE & CLEAR FILTERS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
          {/* Search payments... */}
          <div className="sm:col-span-1">
            <label className="field-label text-[11px]">Search Payments</label>
            <input
              type="text"
              className="field text-xs py-2"
              placeholder="Search payments…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Search by Date */}
          <div className="sm:col-span-1">
            <label className="field-label text-[11px]">Search by Date 📅</label>
            <input
              type="date"
              className="field text-xs py-2"
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
            />
          </div>

          {/* Clear Filters */}
          <div className="sm:col-span-1 flex items-end">
            <button
              type="button"
              onClick={handleClearFilters}
              className="w-full py-2 px-4 rounded-xl text-xs font-extrabold border transition-all text-slate-700 bg-slate-100 hover:bg-slate-200"
              style={{ borderColor: 'var(--color-border)' }}
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* ── 4. MAIN RECORDS TABLE ── */}
      {loading ? (
        <div className="card p-8 text-center text-xs text-text-muted">
          Loading payment records…
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="card p-10 text-center space-y-3 border-dashed border-2">
          <p className="text-4xl">💳</p>
          <p className="font-extrabold text-base text-slate-800">No Payment Records Found</p>
          <p className="text-xs text-text-muted max-w-md mx-auto">
            No payments match the selected status, search text, or date for <strong>{activeModuleLabel}</strong>.
          </p>
          {(statusFilter !== 'all' || searchQuery || searchDate) && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="btn-primary text-xs px-4 py-2 mt-2 font-bold inline-block"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : statusFilter === 'returned' ? (
        <div className="overflow-x-auto rounded-[12px] border border-slate-200 shadow-sm bg-white">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-900 text-white border-b border-slate-700 uppercase tracking-widest text-[10px]">
                <th className="p-3 font-bold text-left">Date & Time</th>
                <th className="p-3 font-bold text-left">Vehicle / Driver</th>
                <th className="p-3 font-bold text-left">Source Tank</th>
                <th className="p-3 font-bold text-right">Ret. Quantity</th>
                <th className="p-3 font-bold text-right">Ret. Packets</th>
                <th className="p-3 font-bold text-left">Reason</th>
                <th className="p-3 font-bold text-center">Status</th>
                <th className="p-3 font-bold text-center">Return Bill</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((r, idx) => {
                const badge = getStatusBadge(r.status);
                const pd = r.packing_data || {};
                
                return (
                  <tr
                    key={r.id || idx}
                    className="border-b last:border-0 hover:bg-slate-50 transition duration-150"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <td className="p-3.5 text-xs text-slate-600 font-semibold">{formatDateDisplay(r.created_at)}</td>
                    <td className="p-3.5 text-xs font-bold text-slate-800">{pd.vehicle_no || r.vehicle_no || r.driver_name || '—'}</td>
                    <td className="p-3.5 text-xs font-bold text-slate-800">{r.resolved_tank_name !== null ? r.resolved_tank_name : (pd.tank_name || r.note || r.holder_name || '—')}</td>
                    <td className="p-3.5 font-black text-blue-700 text-right whitespace-nowrap text-xs">
                      {pd.quantity != null ? Number(pd.quantity).toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="p-3.5 font-black text-slate-700 text-right whitespace-nowrap text-xs">
                      {pd.packets != null ? pd.packets : '—'}
                    </td>
                    <td className="p-3.5 text-xs text-slate-600 truncate max-w-[200px]" title={pd.reason || '—'}>
                      {pd.reason || '—'}
                    </td>
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <span
                        className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border inline-block"
                        style={{
                          background: badge.bg,
                          color: badge.color,
                          borderColor: badge.border,
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="p-3.5 font-bold text-center whitespace-nowrap">
                      {r.bill_number && r.bill_number !== '—' ? (
                        <button
                          type="button"
                          onClick={() => setSelectedBillModal(r.bill_object || { bill_number: r.bill_number })}
                          className="font-extrabold text-blue-600 hover:text-blue-800 underline transition cursor-pointer text-xs"
                        >
                          {r.bill_number}
                        </button>
                      ) : (
                        <span className="text-text-muted font-bold">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-slate-200 shadow-sm bg-white" style={{ borderColor: 'var(--color-border)' }}>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr style={{ background: 'var(--color-primary)', color: '#ffffff' }}>
                <th className="p-3.5 font-extrabold whitespace-nowrap text-white">Date &amp; Time</th>
                <th className="p-3.5 font-extrabold whitespace-nowrap text-white">Process</th>
                <th className="p-3.5 font-extrabold whitespace-nowrap text-white">Payment Type</th>
                <th className="p-3.5 font-extrabold whitespace-nowrap text-white">Party</th>
                <th className="p-3.5 font-extrabold whitespace-nowrap text-right text-white">Requested Amount</th>
                <th className="p-3.5 font-extrabold whitespace-nowrap text-right text-white">Total Amount</th>
                <th className="p-3.5 font-extrabold whitespace-nowrap text-right text-white">Paid Amount</th>
                <th className="p-3.5 font-extrabold whitespace-nowrap text-right text-white">Remaining Amount</th>
                <th className="p-3.5 font-extrabold whitespace-nowrap text-center text-white">Method</th>
                <th className="p-3.5 font-extrabold whitespace-nowrap text-center text-white">Status</th>
                <th className="p-3.5 font-extrabold whitespace-nowrap text-white">Bill</th>
                <th className="p-3.5 font-extrabold whitespace-nowrap text-center text-white">Payment Bill</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((r, idx) => {
                const badge = getStatusBadge(r.status);
                return (
                  <tr
                    key={r.id || idx}
                    className="border-b hover:bg-slate-50 transition-colors"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    {/* Date & Time */}
                    <td className="p-3.5 font-medium text-slate-700 whitespace-nowrap">
                      {formatDateDisplay(r.created_at)}
                    </td>

                    {/* Process */}
                    <td className="p-3.5 font-bold text-slate-800 whitespace-nowrap">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-[11px] font-extrabold border border-slate-200">
                        {r.process}
                      </span>
                    </td>

                    {/* Payment Type */}
                    <td className="p-3.5 font-semibold text-slate-700 whitespace-nowrap">
                      {r.payment_type}
                    </td>

                    {/* Party */}
                    <td className="p-3.5 font-extrabold text-slate-900">
                      <div>
                        <p className="text-xs font-black text-slate-900">{r.party}</p>
                      </div>
                    </td>

                    {/* Requested Amount */}
                    <td className="p-3.5 font-black text-indigo-700 text-right whitespace-nowrap text-xs">
                      ₹{r.amount.toLocaleString('en-IN')}
                    </td>

                    {/* Total Amount */}
                    <td className="p-3.5 font-black text-blue-700 text-right whitespace-nowrap text-xs">
                      ₹{r.total_order_amount.toLocaleString('en-IN')}
                    </td>

                    {/* Paid Amount */}
                    <td className="p-3.5 font-black text-emerald-700 text-right whitespace-nowrap text-xs">
                      ₹{r.paid_order_amount.toLocaleString('en-IN')}
                    </td>

                    {/* Remaining Amount */}
                    <td className="p-3.5 font-black text-amber-700 text-right whitespace-nowrap text-xs">
                      ₹{r.remaining_order_amount.toLocaleString('en-IN')}
                    </td>

                    {/* Method */}
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 font-extrabold text-[11px] border border-sky-200">
                        {r.method}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <span
                        className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border inline-block"
                        style={{
                          background: badge.bg,
                          color: badge.color,
                          borderColor: badge.border,
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>

                    {/* Bill Column: Clickable Bill Number opens COMPLETE/TOTAL BILL */}
                    <td className="p-3.5 font-bold text-slate-800 whitespace-nowrap">
                      {r.bill_number && r.bill_number !== '—' ? (
                        <button
                          type="button"
                          onClick={() => setSelectedBillModal(r.bill_object || { bill_number: r.bill_number })}
                          className="font-extrabold text-blue-600 hover:text-blue-800 underline transition cursor-pointer text-xs"
                        >
                          {r.bill_number}
                        </button>
                      ) : (
                        <span className="text-text-muted font-bold">—</span>
                      )}
                    </td>

                    {/* Payment Bill Column: View Payment button opens PAYMENT BILL details */}
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedPaymentModal(r)}
                        className="px-3 py-1 text-[11px] font-extrabold rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition shadow-sm"
                      >
                        View Payment
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── VIEW PAYMENT DETAILS MODAL ── */}
      {selectedPaymentModal && (
        <ViewPaymentModal
          payment={selectedPaymentModal}
          onClose={() => setSelectedPaymentModal(null)}
        />
      )}
    </div>
  );
}

/**
 * View Payment Details Modal Component
 * Displays real saved details for the clicked payment with Download Bill button at the BOTTOM.
 */
function ViewPaymentModal({ payment, onClose }) {
  const badge = getStatusBadge(payment.status);
  const p = payment;
  const raw = p.raw_record || {};

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[20px] shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 space-y-0 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-blue-300">
              Payment Bill Details
            </span>
            <h3 className="text-base font-extrabold text-white font-mono mt-0.5">
              ID: {p.id}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center font-bold text-base transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Status & Amount Summary Banner */}
          <div className="p-4 rounded-[14px] bg-slate-50 border flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <p className="text-[11px] text-text-muted font-bold uppercase">Status</p>
              <span
                className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border inline-block mt-1"
                style={{ background: badge.bg, color: badge.color, borderColor: badge.border }}
              >
                {badge.label}
              </span>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-text-muted font-bold uppercase">Transaction Amount</p>
              <p className="text-xl font-black text-emerald-700 mt-0.5">
                ₹{p.amount.toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          {/* Core Information Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <DetailItem label="Date & Time" value={formatDateDisplay(p.created_at)} />
            <DetailItem label="Module" value={p.module === 'seed_stock' ? 'Seed Stock' : p.module === 'seed_exchange' ? 'Seed Exchange' : 'Food'} />
            <DetailItem label="Process" value={p.process} />
            <DetailItem label="Payment Type" value={p.payment_type} />
            <DetailItem label="Payment Method" value={p.method} />
            {p.bill_number && p.bill_number !== '—' && (
              <DetailItem label="Bill Number" value={p.bill_number} />
            )}
          </div>

          <hr style={{ borderColor: 'var(--color-border)' }} />

          {/* Financial Breakdown */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border text-xs" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <p className="text-[10px] text-text-muted font-bold uppercase">Total Obligation Amt</p>
              <p className="font-extrabold text-blue-700">₹{p.total_order_amount.toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted font-bold uppercase">Paid Amt</p>
              <p className="font-extrabold text-emerald-600">₹{p.paid_order_amount.toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted font-bold uppercase">Remaining Amt</p>
              <p className="font-extrabold text-amber-600">₹{p.remaining_order_amount.toLocaleString('en-IN')}</p>
            </div>
          </div>

          <hr style={{ borderColor: 'var(--color-border)' }} />

          {/* Party / Beneficiary Details */}
          <div className="space-y-2 text-xs">
            <p className="font-extrabold text-slate-900 uppercase text-[11px] tracking-wider text-text-muted">
              Beneficiary / Party Details
            </p>

            <DetailItem label="Party / Beneficiary" value={p.party} />

            {p.driver_name && <DetailItem label="Driver Name" value={p.driver_name} />}
            {p.vehicle_no && <DetailItem label="Vehicle Number" value={p.vehicle_no} />}
            {p.supervisor_name && <DetailItem label="Supervisor" value={p.supervisor_name} />}
          </div>

          {/* Banking / Financial Information (if saved) */}
          {(p.upi_id || p.account_number || p.bank_name || p.ifsc_code || p.holder_name) && (
            <>
              <hr style={{ borderColor: 'var(--color-border)' }} />
              <div className="space-y-2 text-xs">
                <p className="font-extrabold text-slate-900 uppercase text-[11px] tracking-wider text-text-muted">
                  Saved Account &amp; Transaction Details
                </p>
                {p.upi_id && <DetailItem label="UPI ID" value={p.upi_id} highlight />}
                {p.holder_name && <DetailItem label="Account Holder" value={p.holder_name} />}
                {p.bank_name && <DetailItem label="Bank Name" value={p.bank_name} />}
                {p.account_number && <DetailItem label="Account Number" value={p.account_number} />}
                {p.ifsc_code && <DetailItem label="IFSC Code" value={p.ifsc_code} />}
              </div>
            </>
          )}

          {/* Remarks / Notes (if present) */}
          {p.note && (
            <>
              <hr style={{ borderColor: 'var(--color-border)' }} />
              <div className="text-xs space-y-1">
                <p className="font-extrabold text-slate-900 uppercase text-[11px] tracking-wider text-text-muted">
                  Remarks / Notes
                </p>
                <p className="p-3 bg-slate-50 rounded-xl border text-slate-700 italic font-medium" style={{ borderColor: 'var(--color-border)' }}>
                  "{p.note}"
                </p>
              </div>
            </>
          )}

          {/* Proof Preview (if present) */}
          {raw.proof_url && (
            <div className="text-xs space-y-1">
              <p className="font-extrabold text-slate-900 uppercase text-[11px] tracking-wider text-text-muted">
                Payment Proof
              </p>
              <p className="p-2 bg-emerald-50 rounded-lg text-emerald-800 font-bold border border-emerald-200">
                📄 Proof File: {raw.proof_url}
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer — DOWNLOAD BILL BUTTON POSITIONED AT THE BOTTOM AFTER ALL CONTENT */}
        <div className="px-6 py-4 bg-slate-50 border-t flex items-center justify-between gap-3" style={{ borderColor: 'var(--color-border)' }}>
          <button
            type="button"
            onClick={() => downloadPaymentBill(payment)}
            className="btn-primary text-xs font-extrabold px-5 py-2.5 rounded-xl shadow-md flex items-center gap-2 transition hover:scale-105"
          >
            <span>📥</span>
            <span>Download Bill</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-slate-700 hover:text-slate-900 border rounded-xl bg-white hover:bg-slate-100 transition"
            style={{ borderColor: 'var(--color-border)' }}
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value, highlight = false }) {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-text-muted font-bold uppercase">{label}</p>
      <p className={`font-black ${highlight ? 'text-blue-700 font-mono' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  );
}
