import { useState, useEffect, useMemo } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import DigitalSignaturePad from '../../../components/ui/DigitalSignaturePad';
import { useToast } from '../../../hooks/useToast';

/**
 * LabourDetailsForm — Multi-tank Labour details assignment module.
 * Allows selecting multiple harvested tanks at the top (e.g. A1 + A2),
 * entering Outside Workers details once, saving as a group, displaying saved
 * groups, editing saved groups, and proceeding to review.
 */
const DEFAULT_BATCHES = [
  { id: 1, batch: 'vala manushulu', quantity: '', amount: '' },
  { id: 2, batch: 'mestri', quantity: '', amount: '' },
  { id: 3, batch: 'autos', quantity: '', amount: '' },
  { id: 4, batch: 'valalu', quantity: '', amount: '' },
  { id: 5, batch: 'chethi valalu', quantity: '', amount: '' },
  { id: 6, batch: 'guntu valalu', quantity: '', amount: '' },
  { id: 7, batch: 'Beta', quantity: '', amount: '' },
  { id: 8, batch: 'extra amount', quantity: '', amount: '' },
];

export default function LabourDetailsForm({
  labourData = {},
  setLabourData,
  siteId,
  savedTanks = [],
  tanks = [],
  onProceed,
  onBack,
}) {
  const toast = useToast ? useToast() : { success: console.log, error: console.error };
  const STORAGE_KEY = `ssh_labour_groups_${siteId || 'default'}`;

  // 1. Dynamic list of harvested tanks available for selection
  const harvestedTanks = useMemo(() => {
    if (savedTanks && savedTanks.length > 0) {
      return savedTanks.map((st) => ({
        id: st.id || st.tank_id,
        tank_id: st.tank_id || st.id,
        name: st.tank_name || st.tank?.name || `Tank ${st.tank_id}`,
        kgs: st.grandTotalKgs,
        count: st.finalCount,
      }));
    }
    if (tanks && tanks.length > 0) {
      return tanks.map((t) => ({
        id: t.id,
        tank_id: t.id,
        name: t.name || `Tank ${t.id}`,
      }));
    }
    // Fallback demo tanks if empty
    return [
      { id: 't1', tank_id: 't1', name: 'A1' },
      { id: 't2', tank_id: 't2', name: 'A2' },
      { id: 't3', tank_id: 't3', name: 'A3' },
      { id: 't4', tank_id: 't4', name: 'A4' },
      { id: 't5', tank_id: 't5', name: 'A5' },
    ];
  }, [savedTanks, tanks]);

  // 2. Saved Labour Groups State (loaded from persistence)
  const [labourGroups, setLabourGroups] = useState(() => {
    if (labourData?.labourGroups && Array.isArray(labourData.labourGroups) && labourData.labourGroups.length > 0) {
      return labourData.labourGroups;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (err) {
      console.error('Error reading labour groups:', err);
    }
    return [];
  });

  // 3. Selection & Form Active State
  const [selectedTankIds, setSelectedTankIds] = useState([]);
  const [editingGroupId, setEditingGroupId] = useState(null);

  // Form State
  const [suppliersList, setSuppliersList] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
  const [currentSupplierDetails, setCurrentSupplierDetails] = useState({
    supplier_name: '',
    phone: '',
    village: '',
    phonepe: '',
    bank_account: '',
    bank_holder: '',
    bank_ifsc: '',
  });
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    phone: '',
    village: '',
    phonepe: '',
    bank_account: '',
    bank_holder: '',
    bank_ifsc: '',
  });
  const [workerRows, setWorkerRows] = useState(DEFAULT_BATCHES);
  const [remarks, setRemarks] = useState('');
  const [mestriSignature, setMestriSignature] = useState('');

  // Sync/save labour groups to localStorage & setLabourData
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(labourGroups));
    } catch (err) {
      console.error('Failed to save to localStorage:', err);
    }

    if (setLabourData) {
      const combinedWorkerRows = labourGroups.flatMap((g) => g.worker_rows || []);
      const combinedTotal = labourGroups.reduce((sum, g) => sum + (g.total_amount || 0), 0);
      const supplierNames = [...new Set(labourGroups.map((g) => g.supplier_name).filter(Boolean))].join(', ');

      setLabourData((prev) => ({
        ...prev,
        labourGroups,
        labour_supplier_id: labourGroups[0]?.labour_supplier_id || prev?.labour_supplier_id || '',
        supplier_name: supplierNames || prev?.supplier_name || '',
        phone: labourGroups[0]?.phone || prev?.phone || '',
        village: labourGroups[0]?.village || prev?.village || '',
        phonepe: labourGroups[0]?.phonepe || prev?.phonepe || '',
        bank_account: labourGroups[0]?.bank_account || prev?.bank_account || '',
        bank_holder: labourGroups[0]?.bank_holder || prev?.bank_holder || '',
        worker_rows: combinedWorkerRows.length > 0 ? combinedWorkerRows : (prev?.worker_rows || null),
        remarks: labourGroups.map((g) => g.remarks).filter(Boolean).join('; ') || prev?.remarks || '',
        mestri_signature: labourGroups[0]?.mestri_signature || prev?.mestri_signature || '',
        total_amount: combinedTotal,
      }));
    }
  }, [labourGroups, siteId]);

  // Load suppliers list from Supabase
  const loadSuppliers = async () => {
    if (!siteId) return;
    try {
      const { data } = await supabase
        .from(TABLES.labourSuppliers)
        .select('*')
        .eq('site_id', siteId)
        .order('name');
      setSuppliersList(data || []);
    } catch (err) {
      console.error('Failed to load suppliers:', err);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [siteId]);

  // Compute map of tank_id -> group for visual badges
  const tankToGroupMap = useMemo(() => {
    const map = {};
    labourGroups.forEach((group, idx) => {
      (group.tank_ids || []).forEach((tId) => {
        map[tId] = { group, groupIndex: idx + 1 };
      });
    });
    return map;
  }, [labourGroups]);

  // Unassigned tanks available for new selection
  const unassignedTanks = useMemo(() => {
    return harvestedTanks.filter((t) => !tankToGroupMap[t.id]);
  }, [harvestedTanks, tankToGroupMap]);

  // Handle Tank selection click
  const handleToggleTank = (tankId) => {
    // If tank belongs to an existing group and we are not editing it, prompt/start editing
    const existing = tankToGroupMap[tankId];
    if (existing && existing.group.id !== editingGroupId) {
      handleEditGroup(existing.group);
      return;
    }

    setSelectedTankIds((prev) =>
      prev.includes(tankId) ? prev.filter((id) => id !== tankId) : [...prev, tankId]
    );
  };

  const handleSelectAllUnassigned = () => {
    const unassignedIds = unassignedTanks.map((t) => t.id);
    setSelectedTankIds(unassignedIds);
  };

  const handleClearTankSelection = () => {
    setSelectedTankIds([]);
  };

  // Reset form inputs
  const resetForm = () => {
    setSelectedSupplierId('');
    setShowNewSupplier(false);
    setCurrentSupplierDetails({
      supplier_name: '',
      phone: '',
      village: '',
      phonepe: '',
      bank_account: '',
      bank_holder: '',
      bank_ifsc: '',
    });
    setWorkerRows(DEFAULT_BATCHES);
    setRemarks('');
    setMestriSignature('');
    setSelectedTankIds([]);
    setEditingGroupId(null);
  };

  // Handle Edit Group
  const handleEditGroup = (group) => {
    setEditingGroupId(group.id);
    setSelectedTankIds(group.tank_ids || []);
    setSelectedSupplierId(group.labour_supplier_id || '');
    setCurrentSupplierDetails({
      supplier_name: group.supplier_name || '',
      phone: group.phone || '',
      village: group.village || '',
      phonepe: group.phonepe || '',
      bank_account: group.bank_account || '',
      bank_holder: group.bank_holder || '',
      bank_ifsc: group.bank_ifsc || '',
    });
    setWorkerRows(group.worker_rows || DEFAULT_BATCHES);
    setRemarks(group.remarks || '');
    setMestriSignature(group.mestri_signature || '');
    setShowNewSupplier(false);
    if (toast.success) toast.success(`Editing Labour Details for Tanks: ${group.tank_names?.join(', ')}`);
  };

  // Handle Delete Group
  const handleDeleteGroup = (groupId) => {
    setLabourGroups((prev) => prev.filter((g) => g.id !== groupId));
    if (editingGroupId === groupId) {
      resetForm();
    }
    if (toast.success) toast.success('Labour Details group deleted');
  };

  // Supplier Dropdown Handler
  const handleSelectSupplier = (e) => {
    const sid = e.target.value;
    if (sid === 'new') {
      setShowNewSupplier(true);
      setSelectedSupplierId('new');
      return;
    }
    setShowNewSupplier(false);
    setSelectedSupplierId(sid);
    if (!sid) {
      setCurrentSupplierDetails({
        supplier_name: '',
        phone: '',
        village: '',
        phonepe: '',
        bank_account: '',
        bank_holder: '',
        bank_ifsc: '',
      });
      return;
    }
    const s = suppliersList.find((x) => x.id === sid);
    if (s) {
      setCurrentSupplierDetails({
        supplier_name: s.name || '',
        phone: s.phone || '',
        village: s.address || s.village || '',
        phonepe: s.phonepe || '',
        bank_account: s.bank_account || '',
        bank_holder: s.bank_holder || '',
        bank_ifsc: s.bank_ifsc || '',
      });
    }
  };

  const handleSaveNewSupplier = async () => {
    if (!newSupplier.name.trim()) return;
    setIsSavingSupplier(true);
    try {
      const payload = {
        site_id: siteId,
        name: newSupplier.name.trim(),
        phone: newSupplier.phone,
        address: newSupplier.village,
        village: newSupplier.village,
        phonepe: newSupplier.phonepe,
        bank_account: newSupplier.bank_account,
        bank_holder: newSupplier.bank_holder,
        bank_ifsc: newSupplier.bank_ifsc,
      };
      const { data, error } = await supabase
        .from(TABLES.labourSuppliers)
        .insert(payload)
        .select();
      if (error) throw error;
      const saved = Array.isArray(data) ? data[0] : data;
      const savedDetails = {
        supplier_name: newSupplier.name,
        phone: newSupplier.phone,
        village: newSupplier.village,
        phonepe: newSupplier.phonepe,
        bank_account: newSupplier.bank_account,
        bank_holder: newSupplier.bank_holder,
        bank_ifsc: newSupplier.bank_ifsc,
      };
      setCurrentSupplierDetails(savedDetails);
      await loadSuppliers();
      setSelectedSupplierId(saved?.id || 'new_applied');
      setShowNewSupplier(false);
      setNewSupplier({ name: '', phone: '', village: '', phonepe: '', bank_account: '', bank_holder: '', bank_ifsc: '' });
      if (toast.success) toast.success(`Supplier "${newSupplier.name}" saved!`);
    } catch (err) {
      console.error('Failed to save supplier:', err);
      setCurrentSupplierDetails({
        supplier_name: newSupplier.name,
        phone: newSupplier.phone,
        village: newSupplier.village,
        phonepe: newSupplier.phonepe,
        bank_account: newSupplier.bank_account,
        bank_holder: newSupplier.bank_holder,
        bank_ifsc: newSupplier.bank_ifsc,
      });
      setShowNewSupplier(false);
    } finally {
      setIsSavingSupplier(false);
    }
  };

  const updateWorkerRow = (id, field, val) => {
    setWorkerRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  };

  const addWorkerRow = () => {
    setWorkerRows((prev) => [...prev, { id: Date.now(), batch: '', quantity: '', amount: '' }]);
  };

  const removeWorkerRow = (id) => {
    if (workerRows.length <= 1) return;
    setWorkerRows((prev) => prev.filter((r) => r.id !== id));
  };

  const rowTotal = (row) => (Number(row.quantity) || 0) * (Number(row.amount) || 0);
  const formGrandTotal = workerRows.reduce((sum, r) => sum + rowTotal(r), 0);

  // Submit / Save Group Handler
  const handleSaveGroup = async () => {
    if (selectedTankIds.length === 0) {
      if (toast.error) toast.error('Please select at least one tank for this Labour Details group');
      return;
    }

    const selectedTanksObj = harvestedTanks.filter((t) => selectedTankIds.includes(t.id));
    const selectedTankNames = selectedTanksObj.map((t) => t.name);

    const groupPayload = {
      id: editingGroupId || `lg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      site_id: siteId,
      tank_ids: selectedTankIds,
      tank_names: selectedTankNames,
      labour_supplier_id: selectedSupplierId,
      supplier_name: currentSupplierDetails.supplier_name || 'Outside Workers Crew',
      phone: currentSupplierDetails.phone || '',
      village: currentSupplierDetails.village || '',
      phonepe: currentSupplierDetails.phonepe || '',
      bank_account: currentSupplierDetails.bank_account || '',
      bank_holder: currentSupplierDetails.bank_holder || '',
      bank_ifsc: currentSupplierDetails.bank_ifsc || '',
      worker_rows: workerRows,
      remarks: remarks,
      mestri_signature: mestriSignature,
      total_amount: formGrandTotal,
      updated_at: new Date().toISOString(),
    };

    setLabourGroups((prev) => {
      if (editingGroupId) {
        return prev.map((g) => (g.id === editingGroupId ? groupPayload : g));
      }
      return [...prev, groupPayload];
    });

    // Also persist to Supabase if possible
    try {
      await supabase.from(TABLES.labourGroups).upsert(groupPayload);
    } catch (err) {
      console.warn('Failed to upsert to Supabase labour_groups:', err);
    }

    if (toast.success) toast.success(`Labour Details saved for Tanks: ${selectedTankNames.join(', ')}`);
    resetForm();
  };

  return (
    <div className="space-y-6">
      {/* SECTION 1: Dynamic Harvested Tanks Bar at Top */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>🌾</span>
              <span>Harvested Tanks — Labour Group Assignment</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select multiple tanks harvested by the same Outside Workers crew to enter their details only once.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unassignedTanks.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllUnassigned}
                className="text-xs font-extrabold text-blue-700 hover:text-blue-900 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition"
              >
                Select All Unassigned ({unassignedTanks.length})
              </button>
            )}
            {selectedTankIds.length > 0 && (
              <button
                type="button"
                onClick={handleClearTankSelection}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-2 py-1 rounded-lg transition"
              >
                Clear Selection
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Tank Chips */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {harvestedTanks.map((t) => {
            const isSelected = selectedTankIds.includes(t.id);
            const assignedInfo = tankToGroupMap[t.id];
            const isAssigned = !!assignedInfo && assignedInfo.group.id !== editingGroupId;

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleToggleTank(t.id)}
                className={`relative px-4 py-2.5 rounded-xl border-2 font-black text-sm transition flex items-center gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-[1.02]'
                    : isAssigned
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:border-emerald-500'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-400 hover:bg-white'
                }`}
              >
                <span>{t.name}</span>
                {isSelected && <span className="text-xs">✓</span>}
                {isAssigned && !isSelected && (
                  <span className="text-[10px] bg-emerald-200 text-emerald-900 font-extrabold px-1.5 py-0.5 rounded-md">
                    Group {assignedInfo.groupIndex}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Selection Banner */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex items-center justify-between text-xs">
          <div>
            <span className="font-extrabold text-slate-700">Currently Selected: </span>
            {selectedTankIds.length > 0 ? (
              <span className="font-black text-blue-700">
                {harvestedTanks
                  .filter((t) => selectedTankIds.includes(t.id))
                  .map((t) => t.name)
                  .join(', ')}
              </span>
            ) : (
              <span className="text-slate-400 font-medium italic">No tanks selected. Click tank chips above to start.</span>
            )}
          </div>
          {editingGroupId && (
            <span className="text-[11px] font-extrabold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md">
              ✏️ Editing Group
            </span>
          )}
        </div>
      </div>

      {/* SECTION 2: Saved Labour Details Groups List */}
      {labourGroups.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              📋 Saved Labour Details Groups ({labourGroups.length})
            </h3>
            <p className="text-xs text-slate-500">
              Total Labour Cost: <span className="font-black text-emerald-700">₹{labourGroups.reduce((sum, g) => sum + (g.total_amount || 0), 0).toLocaleString('en-IN')}</span>
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {labourGroups.map((group, idx) => (
              <div
                key={group.id}
                className={`rounded-2xl p-5 border-2 transition space-y-4 ${
                  editingGroupId === group.id
                    ? 'bg-amber-50/70 border-amber-400 shadow-md'
                    : 'bg-white border-slate-200 shadow-card hover:border-slate-300'
                }`}
              >
                {/* Group Card Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-slate-900 text-white font-black text-xs flex items-center justify-center">
                      G{idx + 1}
                    </span>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                        <span>Tanks:</span>
                        <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                          {group.tank_names?.join(', ') || 'Selected Tanks'}
                        </span>
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Supplier: <span className="font-bold text-slate-800">{group.supplier_name || 'Outside Workers'}</span>
                        {group.phone && <span> · {group.phone}</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <span className="text-sm font-black text-emerald-700 font-mono">
                      ₹{(group.total_amount || 0).toLocaleString('en-IN')}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleEditGroup(group)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-xs font-black transition flex items-center gap-1"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteGroup(group.id)}
                      className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-600 hover:text-white text-red-600 text-xs font-black transition flex items-center gap-1"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>

                {/* Worker Details Summary Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/50">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-700 font-extrabold border-b border-slate-200">
                        <th className="p-2.5">Harvest Batch</th>
                        <th className="p-2.5 text-center">Quantity</th>
                        <th className="p-2.5 text-right">Amount (₹ each)</th>
                        <th className="p-2.5 text-right">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60">
                      {(group.worker_rows || [])
                        .filter((r) => (Number(r.quantity) || 0) * (Number(r.amount) || 0) > 0 || r.batch)
                        .map((r, rIdx) => {
                          const tot = (Number(r.quantity) || 0) * (Number(r.amount) || 0);
                          return (
                            <tr key={r.id || rIdx} className="hover:bg-white transition">
                              <td className="p-2.5 font-bold text-slate-800 capitalize">{r.batch || 'Worker Batch'}</td>
                              <td className="p-2.5 text-center font-mono text-slate-700">{r.quantity || '-'}</td>
                              <td className="p-2.5 text-right font-mono text-slate-700">
                                {r.amount ? `₹${Number(r.amount).toLocaleString('en-IN')}` : '-'}
                              </td>
                              <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                                ₹{tot.toLocaleString('en-IN')}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                {/* Remarks & Mestri Signature Thumbnail */}
                {(group.remarks || group.mestri_signature) && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs pt-1 border-t border-slate-100">
                    {group.remarks && (
                      <p className="text-slate-600">
                        <span className="font-bold text-slate-800">Remarks:</span> {group.remarks}
                      </p>
                    )}
                    {group.mestri_signature && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-500">Mestri Signature:</span>
                        <img
                          src={group.mestri_signature}
                          alt="Mestri Signature"
                          className="h-7 border border-slate-300 rounded bg-white px-1 object-contain"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 3: Complete Existing Labour Details Form */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            👷 Valamanushulu / Outside Workers Details Form
          </h3>
          {selectedTankIds.length > 0 ? (
            <span className="text-xs font-black text-blue-700 bg-blue-50 px-3 py-1 rounded-xl border border-blue-200">
              Selected: {harvestedTanks.filter((t) => selectedTankIds.includes(t.id)).map((t) => t.name).join(', ')}
            </span>
          ) : (
            <span className="text-xs font-bold text-slate-400 italic">Select tanks at top to enable submit</span>
          )}
        </div>

        {/* Labour Supplier Selection */}
        <div className="space-y-4">
          <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">1. Labour Supplier</h4>

          {/* Supplier Name Dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Supplier Name</label>
            <select
              value={selectedSupplierId}
              onChange={handleSelectSupplier}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
            >
              <option value="">-- Select Supplier --</option>
              {suppliersList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.phone})
                </option>
              ))}
              <option value="new">➕ New Supplier</option>
            </select>
          </div>

          {/* Selected Supplier Details Card */}
          {selectedSupplierId && selectedSupplierId !== 'new' && currentSupplierDetails.supplier_name && (
            <div className="rounded-xl p-4 bg-emerald-50 border border-emerald-200 space-y-2">
              <h4 className="text-xs font-extrabold text-emerald-900 flex items-center gap-1">
                ✅ Selected Supplier Details
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs text-emerald-800">
                <p><span className="font-bold">Name:</span> {currentSupplierDetails.supplier_name}</p>
                <p><span className="font-bold">Phone:</span> {currentSupplierDetails.phone}</p>
                {currentSupplierDetails.village && (
                  <p><span className="font-bold">Village:</span> {currentSupplierDetails.village}</p>
                )}
                {currentSupplierDetails.phonepe && (
                  <p><span className="font-bold">PhonePe:</span> {currentSupplierDetails.phonepe}</p>
                )}
                {currentSupplierDetails.bank_account && (
                  <p><span className="font-bold">Bank A/C:</span> {currentSupplierDetails.bank_account}</p>
                )}
                {currentSupplierDetails.bank_holder && (
                  <p><span className="font-bold">A/C Holder:</span> {currentSupplierDetails.bank_holder}</p>
                )}
                {currentSupplierDetails.bank_ifsc && (
                  <p><span className="font-bold">IFSC:</span> {currentSupplierDetails.bank_ifsc}</p>
                )}
              </div>
            </div>
          )}

          {/* New Supplier Form */}
          {showNewSupplier && (
            <div className="rounded-xl p-4 bg-blue-50 border border-blue-200 space-y-3">
              <h4 className="text-xs font-extrabold text-blue-900">New Supplier Details</h4>

              {[
                { key: 'name', label: '1. Name (Supplier)', placeholder: 'e.g. Raju Labour Crew', type: 'text' },
                { key: 'phone', label: '2. Phone No. (Supplier)', placeholder: '+91 91234 56789', type: 'tel' },
                { key: 'village', label: '3. Village Name', placeholder: 'e.g. Narsapur', type: 'text' },
                { key: 'phonepe', label: '4. PhonePe No.', placeholder: '+91 91234 56789', type: 'tel' },
                { key: 'bank_account', label: '5. Bank Account Number', placeholder: 'e.g. 01234567890', type: 'text' },
                { key: 'bank_holder', label: '6. Bank Account Holder Name', placeholder: 'e.g. Raju', type: 'text' },
                { key: 'bank_ifsc', label: '7. Bank IFSC Code', placeholder: 'e.g. SBIN0001234', type: 'text' },
              ].map((field) => (
                <div key={field.key} className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">{field.label}</label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={newSupplier[field.key] || ''}
                    onChange={(e) =>
                      setNewSupplier((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              ))}

              <button
                type="button"
                disabled={!newSupplier.name.trim() || isSavingSupplier}
                onClick={handleSaveNewSupplier}
                className="btn-primary text-xs w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingSupplier ? '⏳ Saving...' : '✓ Save & Apply Supplier'}
              </button>
            </div>
          )}
        </div>

        {/* Worker Categories & Wages Table */}
        <div className="space-y-4 border-t border-slate-100 pt-5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">2. Worker Categories & Wages</h4>
            <button
              type="button"
              onClick={addWorkerRow}
              className="btn-secondary text-xs font-bold flex items-center gap-1"
            >
              ➕ Add Row
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 font-extrabold border-b border-slate-200">
                  <th className="p-3 w-14 text-center">S.No</th>
                  <th className="p-3">Harvest Batch</th>
                  <th className="p-3 w-32">Quantity</th>
                  <th className="p-3 w-36">Amount (₹ each)</th>
                  <th className="p-3 text-right w-36">Total Amount (₹)</th>
                  <th className="p-3 w-12 text-center">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workerRows.map((row, idx) => {
                  const total = rowTotal(row);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/60 transition">
                      <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="p-3">
                        <input
                          type="text"
                          placeholder="Batch name"
                          value={row.batch}
                          onChange={(e) => updateWorkerRow(row.id, 'batch', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          placeholder="0"
                          value={row.quantity}
                          onChange={(e) => updateWorkerRow(row.id, 'quantity', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="p-3">
                        <div className="relative">
                          <span className="absolute left-2.5 top-2 text-slate-400 font-bold text-xs">₹</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={row.amount}
                            onChange={(e) => updateWorkerRow(row.id, 'amount', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-7 pr-2 py-1.5 font-mono text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                      </td>
                      <td className="p-3 text-right font-extrabold font-mono text-slate-900 text-sm">
                        ₹{total.toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeWorkerRow(row.id)}
                          disabled={workerRows.length <= 1}
                          className="text-slate-400 hover:text-red-500 disabled:opacity-30 text-sm"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white font-extrabold border-t-2 border-slate-900">
                  <td colSpan={4} className="p-3 text-right uppercase tracking-wider text-[11px]">
                    Group Total
                  </td>
                  <td className="p-3 text-right font-mono text-base text-emerald-400">
                    ₹{formGrandTotal.toLocaleString('en-IN')}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Remarks & Mestri Signature */}
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5 pb-4 border-b border-slate-100">
              <label className="text-xs font-bold text-slate-700 block">3. Remarks (Optional)</label>
              <textarea
                rows={2}
                placeholder="Enter any remarks about labour payment (optional)..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-700">4. Mestri Signature</p>
              <DigitalSignaturePad
                label="Mestri Digital Signature"
                value={mestriSignature}
                onChange={(sig) => setMestriSignature(sig)}
              />
            </div>
          </div>
        </div>

        {/* Form Group Submit Action Button */}
        <div className="pt-3 border-t border-slate-200">
          <button
            type="button"
            disabled={selectedTankIds.length === 0}
            onClick={handleSaveGroup}
            className={`w-full py-3.5 rounded-xl font-extrabold text-sm transition shadow-sm flex items-center justify-center gap-2 ${
              selectedTankIds.length > 0
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <span>{editingGroupId ? '✓ Update Labour Details for Group' : '💾 Submit & Save Labour Details for Selected Tanks'}</span>
            {selectedTankIds.length > 0 && (
              <span className="bg-emerald-800 text-white text-xs px-2 py-0.5 rounded-md">
                ({harvestedTanks.filter((t) => selectedTankIds.includes(t.id)).map((t) => t.name).join(', ')})
              </span>
            )}
          </button>
        </div>
      </div>

      {/* SECTION 4: Navigation Bar */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-200 gap-3">
        <button
          type="button"
          onClick={onBack}
          className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-extrabold transition"
        >
          ← Back to Grader Details
        </button>

        <button
          type="button"
          onClick={onProceed}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold transition shadow-sm flex items-center gap-1.5"
        >
          <span>Proceed to Reviews & Payments →</span>
          {labourGroups.length > 0 && (
            <span className="bg-blue-800 text-white text-[10px] px-1.5 py-0.5 rounded-md">
              ({labourGroups.length} group{labourGroups.length > 1 ? 's' : ''})
            </span>
          )}
        </button>
      </div>
    </div>
  );
}