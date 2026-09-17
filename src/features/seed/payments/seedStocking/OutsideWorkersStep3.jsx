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
    if (activeOrder?.outside_workers_data?.batches) {
      return activeOrder.outside_workers_data.batches;
    }
    if (workSource === 'Packing' && activeOrder?.packing_outside_workers_data) {
      const legacy = activeOrder.packing_outside_workers_data;
      return [{
        batchId: `batch-legacy-${Date.now()}`,
        supplierId: legacy.supplierId,
        supplierName: legacy.supplierName,
        selectedBankAccount: legacy.selectedBankAccount,
        workers: legacy.workers,
        grandTotal: legacy.grandTotal,
        remarks: legacy.remarks,
        supervisorName: legacy.supervisorName,
        supervisorPhone: legacy.supervisorPhone,
        supervisorSignature: legacy.supervisorSignature,
        selectedTanks: []
      }];
    }
    return [];
  });

  const [isFormVisible, setIsFormVisible] = useState(() => {
    const batches = activeOrder?.outside_workers_data?.batches || (activeOrder?.packing_outside_workers_data ? [1] : []);
    return batches.length === 0;
  });
  const [editingBatchId, setEditingBatchId] = useState(null);
  const [selectedTanks, setSelectedTanks] = useState([]);

  const availableTanks = useMemo(() => {
    const tanksMap = new Map();

    const isMixed = activeOrder?.type === 'mixed' || activeOrder?.current_stage === 'mixed-allocation' || Boolean(activeOrder?.packing_data && activeOrder?.stocking_status_data);
    const includePacking = workSource === 'Packing' || isMixed || Boolean(activeOrder?.packing_data?.tanks);
    const includeSeedVan = workSource !== 'Packing' || isMixed || Boolean(activeOrder?.stocking_status_data || (vehicles && vehicles.length > 0));

    const stockingData = step2Data || activeOrder?.stocking_status_data;
    const hasFinalData = Boolean(stockingData);

    // 1. Process persisted Stocking Status Data (if available) for ALL vehicles & sources
    if (hasFinalData) {
      Object.entries(stockingData).forEach(([vId, vData]) => {
        if (vId === 'supervisorName' || vId === 'supervisorPhone' || vId === 'supervisorSignature' || vId === 'seedVanCompleted') return;
        if (!vData || !vData.tankStates) return;

        const vehicle = vehicles.find(v => v.id === vId);
        const vehicleNumber = vehicle ? (vehicle.vehicle_number || vehicle.vehicleName || 'Unknown Vehicle') : (vId === 'packing' ? 'Packing Only' : 'Seed Stocking');

        const aggregated = aggregateTankStates(vData.tankStates, vData.transfers);

        aggregated.forEach(agg => {
          if (!agg || !agg.tankName) return;
          const normalizedName = agg.tankName.trim().toUpperCase();

          // Final eligibility rules:
          // Stocking Completed / Partial Transfer / Partial Return / Transfer Target with count > 0 -> ELIGIBLE
          // Full Return (status = returned, count = 0) or Full Transfer source (status = transferred, count = 0) -> INELIGIBLE
          const isFullReturn = agg.status === 'returned' && agg.totalCount === 0;
          const isFullTransferSource = agg.status === 'transferred' && agg.totalCount === 0;
          const isEligible = !isFullReturn && !isFullTransferSource && (agg.totalCount > 0 || agg.status === 'completed' || agg.status === 'pending' || agg.status === 'Partial Transfer' || agg.status === 'unassigned');

          if (isEligible) {
            const origTank = vehicle?.selected_tanks?.find(t => String(t.name || '').trim().toUpperCase() === normalizedName) || activeOrder?.selected_tanks?.find(t => String(t.name || '').trim().toUpperCase() === normalizedName);

            tanksMap.set(normalizedName, {
              vehicleId: vId,
              vehicleNumber,
              tankId: origTank ? origTank.id : (agg.targetTankId || agg.tankName),
              tankName: agg.tankName,
              finalQuantity: agg.totalCount,
              status: agg.status,
              source: 'seed_van'
            });
          }
        });
      });
    }

    // 2. Process Packing Tanks
    if (includePacking && activeOrder?.packing_data?.tanks) {
      let packingTanks = activeOrder.packing_data.tanks;
      packingTanks.forEach(t => {
        const rawName = String(t.name || t.id || '').trim();
        if (!rawName) return;
        const normalizedName = rawName.toUpperCase();
        const qty = Number(t.quantity) || 0;
        const status = String(t.status || '');

        const isFullReturn = status.includes('Returned') && qty === 0;
        const isFullTransferSource = status.includes('Transferred') && qty === 0;
        const isEligible = !isFullReturn && !isFullTransferSource && (qty > 0 || status === 'Stocking Completed');

        if (isEligible) {
          if (!tanksMap.has(normalizedName)) {
            tanksMap.set(normalizedName, {
              vehicleId: 'packing',
              vehicleNumber: 'Packing Only',
              tankId: t.id || rawName,
              tankName: rawName,
              finalQuantity: qty,
              status,
              source: 'packing'
            });
          } else {
            const existing = tanksMap.get(normalizedName);
            if (qty > 0 && existing.finalQuantity === 0) {
              existing.finalQuantity = qty;
            }
          }
        }
      });
    }

    // 3. Fallback for Seed Van only when NO final transaction data exists
    if (includeSeedVan && !hasFinalData && !activeOrder?.packing_data?.tanks) {
      vehicles.forEach(v => {
        if (v.selected_tanks && Array.isArray(v.selected_tanks)) {
          v.selected_tanks.forEach(t => {
            const rawName = String(t.name || t.id || '').trim();
            if (!rawName) return;
            const normalizedName = rawName.toUpperCase();
            const qty = t.quantity === undefined ? null : Number(t.quantity);

            if (!tanksMap.has(normalizedName) && (qty === null || qty > 0)) {
              tanksMap.set(normalizedName, {
                vehicleId: v.id,
                vehicleNumber: v.vehicle_number || v.vehicleName || 'Unknown Vehicle',
                tankId: t.id,
                tankName: rawName,
                finalQuantity: qty
              });
            }
          });
        }
      });
    }

    const tanks = Array.from(tanksMap.values());

    // Filter out tanks already used in other saved batches (deduplicated by normalized physical tank name)
    const usedByOther = new Set();
    savedBatches.forEach(b => {
      if (b.batchId !== editingBatchId && b.selectedTanks) {
        b.selectedTanks.forEach(st => {
          const tKey = String(st.tankName || st.name || st.tankId || '').trim().toUpperCase();
          if (tKey) usedByOther.add(tKey);
        });
      }
    });

    return tanks.filter(t => !usedByOther.has(String(t.tankName).trim().toUpperCase()));
  }, [vehicles, step2Data, activeOrder, savedBatches, editingBatchId, workSource]);

  function handleTankToggle(tankOpt) {
    const normOptName = String(tankOpt.tankName || tankOpt.name || tankOpt.tankId).trim().toUpperCase();
    setSelectedTanks((prev) => {
      const exists = prev.find(p =>
        String(p.tankName || p.name || p.tankId).trim().toUpperCase() === normOptName ||
        (p.vehicleId === tankOpt.vehicleId && p.tankId === tankOpt.tankId)
      );
      if (exists) {
        return prev.filter(p =>
          String(p.tankName || p.name || p.tankId).trim().toUpperCase() !== normOptName &&
          !(p.vehicleId === tankOpt.vehicleId && p.tankId === tankOpt.tankId)
        );
      } else {
        return [...prev, tankOpt];
      }
    });
  }

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      // 1. Fetch Outside Worker Suppliers from TABLES.labourSuppliers
      const { data: sData } = await supabase.from(TABLES.labourSuppliers).select('*');

      // Also fetch legacy outside workers from TABLES.hatcheries if any exist
      const { data: hLegacy } = await supabase.from(TABLES.hatcheries).select('*').eq('category', 'outside_worker');

      const combinedSuppliers = [
        ...(sData || []),
        ...(hLegacy || []).map(h => ({
          ...h,
          id: h.id,
          name: h.supplier_name || h.name || h.hatchery_name,
          supplier_name: h.supplier_name || h.name || h.hatchery_name,
        }))
      ];

      // 2. Fetch Outside Worker Bank Accounts from TABLES.bankAccounts
      const { data: bData } = await supabase.from(TABLES.bankAccounts).select('*');
      const { data: hbLegacy } = await supabase.from(TABLES.hatcheryBankAccounts).select('*').eq('category', 'outside_worker');

      const combinedAccounts = [
        ...(bData || []),
        ...(hbLegacy || []).map(b => ({
          ...b,
          supplier_id: b.hatchery_id,
          account_number: b.account_number || b.bank_account,
          ifsc_code: b.ifsc_code || b.ifsc || b.bank_ifsc,
        }))
      ];

      setSuppliers(combinedSuppliers);
      setBankAccounts(combinedAccounts);
    })();
  }, [siteId]);

  const selectedSupplier = useMemo(() => {
    return suppliers.find(s => s.id === selectedSupplierId) || null;
  }, [suppliers, selectedSupplierId]);

  const uniqueSuppliers = useMemo(() => {
    const unique = [];
    const seenNames = new Set();
    for (const s of suppliers) {
      const nameKey = (s.supplier_name || s.name || s.hatchery_name || '').trim().toLowerCase();
      if (!nameKey || !seenNames.has(nameKey)) {
        if (nameKey) seenNames.add(nameKey);
        unique.push({
          ...s,
          displayName: s.supplier_name || s.name || s.hatchery_name || ''
        });
      }
    }
    return unique;
  }, [suppliers]);

  const activeSupplierAccounts = useMemo(() => {
    if (!selectedSupplier) return [];

    const selectedName = (selectedSupplier.supplier_name || selectedSupplier.name || selectedSupplier.hatchery_name || '').trim().toLowerCase();

    // Find all supplier IDs in Outside Worker Suppliers with the same supplier name
    const sameNameSupplierIds = suppliers
      .filter(s => {
        const n1 = (s.supplier_name || s.name || s.hatchery_name || '').trim().toLowerCase();
        return n1 === selectedName;
      })
      .map(s => s.id);

    // Isolate accounts belonging to Outside Worker Suppliers in bankAccounts
    const accounts = bankAccounts.filter((b) => {
      const sid = b.supplier_id || b.labour_supplier_id || b.hatchery_id;
      return sameNameSupplierIds.includes(sid);
    });

    // Also check if selectedSupplier itself has direct bank account fields
    const directAccounts = [];
    if (selectedSupplier.account_number || selectedSupplier.bank_account) {
      directAccounts.push({
        id: `direct-${selectedSupplier.id}`,
        supplier_id: selectedSupplier.id,
        bank_name: selectedSupplier.bank_name || 'Bank Account',
        holder_name: selectedSupplier.holder_name || selectedSupplier.bank_holder || (selectedSupplier.supplier_name || selectedSupplier.name),
        account_number: selectedSupplier.account_number || selectedSupplier.bank_account,
        ifsc_code: selectedSupplier.ifsc_code || selectedSupplier.bank_ifsc || selectedSupplier.ifsc,
      });
    }

    const allAccounts = [...accounts, ...directAccounts];

    const seen = new Set();
    return allAccounts.filter((a) => {
      const normAcct = (a.account_number || a.bank_account || '').trim().replace(/\s+/g, '');
      const normIfsc = (a.ifsc_code || a.bank_ifsc || a.ifsc || '').trim().toUpperCase().replace(/\s+/g, '');
      const key = `${normAcct}_${normIfsc}`;
      if (!key || key === '_') return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [selectedSupplier, suppliers, bankAccounts]);

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

    const supplierName = newSupplier.supplierName.trim();
    const sPayload = {
      site_id: siteId,
      name: supplierName,
      supplier_name: supplierName,
      phone: newSupplier.phone ? newSupplier.phone.trim() : '',
      holder_name: newSupplier.holderName.trim(),
      bank_holder: newSupplier.holderName.trim(),
      account_number: newSupplier.accountNumber.trim(),
      bank_account: newSupplier.accountNumber.trim(),
      ifsc_code: newSupplier.ifscCode.trim(),
      bank_ifsc: newSupplier.ifscCode.trim(),
      bank_name: newSupplier.bankName.trim(),
      category: 'outside_worker',
      type: 'outside_worker',
    };

    const { data: sRes, error: sErr } = await supabase.from(TABLES.labourSuppliers).insert(sPayload).select();
    if (sErr) return toast.error(sErr.message);
    const addedSupplier = (Array.isArray(sRes) ? sRes[0] : sRes) || { id: `ls-${Date.now()}`, ...sPayload };

    let addedBank = null;
    if (newSupplier.accountNumber.trim() || newSupplier.ifscCode.trim()) {
      const bPayload = {
        supplier_id: addedSupplier.id,
        labour_supplier_id: addedSupplier.id,
        bank_name: newSupplier.bankName.trim() || 'Bank Account',
        holder_name: newSupplier.holderName.trim(),
        account_number: newSupplier.accountNumber.trim(),
        ifsc_code: newSupplier.ifscCode.trim(),
        category: 'outside_worker',
      };
      const { data: bRes } = await supabase.from(TABLES.bankAccounts).insert(bPayload).select();
      addedBank = (Array.isArray(bRes) ? bRes[0] : bRes) || { id: `ba-${Date.now()}`, ...bPayload };
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
        {uniqueSuppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.hatchery_name || s.name}
          </option>
        ))}
      </select>

      {selectedSupplier && activeSupplierAccounts.length > 0 && (
        <div className="pt-2 border-t mt-3" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs font-bold text-text-secondary mb-2">
            Saved Accounts for {selectedSupplier.hatchery_name || selectedSupplier.name}:
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

                  {/* ── Per-Batch Payment ── */}
                  <div className="mt-4 pt-4 border-t border-emerald-200 bg-white rounded-[8px] p-4">
                    <RequestPayment
                      type="outside_worker"
                      siteId={siteId}
                      billId={activeOrder?.id || null}
                      batchId={batch.batchId}
                      totalOrderPrice={batch.grandTotal}
                      selectedRecipient={{ id: batch.supplierId, hatchery_name: batch.supplierName, name: batch.supplierName }}
                      selectedRecipientBankAccount={batch.selectedBankAccount}
                      workSource={`${workSource} - Batch ${idx + 1}`}
                      onHatcheryBankAccountAdded={(acct) => setBankAccounts(prev => [acct, ...prev])}
                    />
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
                  const normOptName = String(tOpt.tankName || tOpt.name || tOpt.tankId).trim().toUpperCase();
                  const isSelected = selectedTanks.some(st =>
                    String(st.tankName || st.name || st.tankId).trim().toUpperCase() === normOptName ||
                    (st.vehicleId === tOpt.vehicleId && st.tankId === tOpt.tankId)
                  );
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