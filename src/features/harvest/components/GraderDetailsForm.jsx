import { useState, useRef, useEffect } from 'react';
import DigitalSignaturePad from '../../../components/ui/DigitalSignaturePad';

/**
 * GraderDetailsForm — Step 6: Grader & Vehicle details table + line-by-line options.
 * Replaces old form with:
 *   - "Grader & vehicle details" table (Type: Grader / Boys / Driver, no. of persons, Amount, Total)
 *   - Line-by-line options: Extra Amount, Remarks, Phone, PhonePe, Vehicle No, Grader Signature
 */
export default function GraderDetailsForm({ graderData, setGraderData, billingData = {}, siteId, onProceed, onBack }) {
  const [graderSignature, setGraderSignature] = useState('');

  // Auto-populate buyer company name from billing page
  useEffect(() => {
    if (billingData?.buying_company && !graderData.buyer_name) {
      updateField('buyer_name', billingData.buying_company);
    }
  }, [billingData?.buying_company]);

  // Grader table rows: Grader, Boys, Driver
  const GRADER_TYPES = ['Grader', 'Boys', 'Driver'];

  const updateField = (field, val) => {
    setGraderData((prev) => ({ ...prev, [field]: val }));
  };

  const updateGraderRow = (type, field, val) => {
    setGraderData((prev) => {
      const rows = prev.grader_rows || {
        Grader: { persons: '', amount: '' },
        Boys: { persons: '', amount: '' },
        Driver: { persons: '', amount: '' },
      };
      return {
        ...prev,
        grader_rows: {
          ...rows,
          [type]: { ...rows[type], [field]: val },
        },
      };
    });
  };

  const graderRows = graderData.grader_rows || {
    Grader: { persons: '', amount: '' },
    Boys: { persons: '', amount: '' },
    Driver: { persons: '', amount: '' },
  };

  const rowTotal = (type) => {
    const row = graderRows[type] || {};
    return (Number(row.persons) || 0) * (Number(row.amount) || 0);
  };

  const tableGrandTotal =
    GRADER_TYPES.reduce((sum, type) => sum + rowTotal(type), 0) +
    (Number(graderData.extra_amount) || 0);

  const canProceed = !!graderData.buyer_name;

  return (
    <div className="space-y-6">
      {/* Buyer & Factory Information */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          🏢 Buyer Company Name
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

      {/* Grader & Vehicle Details Table */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          🚚 Grader & Vehicle Details
        </h3>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-extrabold border-b border-slate-200">
                <th className="p-3">Type</th>
                <th className="p-3 w-36">No. of Persons</th>
                <th className="p-3 w-40">Amount (per person ₹)</th>
                <th className="p-3 text-right w-36">Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {GRADER_TYPES.map((type) => {
                const row = graderRows[type] || { persons: '', amount: '' };
                const total = rowTotal(type);
                return (
                  <tr key={type} className="hover:bg-slate-50/60 transition">
                    <td className="p-3">
                      <span className="font-bold text-slate-900">{type}</span>
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        placeholder="0"
                        value={row.persons}
                        onChange={(e) => updateGraderRow(type, 'persons', e.target.value)}
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
                          onChange={(e) => updateGraderRow(type, 'amount', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-7 pr-2 py-1.5 font-mono text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </td>
                    <td className="p-3 text-right font-extrabold font-mono text-slate-900 text-sm">
                      ₹{total.toLocaleString('en-IN')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-extrabold border-t-2 border-slate-900">
                <td colSpan={3} className="p-3 text-right uppercase tracking-wider text-[11px]">
                  Grand Total
                </td>
                <td className="p-3 text-right font-mono text-base text-emerald-400">
                  ₹{tableGrandTotal.toLocaleString('en-IN')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Line-by-line options below the table */}
        <div className="space-y-4 pt-2">
          {/* Extra Amount */}
          <div className="space-y-1.5 pb-3 border-b border-slate-100">
            <label className="text-xs font-bold text-slate-700 block">1. Extra Amount (₹)</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-bold">₹</span>
              <input
                type="number"
                placeholder="0"
                value={graderData.extra_amount || ''}
                onChange={(e) => updateField('extra_amount', e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-3 py-2.5 font-mono text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Remarks */}
          <div className="space-y-1.5 pb-3 border-b border-slate-100">
            <label className="text-xs font-bold text-slate-700 block">2. Remarks (Reason for Extra Amount)</label>
            <textarea
              rows={2}
              placeholder="Enter reason for extra amount..."
              value={graderData.remarks || ''}
              onChange={(e) => updateField('remarks', e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none resize-none"
            />
          </div>

          {/* Phone Number (grader) */}
          <div className="space-y-1.5 pb-3 border-b border-slate-100">
            <label className="text-xs font-bold text-slate-700 block">3. PhonePe Number (Grader)</label>
            <input
              type="tel"
              placeholder="+91 98480 12345"
              value={graderData.phone || ''}
              onChange={(e) => updateField('phone', e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
            />
          </div>

          {/* PhonePe Number (grader) */}
          <div className="space-y-1.5 pb-3 border-b border-slate-100">
            <label className="text-xs font-bold text-slate-700 block">4. PhonePe Number (Grader Extra Amount)</label>
            <input
              type="tel"
              placeholder="+91 98480 12345"
              value={graderData.upi_id || ''}
              onChange={(e) => updateField('upi_id', e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
            />
          </div>

          {/* Vehicle Number */}
          <div className="space-y-1.5 pb-3 border-b border-slate-100">
            <label className="text-xs font-bold text-slate-700 block">5. Vehicle Number</label>
            <input
              type="text"
              placeholder="AP 37 AB 5678"
              value={graderData.vehicle_no || ''}
              onChange={(e) => updateField('vehicle_no', e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none uppercase"
            />
          </div>

          {/* Grader Signature */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-slate-700">6. Grader Signature</p>
            <DigitalSignaturePad
              label="Grader Digital Signature"
              value={graderSignature}
              onChange={(sig) => {
                setGraderSignature(sig);
                updateField('grader_signature', sig);
              }}
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button type="button" onClick={onBack} className="btn-secondary">
          ← Back to Count & Price
        </button>

        <button
          type="button"
          disabled={!canProceed}
          onClick={onProceed}
          className={`btn ${canProceed ? 'btn-primary' : 'opacity-50 cursor-not-allowed'}`}
        >
          Proceed to Labour Details →
        </button>
      </div>
    </div>
  );
}
