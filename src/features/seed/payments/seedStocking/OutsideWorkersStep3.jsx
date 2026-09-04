import { useState, useMemo, useEffect } from 'react';
import SignaturePad from './SignaturePad';
import { useToast } from '../../../../hooks/useToast';
import RequestPayment from '../../../../components/payments/RequestPayment';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { aggregateTankStates } from './stockingUtils';

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
  vehicles = [],
  siteId = null,
  workSource = 'Seed Stocking', // Default to Seed Stocking
  step2Data = null
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

  const [savedBatches, setSavedBatches] = useState(() => {
    return activeOrder?.outside_workers_data?.batches || [];
  });

  const [isFormVisible, setIsFormVisible] = useState(() => {
    const batches = activeOrder?.outside_workers_data?.batches || [];
    return batches.length === 0;
  });
  const [editingBatchId, setEditingBatchId] = useState(null);
  const [selectedTanks, setSelectedTanks] = useState([]);

  const availableTanks = useMemo(() => {
    const tanksMap = new Map();
    const finalData = step2Data || activeOrder?.stocking_status_data;
    
    if (finalData) {
      Object.entries(finalData).forEach(([vId, vData]) => {
        if (vId === 'supervisorName' || vId === 'supervisorPhone' || vId === 'supervisorSignature' || vId === 'seedVanCompleted') return;
        if (!vData || !vData.tankStates) return;
        
        const vehicle = vehicles.find(v => v.id === vId);
        const vehicleNumber = vehicle?.vehicle_number || vehicle?.vehicleName || 'Unknown Vehicle';
        
        const aggregated = aggregateTankStates(vData.tankStates, vData.transfers);
        
        aggregated.forEach(agg => {
          if (agg.totalCount > 0) {
            const origTank = vehicle?.selected_tanks?.find(t => t.name === agg.tankName);
            tanksMap.set(`${vId}-${agg.tankName}`, {
              vehicleId: vId,
              vehicleNumber,
              tankId: origTank ? origTank.id : (agg.targetTankId || agg.tankName),
              tankName: agg.tankName,
              finalQuantity: agg.totalCount
            });
          }
        });
      });
    }

    const tanks = Array.from(tanksMap.values());

    if (tanks.length === 0) {
      vehicles.forEach(v => {
        if (v.selected_tanks && Array.isArray(v.selected_tanks)) {
          v.selected_tanks.forEach(t => {
            if (!tanks.find(ex => ex.vehicleId === v.id && ex.tankName === t.name)) {
              tanks.push({
                vehicleId: v.id,
                vehicleNumber: v.vehicle_number || v.vehicleName || 'Unknown Vehicle',
                tankId: t.id,
                tankName: t.name,
                finalQuantity: null
              });
            }
          });
        }
      });
    }
    const usedByOther = new Set();
    savedBatches.forEach(b => {
      if (b.batchId !== editingBatchId && b.selectedTanks) {
        b.selectedTanks.forEach(st => {
          usedByOther.add(`${st.vehicleId}-${st.tankId}`);
        });
      }
    });

    return tanks.filter(t => !usedByOther.has(`${t.vehicleId}-${t.tankId}`));
  }, [vehicles, step2Data, activeOrder, savedBatches, editingBatchId]);

  function handleTankToggle(tankOpt) {
    setSelectedTanks((prev) => {
      const exists = prev.find(p => p.vehicleId === tankOpt.vehicleId && p.tankId === tankOpt.tankId);
      if (exists) {
        return prev.filter(p => !(p.vehicleId === tankOpt.vehicleId && p.tankId === tankOpt.tankId));
      } else {
        return [...prev, tankOpt];
      }
    });
  }

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

  async function handleSaveBatch() {
    const hasWorkers = calculatedRows.some((r) => Number(r.quantity) > 0);
    if (!hasWorkers) return toast.error('Enter at least one worker row with a quantity greater than 0');
    if (!selectedSupplierId) return toast.error('Select a Supplier');
    if (!supervisorName.trim()) return toast.error('Enter Supervisor Name');
    if (!supervisorSignature) return toast.error('Provide Supervisor Digital Signature');

    setSubmitting(true);
    try {
      let newBatches = [...savedBatches];
      const newBatchData = {
        supplierId: selectedSupplierId,
        supplierName: selectedSupplier?.hatchery_name || selectedSupplier?.name,
        selectedBankAccount,
        workers: calculatedRows,
        grandTotal,
        remarks,
        supervisorName,
        supervisorPhone,
        supervisorSignature,
        selectedTanks,
        timestamp: new Date().toISOString()
      };

      if (editingBatchId) {
        newBatches = newBatches.map(b => b.batchId === editingBatchId ? { ...b, ...newBatchData, batchId: editingBatchId } : b);
      } else {
        const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        newBatches.push({ batchId, ...newBatchData });
      }
      
      if (activeOrder?.id) {
        const payload = {
          outside_workers_data: {
            batches: newBatches,
            source: workSource
          }
        };
        const { error } = await supabase.from(TABLES.bills).update(payload).eq('id', activeOrder.id);
        if (error) throw error;
      }

      setSavedBatches(newBatches);
      
      // Reset form
      setTableData(WORKER_ROWS.map((r) => ({ ...r, quantity: '', amount: '' })));
      setRemarks('');
      setSelectedSupplierId('');
      setSelectedBankAccount(null);
      setSupervisorSignature(null);
      setSelectedTanks([]);
      setEditingBatchId(null);
      setIsFormVisible(false);

      toast.success(editingBatchId ? 'Batch updated successfully!' : 'Batch saved successfully!');
    } catch (err) {
      toast.error(err?.message || 'Error saving batch');
    } finally {
      setSubmitting(false);
    }
  }

  function handleEditBatch(batch) {
    setEditingBatchId(batch.batchId);
    setSelectedSupplierId(batch.supplierId || '');
    setSelectedBankAccount(batch.selectedBankAccount || null);
    
    if (batch.workers && batch.workers.length > 0) {
       setTableData(batch.workers);
    } else {
       setTableData(WORKER_ROWS.map((r) => ({ ...r, quantity: '', amount: '' })));
    }
    
    setRemarks(batch.remarks || '');
    setSupervisorName(batch.supervisorName || initialSupervisorName);
    setSupervisorPhone(batch.supervisorPhone || '');
    setSupervisorSignature(batch.supervisorSignature || null);
    setSelectedTanks(batch.selectedTanks || []);
    setIsFormVisible(true);
    // Scroll to form slightly
    window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'smooth' });
  }

  function handleAddNewBatch() {
    setEditingBatchId(null);
    setTableData(WORKER_ROWS.map((r) => ({ ...r, quantity: '', amount: '' })));
    setRemarks('');
    setSelectedSupplierId('');
    setSelectedBankAccount(null);
    setSupervisorSignature(null);
    setSelectedTanks([]);
    setIsFormVisible(true);
  }

  function handleCancelEdit() {
    setEditingBatchId(null);
    setTableData(WORKER_ROWS.map((r) => ({ ...r, quantity: '', amount: '' })));
    setRemarks('');
    setSelectedSupplierId('');
    setSelectedBankAccount(null);
    setSupervisorSignature(null);
    setSelectedTanks([]);
    setIsFormVisible(false);
  }

  async function handleSaveData() {
    let finalBatches = [...savedBatches];

    if (finalBatches.length === 0) {
      const hasWorkers = calculatedRows.some((r) => Number(r.quantity) > 0);
      if (!hasWorkers || !selectedSupplierId || !supervisorName.trim() || !supervisorSignature) {
        return toast.error('Please save at least one batch or fill out the form completely.');
      }
      
      const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newBatch = {
        batchId,
        supplierId: selectedSupplierId,
        supplierName: selectedSupplier?.hatchery_name || selectedSupplier?.name,
        selectedBankAccount,
        workers: calculatedRows,
        grandTotal,
        remarks,
        supervisorName,
        supervisorPhone,
        supervisorSignature,
        selectedTanks,
        timestamp: new Date().toISOString()
      };
      finalBatches.push(newBatch);
    }

    setSubmitting(true);
    try {
      const finalPayload = {
        source: workSource,
        batches: finalBatches,
        // Legacy fallback based on the last batch
        ...finalBatches[finalBatches.length - 1],
      };
      
      await onComplete(finalPayload);
    } catch (err) {
      toast.error(err?.message || 'Error completing Outside Workers data');
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
        
        {savedBatches.length > 0 && (
          <div className="space-y-4 mb-6">
            <h4 className="font-extrabold text-lg text-primary border-b pb-2">📦 Saved Batches ({savedBatches.length})</h4>
            <div className="flex flex-col gap-4">
              {savedBatches.map((batch, idx) => (
                <div key={batch.batchId} className="p-4 border rounded-[12px] bg-emerald-50 border-emerald-200 shadow-sm relative">
                  <div className="flex justify-between items-start mb-3 border-b border-emerald-200 pb-2">
                    <p className="font-extrabold text-emerald-900 text-base">Batch {idx + 1}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-200 px-2 py-1 rounded-full">Saved</span>
                      <button 
                        type="button" 
                        onClick={() => handleEditBatch(batch)}
                        className="text-xs font-bold text-sky-700 bg-sky-100 px-3 py-1 rounded hover:bg-sky-200 transition border border-sky-300"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-emerald-800 mb-1"><strong>Supplier:</strong> {batch.supplierName || 'N/A'}</p>
                      {batch.selectedTanks && batch.selectedTanks.length > 0 && (
                        <p className="text-xs text-emerald-800 mb-1">
                          <strong>Tanks:</strong> {batch.selectedTanks.map(t => (!t.vehicleNumber || t.vehicleNumber === 'Unknown Vehicle' || t.vehicleNumber === 'Unknown' || t.vehicleNumber === 'N/A') ? t.tankName : `${t.vehicleNumber} - ${t.tankName}`).join(', ')}
                        </p>
                      )}
                      <p className="text-xs text-emerald-900 font-extrabold mt-2 text-lg">Total: ₹{Number(batch.grandTotal).toLocaleString('en-IN')}</p>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-100">
                      <p className="text-[10px] uppercase font-bold text-emerald-600 mb-1 border-b border-emerald-50 pb-1">Entered Categories</p>
                      <ul className="text-xs text-emerald-800 space-y-1 mt-1">
                        {batch.workers?.filter(w => Number(w.quantity) > 0 || Number(w.amount) > 0).map(w => (
                          <li key={w.sNo} className="flex justify-between">
                            <span>{w.category} (Qty: {w.quantity || 0}):</span>
                            <span className="font-bold">₹{Number(w.total).toLocaleString('en-IN')}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!isFormVisible && (
              <button 
                type="button" 
                onClick={handleAddNewBatch}
                className="w-full py-3 mt-2 border-2 border-dashed border-emerald-400 text-emerald-700 font-bold rounded-[10px] hover:bg-emerald-50 transition"
              >
                + Add Another Batch
              </button>
            )}
          </div>
        )}

        {isFormVisible && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-extrabold text-lg text-primary">{editingBatchId ? '✏️ Edit Batch' : '➕ New Batch Entry'}</h4>
              {editingBatchId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-2xl leading-none text-text-muted hover:text-black focus:outline-none font-bold px-2"
                  aria-label="Close"
                >
                  ×
                </button>
              )}
            </div>
            
            {supplierSectionUI}

            <h4 className="font-extrabold text-lg text-primary border-b pb-2">Tank Selection</h4>
            {availableTanks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                {availableTanks.map((tOpt, idx) => {
                  const isSelected = selectedTanks.some(st => st.vehicleId === tOpt.vehicleId && st.tankId === tOpt.tankId);
                  return (
                    <button
                      key={`${tOpt.vehicleId}-${tOpt.tankId}-${idx}`}
                      type="button"
                      onClick={() => handleTankToggle(tOpt)}
                      className="flex items-center justify-between p-3 border rounded-[10px] text-left transition"
                      style={{
                        borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                        background: isSelected ? 'var(--color-primary-bg)' : 'var(--color-surface)'
                      }}
                    >
                      <span className="text-xs font-bold" style={{ color: isSelected ? 'var(--color-primary)' : 'inherit' }}>
                        {(!tOpt.vehicleNumber || tOpt.vehicleNumber === 'Unknown Vehicle' || tOpt.vehicleNumber === 'Unknown' || tOpt.vehicleNumber === 'N/A') 
                          ? tOpt.tankName 
                          : `${tOpt.vehicleNumber} - ${tOpt.tankName}`}
                      </span>
                      {isSelected && <span className="text-primary font-bold">✓ Selected</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-text-muted mb-6">No tanks available in the current order vehicles.</p>
            )}

            <h4 className="font-extrabold text-lg text-primary border-b pb-2">Worker Payments</h4>
            <div className="overflow-x-auto rounded-[12px] border">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-text-secondary">
                    <th className="p-3 font-extrabold border-b border-r text-center w-12">#</th>
                    <th className="p-3 font-extrabold border-b">Category</th>
                    <th className="p-3 font-extrabold border-b w-24">Quantity</th>
                    <th className="p-3 font-extrabold border-b w-32">Rate (₹)</th>
                    <th className="p-3 font-extrabold border-b text-right w-32">Total (₹)</th>
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
                          placeholder="Rate"
                          value={r.amount}
                          onChange={(e) => handleRowChange(idx, 'amount', e.target.value)}
                        />
                      </td>
                      <td className="p-3 font-black text-right text-primary text-sm">
                        ₹{Number(r.total || 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50">
                    <td colSpan={4} className="p-3 font-extrabold text-right border-t text-sm">
                      Grand Total:
                    </td>
                    <td className="p-3 font-black text-right text-success text-base border-t">
                      ₹{Number(grandTotal).toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={addRow}
                className="text-xs font-bold text-sky-600 bg-sky-50 px-3 py-1.5 rounded-[8px] hover:bg-sky-100 transition border border-sky-200"
              >
                + Add Custom Row
              </button>
            </div>

            <div className="space-y-2 mt-4">
              <label className="font-bold text-xs text-text-secondary">Remarks (Optional)</label>
              <textarea
                className="field text-xs min-h-[80px]"
                placeholder="Any special remarks regarding this payment..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>

            <div className="mt-6 border-t pt-4 space-y-4" style={{ borderColor: 'var(--color-border)' }}>
              <h4 className="font-extrabold text-base text-primary">Mestri / Supervisor Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Name *</label>
                  <input
                    type="text"
                    className="field"
                    placeholder="Supervisor Name"
                    value={supervisorName}
                    onChange={(e) => setSupervisorName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Phone (Optional)</label>
                  <input
                    type="tel"
                    className="field"
                    placeholder="Phone Number"
                    value={supervisorPhone}
                    onChange={(e) => setSupervisorPhone(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="field-label mb-2 block">Digital Signature (Outside Workers) *</label>
                <SignaturePad onSave={(sig) => setSupervisorSignature(sig)} value={supervisorSignature} />
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 mt-6">
              <button
                type="button"
                onClick={handleSaveBatch}
                disabled={submitting}
                className="btn-primary w-full text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2"
              >
                {submitting ? '⏳ Processing...' : (editingBatchId ? '💾 Update Batch' : '💾 Save Batch')}
              </button>
            </div>
          </div>
        )}

        {/* Complete workflow is always visible at bottom */}
        <div className="mt-6 pt-6 border-t flex flex-col">
          <button
            type="button"
            onClick={handleSaveData}
            disabled={submitting}
            className="btn-success w-full text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2"
          >
            {submitting ? '⏳ Processing...' : `✅ Complete ${workSource} Workflow ➔`}
          </button>
        </div>
      </div>
    </div>
  );
}