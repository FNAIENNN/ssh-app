import { useState, useMemo, useEffect } from 'react';
import SignaturePad from './SignaturePad';
import { useToast } from '../../../../hooks/useToast';
import RequestPayment from '../../../../components/payments/RequestPayment';
import { supabase, TABLES } from '../../../../lib/supabaseClient';

const WORKER_ROWS = [
  { sNo: 1, category: 'Workers' },
  { sNo: 2, category: 'Bike' },
  { sNo: 3, category: 'Auto' },
  { sNo: 4, category: 'Beta' },
  { sNo: 5, category: 'Others' },
];

export default function OutsideWorkersStep3({ 
  initialSupervisorName = '', 
  onComplete, 
  onBack = null,
  activeOrder = null,
  siteId = null,
  workSource = 'Seed Stocking' // Default to Seed Stocking
}) {
  const toast = useToast();
  
  // Suppliers & Bank Accounts
  const [suppliers, setSuppliers] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedBankAccount, setSelectedBankAccount] = useState(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  
  const [newSupplier, setNewSupplier] = useState({
    supplierName: '',
    holderName: '',
    accountNumber: '',
    ifscCode: '',
    bankName: '',
  });

  // Table Data
  const [tableData, setTableData] = useState(() =>
    WORKER_ROWS.map((r) => ({ ...r, quantity: '', amount: '' }))
  );
  const [remarks, setRemarks] = useState('');
  const [supervisorName, setSupervisorName] = useState(initialSupervisorName);
  const [supervisorPhone, setSupervisorPhone] = useState('');
  const [supervisorSignature, setSupervisorSignature] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      const { data: sData } = await supabase.from(TABLES.hatcheries).select('*').order('hatchery_name');
      const { data: bData } = await supabase.from(TABLES.hatcheryBankAccounts).select('*');
      if (sData) setSuppliers(sData);
      if (bData) setBankAccounts(bData);
    })();
  }, [siteId]);

  const selectedSupplier = useMemo(() => {
    return suppliers.find(s => s.id === selectedSupplierId) || null;
  }, [suppliers, selectedSupplierId]);

  const activeSupplierAccounts = useMemo(() => {
    if (!selectedSupplier) return [];
    const accounts = bankAccounts.filter((b) => b.hatchery_id === selectedSupplier.id);
    const seen = new Set();
    return accounts.filter((a) => {
      const key = `${(a.account_number || '').trim()}_${(a.ifsc_code || a.ifsc || '').trim()}`;
      if (!key || key === '_') return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [selectedSupplier, bankAccounts]);

  // Clear selected account if no supplier or no accounts
  useEffect(() => {
    if (activeSupplierAccounts.length === 0 || !selectedSupplier) {
      setSelectedBankAccount(null);
    }
  }, [activeSupplierAccounts, selectedSupplier]);

  function handleRowChange(index, field, value) {
    setTableData((prev) =>
      prev.map((r, idx) => (idx === index ? { ...r, [field]: value } : r))
    );
  }

  function addRow() {
    setTableData((prev) => [
      ...prev,
      { sNo: prev.length + 1, category: 'Additional', quantity: '', amount: '' }
    ]);
  }

  const calculatedRows = useMemo(() => {
    return tableData.map((r) => {
      const q = Number(r.quantity) || 0;
      const a = Number(r.amount) || 0;
      return { ...r, total: q * a };
    });
  }, [tableData]);

  const grandTotal = useMemo(() => {
    return calculatedRows.reduce((sum, r) => sum + r.total, 0);
  }, [calculatedRows]);

  async function handleAddSupplier() {
    if (!newSupplier.supplierName.trim()) return toast.error('Enter Supplier Name');
    
    const hPayload = {
      site_id: siteId,
      hatchery_name: newSupplier.supplierName.trim(),
      holder_name: newSupplier.holderName.trim(),
      account_number: newSupplier.accountNumber.trim(),
      ifsc_code: newSupplier.ifscCode.trim(),
    };

    const { data: hRes, error: hErr } = await supabase.from(TABLES.hatcheries).insert(hPayload).select();
    if (hErr) return toast.error(hErr.message);
    const addedSupplier = (Array.isArray(hRes) ? hRes[0] : hRes) || { id: `hatch-${Date.now()}`, ...hPayload };

    let addedBank = null;
    if (newSupplier.accountNumber.trim() || newSupplier.ifscCode.trim()) {
      const bPayload = {
        hatchery_id: addedSupplier.id,
        bank_name: newSupplier.bankName.trim() || 'Bank Account',
        holder_name: newSupplier.holderName.trim(),
        account_number: newSupplier.accountNumber.trim(),
        ifsc_code: newSupplier.ifscCode.trim(),
      };
      const { data: bRes } = await supabase.from(TABLES.hatcheryBankAccounts).insert(bPayload).select();
      addedBank = (Array.isArray(bRes) ? bRes[0] : bRes) || { id: `hba-${Date.now()}`, ...bPayload };
      setBankAccounts((prev) => [addedBank, ...prev]);
    }

    setSuppliers((prev) => [addedSupplier, ...prev]);
    setSelectedSupplierId(addedSupplier.id);
    setSelectedBankAccount(null);
    setShowAddSupplier(false);
    setNewSupplier({ supplierName: '', holderName: '', accountNumber: '', ifscCode: '', bankName: '' });
    toast.success('Supplier added');
  }

  async function handleSaveData() {
    const hasWorkers = calculatedRows.some((r) => Number(r.quantity) > 0);
    if (!hasWorkers) return toast.error('Enter at least one worker row with a quantity greater than 0');
    if (!selectedSupplierId) return toast.error('Select a Supplier');
    if (!supervisorName.trim()) return toast.error('Enter Supervisor Name');
    if (!supervisorSignature) return toast.error('Provide Supervisor Digital Signature');

    setSubmitting(true);
    try {
      const finalPayload = {
        source: workSource,
        supplierId: selectedSupplierId,
        supplierName: selectedSupplier?.hatchery_name,
        selectedBankAccount,
        workers: calculatedRows,
        grandTotal,
        remarks,
        supervisorName,
        supervisorPhone,
        supervisorSignature,
        timestamp: new Date().toISOString()
      };
      
      await onComplete(finalPayload);
    } catch (err) {
      toast.error(err?.message || 'Error saving Outside Workers data');
      setSubmitting(false);
    }
  }

  const supplierSectionUI = (
    <div className="space-y-4 mb-4 bg-slate-50 p-4 rounded-[12px] border" style={{ borderColor: 'var(--color-primary)' }}>
      <div className="flex justify-between items-center">
        <label className="font-extrabold text-primary">👷 Select Supplier *</label>
        <button type="button" onClick={() => setShowAddSupplier(!showAddSupplier)} className="text-xs font-bold text-sky-600 border border-sky-200 px-2 py-1 rounded bg-sky-50">
          + Add Supplier
        </button>
      </div>
      
      {showAddSupplier && (
        <div className="p-4 rounded-[12px] bg-white border border-slate-200 space-y-3 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Add New Supplier</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="field-label text-[10px]">Supplier Name *</label>
              <input className="field text-sm" placeholder="Supplier Name" value={newSupplier.supplierName} onChange={(e) => setNewSupplier({ ...newSupplier, supplierName: e.target.value })} />
            </div>
            <div>
              <label className="field-label text-[10px]">Account Number</label>
              <input className="field text-sm" placeholder="Account Number" value={newSupplier.accountNumber} onChange={(e) => setNewSupplier({ ...newSupplier, accountNumber: e.target.value })} />
            </div>
            <div>
              <label className="field-label text-[10px]">Holder Name</label>
              <input className="field text-sm" placeholder="Holder Name" value={newSupplier.holderName} onChange={(e) => setNewSupplier({ ...newSupplier, holderName: e.target.value })} />
            </div>
            <div>
              <label className="field-label text-[10px]">IFSC Code</label>
              <input className="field text-sm" placeholder="IFSC Code" value={newSupplier.ifscCode} onChange={(e) => setNewSupplier({ ...newSupplier, ifscCode: e.target.value })} />
            </div>
            <div>
              <label className="field-label text-[10px]">Bank Name</label>
              <input className="field text-sm" placeholder="Bank Name (e.g. SBI)" value={newSupplier.bankName} onChange={(e) => setNewSupplier({ ...newSupplier, bankName: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAddSupplier(false)} className="btn-ghost text-xs">Cancel</button>
            <button type="button" onClick={handleAddSupplier} className="btn-success text-xs font-bold">Save Supplier</button>
          </div>
        </div>
      )}

      <select
        className="field text-sm font-semibold"
        value={selectedSupplierId}
        onChange={(e) => {
          setSelectedSupplierId(e.target.value);
          setSelectedBankAccount(null);
        }}
      >
        <option value="">-- Select Registered Supplier --</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.hatchery_name || s.name} {s.holder_name ? `(${s.holder_name})` : ''}
          </option>
        ))}
      </select>

      {selectedSupplier && activeSupplierAccounts.length > 0 && (
        <div className="pt-2 border-t mt-3" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs font-bold text-text-secondary mb-2">
            {selectedBankAccount ? 'Selected Supplier Bank Account' : 'Select Bank Account'}
          </p>
          <div className="space-y-2">
            {activeSupplierAccounts.map((acct) => {
              const isSelected = selectedBankAccount?.id === acct.id;
              return (
                <button
                  key={acct.id}
                  type="button"
                  onClick={() => setSelectedBankAccount(isSelected ? null : acct)}
                  className="w-full text-left rounded-[10px] p-3 border transition flex items-center justify-between"
                  style={{
                    borderColor: isSelected ? 'var(--color-success)' : 'var(--color-border)',
                    background: isSelected ? 'var(--color-success-bg)' : 'var(--color-surface)',
                  }}
                >
                  <div className="text-xs space-y-0.5">
                    <p className="font-bold" style={{ color: isSelected ? 'var(--color-success)' : 'var(--color-text-primary)' }}>
                      🏦 Bank Account Number: {acct.account_number}
                    </p>
                    <p className="text-text-muted">
                      Account Holder Name: {acct.holder_name || selectedSupplier.holder_name} | IFSC Code: {acct.ifsc_code} | Bank Name: {acct.bank_name || 'N/A'}
                    </p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full border" style={{
                    borderColor: isSelected ? 'var(--color-success)' : 'var(--color-border)',
                    color: isSelected ? 'var(--color-success)' : 'var(--color-text-muted)'
                  }}>
                    {isSelected ? '✓ Selected' : 'Select'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Title & Top Back Button */}
      <div className="flex items-center justify-between">
        {onBack && (
          <button type="button" onClick={onBack} className="text-sm font-bold text-text-muted hover:text-black flex items-center gap-1">
            ← Back
          </button>
        )}
        <div className="text-center flex-1">
          <h3 className="text-2xl font-black text-primary uppercase tracking-wide flex items-center justify-center gap-2">
            <span>👷</span> Outside Workers
          </h3>
          <p className="text-xs text-text-secondary">
            Enter common outside workers and payments for {workSource}.
          </p>
        </div>
      </div>

      <div className="card p-6 space-y-6 shadow-sm border" style={{ borderColor: 'var(--color-primary)' }}>
        
        <h4 className="font-extrabold text-lg text-primary border-b pb-2">Supplier Details</h4>
        {supplierSectionUI}

        <h4 className="font-extrabold text-lg text-primary border-b pb-2">Worker Payments</h4>
        <div className="overflow-x-auto rounded-[12px] border">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr style={{ background: 'var(--color-primary)', color: '#fff' }}>
                <th className="p-3 font-extrabold text-center border-r border-white/20">S.No</th>
                <th className="p-3 font-extrabold">Category</th>
                <th className="p-3 font-extrabold w-32">Quantity</th>
                <th className="p-3 font-extrabold w-36">Amount (₹)</th>
                <th className="p-3 font-extrabold text-right w-40">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {calculatedRows.map((r, idx) => (
                <tr key={idx} className="border-b hover:bg-slate-50">
                  <td className="p-3 font-bold text-center border-r text-text-muted">{r.sNo}</td>
                  <td className="p-3 font-extrabold text-sm text-slate-800">
                    <input
                      type="text"
                      className="field py-1.5 text-xs font-semibold bg-transparent border-none px-0 focus:ring-0"
                      value={r.category}
                      onChange={(e) => handleRowChange(idx, 'category', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      className="field py-1.5 text-xs font-semibold"
                      placeholder="Qty"
                      value={r.quantity}
                      onChange={(e) => handleRowChange(idx, 'quantity', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      className="field py-1.5 text-xs font-semibold"
                      placeholder="Rate ₹"
                      value={r.amount}
                      onChange={(e) => handleRowChange(idx, 'amount', e.target.value)}
                    />
                  </td>
                  <td className="p-3 text-right font-extrabold text-sm text-primary">
                    ₹{r.total.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-extrabold text-sm border-t-2">
                <td colSpan={4} className="p-3 text-right">Grand Total:</td>
                <td className="p-3 text-right text-success font-black text-base">
                  ₹{grandTotal.toLocaleString('en-IN')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button type="button" onClick={addRow} className="text-xs font-bold text-primary flex items-center gap-1 mt-2 hover:underline">
          + Add Row
        </button>

        {/* Multiline Remarks */}
        <div className="mt-4">
          <label className="field-label">Work / Worker Remarks</label>
          <textarea
            rows={2}
            className="field text-sm"
            placeholder="Enter remarks or additional notes..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>

        {/* Payment Component */}
        <div className="mt-6 border-t pt-6">
          <RequestPayment 
            type="outside_worker" 
            siteId={siteId} 
            billId={activeOrder?.id || null} 
            totalOrderPrice={grandTotal}
            selectedHatcheryBankAccount={selectedBankAccount}
            selectedHatchery={selectedSupplier}
            workSource={workSource}
          />
        </div>

        {/* Supervisor Details & Digital Signature */}
        <div className="card p-5 space-y-4 border bg-slate-50 mt-6">
          <h4 className="font-extrabold text-base text-primary border-b pb-2">✍️ Mestri Signature / Sign Off</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Mestri Name *</label>
              <input
                className="field text-sm"
                placeholder="Enter Mestri Name"
                value={supervisorName}
                onChange={(e) => setSupervisorName(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Mestri Phone Number</label>
              <input
                type="tel"
                className="field text-sm"
                placeholder="Enter Phone Number"
                value={supervisorPhone}
                onChange={(e) => setSupervisorPhone(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="field-label">Mestri Signature *</label>
            <SignaturePad onSave={(sig) => setSupervisorSignature(sig)} value={supervisorSignature} />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveData}
          disabled={submitting}
          className="btn-success w-full text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2 mt-6"
        >
          {submitting ? '⏳ Processing...' : `✅ Complete ${workSource} Workflow ➔`}
        </button>
      </div>
    </div>
  );
}
