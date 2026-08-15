import { useState, useEffect } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';

/**
 * LabourDetailsForm — Step 6: Labour supplier & team wage breakdown.
 */
export default function LabourDetailsForm({ labourData, setLabourData, siteId, onProceed, onBack }) {
  const [suppliersList, setSuppliersList] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      const { data } = await supabase
        .from(TABLES.labourSuppliers)
        .select('*')
        .eq('site_id', siteId);
      setSuppliersList(data || []);
    })();
  }, [siteId]);

  const handleSelectSupplier = (e) => {
    const sid = e.target.value;
    setSelectedSupplierId(sid);
    if (!sid) return;
    const s = suppliersList.find((x) => x.id === sid);
    if (s) {
      setLabourData((prev) => ({
        ...prev,
        labour_supplier_id: s.id,
        supplier_name: s.name || '',
        phone: s.phone || '',
      }));
    }
  };

  const updateField = (field, val) => {
    setLabourData((prev) => ({ ...prev, [field]: val }));
  };

  const mainTotal = (Number(labourData.main_workers) || 0) * (Number(labourData.main_rate) || 0);
  const guntuTotal = (Number(labourData.guntu_workers) || 0) * (Number(labourData.guntu_rate) || 0);
  const chethiTotal = (Number(labourData.chethi_workers) || 0) * (Number(labourData.chethi_rate) || 0);
  const grandLabourTotal = mainTotal + guntuTotal + chethiTotal;

  return (
    <div className="space-y-6">
      {/* Labour Supplier Selection */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            👷 Labour Contractor & Supplier
          </h3>

          {suppliersList.length > 0 && (
            <select
              value={selectedSupplierId}
              onChange={handleSelectSupplier}
              className="text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg px-3 py-1.5"
            >
              <option value="">-- Select Registered Supplier --</option>
              {suppliersList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.phone})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Supplier / Team Name</label>
            <input
              type="text"
              placeholder="e.g. Raju Labour Crew"
              value={labourData.supplier_name || ''}
              onChange={(e) => updateField('supplier_name', e.target.value)}
              className="field"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Contact Phone</label>
            <input
              type="text"
              placeholder="+91 91234 56789"
              value={labourData.phone || ''}
              onChange={(e) => updateField('phone', e.target.value)}
              className="field"
            />
          </div>
        </div>
      </div>

      {/* Workers Wage Breakdown Table */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <h3 className="text-base font-extrabold text-slate-900">Worker Categories & Wages</h3>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-extrabold border-b border-slate-200">
                <th className="p-3">Category</th>
                <th className="p-3 w-32">Worker Count</th>
                <th className="p-3 w-36">Per Head Rate (₹)</th>
                <th className="p-3 text-right">Subtotal (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {/* Main Workers */}
              <tr>
                <td className="p-3 font-bold">
                  Main Harvest Workers
                  <span className="text-[10px] text-slate-400 block font-normal">Primary net drag and tub loading team</span>
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    value={labourData.main_workers}
                    onChange={(e) => updateField('main_workers', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-sm font-bold text-slate-900"
                  />
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    value={labourData.main_rate}
                    onChange={(e) => updateField('main_rate', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-sm font-bold text-slate-900"
                  />
                </td>
                <td className="p-3 text-right font-bold font-mono text-slate-900 text-sm">
                  ₹{mainTotal.toLocaleString('en-IN')}
                </td>
              </tr>

              {/* Guntu Workers */}
              <tr>
                <td className="p-3 font-bold">
                  Guntu Workers
                  <span className="text-[10px] text-slate-400 block font-normal">Heavy lifting and basket shifting team</span>
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    value={labourData.guntu_workers}
                    onChange={(e) => updateField('guntu_workers', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-sm font-bold text-slate-900"
                  />
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    value={labourData.guntu_rate}
                    onChange={(e) => updateField('guntu_rate', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-sm font-bold text-slate-900"
                  />
                </td>
                <td className="p-3 text-right font-bold font-mono text-slate-900 text-sm">
                  ₹{guntuTotal.toLocaleString('en-IN')}
                </td>
              </tr>

              {/* Chethi Workers */}
              <tr>
                <td className="p-3 font-bold">
                  Chethi Workers
                  <span className="text-[10px] text-slate-400 block font-normal">Hand collection and sorting team</span>
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    value={labourData.chethi_workers}
                    onChange={(e) => updateField('chethi_workers', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-sm font-bold text-slate-900"
                  />
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    value={labourData.chethi_rate}
                    onChange={(e) => updateField('chethi_rate', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-sm font-bold text-slate-900"
                  />
                </td>
                <td className="p-3 text-right font-bold font-mono text-slate-900 text-sm">
                  ₹{chethiTotal.toLocaleString('en-IN')}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-extrabold border-t-2 border-slate-900">
                <td colSpan="3" className="p-3 text-right uppercase tracking-wider text-[11px]">
                  Total Labour Expense
                </td>
                <td className="p-3 text-right font-mono text-base text-emerald-400">
                  ₹{grandLabourTotal.toLocaleString('en-IN')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button type="button" onClick={onBack} className="btn-secondary">
          ← Back to Grader Details
        </button>

        <button type="button" onClick={onProceed} className="btn-primary">
          Proceed to Summary & Bill →
        </button>
      </div>
    </div>
  );
}
