import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, TABLES } from '../../lib/supabaseClient';
import { useSite } from '../../hooks/useSite';
import { useToast } from '../../hooks/useToast';
import { Empty } from '../../components/ui/State';
import DigitalSignaturePad from '../../components/ui/DigitalSignaturePad';

const SESSIONS = [
  { id: 'Morning', name: 'Morning', icon: '☀️', meal: 'Tiffins' },
  { id: 'Afternoon', name: 'Afternoon', icon: '🌤️', meal: 'Lunch' },
  { id: 'Night', name: 'Night / Evening', icon: '🌙', meal: 'Dinner' },
];

const STAGES = [
  { id: 0, name: 'Ordered / Requested', badge: 'Order Placed' },
  { id: 1, name: 'Canteen Received', badge: 'Canteen Processing' },
  { id: 2, name: 'Dispatched', badge: 'Out for Delivery' },
  { id: 3, name: 'Received & Reconciled', badge: 'Delivered & Audited' },
];

function todayKey(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return new Date().toISOString().slice(0, 10);
  return dt.toISOString().slice(0, 10);
}

function formatDate(d) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function generateOrderId() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `FOOD-${dateStr}-${rand}`;
}

export default function FoodModule({ source = 'seed' }) {
  const { siteId, site } = useSite();
  const toast = useToast();
  const isHarvest = source === 'harvest';
  const moduleLabel = isHarvest ? 'Harvest' : 'Seed';
  const accent = isHarvest ? '#D97706' : '#2563EB';

  // Section Order: 1. Data Entry , 2. Status , 3. History
  const [activeTab, setActiveTab] = useState('data_entry');

  // --- Data Entry State ---
  const [entryDate, setEntryDate] = useState(todayKey());
  const [tanks, setTanks] = useState([]);
  const [selectedTankIds, setSelectedTankIds] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [showNewSupplierForm, setShowNewSupplierForm] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    phone: '',
    village: '',
    phonepe: '',
    bankAccount: '',
    holderName: '',
  });

  const [selectedSession, setSelectedSession] = useState('Morning');
  const [outsideCount, setOutsideCount] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [otherCount, setOtherCount] = useState('');
  const [extraInfo, setExtraInfo] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // --- Submissions & State ---
  const [submissions, setSubmissions] = useState([]);
  const [finalizedSessions, setFinalizedSessions] = useState([]);

  // Map of orderId -> received count (for Reconciliation table)
  const [receivedMap, setReceivedMap] = useState({});
  // Map of orderId -> pipeline stage index (0..3)
  const [orderStages, setOrderStages] = useState({});

  // Action Column Yes/No Resolutions Map (orderId -> 'reordered' | 'shortage_dismissed' | 'returned' | 'surplus_accepted')
  const [orderResolutions, setOrderResolutions] = useState({});

  // Supervisor Signature (in digital format)
  const [supervisorSignature, setSupervisorSignature] = useState('');
  const [supervisorSignatureInfo, setSupervisorSignatureInfo] = useState(null);

  // History Filters
  const [dateFilter, setDateFilter] = useState('');
  const [sessionFilter, setSessionFilter] = useState('All');
  const [supplierFilter, setSupplierFilter] = useState('All');
  const [tankFilter, setTankFilter] = useState('All');
  const [expandedDays, setExpandedDays] = useState(new Set());
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [printSlipOrder, setPrintSlipOrder] = useState(null);

  // Dispatch modal state
  const [dispatchModalOrder, setDispatchModalOrder] = useState(null);
  const [dispatchInfo, setDispatchInfo] = useState({ vehicleNo: '', deliveryPerson: '' });

  // Scope localStorage key per site and source
  const localStoreKey = `ssh_food_data_v4_${siteId}_${source}`;

  // Load state & tanks
  const loadData = useCallback(async () => {
    if (!siteId) return;

    // Fetch active running tanks for this site
    const { data: tankList } = await supabase
      .from(TABLES.tanks)
      .select('*')
      .eq('site_id', siteId);

    const activeTanks = tankList || [];
    setTanks(activeTanks);

    // Fetch suppliers from DB & local state
    const { data: dbSuppliers } = await supabase
      .from(TABLES.labourSuppliers)
      .select('*')
      .eq('site_id', siteId);

    let combinedSuppliers = dbSuppliers || [];

    // LocalStorage fallback and custom state
    try {
      const raw = localStorage.getItem(localStoreKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.customSuppliers && Array.isArray(parsed.customSuppliers)) {
          const ids = new Set(combinedSuppliers.map((s) => s.id));
          parsed.customSuppliers.forEach((cs) => {
            if (!ids.has(cs.id)) combinedSuppliers.push(cs);
          });
        }
        if (parsed.submissions && Array.isArray(parsed.submissions)) {
          setSubmissions(parsed.submissions);
        }
        if (parsed.finalizedSessions && Array.isArray(parsed.finalizedSessions)) {
          setFinalizedSessions(parsed.finalizedSessions);
        }
        if (parsed.receivedMap) {
          setReceivedMap(parsed.receivedMap);
        }
        if (parsed.orderStages) {
          setOrderStages(parsed.orderStages);
        }
        if (parsed.orderResolutions) {
          setOrderResolutions(parsed.orderResolutions);
        }
        if (parsed.supervisorSignature) {
          setSupervisorSignature(parsed.supervisorSignature);
        }
        if (parsed.supervisorSignatureInfo) {
          setSupervisorSignatureInfo(parsed.supervisorSignatureInfo);
        }
      } else {
        setSubmissions([]);
        setFinalizedSessions([]);
      }
    } catch {
      // Fallback
    }

    if (!combinedSuppliers.length) {
      combinedSuppliers = [
        {
          id: 'sup-demo-1',
          name: 'Raju Labour Agency',
          phone: '+91 98480 11223',
          village: 'Akividu Town',
          phonepe: '9848011223@ybl',
          bank_account: '5010023491823',
          holder_name: 'K Raju',
        },
        {
          id: 'sup-demo-2',
          name: 'Sri Ram Labour Gang',
          phone: '+91 94401 55443',
          village: 'Bhimavaram Center',
          phonepe: 'sriram@upi',
          bank_account: '39481029384',
          holder_name: 'Venkatesh S',
        },
      ];
    }
    setSuppliers(combinedSuppliers);
  }, [siteId, source, localStoreKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Persist local state changes
  const persistLocal = useCallback(
    (extraState = {}) => {
      if (!siteId) return;
      try {
        const payload = {
          submissions: extraState.submissions ?? submissions,
          finalizedSessions: extraState.finalizedSessions ?? finalizedSessions,
          receivedMap: extraState.receivedMap ?? receivedMap,
          orderStages: extraState.orderStages ?? orderStages,
          orderResolutions: extraState.orderResolutions ?? orderResolutions,
          supervisorSignature: extraState.supervisorSignature ?? supervisorSignature,
          supervisorSignatureInfo: extraState.supervisorSignatureInfo ?? supervisorSignatureInfo,
          customSuppliers: suppliers.filter((s) => String(s.id).startsWith('sup-custom-')),
        };
        localStorage.setItem(localStoreKey, JSON.stringify(payload));
      } catch (err) {
        console.error('Failed to persist food data locally:', err);
      }
    },
    [siteId, submissions, finalizedSessions, receivedMap, orderStages, orderResolutions, supervisorSignature, supervisorSignatureInfo, suppliers, localStoreKey]
  );

  // Today's Submissions (Running Day Orders)
  const todaySubmissions = useMemo(() => {
    const tKey = todayKey();
    return submissions.filter((s) => s.entry_date === tKey);
  }, [submissions]);

  // --- Supplier Selection & Creation ---
  const selectedSupplierObj = useMemo(() => {
    return suppliers.find((s) => String(s.id) === String(selectedSupplierId)) || null;
  }, [suppliers, selectedSupplierId]);

  const handleSupplierSelectChange = (e) => {
    const val = e.target.value;
    if (val === '__NEW__') {
      setSelectedSupplierId('');
      setShowNewSupplierForm(true);
    } else {
      setShowNewSupplierForm(false);
      setSelectedSupplierId(val);
    }
  };

  const handleCreateNewSupplier = async () => {
    if (!newSupplier.name.trim()) return toast.error('Enter supplier name');
    if (!newSupplier.phone.trim()) return toast.error('Enter supplier phone number');

    const created = {
      id: `sup-custom-${Date.now()}`,
      site_id: siteId,
      name: newSupplier.name.trim(),
      phone: newSupplier.phone.trim(),
      village: newSupplier.village.trim() || '—',
      phonepe: newSupplier.phonepe.trim() || '—',
      bank_account: newSupplier.bankAccount.trim() || '—',
      holder_name: newSupplier.holderName.trim() || '—',
      created_at: new Date().toISOString(),
    };

    await supabase.from(TABLES.labourSuppliers).insert(created);

    const updatedList = [created, ...suppliers];
    setSuppliers(updatedList);
    setSelectedSupplierId(created.id);
    setShowNewSupplierForm(false);
    setNewSupplier({ name: '', phone: '', village: '', phonepe: '', bankAccount: '', holderName: '' });
    toast.success(`Supplier "${created.name}" added successfully`);
  };

  // Calculations for Data Entry 4 Summary Cards
  const outsideVal = Math.max(0, Number(outsideCount) || 0);
  const guestVal = Math.max(0, Number(guestCount) || 0);
  const otherVal = Math.max(0, Number(otherCount) || 0);
  const totalVal = outsideVal + guestVal + otherVal;

  // Tank multi-select helper
  const toggleTankSelection = (tankId) => {
    setSelectedTankIds((prev) =>
      prev.includes(tankId) ? prev.filter((id) => id !== tankId) : [...prev, tankId]
    );
  };
  const toggleSelectAllTanks = () => {
    if (selectedTankIds.length === tanks.length) {
      setSelectedTankIds([]);
    } else {
      setSelectedTankIds(tanks.map((t) => t.id));
    }
  };

  // Submit Order from Data Entry
  const handleSubmitOrder = async () => {
    if (!entryDate) return toast.error('Please select an entry date');
    if (selectedTankIds.length === 0) return toast.error('Please select at least one running tank');
    if (!selectedSupplierObj) return toast.error('Please select or create a supplier');
    if (totalVal <= 0) return toast.error('Please enter headcount for Outside, Guests, or Others');

    setSubmittingOrder(true);
    const orderId = generateOrderId();
    const allocatedTankNames = tanks
      .filter((t) => selectedTankIds.includes(t.id))
      .map((t) => t.name);

    const newOrder = {
      id: orderId,
      order_number: orderId,
      site_id: siteId,
      source,
      entry_date: entryDate,
      created_at: new Date().toISOString(),
      created_time: formatTime(),
      session_name: selectedSession,
      supplier_id: selectedSupplierObj.id,
      supplier_name: selectedSupplierObj.name,
      supplier_details: selectedSupplierObj,
      allocated_tank_ids: selectedTankIds,
      allocated_tanks: allocatedTankNames,
      counts: {
        regular: 0,
        outside: outsideVal,
        guests: guestVal,
        others: otherVal,
        total: totalVal,
      },
      extra_info: extraInfo.trim(),
      status: 'Ordered',
    };

    // Save to DB
    await supabase.from(TABLES.foodSubmissions).insert({
      site_id: siteId,
      source,
      module: moduleLabel,
      shifts: [selectedSession],
      attendance_date: entryDate,
      outside_worker_count: outsideVal,
      guest_count: guestVal,
      other_count: otherVal,
      remarks: extraInfo.trim(),
      payload: newOrder,
      status: 'Submitted',
    });

    const updatedSubmissions = [newOrder, ...submissions];
    const updatedReceivedMap = { ...receivedMap, [orderId]: totalVal };
    const updatedOrderStages = { ...orderStages, [orderId]: 0 };

    setSubmissions(updatedSubmissions);
    setReceivedMap(updatedReceivedMap);
    setOrderStages(updatedOrderStages);

    persistLocal({
      submissions: updatedSubmissions,
      receivedMap: updatedReceivedMap,
      orderStages: updatedOrderStages,
    });

    setSubmittingOrder(false);
    toast.success(`Order ${orderId} submitted! Added to Status tab.`);

    // Switch view to 2. Status tab
    setActiveTab('status');
  };

  // Pipeline Stage Actions
  const handleMarkCanteenReceived = (orderId) => {
    const nextStages = { ...orderStages, [orderId]: 1 };
    const updatedSubs = submissions.map((s) =>
      s.id === orderId ? { ...s, status: 'Canteen Received' } : s
    );
    setOrderStages(nextStages);
    setSubmissions(updatedSubs);
    persistLocal({ orderStages: nextStages, submissions: updatedSubs });
    toast.success('Canteen received order & started food preparation.');
  };

  const handleConfirmDispatch = (orderId) => {
    const nextStages = { ...orderStages, [orderId]: 2 };
    const updatedSubs = submissions.map((s) =>
      s.id === orderId ? { ...s, status: 'Dispatched', dispatch_info: dispatchInfo } : s
    );
    setOrderStages(nextStages);
    setSubmissions(updatedSubs);
    setDispatchModalOrder(null);
    persistLocal({ orderStages: nextStages, submissions: updatedSubs });
    toast.success('Food marked as dispatched!');
  };

  const handleSaveAndFinalizeSession = async (order) => {
    const totalOrdered = order.counts.total;
    const totalRecv = receivedMap[order.id] !== undefined ? receivedMap[order.id] : totalOrdered;
    const discrepancy = totalRecv - totalOrdered;

    const finalizedRec = {
      id: `session-${Date.now()}`,
      order_id: order.id,
      site_id: siteId,
      source,
      date: order.entry_date,
      session_name: order.session_name,
      supplier_name: order.supplier_name,
      allocated_tanks: order.allocated_tanks,
      ordered_count: totalOrdered,
      received_count: totalRecv,
      discrepancy,
      completed_at: new Date().toISOString(),
    };

    await supabase.from(TABLES.foodSessions).insert({
      site_id: siteId,
      source,
      submission_id: order.id,
      session_name: order.session_name,
      attendance_date: order.entry_date,
      stage: 'completed',
      ordered_total: totalOrdered,
      received_total: totalRecv,
      date: order.entry_date,
    });

    const updatedFinalized = [finalizedRec, ...finalizedSessions];
    const nextStages = { ...orderStages, [order.id]: 3 };
    const updatedSubs = submissions.map((s) =>
      s.id === order.id ? { ...s, status: 'Received & Reconciled' } : s
    );

    setFinalizedSessions(updatedFinalized);
    setOrderStages(nextStages);
    setSubmissions(updatedSubs);

    persistLocal({
      finalizedSessions: updatedFinalized,
      orderStages: nextStages,
      submissions: updatedSubs,
    });

    toast.success(`Order ${order.id} (${order.session_name}) finalized & saved!`);
  };

  const handleConfirmAllNewOrdersReceived = (ordersToReceive) => {
    if (!ordersToReceive || ordersToReceive.length === 0) return;
    const nextStages = { ...orderStages };
    const nextRecv = { ...receivedMap };
    const orderIdSet = new Set(ordersToReceive.map((o) => o.id));

    const updatedSubs = submissions.map((s) => {
      if (orderIdSet.has(s.id)) {
        nextStages[s.id] = 3;
        nextRecv[s.id] = nextRecv[s.id] !== undefined ? nextRecv[s.id] : (s.counts?.total || 0);
        return { ...s, status: 'Received & Reconciled' };
      }
      return s;
    });

    setOrderStages(nextStages);
    setReceivedMap(nextRecv);
    setSubmissions(updatedSubs);
    persistLocal({
      orderStages: nextStages,
      receivedMap: nextRecv,
      submissions: updatedSubs,
    });
    toast.success('Food parcels for the session marked as received at farm site!');
  };

  const handleClearSavedSignature = () => {
    setSupervisorSignature('');
    setSupervisorSignatureInfo(null);
    persistLocal({
      supervisorSignature: '',
      supervisorSignatureInfo: null,
    });
    toast.info('Saved supervisor signature removed.');
  };

  // --- Negative Balance (Shortage) Actions ---
  // Reorder Balance YES
  const handleShortageReorderYes = (order, shortageCount) => {
    setEntryDate(todayKey());
    setSelectedSession(order.session_name || 'Morning');
    setSelectedSupplierId(order.supplier_id || '');
    setSelectedTankIds(order.allocated_tank_ids || []);
    setOutsideCount(shortageCount);
    setGuestCount(0);
    setOtherCount(0);
    setExtraInfo(`Reorder for shortage of ${shortageCount} parcels from order ${order.id}`);

    const updatedResolutions = { ...orderResolutions, [order.id]: 'reordered' };
    setOrderResolutions(updatedResolutions);
    persistLocal({ orderResolutions: updatedResolutions });

    setActiveTab('data_entry');
    toast.success(`Reordering ${shortageCount} balance parcels! Switched to Data Entry.`);
  };

  // Reorder Balance NO (Accept shortage without reordering -> show tick mark)
  const handleShortageReorderNo = (order) => {
    const updatedResolutions = { ...orderResolutions, [order.id]: 'shortage_dismissed' };
    setOrderResolutions(updatedResolutions);
    persistLocal({ orderResolutions: updatedResolutions });
    toast.success(`Shortage for order ${order.id} marked as accepted.`);
  };

  // --- Positive Balance (Surplus) Actions ---
  // Return Extra YES
  const handleSurplusReturnYes = (order, extraCount) => {
    // Adjust received count back to ordered count
    const orderedCount = order.counts?.total || 0;
    const updatedReceivedMap = { ...receivedMap, [order.id]: orderedCount };
    const updatedResolutions = { ...orderResolutions, [order.id]: 'returned' };

    setReceivedMap(updatedReceivedMap);
    setOrderResolutions(updatedResolutions);
    persistLocal({ receivedMap: updatedReceivedMap, orderResolutions: updatedResolutions });

    toast.success(`Returned ${extraCount} extra parcels to canteen! Count updated.`);
  };

  // Return Extra NO (Keep/Adjust extra parcels at site -> show tick mark)
  const handleSurplusReturnNo = (order, extraCount) => {
    const updatedResolutions = { ...orderResolutions, [order.id]: 'surplus_accepted' };
    setOrderResolutions(updatedResolutions);
    persistLocal({ orderResolutions: updatedResolutions });
    toast.success(`Surplus ${extraCount} extra parcels accepted & adjusted at site.`);
  };

  // --- History Filtering ---
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((sub) => {
      if (dateFilter && sub.entry_date !== dateFilter) return false;
      if (sessionFilter !== 'All' && sub.session_name !== sessionFilter) return false;
      if (supplierFilter !== 'All' && String(sub.supplier_id) !== String(supplierFilter) && sub.supplier_name !== supplierFilter) return false;
      if (tankFilter !== 'All' && !sub.allocated_tanks?.includes(tankFilter)) return false;
      return true;
    });
  }, [submissions, dateFilter, sessionFilter, supplierFilter, tankFilter]);

  const groupedHistory = useMemo(() => {
    const map = {};
    filteredSubmissions.forEach((sub) => {
      const key = sub.entry_date || todayKey();
      if (!map[key]) map[key] = [];
      map[key].push(sub);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredSubmissions]);

  // History KPI Metrics
  const historyKPIs = useMemo(() => {
    const totalRecords = filteredSubmissions.length;
    const totalMeals = filteredSubmissions.reduce((sum, s) => sum + (s.counts?.total || 0), 0);
    const tanksSet = new Set();
    filteredSubmissions.forEach((s) => s.allocated_tanks?.forEach((t) => tanksSet.add(t)));
    const todayStr = todayKey();
    const todayParcels = filteredSubmissions
      .filter((s) => s.entry_date === todayStr)
      .reduce((sum, s) => sum + (s.counts?.total || 0), 0);

    return {
      totalRecords,
      totalMeals,
      associatedTanksCount: tanksSet.size,
      todayParcels,
    };
  }, [filteredSubmissions]);

  // Today's Total Food Summary Calculations for Bottom Card in Status
  const todayTotals = useMemo(() => {
    let orderedSum = 0;
    let receivedSum = 0;

    todaySubmissions.forEach((sub) => {
      const ord = sub.counts?.total || 0;
      const rec = receivedMap[sub.id] !== undefined ? receivedMap[sub.id] : ord;
      orderedSum += ord;
      receivedSum += rec;
    });

    const netDiscrepancy = receivedSum - orderedSum;
    return {
      count: todaySubmissions.length,
      orderedSum,
      receivedSum,
      netDiscrepancy,
    };
  }, [todaySubmissions, receivedMap]);

  const toggleDayAccordion = (day) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const handleDuplicateForToday = (order) => {
    setEntryDate(todayKey());
    setSelectedSession(order.session_name || 'Morning');
    setSelectedSupplierId(order.supplier_id || '');
    setSelectedTankIds(order.allocated_tank_ids || []);
    setOutsideCount(order.counts?.outside || '');
    setGuestCount(order.counts?.guests || '');
    setOtherCount(order.counts?.others || '');
    setExtraInfo(order.extra_info || '');

    setActiveTab('data_entry');
    toast.success(`Copied Order ${order.id} into Data Entry for today!`);
  };

  if (!siteId) return <Empty icon="🗺️" title="Select a site first" hint="Choose a farm site to manage food requests." />;

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Module Banner & 3-Section Tab Navigation (Order: 1. Data Entry, 2. Status, 3. History) */}
      <div className="rounded-2xl border bg-white p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🍱</span>
            <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: `${accent}15`, color: accent }}>
              {moduleLabel} Module
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-900 mt-1">Food & Meal Management</h2>
          <p className="text-xs text-slate-500">
            Site: <span className="font-bold text-slate-700">{site?.name}</span> · Data Entry, Running Day Status & History
          </p>
        </div>

        {/* The 3 Core Sections: 1. Data Entry , 2. Status , 3. History */}
        <div className="flex bg-slate-100 p-1.5 rounded-xl gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('data_entry')}
            className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${activeTab === 'data_entry' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <span>📝</span>
            <span>1. Data Entry</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${activeTab === 'status' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <span>🚚</span>
            <span>2. Status</span>
            {todaySubmissions.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-blue-600 text-white ml-0.5">
                {todaySubmissions.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${activeTab === 'history' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <span>📜</span>
            <span>3. History</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: DATA ENTRY                                                      */}
      {/* ========================================================================= */}
      {activeTab === 'data_entry' && (
        <div className="space-y-5">
          {/* Card 1: Date Entry */}
          <div className="card p-5 space-y-3 bg-white rounded-2xl border shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">📅</span>
                <h3 className="font-extrabold text-sm text-slate-900">1. Select Attendance / Order Date</h3>
              </div>
              <span className="text-[11px] font-bold text-slate-500">Defaults to Today</span>
            </div>
            <div>
              <label className="block text-xs font-extrabold text-slate-600 mb-1">Date</label>
              <input
                type="date"
                className="w-full md:w-64 px-3 py-2 border rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
          </div>

          {/* Card 2: Running Tanks Data (Small Icons) */}
          <div className="card p-5 space-y-3 bg-white rounded-2xl border shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏞️</span>
                <h3 className="font-extrabold text-sm text-slate-900">2. Running Tanks (Select Tanks Receiving Food)</h3>
              </div>
              <button
                type="button"
                onClick={toggleSelectAllTanks}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                {selectedTankIds.length === tanks.length ? 'Deselect All' : 'Select All Tanks'}
              </button>
            </div>

            {tanks.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No running tanks registered for this site.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {tanks.map((t) => {
                  const isSelected = selectedTankIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTankSelection(t.id)}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${isSelected
                          ? 'border-blue-600 bg-blue-50/70 shadow-sm ring-1 ring-blue-500'
                          : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-lg">🏞️</span>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => { }}
                          className="rounded text-blue-600 pointer-events-none"
                        />
                      </div>
                      <div className="mt-2">
                        <p className="font-black text-sm text-slate-900">{t.name}</p>
                        <p className="text-[10px] font-bold text-slate-500">
                          {t.quantity ? `${(t.quantity / 1000).toFixed(0)}k PL` : 'Active'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card 3: Supplier Name Dropdown & Details / New Supplier Form */}
          <div className="card p-5 space-y-4 bg-white rounded-2xl border shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">🤝</span>
                <h3 className="font-extrabold text-sm text-slate-900">3. Supplier / Mestri Selection</h3>
              </div>
              <span className="text-xs font-semibold text-slate-500">Contractor details</span>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-extrabold text-slate-600">Select Supplier</label>
              <select
                className="w-full px-3 py-2.5 border rounded-xl text-sm font-bold bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                value={showNewSupplierForm ? '__NEW__' : selectedSupplierId}
                onChange={handleSupplierSelectChange}
              >
                <option value="">-- Choose Existing Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.phone || s.village || 'Supplier'})
                  </option>
                ))}
                <option value="__NEW__">➕ New Supplier (Add Details)</option>
              </select>

              {/* Display Selected Supplier Details */}
              {selectedSupplierObj && !showNewSupplierForm && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-900 text-sm">{selectedSupplierObj.name}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">Verified Supplier</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 text-slate-600">
                    <p>📱 <span className="font-semibold text-slate-800">Phone:</span> {selectedSupplierObj.phone || '—'}</p>
                    <p>🏡 <span className="font-semibold text-slate-800">Village:</span> {selectedSupplierObj.village || '—'}</p>
                    <p>💸 <span className="font-semibold text-slate-800">PhonePe:</span> {selectedSupplierObj.phonepe || '—'}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 border-t border-slate-200 text-slate-600">
                    <p>🏦 <span className="font-semibold text-slate-800">Bank Account:</span> {selectedSupplierObj.bank_account || '—'}</p>
                    <p>👤 <span className="font-semibold text-slate-800">Account Holder:</span> {selectedSupplierObj.holder_name || '—'}</p>
                  </div>
                </div>
              )}

              {/* Form for New Supplier */}
              {showNewSupplierForm && (
                <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3">
                  <div className="flex items-center justify-between border-b border-blue-200 pb-2">
                    <span className="font-extrabold text-sm text-blue-900">Add New Supplier Details</span>
                    <button
                      type="button"
                      onClick={() => setShowNewSupplierForm(false)}
                      className="text-xs font-bold text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700">1. Supplier Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Ramesh Labour Crew"
                        className="w-full mt-1 px-3 py-2 border rounded-lg text-xs font-semibold bg-white"
                        value={newSupplier.name}
                        onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700">2. Phone No. *</label>
                      <input
                        type="text"
                        placeholder="e.g. +91 98480 12345"
                        className="w-full mt-1 px-3 py-2 border rounded-lg text-xs font-semibold bg-white"
                        value={newSupplier.phone}
                        onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700">3. Village Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Akividu Town"
                        className="w-full mt-1 px-3 py-2 border rounded-lg text-xs font-semibold bg-white"
                        value={newSupplier.village}
                        onChange={(e) => setNewSupplier({ ...newSupplier, village: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700">4. PhonePe No. / UPI</label>
                      <input
                        type="text"
                        placeholder="e.g. 9848012345@ybl"
                        className="w-full mt-1 px-3 py-2 border rounded-lg text-xs font-semibold bg-white"
                        value={newSupplier.phonepe}
                        onChange={(e) => setNewSupplier({ ...newSupplier, phonepe: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700">5. Bank Account Number</label>
                      <input
                        type="text"
                        placeholder="e.g. 501009849201"
                        className="w-full mt-1 px-3 py-2 border rounded-lg text-xs font-semibold bg-white"
                        value={newSupplier.bankAccount}
                        onChange={(e) => setNewSupplier({ ...newSupplier, bankAccount: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700">5. Bank Holder Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Ramesh Kumar"
                        className="w-full mt-1 px-3 py-2 border rounded-lg text-xs font-semibold bg-white"
                        value={newSupplier.holderName}
                        onChange={(e) => setNewSupplier({ ...newSupplier, holderName: e.target.value })}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCreateNewSupplier}
                    className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-extrabold text-xs shadow hover:bg-blue-700 transition"
                  >
                    ✓ Save & Select New Supplier
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Card 4: Session Buttons & Food Headcounts */}
          <div className="card p-5 space-y-4 bg-white rounded-2xl border shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">🍽️</span>
                <h3 className="font-extrabold text-sm text-slate-900">4. Session & Meal Breakdown</h3>
              </div>
              <span className="text-xs font-semibold text-slate-500">Select Shift</span>
            </div>

            {/* Meal Session Buttons (Morning, Afternoon, Evening) */}
            <div>
              <label className="block text-xs font-extrabold text-slate-600 mb-2">Select Meal Session</label>
              <div className="flex flex-wrap gap-2">
                {SESSIONS.map((s) => {
                  const active = selectedSession === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSession(s.id)}
                      className={`px-4 py-2.5 rounded-xl text-xs font-extrabold border transition-all flex items-center gap-2 ${active
                          ? 'bg-slate-900 text-white border-slate-900 shadow'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                    >
                      <span>{s.icon}</span>
                      <span>{s.name}</span>
                      <span className="text-[10px] opacity-70">({s.meal})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* Outside Workers Food Count (Defaulted with Selected Supplier Name) */}
              <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 space-y-1.5">
                <label className="block text-xs font-extrabold text-amber-900">
                  Outside Workers Count
                </label>
                <p className="text-[10px] font-extrabold text-amber-700 truncate">
                  Supplier: {selectedSupplierObj ? selectedSupplierObj.name : 'No Supplier Selected'}
                </p>
                <input
                  type="number"
                  min="0"
                  placeholder="Count of outside food"
                  className="w-full px-3 py-2 border rounded-lg text-sm font-bold bg-white"
                  value={outsideCount}
                  onChange={(e) => setOutsideCount(e.target.value)}
                />
              </div>

              {/* Guests Count */}
              <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/50 space-y-1.5">
                <label className="block text-xs font-extrabold text-purple-900">
                  Guests Count
                </label>
                <p className="text-[10px] font-bold text-purple-700">Visitors / Officers</p>
                <input
                  type="number"
                  min="0"
                  placeholder="Enter guest count"
                  className="w-full px-3 py-2 border rounded-lg text-sm font-bold bg-white"
                  value={guestCount}
                  onChange={(e) => setGuestCount(e.target.value)}
                />
              </div>

              {/* Others Count */}
              <div className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-1.5">
                <label className="block text-xs font-extrabold text-indigo-900">
                  Others Count
                </label>
                <p className="text-[10px] font-bold text-indigo-700">Drivers / Helpers</p>
                <input
                  type="number"
                  min="0"
                  placeholder="Enter others count"
                  className="w-full px-3 py-2 border rounded-lg text-sm font-bold bg-white"
                  value={otherCount}
                  onChange={(e) => setOtherCount(e.target.value)}
                />
              </div>
            </div>

            {/* Extra Info (Optional) */}
            <div>
              <label className="block text-xs font-extrabold text-slate-600 mb-1">Extra Info (Optional)</label>
              <textarea
                placeholder="Special meal requirements, diet note, or delivery location details..."
                className="w-full px-3 py-2 border rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                rows="2"
                value={extraInfo}
                onChange={(e) => setExtraInfo(e.target.value)}
              />
            </div>
          </div>

          {/* 4 Bottom Cards: 1. Outside, 2. Guests, 3. Others, 4. Total */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white border shadow-sm flex flex-col justify-between" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-xs font-extrabold text-slate-500">1. Outside</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black text-amber-600">{outsideVal}</span>
                <span className="text-[10px] font-bold text-slate-400">parcels</span>
              </div>
              <p className="text-[10px] text-slate-500 truncate mt-1">
                {selectedSupplierObj ? selectedSupplierObj.name : 'Selected Supplier'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white border shadow-sm flex flex-col justify-between" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-xs font-extrabold text-slate-500">2. Guests</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black text-purple-600">{guestVal}</span>
                <span className="text-[10px] font-bold text-slate-400">parcels</span>
              </div>
              <p className="text-[10px] text-slate-500 truncate mt-1">Visitors count</p>
            </div>

            <div className="p-4 rounded-2xl bg-white border shadow-sm flex flex-col justify-between" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-xs font-extrabold text-slate-500">3. Others</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black text-indigo-600">{otherVal}</span>
                <span className="text-[10px] font-bold text-slate-400">parcels</span>
              </div>
              <p className="text-[10px] text-slate-500 truncate mt-1">Extra staff count</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 text-white shadow-sm flex flex-col justify-between">
              <span className="text-xs font-extrabold text-emerald-400">4. Total Headcount</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-3xl font-black text-white">{totalVal}</span>
                <span className="text-[10px] font-bold text-slate-300">parcels</span>
              </div>
              <p className="text-[10px] text-slate-400 truncate mt-1">Outside + Guests + Others</p>
            </div>
          </div>

          {/* Submit Order Action Button */}
          <button
            type="button"
            disabled={submittingOrder}
            onClick={handleSubmitOrder}
            className="w-full py-4 rounded-2xl font-black text-white shadow-md text-sm transition-all flex items-center justify-center gap-2 hover:opacity-95"
            style={{ background: accent }}
          >
            {submittingOrder ? 'Submitting Order…' : `Submit ${moduleLabel} Food Request to Canteen & Track Status`}
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: STATUS (SHOWS ALL RUNNING DAY / TODAY'S ORDERS)                */}
      {/* ========================================================================= */}
      {activeTab === 'status' && (
        <div className="space-y-5">
          {/* Active Session Hero Card (Shows ALL Today's Orders) */}
          <div className="rounded-2xl p-5 text-white shadow-md relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)' }}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-700 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">☀️</span>
                  <h3 className="text-lg font-black text-white">Running Day Active Food Orders ({formatDate(todayKey())})</h3>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Showing all orders entered today for supplier batches, sessions, and tanks.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-500/20 text-blue-300 border border-blue-400/30">
                {todaySubmissions.length} Order{todaySubmissions.length !== 1 ? 's' : ''} Today
              </span>
            </div>

            {todaySubmissions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 space-y-2">
                <p>No food orders entered for today ({formatDate(todayKey())}) yet.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('data_entry')}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-extrabold text-xs shadow hover:bg-blue-700"
                >
                  + Add Food Order in Data Entry
                </button>
              </div>
            ) : (
              <div className="space-y-3 mt-4">
                {todaySubmissions.map((order) => {
                  const stageIdx = orderStages[order.id] ?? 0;
                  return (
                    <div key={order.id} className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-3">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">
                            {order.session_name === 'Morning' ? '☀️' : order.session_name === 'Afternoon' ? '🌤️' : '🌙'}
                          </span>
                          <div>
                            <span className="font-black text-sm text-white">
                              {order.session_name} Session Order
                            </span>
                            <span className="font-mono text-xs text-emerald-400 font-extrabold ml-2">
                              {order.id}
                            </span>
                            <span className="text-[11px] text-slate-400 ml-2">({order.created_time || formatTime()})</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-amber-400/10 text-amber-300 border border-amber-400/30">
                            🤝 {order.supplier_name}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            {order.status || 'Ordered'}
                          </span>
                        </div>
                      </div>

                      {/* Allocated Tanks */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-slate-400 text-[11px]">Allocated Tanks:</span>
                        {order.allocated_tanks?.map((tn) => (
                          <span key={tn} className="px-2 py-0.5 rounded text-[11px] font-black bg-blue-500/20 text-blue-300 border border-blue-400/30">
                            🏞️ {tn}
                          </span>
                        ))}
                        <span className="ml-auto font-black text-slate-200 text-xs">
                          Parcels: <strong className="text-emerald-400 text-sm">{order.counts?.total || 0}</strong>
                        </span>
                      </div>

                      {/* 4-Stage Controls per Order */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-700/60">
                        <div className={`p-2 rounded-lg text-center border ${stageIdx >= 0 ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-500'}`}>
                          <p className="text-[10px] font-extrabold">1. Ordered</p>
                          <p className="text-[9px] text-slate-400">Placed {order.created_time || 'today'}</p>
                        </div>

                        <div className={`p-2 rounded-lg text-center border ${stageIdx >= 1 ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-500'}`}>
                          <p className="text-[10px] font-extrabold">2. Canteen</p>
                          {stageIdx === 0 ? (
                            <button
                              type="button"
                              onClick={() => handleMarkCanteenReceived(order.id)}
                              className="mt-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] w-full"
                            >
                              Mark Received
                            </button>
                          ) : (
                            <p className="text-[9px] text-emerald-400 font-bold">✓ Processing</p>
                          )}
                        </div>

                        <div className={`p-2 rounded-lg text-center border ${stageIdx >= 2 ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-500'}`}>
                          <p className="text-[10px] font-extrabold">3. Dispatched</p>
                          {stageIdx === 1 ? (
                            <button
                              type="button"
                              onClick={() => setDispatchModalOrder(order)}
                              className="mt-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] w-full"
                            >
                              Mark Dispatched
                            </button>
                          ) : stageIdx > 1 ? (
                            <p className="text-[9px] text-emerald-400 font-bold">✓ Dispatched</p>
                          ) : (
                            <p className="text-[9px] text-slate-500">Pending</p>
                          )}
                        </div>

                        <div className={`p-2 rounded-lg text-center border ${stageIdx >= 3 ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-500'}`}>
                          <p className="text-[10px] font-extrabold">4. Reconciled</p>
                          {stageIdx === 2 ? (
                            <button
                              type="button"
                              onClick={() => handleSaveAndFinalizeSession(order)}
                              className="mt-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] w-full"
                            >
                              ✓ Finalize
                            </button>
                          ) : stageIdx >= 3 ? (
                            <p className="text-[9px] text-emerald-400 font-bold">✓ Complete</p>
                          ) : (
                            <p className="text-[9px] text-slate-500">Pending</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Order Reconciliation & Discrepancy Audit Table */}
          <div className="card p-5 bg-white rounded-2xl border shadow-sm space-y-4" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <h3 className="font-black text-sm text-slate-900">Order Reconciliation & Discrepancy Audit</h3>
                <p className="text-xs text-slate-500">Audit today's received parcels, adjust balances, or reorder/return parcels with Yes/No actions.</p>
              </div>
              <span className="text-xs font-bold text-slate-600">{todaySubmissions.length} Today's Entries</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-extrabold uppercase">
                    <th className="py-2.5 px-3">1. Supplier Name & Tanks</th>
                    <th className="py-2.5 px-3 text-center">2. Ordered Count</th>
                    <th className="py-2.5 px-3 text-center">3. Received Count</th>
                    <th className="py-2.5 px-3 text-center">4. Discrepancy (Balance)</th>
                    <th className="py-2.5 px-3 text-center">5. Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todaySubmissions.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-6 text-center text-slate-400 italic">
                        No orders entered today yet. Add orders in Data Entry to reconcile.
                      </td>
                    </tr>
                  ) : (
                    todaySubmissions.map((order) => {
                      const orderedCount = order.counts?.total || 0;
                      const recvVal = receivedMap[order.id] !== undefined ? receivedMap[order.id] : orderedCount;
                      const discrepancy = recvVal - orderedCount;
                      const resolution = orderResolutions[order.id];
                      const isLocked = Boolean(resolution);

                      return (
                        <tr key={order.id} className="hover:bg-slate-50/80 transition">
                          {/* Col 1: Supplier Name & Tanks */}
                          <td className="py-3 px-3">
                            <div className="font-extrabold text-slate-900 text-sm">{order.supplier_name}</div>
                            <div className="flex flex-wrap items-center gap-1 mt-1">
                              <span className="text-[10px] font-bold text-slate-500 mr-1">{order.session_name}:</span>
                              {order.allocated_tanks?.map((tn) => (
                                <span key={tn} className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-black text-[10px] border border-blue-200">
                                  {tn}
                                </span>
                              ))}
                            </div>
                          </td>

                          {/* Col 2: Ordered Count */}
                          <td className="py-3 px-3 text-center font-extrabold text-sm text-slate-900">
                            {orderedCount}
                          </td>

                          {/* Col 3: Received Count (Locked / Non-editable once Yes/No action taken) */}
                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex items-center justify-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                disabled={isLocked}
                                readOnly={isLocked}
                                className={`w-24 px-2.5 py-1 text-center border rounded-xl font-black text-sm transition-all ${
                                  isLocked
                                    ? 'bg-slate-100 text-slate-600 border-slate-300 cursor-not-allowed select-none shadow-none'
                                    : 'bg-white text-slate-900 border-slate-300 focus:ring-2 focus:ring-blue-500 shadow-xs'
                                }`}
                                value={recvVal}
                                onChange={(e) => {
                                  if (isLocked) return;
                                  const val = Math.max(0, Number(e.target.value) || 0);
                                  setReceivedMap((prev) => ({ ...prev, [order.id]: val }));
                                }}
                                title={isLocked ? 'Received count is locked after taking reconciliation action' : 'Enter received count'}
                              />
                              {isLocked && (
                                <span className="text-xs select-none" title="Locked after action (Yes/No)">🔒</span>
                              )}
                            </div>
                          </td>

                          {/* Col 4: Discrepancy (Balance) */}
                          <td className="py-3 px-3 text-center font-black text-sm">
                            <span className={discrepancy < 0 ? 'text-red-600 font-black' : discrepancy > 0 ? 'text-amber-600 font-black' : 'text-emerald-600 font-black'}>
                              {discrepancy > 0 ? `+${discrepancy}` : discrepancy}
                            </span>
                          </td>

                          {/* Col 5: Action (Yes / No handling for Negative and Positive balances) */}
                          <td className="py-3 px-3 text-center">
                            {/* CASE 1: Negative Balance (Shortage) */}
                            {discrepancy < 0 && (
                              <div>
                                {resolution === 'shortage_dismissed' ? (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center justify-center gap-1">
                                      ✓ Shortage Accepted
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = { ...orderResolutions };
                                        delete next[order.id];
                                        setOrderResolutions(next);
                                        persistLocal({ orderResolutions: next });
                                      }}
                                      className="text-[10px] text-slate-400 hover:text-blue-600 font-bold underline cursor-pointer"
                                      title="Reset action to edit received count"
                                    >
                                      Edit
                                    </button>
                                  </div>
                                ) : resolution === 'reordered' ? (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <span className="px-2.5 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-300 flex items-center justify-center gap-1">
                                      ✓ Reordered ({Math.abs(discrepancy)})
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = { ...orderResolutions };
                                        delete next[order.id];
                                        setOrderResolutions(next);
                                        persistLocal({ orderResolutions: next });
                                      }}
                                      className="text-[10px] text-slate-400 hover:text-blue-600 font-bold underline cursor-pointer"
                                      title="Reset action to edit received count"
                                    >
                                      Edit
                                    </button>
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-extrabold text-red-600">Reorder balance ({Math.abs(discrepancy)})?</p>
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleShortageReorderYes(order, Math.abs(discrepancy))}
                                        className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow"
                                      >
                                        Yes
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleShortageReorderNo(order)}
                                        className="px-3 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-extrabold text-xs"
                                      >
                                        No
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* CASE 2: Positive Balance (Surplus) */}
                            {discrepancy > 0 && (
                              <div>
                                {resolution === 'surplus_accepted' ? (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center justify-center gap-1">
                                      ✓ Extra Parcels Kept
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = { ...orderResolutions };
                                        delete next[order.id];
                                        setOrderResolutions(next);
                                        persistLocal({ orderResolutions: next });
                                      }}
                                      className="text-[10px] text-slate-400 hover:text-blue-600 font-bold underline cursor-pointer"
                                      title="Reset action to edit received count"
                                    >
                                      Edit
                                    </button>
                                  </div>
                                ) : resolution === 'returned' ? (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <span className="px-2.5 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-300 flex items-center justify-center gap-1">
                                      ✓ Returned Extra ({discrepancy})
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = { ...orderResolutions };
                                        delete next[order.id];
                                        setOrderResolutions(next);
                                        persistLocal({ orderResolutions: next });
                                      }}
                                      className="text-[10px] text-slate-400 hover:text-blue-600 font-bold underline cursor-pointer"
                                      title="Reset action to edit received count"
                                    >
                                      Edit
                                    </button>
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-extrabold text-amber-700">Return extra ({discrepancy})?</p>
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleSurplusReturnYes(order, discrepancy)}
                                        className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow"
                                      >
                                        Yes
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSurplusReturnNo(order, discrepancy)}
                                        className="px-3 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-extrabold text-xs"
                                      >
                                        No
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* CASE 3: Zero Balance */}
                            {discrepancy === 0 && (
                              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                                ✓ Balanced
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Card Below Table: Total Today Food Orders Summary Card */}
          <div className="p-5 rounded-2xl bg-slate-900 text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center md:text-left">
              <span className="text-xs font-extrabold uppercase text-emerald-400 tracking-wider">
                Total Today's Food Orders Summary ({formatDate(todayKey())})
              </span>
              <h4 className="text-xl font-black text-white">
                {todayTotals.count} Total Orders Placed Today
              </h4>
              <p className="text-xs text-slate-300 font-medium">
                Combined headcount across all active sessions, suppliers & tanks today.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-center">
              <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 min-w-[100px]">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase">Ordered Today</p>
                <p className="text-2xl font-black text-white">{todayTotals.orderedSum}</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 min-w-[100px]">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase">Received Today</p>
                <p className="text-2xl font-black text-blue-400">{todayTotals.receivedSum}</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 min-w-[100px]">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase">Net Balance</p>
                <p className={`text-2xl font-black ${todayTotals.netDiscrepancy < 0 ? 'text-red-400' : todayTotals.netDiscrepancy > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {todayTotals.netDiscrepancy > 0 ? `+${todayTotals.netDiscrepancy}` : todayTotals.netDiscrepancy}
                </p>
              </div>
            </div>
          </div>

          {/* Supervisor Signature (in digital format) */}
          {(() => {
            const hasSavedSignature = Boolean(supervisorSignature);
            const signedOrderIds = new Set(supervisorSignatureInfo?.signedOrderIds || []);
            const lastSignedTime = supervisorSignatureInfo?.timestamp
              ? new Date(supervisorSignatureInfo.timestamp).getTime()
              : 0;
            const lastSignedSession = supervisorSignatureInfo?.session || '';
            const lastSignedDate = supervisorSignatureInfo?.date || '';

            // Identify orders that belong to a new / next session (i.e. not verified by the previous signature)
            const unsignedTodayOrders = todaySubmissions.filter((order) => {
              if (!hasSavedSignature) return true;
              if (signedOrderIds.has(order.id)) return false;
              if (order.created_time && lastSignedTime) {
                const createdMs = new Date(order.created_time).getTime();
                if (!isNaN(createdMs) && createdMs <= lastSignedTime) return false;
              }
              if (order.entry_date === lastSignedDate && order.session_name === lastSignedSession && signedOrderIds.size > 0) {
                return false;
              }
              return true;
            });

            const hasOrdersForNewSession = unsignedTodayOrders.length > 0;
            const nextSessionName = unsignedTodayOrders[0]?.session_name || todaySubmissions[0]?.session_name || 'Current Session';

            // Calculate ordered and received totals for the new session orders
            let nextOrderedSum = 0;
            let nextReceivedSum = 0;
            let areAllNewOrdersReceived = hasOrdersForNewSession;

            unsignedTodayOrders.forEach((order) => {
              const ord = order.counts?.total || 0;
              const stage = orderStages[order.id] ?? 0;
              const isResolved = Boolean(orderResolutions[order.id]);
              const isReceivedAtSite = stage >= 2 || stage === 3 || order.status === 'Received & Reconciled' || isResolved;
              const rec = receivedMap[order.id] !== undefined ? receivedMap[order.id] : ord;

              nextOrderedSum += ord;
              nextReceivedSum += rec;

              if (!isReceivedAtSite && stage < 2) {
                areAllNewOrdersReceived = false;
              }
            });

            const canSignNewSession = hasOrdersForNewSession && areAllNewOrdersReceived;

            return (
              <div
                className="card p-5 bg-white rounded-2xl border shadow-sm space-y-4"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">✍️</span>
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900">
                        Supervisor Signature (in digital format)
                      </h4>
                      <p className="text-xs text-slate-500">
                        {hasSavedSignature
                          ? "Signature remains saved and active until next session food is ordered, received, and re-signed."
                          : "Supervisor confirms receipt of the total food parcels ordered."}
                      </p>
                    </div>
                  </div>

                  <div>
                    {canSignNewSession ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <span>✓</span>
                        <span>{nextSessionName} Food Received ({nextReceivedSum}/{nextOrderedSum}) — Ready to Sign</span>
                      </span>
                    ) : hasOrdersForNewSession ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300">
                        <span>⏳</span>
                        <span>{nextSessionName} Pending Delivery ({nextReceivedSum}/{nextOrderedSum} Parcels)</span>
                      </span>
                    ) : hasSavedSignature ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-300">
                        <span>✓</span>
                        <span>Active Saved Signature (Valid Until Next Session)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-700 border border-slate-300">
                        <span>🔒</span>
                        <span>Signature Locked (No Active Orders)</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 1. Active Saved Signature (Remains permanently saved & displayed until supervisor re-signs in next session or clicks Clear) */}
                {hasSavedSignature && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <span className="text-emerald-600">✓</span>
                        <span>Active Saved Supervisor Signature:</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                          Saved &amp; Available Until Next Session Re-signed
                        </span>
                        <button
                          type="button"
                          onClick={handleClearSavedSignature}
                          className="px-2.5 py-0.5 text-xs font-black text-red-600 hover:text-white hover:bg-red-600 bg-red-50 border border-red-200 hover:border-red-600 rounded-lg transition inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                          title="Clear saved supervisor signature immediately"
                        >
                          <span>🗑️</span>
                          <span>Clear</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="bg-white border rounded-xl p-3 inline-block shadow-sm">
                        <img
                          src={supervisorSignature}
                          alt="Supervisor Signature"
                          className="h-16 max-w-xs object-contain"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleClearSavedSignature}
                        className="px-3 py-1.5 text-xs font-extrabold text-red-600 hover:text-white hover:bg-red-600 bg-white hover:border-red-600 border border-red-200 rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="Remove this saved signature immediately"
                      >
                        <span>✕</span>
                        <span>Clear Signature</span>
                      </button>
                    </div>

                    {supervisorSignatureInfo && (
                      <p className="text-[11px] text-slate-500 font-medium">
                        Verified on <span className="font-bold text-slate-700">{supervisorSignatureInfo.formattedDate || supervisorSignatureInfo.date}</span> at <span className="font-bold text-slate-700">{supervisorSignatureInfo.time}</span> ({supervisorSignatureInfo.session}, {supervisorSignatureInfo.totalParcels} parcels verified).
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 italic">
                      This signature remains available across sessions until next session food is ordered, received, and re-signed, or until you click Clear.
                    </p>
                  </div>
                )}

                {/* 2. Next Session Signature Pad OR Status Guidance */}
                {canSignNewSession ? (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="text-xs text-slate-800 font-extrabold">
                        {hasSavedSignature
                          ? `Sign below to update signature for ${nextSessionName} Session (${nextReceivedSum} of ${nextOrderedSum} parcels received):`
                          : `All ${nextReceivedSum} of ${nextOrderedSum} parcels received for ${nextSessionName}. Sign below to digitally verify receipt:`}
                      </p>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Delivery Received at Farm Site
                      </span>
                    </div>

                    <div className="max-w-md">
                      <DigitalSignaturePad
                        label={hasSavedSignature ? `New Digital Signature for ${nextSessionName} (Replaces previous upon signing)` : "Supervisor Digital Signature"}
                        value=""
                        onChange={(sig) => {
                          if (!sig) return;
                          const info = {
                            date: todayKey(),
                            formattedDate: formatDate(todayKey()),
                            time: formatTime(),
                            timestamp: new Date().toISOString(),
                            totalParcels: nextReceivedSum || nextOrderedSum,
                            session: nextSessionName,
                            signedOrderIds: todaySubmissions.map((s) => s.id),
                          };
                          setSupervisorSignature(sig);
                          setSupervisorSignatureInfo(info);
                          persistLocal({
                            supervisorSignature: sig,
                            supervisorSignatureInfo: info,
                          });
                          toast.success(`Supervisor signature updated with verification for ${nextSessionName}!`);
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {hasSavedSignature
                        ? "Drawing your signature above will replace the previous saved signature. Until you sign here, the previous signature remains active and valid."
                        : "Sign above using mouse or touchscreen to save digital confirmation."}
                    </p>
                  </div>
                ) : hasOrdersForNewSession ? (
                  <div className="rounded-xl p-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
                    <span className="text-lg">⏳</span>
                    <div className="space-y-2 flex-1">
                      <div>
                        <p className="font-black text-amber-950">
                          {nextSessionName} Session Food Ordered — Awaiting Delivery &amp; Receipt at Site
                        </p>
                        <p className="text-amber-800 font-medium leading-relaxed mt-0.5">
                          Food has been ordered for <strong>{nextSessionName}</strong> ({nextOrderedSum} parcels). The supervisor will sign here only after receiving the total parcels ordered.
                          {hasSavedSignature ? ' The previous signature remains saved and available above until you sign again.' : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleConfirmAllNewOrdersReceived(unsignedTodayOrders)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow inline-flex items-center gap-1.5"
                        >
                          <span>🚚</span>
                          <span>Mark Food Received at Farm Site ({nextOrderedSum} Parcels)</span>
                        </button>
                        <span className="text-[11px] text-amber-700 italic">
                          (Unlocks signature pad once parcels are received)
                        </span>
                      </div>
                    </div>
                  </div>
                ) : hasSavedSignature ? (
                  <div className="rounded-xl p-3 bg-blue-50/80 border border-blue-200 text-blue-900 text-xs flex items-center gap-2.5">
                    <span className="text-base">ℹ️</span>
                    <p className="font-medium text-blue-800">
                      Previous session supervisor signature is saved and active above. It will remain available until the next session food is ordered in Data Entry, received at the farm site, and re-signed.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl p-3 bg-slate-50 border border-slate-200 text-slate-600 text-xs flex items-center gap-2.5">
                    <span className="text-base">🔒</span>
                    <p className="font-medium">
                      No food orders have been placed today. The supervisor will sign here once food is ordered and received.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: HISTORY                                                         */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <div className="space-y-5">
          {/* 1. KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white border shadow-sm space-y-1" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-[11px] font-extrabold text-slate-500">Total Records</p>
              <p className="text-2xl font-black text-slate-900">{historyKPIs.totalRecords}</p>
              <p className="text-[10px] text-slate-400">Submitted meal orders</p>
            </div>
            <div className="p-4 rounded-2xl bg-white border shadow-sm space-y-1" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-[11px] font-extrabold text-slate-500">Total Meals / Parcels Served</p>
              <p className="text-2xl font-black text-emerald-600">{historyKPIs.totalMeals}</p>
              <p className="text-[10px] text-slate-400">Combined headcount breakdown</p>
            </div>
            <div className="p-4 rounded-2xl bg-white border shadow-sm space-y-1" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-[11px] font-extrabold text-slate-500">Associated Running Tanks</p>
              <p className="text-2xl font-black text-blue-600">{historyKPIs.associatedTanksCount}</p>
              <p className="text-[10px] text-slate-400">Tanks covered by requests</p>
            </div>
            <div className="p-4 rounded-2xl bg-white border shadow-sm space-y-1" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-[11px] font-extrabold text-slate-500">Today's Parcels</p>
              <p className="text-2xl font-black text-amber-600">{historyKPIs.todayParcels}</p>
              <p className="text-[10px] text-slate-400">Current calendar day</p>
            </div>
          </div>

          {/* 2. Search & Filter Bar */}
          <div className="card p-4 bg-white rounded-2xl border shadow-sm space-y-3" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="font-extrabold text-xs text-slate-700">🔍 Filter Submissions</span>
              <button
                type="button"
                onClick={() => {
                  setDateFilter('');
                  setSessionFilter('All');
                  setSupplierFilter('All');
                  setTankFilter('All');
                }}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                Reset Filters Button
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Search by Date</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border rounded-xl text-xs font-semibold"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Filter by Session</label>
                <select
                  className="w-full px-3 py-2 border rounded-xl text-xs font-semibold bg-white"
                  value={sessionFilter}
                  onChange={(e) => setSessionFilter(e.target.value)}
                >
                  <option value="All">All Sessions</option>
                  <option value="Morning">☀️ Morning / Tiffins</option>
                  <option value="Afternoon">🌤️ Afternoon / Lunch</option>
                  <option value="Night">🌙 Night / Dinner</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Filter by Supplier / Mestri</label>
                <select
                  className="w-full px-3 py-2 border rounded-xl text-xs font-semibold bg-white"
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                >
                  <option value="All">All Suppliers</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Filter by Running Tank</label>
                <select
                  className="w-full px-3 py-2 border rounded-xl text-xs font-semibold bg-white"
                  value={tankFilter}
                  onChange={(e) => setTankFilter(e.target.value)}
                >
                  <option value="All">All Running Tanks</option>
                  {tanks.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 3. Chronological Daily Log & Expandable Ledger */}
          {groupedHistory.length === 0 ? (
            <Empty icon="🍱" title="No past food submissions found" hint="Submit a request from the Data Entry tab." />
          ) : (
            <div className="space-y-3">
              {groupedHistory.map(([dayStr, dayRows]) => {
                const dayTotalParcels = dayRows.reduce((sum, r) => sum + (r.counts?.total || 0), 0);
                const isExpanded = expandedDays.has(dayStr);

                return (
                  <div key={dayStr} className="card bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                    {/* Header per Day */}
                    <button
                      type="button"
                      onClick={() => toggleDayAccordion(dayStr)}
                      className="w-full p-4 text-left flex items-center justify-between hover:bg-slate-50 transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-base font-black text-slate-900">{formatDate(dayStr)}</span>
                        <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-800">
                          {dayTotalParcels} Total Parcels
                        </span>
                        <span className="text-xs text-slate-500 font-semibold">
                          {dayRows.length} session order{dayRows.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className="text-slate-400 font-bold text-sm">
                        {isExpanded ? '▲ Hide Details' : '▼ Expand Ledger'}
                      </span>
                    </button>

                    {/* Expanded Session Breakdown Table / Cards */}
                    {isExpanded && (
                      <div className="p-4 border-t border-slate-100 overflow-x-auto bg-slate-50/50">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500 font-extrabold uppercase">
                              <th className="py-2.5 px-2">Time & Session</th>
                              <th className="py-2.5 px-2">Order #</th>
                              <th className="py-2.5 px-2">Allocated Tanks</th>
                              <th className="py-2.5 px-2">Supplier / Mestri</th>
                              <th className="py-2.5 px-2 text-center">Regular (R)</th>
                              <th className="py-2.5 px-2 text-center">Outside (O)</th>
                              <th className="py-2.5 px-2 text-center">Guests (G)</th>
                              <th className="py-2.5 px-2 text-center">Others (X)</th>
                              <th className="py-2.5 px-2 text-center">Total Parcels</th>
                              <th className="py-2.5 px-2">Remarks</th>
                              <th className="py-2.5 px-2 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {dayRows.map((row) => (
                              <tr key={row.id} className="hover:bg-white transition font-medium">
                                <td className="py-3 px-2 whitespace-nowrap">
                                  <div className="font-extrabold text-slate-900">{row.created_time || '08:30 AM'}</div>
                                  <div className="text-[10px] text-slate-500 font-bold">
                                    {row.session_name === 'Morning' ? '☀️ Morning (Tiffins)' : row.session_name === 'Afternoon' ? '🌤️ Afternoon (Lunch)' : '🌙 Night (Dinner)'}
                                  </div>
                                </td>

                                <td className="py-3 px-2 font-mono text-[11px] font-extrabold text-blue-600 whitespace-nowrap">
                                  {row.id}
                                </td>

                                <td className="py-3 px-2">
                                  <div className="flex flex-wrap gap-1">
                                    {row.allocated_tanks?.map((tn) => (
                                      <span key={tn} className="px-2 py-0.5 rounded bg-slate-200 text-[10px] font-black text-slate-700">
                                        {tn}
                                      </span>
                                    )) || <span className="text-slate-400">—</span>}
                                  </div>
                                </td>

                                <td className="py-3 px-2 font-bold text-slate-800 whitespace-nowrap">
                                  {row.supplier_name || '—'}
                                </td>

                                <td className="py-3 px-2 text-center font-bold text-slate-600">{row.counts?.regular || 0}</td>
                                <td className="py-3 px-2 text-center font-extrabold text-amber-700">{row.counts?.outside || 0}</td>
                                <td className="py-3 px-2 text-center font-extrabold text-purple-700">{row.counts?.guests || 0}</td>
                                <td className="py-3 px-2 text-center font-extrabold text-indigo-700">{row.counts?.others || 0}</td>

                                <td className="py-3 px-2 text-center font-black text-sm text-slate-900 whitespace-nowrap">
                                  {row.counts?.total || 0}
                                </td>

                                <td className="py-3 px-2 text-slate-600 max-w-[150px] truncate" title={row.extra_info}>
                                  {row.extra_info || '—'}
                                </td>

                                <td className="py-3 px-2 text-right whitespace-nowrap">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedOrderDetails(row)}
                                      className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[11px]"
                                    >
                                      View Details
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDuplicateForToday(row)}
                                      className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-extrabold text-[11px]"
                                    >
                                      Duplicate for Today
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPrintSlipOrder(row)}
                                      className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-extrabold text-[11px]"
                                    >
                                      Print Slip
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: DISPATCH DETAILS MODAL                                            */}
      {/* ========================================================================= */}
      {dispatchModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-black text-base text-slate-900">Mark Order {dispatchModalOrder.id} Dispatched</h3>
            <p className="text-xs text-slate-500">Record delivery vehicle and driver info for dispatch.</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">Delivery Vehicle No.</label>
                <input
                  type="text"
                  placeholder="e.g. AP 39 AB 1234"
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-xs font-semibold"
                  value={dispatchInfo.vehicleNo}
                  onChange={(e) => setDispatchInfo({ ...dispatchInfo, vehicleNo: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700">Delivery Person Phone / Name</label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh (+91 90000 12345)"
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-xs font-semibold"
                  value={dispatchInfo.deliveryPerson}
                  onChange={(e) => setDispatchInfo({ ...dispatchInfo, deliveryPerson: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDispatchModalOrder(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDispatch(dispatchModalOrder.id)}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-extrabold text-xs shadow hover:bg-blue-700"
              >
                Confirm Dispatch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: READ-ONLY DETAILS MODAL                                           */}
      {/* ========================================================================= */}
      {selectedOrderDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-blue-600">Order Details</span>
                <h3 className="font-mono text-base font-black text-slate-900">{selectedOrderDetails.id}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderDetails(null)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p>📅 <strong>Date:</strong> {formatDate(selectedOrderDetails.entry_date)}</p>
                <p>🕒 <strong>Time:</strong> {selectedOrderDetails.created_time || '08:30 AM'}</p>
                <p>🍽️ <strong>Session:</strong> {selectedOrderDetails.session_name}</p>
                <p>🤝 <strong>Supplier:</strong> {selectedOrderDetails.supplier_name}</p>
              </div>

              <div>
                <strong className="block text-slate-700 mb-1">Allocated Tanks:</strong>
                <div className="flex flex-wrap gap-1">
                  {selectedOrderDetails.allocated_tanks?.map((tn) => (
                    <span key={tn} className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-bold border border-blue-200">
                      {tn}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <strong className="block text-slate-700 mb-1">Category Headcount Breakdown:</strong>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-[10px] text-amber-700 font-bold">Outside</p>
                    <p className="font-black text-sm text-amber-900">{selectedOrderDetails.counts?.outside || 0}</p>
                  </div>
                  <div className="p-2 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-[10px] text-purple-700 font-bold">Guests</p>
                    <p className="font-black text-sm text-purple-900">{selectedOrderDetails.counts?.guests || 0}</p>
                  </div>
                  <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-200">
                    <p className="text-[10px] text-indigo-700 font-bold">Others</p>
                    <p className="font-black text-sm text-indigo-900">{selectedOrderDetails.counts?.others || 0}</p>
                  </div>
                </div>
                <div className="mt-2 p-2.5 bg-slate-900 text-white rounded-lg text-center flex justify-between items-center">
                  <span className="font-extrabold">Total Parcels Served</span>
                  <span className="text-base font-black text-emerald-400">{selectedOrderDetails.counts?.total || 0}</span>
                </div>
              </div>

              {selectedOrderDetails.extra_info && (
                <div>
                  <strong className="block text-slate-700 mb-1">Remarks / Special Info:</strong>
                  <p className="p-2.5 bg-slate-50 rounded-lg border text-slate-700 italic">
                    "{selectedOrderDetails.extra_info}"
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedOrderDetails(null)}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-extrabold text-xs"
            >
              Close Details
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: PRINT SLIP RECEIPT MODAL                                          */}
      {/* ========================================================================= */}
      {printSlipOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div id="food-print-slip" className="border p-4 rounded-xl space-y-3 bg-white text-slate-900">
              <div className="text-center border-b pb-3">
                <h2 className="text-lg font-black uppercase tracking-wide">Canteen Food Slip</h2>
                <p className="text-[10px] font-bold text-slate-500">
                  {site?.name} · {moduleLabel} Food Order
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-slate-500 font-bold text-[10px]">Order Identifier</p>
                  <p className="font-mono font-extrabold">{printSlipOrder.id}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-bold text-[10px]">Date & Session</p>
                  <p className="font-extrabold">{formatDate(printSlipOrder.entry_date)} ({printSlipOrder.session_name})</p>
                </div>
                <div>
                  <p className="text-slate-500 font-bold text-[10px]">Supplier / Mestri</p>
                  <p className="font-extrabold">{printSlipOrder.supplier_name}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-bold text-[10px]">Allocated Tanks</p>
                  <p className="font-extrabold">{printSlipOrder.allocated_tanks?.join(', ') || '—'}</p>
                </div>
              </div>

              <div className="border-t pt-2 space-y-1 text-xs">
                <div className="flex justify-between py-1 border-b">
                  <span>Outside Workers:</span>
                  <span className="font-bold">{printSlipOrder.counts?.outside || 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span>Guests:</span>
                  <span className="font-bold">{printSlipOrder.counts?.guests || 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span>Others:</span>
                  <span className="font-bold">{printSlipOrder.counts?.others || 0}</span>
                </div>
                <div className="flex justify-between py-2 font-black text-sm text-slate-900">
                  <span>TOTAL PARCELS:</span>
                  <span className="text-emerald-700">{printSlipOrder.counts?.total || 0}</span>
                </div>
              </div>

              {printSlipOrder.extra_info && (
                <div className="text-[11px] text-slate-600 border-t pt-2 italic">
                  Note: {printSlipOrder.extra_info}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPrintSlipOrder(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-extrabold text-xs shadow hover:bg-emerald-700"
              >
                🖨️ Print Slip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
