import { useState } from 'react';

/**
 * BillingPage — Step 3 of Middle Harvest Wizard.
 * Captures billing information: supervisor, farmer, buying company, grader, net weight.
 * The net weight field is shared back to the weighment table.
 */
export default function BillingPage({ billingData, setBillingData, onProceed, onBack }) {
  const fields = [
    { key: 'harvest_supervisor', label: 'Harvest Supervisor', placeholder: 'e.g. Ramu Babu', type: 'text', icon: '👨‍💼' },
    { key: 'supervisor_phone', label: 'Phone Number (Supervisor)', placeholder: '+91 98480 12345', type: 'tel', icon: '📱' },
    { key: 'farmer_name', label: 'Farmer Name', placeholder: 'e.g. Krishna Rao', type: 'text', icon: '👨‍🌾' },
    { key: 'farm_name', label: 'Farm Name (Site Name)', placeholder: 'e.g. Sri Venkateswara Aqua Farm', type: 'text', icon: '🏡' },
    { key: 'farmer_phone', label: 'Phone Number (Farmer)', placeholder: '+91 91234 56789', type: 'tel', icon: '📞' },
    { key: 'buying_company', label: 'Buying Company Name', placeholder: 'e.g. Apex Frozen Foods Pvt Ltd', type: 'text', icon: '🏢' },
    { key: 'grader_name', label: 'Grader Name', placeholder: 'e.g. Sri Venkateswara Logistics', type: 'text', icon: '🚚' },
    { key: 'grader_phone', label: 'Phone Number (Grader)', placeholder: '+91 94400 12345', type: 'tel', icon: '📲' },
  ];

  const updateField = (key, val) => {
    setBillingData((prev) => ({ ...prev, [key]: val }));
  };

  const isComplete = fields.every((f) => billingData[f.key]?.trim());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl p-5 bg-gradient-to-r from-blue-900 via-slate-900 to-slate-900 text-white shadow-xl">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400 block mb-1">
          HARVEST BILLING DETAILS
        </span>
        <h3 className="text-lg font-black text-white">Billing Page</h3>
        <p className="text-xs text-slate-300 mt-1">
          Fill in all billing details. These will appear on the final harvest bill.
        </p>
      </div>

      {/* Fields — One by One */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <h3 className="text-base font-extrabold text-slate-900">Billing Information</h3>

        <div className="space-y-4">
          {fields.map((field, idx) => (
            <div key={field.key} className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <span>{field.icon}</span>
                <span>{idx + 1}. {field.label}</span>
                <span className="text-red-500">*</span>
              </label>
              <input
                type={field.type}
                placeholder={field.placeholder}
                step={field.type === 'number' ? '0.01' : undefined}
                value={billingData[field.key] || ''}
                onChange={(e) => updateField(field.key, e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none transition"
              />
              {/* Separator between fields */}
              {idx < fields.length - 1 && (
                <div className="border-b border-slate-100 pt-1" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Summary Preview */}
      {billingData.farm_name && (
        <div className="rounded-2xl p-4 bg-blue-50 border border-blue-200 space-y-2">
          <h4 className="text-xs font-extrabold text-blue-900 uppercase tracking-wide">
            📋 Bill Preview Summary
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {fields.map((f) =>
              billingData[f.key] ? (
                <div key={f.key} className="flex items-center gap-1.5">
                  <span className="text-slate-500">{f.icon}</span>
                  <div>
                    <span className="text-slate-500 block">{f.label}</span>
                    <span className="font-bold text-slate-900">
                      {f.key === 'net_weight'
                        ? `${billingData[f.key]} kg/net`
                        : billingData[f.key]}
                    </span>
                  </div>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button type="button" onClick={onBack} className="btn-secondary">
          ← Back to Checklist
        </button>
        <button
          type="button"
          onClick={onProceed}
          disabled={!isComplete}
          className={`btn ${isComplete ? 'btn-primary' : 'opacity-50 cursor-not-allowed'}`}
        >
          Proceed to Weight Entry →
        </button>
      </div>
    </div>
  );
}
