import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, TABLES } from '../../lib/supabaseClient';
import { useSite } from '../../hooks/useSite';
import { useToast } from '../../hooks/useToast';
import { nextTrailNettingBillNumber } from '../../lib/bills';
import { Spinner, Empty } from '../../components/ui/State';

const INITIAL_BATCH_ROWS = [
  { batch: 'Workers', number: '', amount: '' },
  { batch: 'Bike', number: '', amount: '' },
  { batch: 'Beta', number: '', amount: '' },
  { batch: 'Others', number: '', amount: '' },
];

export default function TrailNettingPaymentsPage() {
  const navigate = useNavigate();
  const { siteId, currentSite } = useSite();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('payments'); // 'payments' | 'history'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Suppliers state
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [showEditSupplierModal, setShowEditSupplierModal] = useState(false);

  // New/Edit supplier form state
  const [supplierForm, setSupplierForm] = useState({
    id: '',
    name: '',
    phone: '',
    village_name: '',
    phonepe_number: '',
    account_holder_name: '',
    bank_account_number: '',
    ifsc_code: '',
  });

  // Tanks state
  const [completedTanks, setCompletedTanks] = useState([]);
  const [selectedTankIds, setSelectedTankIds] = useState([]);

  // Bill & Payment breakdown state
  const [existingBills, setExistingBills] = useState([]);
  const [billNumber, setBillNumber] = useState('');
  const [batchRows, setBatchRows] = useState(INITIAL_BATCH_ROWS);
  const [supervisorName, setSupervisorName] = useState('');
  const [remarks, setRemarks] = useState('');

  // History tab state
  const [historyBills, setHistoryBills] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedBillForView, setSelectedBillForView] = useState(null);

  const fetchPaymentsData = async () => {
    if (!siteId) return;
    setLoading(true);

    // 1. Fetch suppliers
    const { data: sups } = await supabase
      .from(TABLES.suppliers)
      .select('*')
      .eq('site_id', siteId)
      .order('name');
    setSuppliers(sups ?? []);
    if (sups && sups.length > 0 && !selectedSupplierId) {
      setSelectedSupplierId(sups[0].id);
    }

    // 2. Fetch tanks where trail netting is completed
    const { data: tks } = await supabase
      .from(TABLES.tanks)
      .select('*, sections(name)')
      .eq('site_id', siteId);

    const { data: records } = await supabase
      .from(TABLES.trailNettingRecords)
      .select('tank_id')
      .eq('site_id', siteId);

    const completedTankIds = new Set((records ?? []).map((r) => r.tank_id));
    const eligible = (tks ?? []).filter((t) => completedTankIds.has(t.id));
    setCompletedTanks(eligible);

    // 3. Fetch existing bills to calculate auto-increment Bill Number & for History tab
    const { data: bList } = await supabase
      .from(TABLES.trailNettingPayments)
      .select('*')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false });

    setExistingBills(bList ?? []);
    setHistoryBills(bList ?? []);

    const nextBillNo = nextTrailNettingBillNumber(currentSite?.name || 'AKIVIDU', bList ?? []);
    setBillNumber(nextBillNo);

    setLoading(false);
  };

  useEffect(() => {
    fetchPaymentsData();
  }, [siteId, currentSite]);

  // Recalculate bill number when existingBills or site changes
  useEffect(() => {
    if (currentSite?.name) {
      const nextBillNo = nextTrailNettingBillNumber(currentSite.name, existingBills);
      setBillNumber(nextBillNo);
    }
  }, [existingBills, currentSite]);

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);

  // Supplier Form Handlers
  const handleOpenAddSupplier = () => {
    setSupplierForm({
      id: '',
      name: '',
      phone: '',
      village_name: '',
      phonepe_number: '',
      account_holder_name: '',
      bank_account_number: '',
      ifsc_code: '',
    });
    setShowAddSupplierModal(true);
  };

  const handleOpenEditSupplier = () => {
    if (!selectedSupplier) return;
    setSupplierForm({
      id: selectedSupplier.id,
      name: selectedSupplier.name || '',
      phone: selectedSupplier.phone || '',
      village_name: selectedSupplier.village_name || selectedSupplier.address || '',
      phonepe_number: selectedSupplier.phonepe_number || '',
      account_holder_name: selectedSupplier.account_holder_name || '',
      bank_account_number: selectedSupplier.bank_account_number || '',
      ifsc_code: selectedSupplier.ifsc_code || '',
    });
    setShowEditSupplierModal(true);
  };

  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    if (!supplierForm.name.trim()) {
      return toast.warning('Supplier Name is required');
    }

    const payload = {
      site_id: siteId,
      name: supplierForm.name.trim(),
      phone: supplierForm.phone.trim(),
      village_name: supplierForm.village_name.trim(),
      phonepe_number: supplierForm.phonepe_number.trim(),
      account_holder_name: supplierForm.account_holder_name.trim(),
      bank_account_number: supplierForm.bank_account_number.trim(),
      ifsc_code: supplierForm.ifsc_code.trim().toUpperCase(),
      updated_at: new Date().toISOString(),
    };

    if (supplierForm.id) {
      // Edit supplier
      await supabase.from(TABLES.suppliers).update(payload).eq('id', supplierForm.id);
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supplierForm.id ? { ...s, ...payload } : s))
      );
      toast.success('Supplier details updated successfully');
      setShowEditSupplierModal(false);
    } else {
      // Add new supplier
      const { data: newSup } = await supabase
        .from(TABLES.suppliers)
        .insert(payload)
        .select()
        .single();
      const saved = newSup || { id: `${Date.now()}`, ...payload };
      setSuppliers((prev) => [...prev, saved]);
      setSelectedSupplierId(saved.id);
      toast.success('New supplier added successfully');
      setShowAddSupplierModal(false);
    }
  };

  // Tank Selection toggle
  const toggleTankSelection = (tankId) => {
    setSelectedTankIds((prev) =>
      prev.includes(tankId) ? prev.filter((id) => id !== tankId) : [...prev, tankId]
    );
  };

  // Batch Table change handler
  const handleBatchRowChange = (index, field, value) => {
    setBatchRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  // Calculated totals for table rows
  const computedBatchRows = batchRows.map((r) => {
    const num = parseFloat(r.number) || 0;
    const amt = parseFloat(r.amount) || 0;
    return {
      ...r,
      totalAmount: Math.round(num * amt * 100) / 100,
    };
  });

  const grandTotal = computedBatchRows.reduce((sum, r) => sum + r.totalAmount, 0);

  // Submit Handler
  const handleSubmitPayment = async (e) => {
    e.preventDefault();

    if (!selectedSupplierId) {
      return toast.warning('Please select a supplier');
    }
    if (selectedTankIds.length === 0) {
      return toast.warning('Please select at least one completed tank');
    }
    if (grandTotal <= 0) {
      return toast.warning('Please enter valid quantities and rates in the Batch table');
    }
    if (!supervisorName.trim()) {
      return toast.warning('Please enter Supervisor Name');
    }

    setSaving(true);

    const selectedTanksList = completedTanks.filter((t) => selectedTankIds.includes(t.id));

    const paymentData = {
      site_id: siteId,
      bill_number: billNumber,
      supplier_id: selectedSupplierId,
      supplier_details: selectedSupplier,
      selected_tanks: selectedTanksList.map((t) => ({
        id: t.id,
        name: t.name,
        section_name: t.sections?.name || 'Section',
      })),
      batch_breakdown: computedBatchRows,
      grand_total: grandTotal,
      supervisor_name: supervisorName.trim(),
      remarks: remarks.trim(),
      status: 'sent_to_finance',
      forwarded_to_finance: true,
      created_at: new Date().toISOString(),
    };

    // 1. Save to Trail Netting Payments table
    const { error: payErr } = await supabase
      .from(TABLES.trailNettingPayments)
      .insert(paymentData);

    if (payErr) {
      setSaving(false);
      return toast.error(payErr.message || 'Failed to save payment record');
    }

    // 2. Also register in shared Bills table for audit trail
    await supabase.from(TABLES.bills).insert({
      site_id: siteId,
      bill_number: billNumber,
      type: 'trail_netting',
      total_amount: grandTotal,
      status: 'sent_to_finance',
      created_at: new Date().toISOString(),
    });

    setSaving(false);
    toast.success(`Trail Netting Bill #${billNumber} saved and forwarded to Finance!`);

    // Reset payment form & refresh data
    setSelectedTankIds([]);
    setBatchRows(INITIAL_BATCH_ROWS);
    setSupervisorName('');
    setRemarks('');
    fetchPaymentsData();

    // Switch tab to History to see the newly submitted bill
    setActiveTab('history');
  };

  if (loading) return <Spinner />;
  if (!siteId) return <Empty icon="MAP" title="Select a site first" />;

  const selectedTanksObjList = completedTanks.filter((t) => selectedTankIds.includes(t.id));

  // Filter history bills based on search
  const filteredHistoryBills = historyBills.filter((b) => {
    if (!historySearch.trim()) return true;
    const q = historySearch.toLowerCase().trim();
    const bNo = String(b.bill_number || '').toLowerCase();
    const sName = String(b.supplier_details?.name || '').toLowerCase();
    const supName = String(b.supervisor_name || '').toLowerCase();
    return bNo.includes(q) || sName.includes(q) || supName.includes(q);
  });

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Navigation Breadcrumb */}
      <button
        onClick={() => navigate('/app/trail-netting')}
        className="text-sm font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
      >
        ← Back to Tank List
      </button>

      {/* Page Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">
            Payments Module
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">Trail Netting Payments</h1>
          <p className="text-xs text-slate-500">
            Generate Trail Netting bills for suppliers and review historical payment submissions.
          </p>
        </div>

        {/* Sub-Tabs Navigation (Payments / History) */}
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
              activeTab === 'payments'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <span>💵</span> Payments
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 relative ${
              activeTab === 'history'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <span>🕓</span> History
            {historyBills.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  activeTab === 'history' ? 'bg-emerald-800 text-white' : 'bg-slate-300 text-slate-700'
                }`}
              >
                {historyBills.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* TAB 1: PAYMENTS */}
      {activeTab === 'payments' && (
        <div className="space-y-6">
          {/* SECTION 1: Supplier Selection & Add/Edit */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <span>👤</span> Supplier Selection
                </h3>
                <p className="text-xs text-slate-500">Select an existing supplier or add a new supplier</p>
              </div>
              <button
                type="button"
                onClick={handleOpenAddSupplier}
                className="btn-primary text-xs font-bold px-3 py-2 flex items-center gap-1.5 self-start sm:self-auto"
              >
                + Add New Supplier
              </button>
            </div>

            {/* Dropdown */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Select Supplier:</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="field text-sm w-full py-2.5 px-3 bg-white"
              >
                <option value="">-- Choose Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.phone ? `(${s.phone})` : ''} {s.village_name ? `- ${s.village_name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Display Selected Supplier Details */}
            {selectedSupplier ? (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <span>🏭</span> {selectedSupplier.name}
                  </h4>
                  <button
                    type="button"
                    onClick={handleOpenEditSupplier}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-3 py-1 rounded-md border border-emerald-200"
                  >
                    ✏️ Edit Details
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                  <div>
                    <p className="text-[11px] text-slate-400 font-bold uppercase">Phone Number</p>
                    <p className="font-extrabold text-slate-800">{selectedSupplier.phone || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 font-bold uppercase">Village Name</p>
                    <p className="font-extrabold text-slate-800">
                      {selectedSupplier.village_name || selectedSupplier.address || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 font-bold uppercase">PhonePe Number</p>
                    <p className="font-extrabold text-emerald-700 font-mono">
                      {selectedSupplier.phonepe_number || selectedSupplier.phone || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 font-bold uppercase">Bank Account</p>
                    <p className="font-extrabold text-slate-800 font-mono">
                      {selectedSupplier.bank_account_number || '—'}
                    </p>
                    {selectedSupplier.account_holder_name && (
                      <p className="text-[10px] text-slate-500">Holder: {selectedSupplier.account_holder_name}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 font-bold uppercase">IFSC Code</p>
                    <p className="font-extrabold text-slate-900 font-mono">
                      {selectedSupplier.ifsc_code || '—'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800">
                Please select a supplier from the dropdown above or click &quot;Add New Supplier&quot;.
              </div>
            )}
          </div>

          {/* SECTION 2: Tank Selection (Completed Trail Netting Tanks Only) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <span>🌊</span> Tank Selection (Trail Netting Completed)
              </h3>
              <p className="text-xs text-slate-500">
                Only tanks where Trail Netting sampling has been completed are eligible for selection.
              </p>
            </div>

            {completedTanks.length > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {completedTanks.map((t) => {
                    const isSelected = selectedTankIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTankSelection(t.id)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-extrabold opacity-80">
                            {t.sections?.name ? `Section ${t.sections.name}` : 'Tank'}
                          </span>
                          <span className="text-xs font-black">{isSelected ? '✓' : '+'}</span>
                        </div>
                        <p className="text-base font-black mt-1">Tank {t.name}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Display Selected Tanks Row */}
                {selectedTanksObjList.length > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1.5">
                    <p className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                      Selected Tanks ({selectedTanksObjList.length}):
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedTanksObjList.map((t) => (
                        <span
                          key={t.id}
                          className="bg-emerald-800 text-white text-xs font-black px-3 py-1 rounded-lg flex items-center gap-1 shadow-sm"
                        >
                          <span>Tank {t.name}</span>
                          <button
                            type="button"
                            onClick={() => toggleTankSelection(t.id)}
                            className="text-emerald-200 hover:text-white ml-1 text-xs"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs font-semibold text-slate-600">
                No tanks found with completed Trail Netting records. Complete sampling on tanks first.
              </div>
            )}
          </div>

          {/* SECTION 3: Trail Netting Batch Table */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <span>🧾</span> Trail Netting Batch Breakdown
                </h3>
                <p className="text-xs text-slate-500">Auto-calculated itemized bill for workers, bike, beta, and others</p>
              </div>
              <span className="text-xs font-bold font-mono text-slate-600 bg-slate-100 px-3 py-1 rounded-md">
                Bill #: {billNumber}
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    <th className="p-3">Trail Netting Batch</th>
                    <th className="p-3 w-36">Number (Qty)</th>
                    <th className="p-3 w-36">Amount (Rate)</th>
                    <th className="p-3 text-right w-44">Total Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {computedBatchRows.map((r, index) => (
                    <tr key={r.batch} className="hover:bg-slate-50">
                      <td className="p-3 font-extrabold text-slate-900">{r.batch}</td>
                      <td className="p-3">
                        <input
                          type="number"
                          step="1"
                          placeholder="0"
                          value={r.number}
                          onChange={(e) => handleBatchRowChange(index, 'number', e.target.value)}
                          className="field py-1.5 px-3 w-full text-sm font-mono"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="₹ 0.00"
                          value={r.amount}
                          onChange={(e) => handleBatchRowChange(index, 'amount', e.target.value)}
                          className="field py-1.5 px-3 w-full text-sm font-mono"
                        />
                      </td>
                      <td className="p-3 text-right font-mono font-extrabold text-slate-900 text-base">
                        ₹ {r.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {/* Grand Total Row */}
                  <tr className="bg-slate-900 text-white font-extrabold text-base">
                    <td colSpan={3} className="p-3 text-right uppercase tracking-wider text-xs font-extrabold text-slate-300">
                      Grand Total
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-400 text-lg">
                      ₹ {grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 4: Additional Fields (Supervisor Name & Remarks) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
              <span>✍️</span> Additional Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Supervisor Name <span className="text-rose-600">*</span>:
                </label>
                <input
                  type="text"
                  placeholder="Enter Supervisor / Manager Name"
                  value={supervisorName}
                  onChange={(e) => setSupervisorName(e.target.value)}
                  className="field text-sm w-full py-2.5 px-3"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Remarks:</label>
                <textarea
                  rows={3}
                  placeholder="Enter payment observations, instructions, or notes for Finance Application..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="field text-sm w-full p-3 rounded-xl border border-slate-200 resize-y"
                />
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleSubmitPayment}
              disabled={saving}
              className="btn-primary w-full py-4 text-base font-extrabold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition bg-emerald-600 hover:bg-emerald-700 border-none text-white"
            >
              {saving ? 'Submitting to Backend & Forwarding to Finance…' : '🚀 Submit Payment & Forward to Finance'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* History Search & Stats Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-md">
              <span className="text-slate-400 text-lg">🔍</span>
              <input
                type="text"
                placeholder="Search submitted bills by Bill Number (e.g. VZTN001), Supplier, or Supervisor..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="field text-sm w-full py-2 px-3"
              />
              {historySearch && (
                <button
                  onClick={() => setHistorySearch('')}
                  className="text-xs text-slate-400 hover:text-slate-600 font-bold px-2 py-1"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Showing <strong>{filteredHistoryBills.length}</strong> submitted bill(s)
            </div>
          </div>

          {/* History Bills List / Cards */}
          {filteredHistoryBills.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {filteredHistoryBills.map((b) => (
                <div
                  key={b.id || b.bill_number}
                  className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-900 text-emerald-400 font-mono text-sm font-black px-3 py-1 rounded-lg">
                        {b.bill_number}
                      </span>
                      <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                        {b.status === 'sent_to_finance' ? 'Forwarded to Finance' : b.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span>
                        <strong>Supplier:</strong> {b.supplier_details?.name || '—'}
                      </span>
                      <span>
                        <strong>Supervisor:</strong> {b.supervisor_name || '—'}
                      </span>
                      <span>
                        <strong>Date:</strong> {b.created_at ? new Date(b.created_at).toLocaleDateString('en-IN') : '—'}
                      </span>
                    </div>

                    {b.selected_tanks && b.selected_tanks.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] font-bold text-slate-400">Tanks:</span>
                        {b.selected_tanks.map((t) => (
                          <span
                            key={t.id}
                            className="bg-slate-100 text-slate-700 text-[10px] font-extrabold px-2 py-0.5 rounded-md"
                          >
                            Tank {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0">
                    <div className="text-left sm:text-right">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Grand Total</p>
                      <p className="text-xl font-black text-slate-900 font-mono">
                        ₹ {(b.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedBillForView(b)}
                      className="btn-secondary text-xs font-extrabold px-4 py-2.5 flex items-center gap-1 border-slate-300 hover:bg-slate-100"
                    >
                      👁️ View Bill
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon="🧾"
              title={historySearch ? 'No matching bills found' : 'No submitted bills in History'}
              hint={historySearch ? 'Try a different search term.' : 'Submit a Trail Netting payment bill to view it in History.'}
            />
          )}
        </div>
      )}

      {/* Modal: Add or Edit Supplier */}
      {(showAddSupplierModal || showEditSupplierModal) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-900">
                {showEditSupplierModal ? 'Edit Supplier Information' : 'Add New Supplier'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddSupplierModal(false);
                  setShowEditSupplierModal(false);
                }}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Supplier Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Labour Supplier"
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  className="field text-sm w-full py-2 px-3"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+91 98480 12345"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    className="field text-sm w-full py-2 px-3"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Village Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Akividu Village"
                    value={supplierForm.village_name}
                    onChange={(e) => setSupplierForm({ ...supplierForm, village_name: e.target.value })}
                    className="field text-sm w-full py-2 px-3"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">PhonePe Number / UPI ID</label>
                <input
                  type="text"
                  placeholder="e.g. 9848012345 or ramesh@upi"
                  value={supplierForm.phonepe_number}
                  onChange={(e) => setSupplierForm({ ...supplierForm, phonepe_number: e.target.value })}
                  className="field text-sm w-full py-2 px-3 font-mono"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <p className="font-extrabold text-slate-900 uppercase text-[11px] tracking-wider">
                  Bank Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Account Holder Name</label>
                    <input
                      type="text"
                      placeholder="Account Holder Name"
                      value={supplierForm.account_holder_name}
                      onChange={(e) => setSupplierForm({ ...supplierForm, account_holder_name: e.target.value })}
                      className="field text-sm w-full py-2 px-3"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Bank Account Number</label>
                    <input
                      type="text"
                      placeholder="Bank Account Number"
                      value={supplierForm.bank_account_number}
                      onChange={(e) => setSupplierForm({ ...supplierForm, bank_account_number: e.target.value })}
                      className="field text-sm w-full py-2 px-3 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">IFSC Code</label>
                    <input
                      type="text"
                      placeholder="e.g. HDFC0001234"
                      value={supplierForm.ifsc_code}
                      onChange={(e) => setSupplierForm({ ...supplierForm, ifsc_code: e.target.value })}
                      className="field text-sm w-full py-2 px-3 font-mono uppercase"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSupplierModal(false);
                    setShowEditSupplierModal(false);
                  }}
                  className="btn-secondary text-xs font-bold px-4 py-2"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary text-xs font-bold px-4 py-2">
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Read-Only Detailed Bill View */}
      {selectedBillForView && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl border border-slate-200 my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <span className="bg-slate-900 text-emerald-400 font-mono text-base font-black px-3.5 py-1.5 rounded-xl">
                  {selectedBillForView.bill_number}
                </span>
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-md">
                  Forwarded to Finance
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBillForView(null)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Read-Only Bill Content */}
            <div className="space-y-4 text-xs">
              {/* Submission Metadata */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 font-sans">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Supervisor Name</p>
                  <p className="font-extrabold text-slate-900 text-sm">
                    {selectedBillForView.supervisor_name || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Submission Date</p>
                  <p className="font-extrabold text-slate-900 text-sm">
                    {selectedBillForView.created_at
                      ? new Date(selectedBillForView.created_at).toLocaleString('en-IN')
                      : '—'}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Status</p>
                  <p className="font-extrabold text-emerald-700 text-sm uppercase">
                    {selectedBillForView.status || 'Sent to Finance'}
                  </p>
                </div>
              </div>

              {/* Supplier Information Card */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                <h4 className="font-black text-slate-900 text-sm border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <span>👤</span> Supplier Information
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-1">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Supplier Name</p>
                    <p className="font-extrabold text-slate-800">
                      {selectedBillForView.supplier_details?.name || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Phone Number</p>
                    <p className="font-extrabold text-slate-800">
                      {selectedBillForView.supplier_details?.phone || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Village Name</p>
                    <p className="font-extrabold text-slate-800">
                      {selectedBillForView.supplier_details?.village_name || selectedBillForView.supplier_details?.address || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">PhonePe Number</p>
                    <p className="font-extrabold text-emerald-700 font-mono">
                      {selectedBillForView.supplier_details?.phonepe_number || selectedBillForView.supplier_details?.phone || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Bank Account Number</p>
                    <p className="font-extrabold text-slate-800 font-mono">
                      {selectedBillForView.supplier_details?.bank_account_number || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">IFSC Code</p>
                    <p className="font-extrabold text-slate-900 font-mono">
                      {selectedBillForView.supplier_details?.ifsc_code || '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Selected Tanks List */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                <h4 className="font-black text-slate-900 text-sm border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <span>🌊</span> Selected Trail Netting Tanks
                </h4>
                {selectedBillForView.selected_tanks && selectedBillForView.selected_tanks.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {selectedBillForView.selected_tanks.map((t) => (
                      <span
                        key={t.id}
                        className="bg-emerald-100 text-emerald-900 text-xs font-black px-3 py-1 rounded-lg border border-emerald-300"
                      >
                        Tank {t.name} ({t.section_name || 'Section'})
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 font-medium">No tanks recorded.</p>
                )}
              </div>

              {/* Trail Netting Batch Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden space-y-1">
                <div className="bg-slate-100 p-3 border-b border-slate-200">
                  <h4 className="font-black text-slate-900 text-sm">
                    Trail Netting Batch Breakdown
                  </h4>
                </div>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-extrabold text-slate-700">
                      <th className="p-2.5">Trail Netting Batch</th>
                      <th className="p-2.5 text-center">Number (Qty)</th>
                      <th className="p-2.5 text-right">Amount (Rate)</th>
                      <th className="p-2.5 text-right">Total Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(selectedBillForView.batch_breakdown || []).map((r) => (
                      <tr key={r.batch}>
                        <td className="p-2.5 font-bold text-slate-900">{r.batch}</td>
                        <td className="p-2.5 text-center font-mono">{r.number || 0}</td>
                        <td className="p-2.5 text-right font-mono">
                          ₹ {Number(r.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                          ₹ {Number(r.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-900 text-white font-extrabold text-sm">
                      <td colSpan={3} className="p-2.5 text-right uppercase tracking-wider text-xs text-slate-300">
                        Grand Total
                      </td>
                      <td className="p-2.5 text-right font-mono text-emerald-400 text-base">
                        ₹ {(selectedBillForView.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Remarks */}
              {selectedBillForView.remarks && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Remarks</p>
                  <p className="text-xs text-slate-700">{selectedBillForView.remarks}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedBillForView(null)}
                className="btn-primary text-xs font-bold px-5 py-2.5"
              >
                Close Bill View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
