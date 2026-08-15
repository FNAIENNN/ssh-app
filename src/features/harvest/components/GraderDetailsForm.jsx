import { useState, useEffect } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';

/**
 * GraderDetailsForm — Step 5: Grader / Transport Contractor & Buyer details.
 */
export default function GraderDetailsForm({ graderData, setGraderData, siteId, onProceed, onBack }) {
  const [gradersList, setGradersList] = useState([]);
  const [selectedGraderId, setSelectedGraderId] = useState('');

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      const { data } = await supabase
        .from(TABLES.graders)
        .select('*')
        .eq('site_id', siteId);
      setGradersList(data || []);
    })();
  }, [siteId]);

  const handleSelectGrader = (e) => {
    const gid = e.target.value;
    setSelectedGraderId(gid);
    if (!gid) return;
    const g = gradersList.find((x) => x.id === gid);
    if (g) {
      setGraderData((prev) => ({
        ...prev,
        grader_id: g.id,
        name: g.name || '',
        phone: g.phone || '',
        vehicle_no: g.vehicle_no || '',
        upi_id: g.upi_id || '',
        bank_account: g.bank_account || '',
        driver_bata: g.default_driver_bata || prev.driver_bata || 500,
        packing_bata: g.default_packing_bata || prev.packing_bata || 1200,
      }));
    }
  };

  const updateField = (field, val) => {
    setGraderData((prev) => ({ ...prev, [field]: val }));
  };

  const totalGraderExpense =
    (Number(graderData.driver_bata) || 0) +
    (Number(graderData.packing_bata) || 0) +
    (Number(graderData.extra_payment) || 0);

  return (
    <div className="space-y-6">
      {/* Buyer & Factory Information */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          🏢 Buyer & Factory Destination
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Buyer Name *</label>
            <input
              type="text"
              placeholder="e.g. Choice Trading Co."
              value={graderData.buyer_name || ''}
              onChange={(e) => updateField('buyer_name', e.target.value)}
              className="field"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Processing Factory *</label>
            <input
              type="text"
              placeholder="e.g. Apex Frozen Foods, Kakinada"
              value={graderData.factory_name || ''}
              onChange={(e) => updateField('factory_name', e.target.value)}
              className="field"
            />
          </div>
        </div>
      </div>

      {/* Grader / Transport Contractor Form */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            🚚 Grader & Vehicle Details
          </h3>

          {gradersList.length > 0 && (
            <select
              value={selectedGraderId}
              onChange={handleSelectGrader}
              className="text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 rounded-lg px-3 py-1.5"
            >
              <option value="">-- Select Registered Grader --</option>
              {gradersList.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.vehicle_no})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Grader / Contractor Name</label>
            <input
              type="text"
              placeholder="e.g. Sri Venkateswara Logistics"
              value={graderData.name || ''}
              onChange={(e) => updateField('name', e.target.value)}
              className="field"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Phone Number</label>
            <input
              type="text"
              placeholder="+91 98480 12345"
              value={graderData.phone || ''}
              onChange={(e) => updateField('phone', e.target.value)}
              className="field"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Vehicle Number</label>
            <input
              type="text"
              placeholder="AP 37 AB 5678"
              value={graderData.vehicle_no || ''}
              onChange={(e) => updateField('vehicle_no', e.target.value)}
              className="field font-mono font-bold"
            />
          </div>
        </div>

        {/* Financial & Batas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Driver Bata (₹)</label>
            <input
              type="number"
              placeholder="500"
              value={graderData.driver_bata || ''}
              onChange={(e) => updateField('driver_bata', e.target.value)}
              className="field font-mono font-bold"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Packing Boys Bata (₹)</label>
            <input
              type="number"
              placeholder="1200"
              value={graderData.packing_bata || ''}
              onChange={(e) => updateField('packing_bata', e.target.value)}
              className="field font-mono font-bold"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Extra Transport Payment (₹)</label>
            <input
              type="number"
              placeholder="0"
              value={graderData.extra_payment || ''}
              onChange={(e) => updateField('extra_payment', e.target.value)}
              className="field font-mono font-bold"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">UPI / PhonePe ID</label>
            <input
              type="text"
              placeholder="grader@upi"
              value={graderData.upi_id || ''}
              onChange={(e) => updateField('upi_id', e.target.value)}
              className="field"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Bank Account / Remarks</label>
            <input
              type="text"
              placeholder="HDFC - 9988776655"
              value={graderData.bank_account || ''}
              onChange={(e) => updateField('bank_account', e.target.value)}
              className="field"
            />
          </div>
        </div>

        <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-between border border-slate-200">
          <span className="text-xs font-bold text-slate-600">Total Grader & Vehicle Allowance:</span>
          <span className="text-base font-black font-mono text-blue-900">
            ₹{totalGraderExpense.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button type="button" onClick={onBack} className="btn-secondary">
          ← Back to Count Entry
        </button>

        <button
          type="button"
          disabled={!graderData.buyer_name || !graderData.factory_name}
          onClick={onProceed}
          className={`btn ${
            graderData.buyer_name && graderData.factory_name
              ? 'btn-primary'
              : 'opacity-50 cursor-not-allowed'
          }`}
        >
          Proceed to Labour Details →
        </button>
      </div>
    </div>
  );
}
