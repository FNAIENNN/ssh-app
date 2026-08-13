import { useState, useEffect } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import DigitalSignaturePad from '../../../components/ui/DigitalSignaturePad';

/**
 * LabourDetailsForm — Labour supplier dropdown (functional), new supplier form
 * (with Bank IFSC Code), Worker Categories & Wages table, Mestri digital signature.
 */
export default function LabourDetailsForm({ labourData, setLabourData, siteId, onProceed, onBack }) {
  const [suppliersList, setSuppliersList] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState(labourData.labour_supplier_id || '');
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    phone: '',
    village: '',
    phonepe: '',
    bank_account: '',
    bank_holder: '',
    bank_ifsc: '',
  });
  const [mestriSignature, setMestriSignature] = useState(labourData.mestri_signature || '');

  // Worker categories table state
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

  const [workerRows, setWorkerRows] = useState(
    labourData.worker_rows || DEFAULT_BATCHES
  );
  const [remarks, setRemarks] = useState(labourData.remarks || '');

  const loadSuppliers = async () => {
    if (!siteId) return;
    const { data } = await supabase
      .from(TABLES.labourSuppliers)
      .select('*')
      .eq('site_id', siteId)
      .order('name');
    setSuppliersList(data || []);
  };

  useEffect(() => {
    loadSuppliers();
  }, [siteId]);

  // Sync selectedSupplierId back if labourData changes externally
  useEffect(() => {
    if (labourData.labour_supplier_id && labourData.labour_supplier_id !== selectedSupplierId) {
      setSelectedSupplierId(labourData.labour_supplier_id);
    }
  }, [labourData.labour_supplier_id]);

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
      setLabourData((prev) => ({
        ...prev,
        labour_supplier_id: '',
        supplier_name: '',
        phone: '',
        village: '',
        phonepe: '',
        bank_account: '',
        bank_holder: '',
        bank_ifsc: '',
      }));
      return;
    }
    const s = suppliersList.find((x) => x.id === sid);
    if (s) {
      setLabourData((prev) => ({
        ...prev,
        labour_supplier_id: s.id,
        supplier_name: s.name || '',
        phone: s.phone || '',
        village: s.address || s.village || '',
        phonepe: s.phonepe || '',
        bank_account: s.bank_account || '',
        bank_holder: s.bank_holder || '',
        bank_ifsc: s.bank_ifsc || '',
      }));
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
      // Update labourData
      setLabourData((prev) => ({
        ...prev,
        labour_supplier_id: saved?.id || '',
        supplier_name: newSupplier.name,
        phone: newSupplier.phone,
        village: newSupplier.village,
        phonepe: newSupplier.phonepe,
        bank_account: newSupplier.bank_account,
        bank_holder: newSupplier.bank_holder,
        bank_ifsc: newSupplier.bank_ifsc,
      }));
      // Reload dropdown
      await loadSuppliers();
      setSelectedSupplierId(saved?.id || 'new_applied');
      setShowNewSupplier(false);
      setNewSupplier({ name: '', phone: '', village: '', phonepe: '', bank_account: '', bank_holder: '', bank_ifsc: '' });
    } catch (err) {
      console.error('Failed to save supplier:', err);
      // Still apply locally even if save fails
      setLabourData((prev) => ({
        ...prev,
        supplier_name: newSupplier.name,
        phone: newSupplier.phone,
        village: newSupplier.village,
        phonepe: newSupplier.phonepe,
        bank_account: newSupplier.bank_account,
        bank_holder: newSupplier.bank_holder,
        bank_ifsc: newSupplier.bank_ifsc,
      }));
      setShowNewSupplier(false);
    } finally {
      setIsSavingSupplier(false);
    }
  };

  const updateWorkerRow = (id, field, val) => {
    setWorkerRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const addWorkerRow = () => {
    setWorkerRows((prev) => [
      ...prev,
      { id: Date.now(), batch: '', quantity: '', amount: '' },
    ]);
  };

  const removeWorkerRow = (id) => {
    if (workerRows.length <= 1) return;
    setWorkerRows((prev) => prev.filter((r) => r.id !== id));
  };

  const rowTotal = (row) => (Number(row.quantity) || 0) * (Number(row.amount) || 0);
  const grandTotal = workerRows.reduce((sum, r) => sum + rowTotal(r), 0);

  // Sync to labourData when rows/remarks change
  useEffect(() => {
    setLabourData((prev) => ({ ...prev, worker_rows: workerRows, remarks }));
  }, [workerRows, remarks]);

  const selectedSupplierObj = suppliersList.find((s) => s.id === selectedSupplierId);

  return (
    <div className="space-y-6">
      {/* Labour Supplier Selection */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            👷 Labour Supplier
          </h3>
        </div>

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
        {selectedSupplierId && selectedSupplierId !== 'new' && labourData.supplier_name && (
          <div className="rounded-xl p-4 bg-emerald-50 border border-emerald-200 space-y-2">
            <h4 className="text-xs font-extrabold text-emerald-900 flex items-center gap-1">
              ✅ Selected Supplier Details
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs text-emerald-800">
              <p><span className="font-bold">Name:</span> {labourData.supplier_name}</p>
              <p><span className="font-bold">Phone:</span> {labourData.phone}</p>
              {labourData.village && (
                <p><span className="font-bold">Village:</span> {labourData.village}</p>
              )}
              {labourData.phonepe && (
                <p><span className="font-bold">PhonePe:</span> {labourData.phonepe}</p>
              )}
              {labourData.bank_account && (
                <p><span className="font-bold">Bank A/C:</span> {labourData.bank_account}</p>
              )}
              {labourData.bank_holder && (
                <p><span className="font-bold">A/C Holder:</span> {labourData.bank_holder}</p>
              )}
              {labourData.bank_ifsc && (
                <p><span className="font-bold">IFSC:</span> {labourData.bank_ifsc}</p>
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

      {/* Worker Categories & Wages */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900">Worker Categories & Wages</h3>
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
                  Grand Total
                </td>
                <td className="p-3 text-right font-mono text-base text-emerald-400">
                  ₹{grandTotal.toLocaleString('en-IN')}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Remarks & Mestri Signature */}
        <div className="space-y-4 pt-2">
          {/* Remarks (Optional) */}
          <div className="space-y-1.5 pb-4 border-b border-slate-100">
            <label className="text-xs font-bold text-slate-700 block">1. Remarks (Optional)</label>
            <textarea
              rows={2}
              placeholder="Enter any remarks about labour payment (optional)..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none resize-none"
            />
          </div>

          {/* Mestri Signature */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-slate-700">2. Mestri Signature</p>
            <DigitalSignaturePad
              label="Mestri Digital Signature"
              value={mestriSignature}
              onChange={(sig) => {
                setMestriSignature(sig);
                setLabourData((prev) => ({ ...prev, mestri_signature: sig }));
              }}
            />
          </div>
        </div>
      </div>

      {/* Action buttons — compact & proportional */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-200 gap-3">
        <button type="button" onClick={onBack} className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-extrabold transition">
          ← Back to Grader Details
        </button>

        <button type="button" onClick={onProceed} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold transition shadow-sm">
          Proceed to Summary & Bill →
        </button>
      </div>
    </div>
  );
}
