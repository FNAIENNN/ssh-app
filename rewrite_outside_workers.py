import os

filepath = 'src/features/seed/payments/seedStocking/OutsideWorkersStep3.jsx'

with open(filepath, 'r') as f:
    original = f.read()

# We will completely rewrite OutsideWorkersStep3.jsx to handle multiple vehicles
# and include RequestPayment and a Supplier dropdown.
new_code = """import { useState, useMemo, useEffect } from 'react';
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

function SingleVehicleOutsideWorker({ 
  vehicle, 
  activeOrder, 
  siteId, 
  workSource, 
  initialSupervisorName = '', 
  onSave, 
  suppliersList 
}) {
  const toast = useToast();
  
  const [tableData, setTableData] = useState(() =>
    WORKER_ROWS.map((r) => ({ ...r, quantity: '', amount: '' }))
  );
  const [remarks, setRemarks] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supervisorName, setSupervisorName] = useState(initialSupervisorName);
  const [supervisorPhone, setSupervisorPhone] = useState('');
  const [supervisorSignature, setSupervisorSignature] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleRowChange(index, field, value) {
    setTableData((prev) =>
      prev.map((r, idx) => (idx === index ? { ...r, [field]: value } : r))
    );
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

  async function handleSaveData() {
    const hasWorkers = calculatedRows.some((r) => Number(r.quantity) > 0);
    if (!hasWorkers) return toast.error('Enter at least one worker row with a quantity greater than 0');
    if (!selectedSupplierId) return toast.error('Select a Labour Supplier');
    if (!supervisorName.trim()) return toast.error('Enter Supervisor Name');
    if (!supervisorSignature) return toast.error('Provide Supervisor Digital Signature');

    setSubmitting(true);
    try {
      const supplierName = suppliersList.find(s => s.id === selectedSupplierId)?.name || '';
      
      const payload = {
        vehicleId: vehicle.id,
        vehicleNo: vehicle.vehicle_no,
        supplierId: selectedSupplierId,
        supplierName,
        workers: calculatedRows,
        grandTotal,
        remarks,
        supervisorName,
        supervisorPhone,
        supervisorSignature,
        workSource
      };
      await onSave(vehicle.id, payload);
      setSaved(true);
      toast.success(`Worker data saved for Vehicle ${vehicle.vehicle_no || 'Unknown'}`);
    } catch (err) {
      toast.error(err?.message || 'Error saving Outside Workers data');
    }
    setSubmitting(false);
  }

  // Create a supplier selection section to inject into RequestPayment
  const supplierSection = (
    <div className="space-y-3 mb-4">
      <label className="field-label block">👷 Select Labour Supplier *</label>
      <select
        className="field text-sm font-semibold"
        value={selectedSupplierId}
        onChange={(e) => setSelectedSupplierId(e.target.value)}
        disabled={saved}
      >
        <option value="">-- Select Registered Supplier --</option>
        {suppliersList.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} {s.phone ? `(${s.phone})` : ''}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="card p-6 space-y-6 mb-6 shadow-sm border" style={{ borderColor: 'var(--color-primary)' }}>
      {/* Context Header */}
      <div className="bg-slate-50 p-4 rounded-[12px] border">
        <div className="flex justify-between items-start">
          <div>
            <h4 className="font-black text-lg text-primary uppercase">
              Vehicle: {vehicle.vehicle_no || 'Unknown'}
            </h4>
            <p className="text-xs text-text-muted mt-1">
              Driver: {vehicle.driver_name || 'N/A'} | Tank(s): {vehicle.tank_ids?.join(', ') || 'N/A'}
            </p>
          </div>
          <div className="bg-sky-100 text-sky-800 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase">
            Source: {workSource}
          </div>
        </div>
      </div>

      {/* Workers Table */}
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
              <tr key={r.sNo} className="border-b hover:bg-slate-50">
                <td className="p-3 font-bold text-center border-r text-text-muted">{r.sNo}</td>
                <td className="p-3 font-extrabold text-sm text-slate-800">{r.category}</td>
                <td className="p-2">
                  <input
                    type="number"
                    disabled={saved}
                    className="field py-1.5 text-xs font-semibold"
                    placeholder="Qty"
                    value={r.quantity}
                    onChange={(e) => handleRowChange(idx, 'quantity', e.target.value)}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    disabled={saved}
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

      {/* Multiline Remarks */}
      <div>
        <label className="field-label">Work / Worker Remarks</label>
        <textarea
          rows={2}
          disabled={saved}
          className="field text-sm"
          placeholder="Enter remarks or additional notes..."
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
      </div>

      {/* Payment Component */}
      <div className="mt-6 border-t pt-6">
        <h4 className="font-extrabold text-base text-primary mb-4">💳 Worker Payments</h4>
        <RequestPayment 
          type="outside_worker" 
          siteId={siteId} 
          billId={activeOrder?.id || null} 
          totalOrderPrice={grandTotal}
          supplierSection={supplierSection}
          relatedTankId={vehicle.tank_ids?.[0] || null} // Primary tank
        />
        {/* We need to inject the Work Source into the RequestPayment note dynamically via a small hack 
            or assume it's fine. Wait, we can't easily inject into RequestPayment's note from here without modifying it. 
            However, we are passing `type="outside_worker"`. We will modify CentralPayments to read workSource from the `outside_workers_data` in the bill.
        */}
      </div>

      {/* Supervisor Details & Digital Signature */}
      <div className="card p-5 space-y-4 border bg-slate-50 mt-6">
        <h4 className="font-extrabold text-base text-primary border-b pb-2">✍️ Supervisor Sign-off (Vehicle Specific)</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">Supervisor Name *</label>
            <input
              className="field text-sm"
              disabled={saved}
              placeholder="Enter Supervisor Name"
              value={supervisorName}
              onChange={(e) => setSupervisorName(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Supervisor Phone</label>
            <input
              type="tel"
              className="field text-sm"
              disabled={saved}
              placeholder="Enter Phone Number"
              value={supervisorPhone}
              onChange={(e) => setSupervisorPhone(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="field-label">Supervisor Signature *</label>
          <SignaturePad onSave={(sig) => setSupervisorSignature(sig)} value={supervisorSignature} />
        </div>
      </div>

      {!saved && (
        <button
          type="button"
          onClick={handleSaveData}
          disabled={submitting}
          className="btn-success w-full py-3 font-extrabold mt-4 shadow-md"
        >
          {submitting ? '⏳ Saving...' : '✅ Save Worker Data For Vehicle'}
        </button>
      )}
    </div>
  );
}

export default function OutsideWorkersStep3({ 
  initialSupervisorName = '', 
  onComplete, 
  onBack = null,
  vehicles = [],
  activeOrder = null,
  siteId = null,
  workSource = 'Seed Stocking' // Default to Seed Stocking
}) {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [savedVehicles, setSavedVehicles] = useState({});

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      const { data } = await supabase.from(TABLES.labourSuppliers).select('*').eq('site_id', siteId);
      if (data) setSuppliers(data);
    })();
  }, [siteId]);

  const handleVehicleSave = (vehicleId, payload) => {
    setSavedVehicles(prev => ({ ...prev, [vehicleId]: payload }));
  };

  const handleFinalComplete = () => {
    // Only allow complete if ALL provided vehicles have saved their data
    if (vehicles.length > 0 && Object.keys(savedVehicles).length < vehicles.length) {
      return toast.error('Please save worker data for ALL vehicles before completing.');
    }
    
    // Combine all vehicle data into an array or object
    const finalPayload = {
      source: workSource,
      vehiclesData: savedVehicles,
      grandTotal: Object.values(savedVehicles).reduce((acc, curr) => acc + curr.grandTotal, 0),
      timestamp: new Date().toISOString()
    };
    
    onComplete(finalPayload);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Title & Top Back Button */}
      <div className="flex items-center justify-between">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-bold text-text-muted hover:text-black flex items-center gap-1"
          >
            ← Back
          </button>
        )}
        <div className="text-center flex-1">
          <h3 className="text-2xl font-black text-primary uppercase tracking-wide flex items-center justify-center gap-2">
            <span>👷</span> Outside Workers
          </h3>
          <p className="text-xs text-text-secondary">
            Enter outside workers and payments for {workSource}.
          </p>
        </div>
      </div>

      {vehicles.length === 0 ? (
        <div className="card p-8 text-center text-text-muted text-sm border-dashed border-2 opacity-60">
          No vehicles found for {workSource}.
        </div>
      ) : (
        vehicles.map(v => (
          <SingleVehicleOutsideWorker
            key={v.id}
            vehicle={v}
            activeOrder={activeOrder}
            siteId={siteId}
            workSource={workSource}
            initialSupervisorName={initialSupervisorName}
            onSave={handleVehicleSave}
            suppliersList={suppliers}
          />
        ))
      )}

      {/* Final Complete Button */}
      {vehicles.length > 0 && Object.keys(savedVehicles).length === vehicles.length && (
        <button
          type="button"
          onClick={handleFinalComplete}
          className="btn-primary w-full text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2 mt-6"
        >
          <span>✅ Complete {workSource} Workflow</span>
          <span>➔</span>
        </button>
      )}
    </div>
  );
}
"""

with open(filepath, 'w') as f:
    f.write(new_code)
