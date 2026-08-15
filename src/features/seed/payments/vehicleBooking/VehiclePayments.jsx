/**
 * VehiclePayments — Step after Vehicle Booking.
 *
 * Displays all booked vehicles and allows per-vehicle payment via:
 *   • Advance Cash Payments (Driver Amount → Remaining Balance → Submit Request)
 *   • Advance Bank Payments (UPI or Bank Transfer → Submit Request)
 *
 * All requests automatically appear in the Payments module (TABLES.payments).
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useAuth } from '../../../../hooks/useAuth';
import { useToast } from '../../../../hooks/useToast';

function BackButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-sm font-bold"
      style={{ color: '#000', background: 'none', border: 'none', cursor: 'pointer' }}
    >
      <span style={{ color: '#000', fontSize: '1.1rem' }}>←</span>
      <span style={{ color: '#000' }}>Back</span>
    </button>
  );
}

export default function VehiclePayments({ siteId, bill, onBack, onProceedToSeedStocking, onProceedToPacking, onProceedClicked, loadBills, updateBill }) {
  const { user } = useAuth();
  const toast = useToast();

  const [showNextSteps, setShowNextSteps] = useState(false);

  const [vehicles, setVehicles] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(null); // vehicle id being submitted

  // Per-vehicle payment form state
  // { [vehicleId]: { cashAmount, upiId, bankForm, payMode, advMode } }
  const [forms, setForms] = useState({});

  useEffect(() => {
    if (!bill?.id) return;
    loadData();
  }, [bill?.id, bill?.updated_at]);

  async function loadData() {
    setLoading(true);
    try {
      let loadedVehicles = [];
      const { data: vData } = await supabase
        .from(TABLES.vehicleBookings)
        .select('*')
        .eq('bill_id', bill.id)
        .order('created_at', { ascending: true });
        
      if (vData && vData.length > 0) {
        loadedVehicles = vData;
      } else if (bill?.vehicle_booking_data?.vehicles?.length > 0) {
        loadedVehicles = bill.vehicle_booking_data.vehicles.map(v => ({
          ...v,
          id: v.id,
          driver_name: v.driverName || v.driver_name,
          vehicle_no: v.vehicleNo || v.vehicle_no,
          transport_charges: v.transportCharges || v.transport_charges,
          tank_ids: v.selectedTanks || v.tank_ids || [],
          spread: !!v.spread
        }));
      }

      setVehicles(loadedVehicles);

      const { data: pData } = await supabase
        .from(TABLES.payments)
        .select('*')
        .eq('bill_id', bill.id)
        .eq('type', 'vehicle');
      setPayments(pData ?? []);

      // Initialize form state for each vehicle
      const initForms = {};
      (loadedVehicles ?? []).forEach((v) => {
        initForms[v.id] = {
          cashAmount: '',
          upiId: '',
          bankForm: { holderName: '', accountNumber: '', bankName: '', ifsc: '' },
          payMode: 'cash', // 'cash' | 'bank'
          advMode: 'upi',  // 'upi' | 'bank_transfer'
        };
      });
      setForms(initForms);
    } finally {
      setLoading(false);
    }
  }

  const overallTransportCharges = useMemo(
    () => vehicles.reduce((sum, v) => sum + (Number(v.transport_charges) || 0), 0),
    [vehicles]
  );

  function vehiclePaidAmount(vehicleId) {
    return payments
      .filter((p) => p.vehicle_booking_id === vehicleId)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }

  function updateForm(vehicleId, field, value) {
    setForms((prev) => ({
      ...prev,
      [vehicleId]: { ...prev[vehicleId], [field]: value },
    }));
  }

  function updateBankForm(vehicleId, field, value) {
    setForms((prev) => ({
      ...prev,
      [vehicleId]: {
        ...prev[vehicleId],
        bankForm: { ...prev[vehicleId]?.bankForm, [field]: value },
      },
    }));
  }

  async function submitCashRequest(vehicle) {
    const form = forms[vehicle.id];
    const amount = Number(form?.cashAmount) || 0;
    
    const reqCharge = Number(vehicle.transport_charges) || 0;
    const alreadyPaid = vehiclePaidAmount(vehicle.id);
    const remainingForVehicle = Math.max(0, reqCharge - alreadyPaid);

    if (amount <= 0) return toast.error('Enter a valid cash amount greater than 0');
    if (amount > remainingForVehicle) return toast.error(`Requested amount cannot exceed the remaining balance of ₹${remainingForVehicle.toLocaleString('en-IN')}.`);

    const remaining = Math.max(0, remainingForVehicle - amount);

    setSubmitting(vehicle.id + '-cash');
    try {
      const payload = {
        site_id: siteId,
        bill_id: bill.id,
        type: 'vehicle',
        method: 'cash',
        advance_mode: 'cash',
        amount,
        remaining_balance: remaining,
        driver_name: vehicle.driver_name,
        vehicle_no: vehicle.vehicle_no,
        vehicle_booking_id: vehicle.id,
        status: 'requested',
        created_by: user?.id,
        created_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from(TABLES.payments).insert(payload).select();
      if (error) return toast.error(error.message);
      const inserted = (Array.isArray(data) ? data[0] : data) || payload;
      setPayments((prev) => [inserted, ...prev]);
      updateForm(vehicle.id, 'cashAmount', '');

      if (updateBill) {
        try {
          await updateBill({}, `Cash payment request submitted for ${vehicle.driver_name || 'driver'}`, user?.email);
        } catch (err) {
          console.error('Failed to update bill context after cash payment', err);
        }
      }

      toast.success(`Cash payment request submitted for ${vehicle.driver_name || 'driver'}`);
    } finally {
      setSubmitting(null);
    }
  }

  async function submitBankRequest(vehicle) {
    const form = forms[vehicle.id];
    const advMode = form?.advMode || 'upi';
    const reqCharge = Number(vehicle.transport_charges) || 0;
    const alreadyPaid = vehiclePaidAmount(vehicle.id);
    const amount = Number(form?.cashAmount) || 0; // reusing cashAmount field for bank amount

    const remainingForVehicle = Math.max(0, reqCharge - alreadyPaid);

    if (amount <= 0) return toast.error('Enter a valid amount greater than 0');
    if (amount > remainingForVehicle) return toast.error(`Requested amount cannot exceed the remaining balance of ₹${remainingForVehicle.toLocaleString('en-IN')}.`);

    const remaining = Math.max(0, remainingForVehicle - amount);

    if (advMode === 'upi' && !form?.upiId?.trim()) return toast.error('Enter UPI ID');
    if (advMode === 'bank_transfer') {
      if (!form?.bankForm?.accountNumber) return toast.error('Enter Account Number');
      if (!form?.bankForm?.ifsc) return toast.error('Enter IFSC Code');
    }

    setSubmitting(vehicle.id + '-bank');
    try {
      const payload = {
        site_id: siteId,
        bill_id: bill.id,
        type: 'vehicle',
        method: 'advance',
        advance_mode: advMode,
        amount,
        remaining_balance: remaining,
        driver_name: vehicle.driver_name,
        vehicle_no: vehicle.vehicle_no,
        vehicle_booking_id: vehicle.id,
        upi_id: advMode === 'upi' ? form.upiId.trim() : null,
        holder_name: advMode === 'bank_transfer' ? form.bankForm.holderName : null,
        account_number: advMode === 'bank_transfer' ? form.bankForm.accountNumber : null,
        bank_name: advMode === 'bank_transfer' ? form.bankForm.bankName : null,
        ifsc_code: advMode === 'bank_transfer' ? form.bankForm.ifsc : null,
        status: 'requested',
        created_by: user?.id,
        created_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from(TABLES.payments).insert(payload).select();
      if (error) return toast.error(error.message);
      const inserted = (Array.isArray(data) ? data[0] : data) || payload;
      setPayments((prev) => [inserted, ...prev]);
      updateForm(vehicle.id, 'cashAmount', '');
      updateForm(vehicle.id, 'upiId', '');

      if (updateBill) {
        try {
          await updateBill({}, `Bank payment request submitted for ${vehicle.driver_name || 'driver'}`, user?.email);
        } catch (err) {
          console.error('Failed to update bill context after bank payment', err);
        }
      }

      toast.success(`Bank payment request submitted for ${vehicle.driver_name || 'driver'}`);
    } finally {
      setSubmitting(null);
    }
  }

  if (loading) return <p className="text-sm text-text-muted p-4">Loading vehicle payment data…</p>;

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <BackButton onClick={onBack} />
        {bill && (
          <span className="text-xs font-extrabold px-3 py-1 rounded-full text-white"
            style={{ background: 'var(--color-primary)' }}>
            Bill: {bill.bill_number}
          </span>
        )}
      </div>

      {/* Banner */}
      <div className="rounded-[16px] px-5 py-4 flex items-center justify-between shadow-lg text-white"
        style={{ background: 'linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%)' }}>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-white/80">Vehicle Transport Payments</p>
          <p className="text-xl font-extrabold tracking-wide">{bill?.bill_number || 'No Bill'}</p>
          <p className="text-xs text-white/90">Submit driver transport payment requests to the Payments module</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/80">Total Transport Charges</p>
          <p className="text-2xl font-black">₹{overallTransportCharges.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Per-vehicle payment cards */}
      {vehicles.length === 0 ? (
        <div className="card p-8 text-center text-xs text-text-muted">
          No vehicle bookings found. Go back and add vehicles.
        </div>
      ) : (
        <div className="space-y-4">
          {vehicles.map((v, idx) => {
            const form = forms[v.id] || {};
            const reqCharge = Number(v.transport_charges) || 0;
            const paid = vehiclePaidAmount(v.id);
            const inputAmount = Number(form.cashAmount) || 0;
            const remainingForVehicle = Math.max(0, reqCharge - paid);
            const remainingAfterInput = Math.max(0, remainingForVehicle - inputAmount);
            const vehiclePayments = payments.filter((p) => p.vehicle_booking_id === v.id);
            const isAmountInvalid = inputAmount > remainingForVehicle;

            return (
              <div key={v.id} className="card p-5 space-y-4 border"
                style={{ borderColor: 'var(--color-border)' }}>
                {/* Vehicle header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-extrabold text-sm text-primary">
                      🚛 Vehicle {idx + 1}: {v.vehicle_no || 'No Vehicle Number'}
                    </p>
                    <p className="text-xs text-text-secondary">
                      Driver: <strong>{v.driver_name || 'N/A'}</strong>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-text-muted">Transport Charge</p>
                    <p className="text-base font-extrabold">₹{reqCharge.toLocaleString('en-IN')}</p>
                  </div>
                </div>

                {/* Payment mode tabs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-2">
                  {['cash', 'bank'].map((mode) => {
                    const isSelected = form.payMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updateForm(v.id, 'payMode', mode)}
                        className={`w-full py-4 px-4 rounded-[12px] text-base font-extrabold border-2 transition-all flex items-center justify-center gap-3 ${
                          isSelected 
                            ? 'shadow-lg ring-2 ring-blue-200 ring-offset-1' 
                            : 'hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm'
                        }`}
                        style={{
                          borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                          backgroundColor: isSelected ? 'var(--color-primary)' : '#ffffff',
                          color: isSelected ? '#ffffff' : 'var(--color-text-secondary)',
                          transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                        }}
                      >
                        <span className="text-2xl">{mode === 'cash' ? '💵' : '🏦'}</span>
                        <span>{mode === 'cash' ? 'Advance Cash' : 'Advance Bank'}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Cash form */}
                {form.payMode === 'cash' && (
                  <div className="space-y-3">
                    {remainingForVehicle === 0 && (
                      <div className="p-3 rounded-[8px] bg-red-50 text-red-700 text-sm font-extrabold border border-red-200 text-center shadow-sm">
                        No remaining balance available for another payment request.
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="field-label text-xs">Driver Amount (₹)</label>
                        <input
                          type="number"
                          className={`field text-sm disabled:opacity-60 disabled:bg-slate-100 ${isAmountInvalid ? 'border-red-500 bg-red-50 text-red-900' : ''}`}
                          placeholder="Enter amount"
                          value={form.cashAmount}
                          onChange={(e) => updateForm(v.id, 'cashAmount', e.target.value)}
                          disabled={remainingForVehicle === 0}
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => submitCashRequest(v)}
                          disabled={remainingForVehicle === 0 || submitting === v.id + '-cash' || inputAmount <= 0 || isAmountInvalid}
                          className="btn-primary w-full text-xs font-extrabold py-2.5 shadow disabled:opacity-50"
                        >
                          {submitting === v.id + '-cash' ? 'Submitting…' : 'Submit Request'}
                        </button>
                      </div>
                    </div>
                    {isAmountInvalid && (
                      <p className="text-xs font-extrabold text-red-600">Requested amount cannot exceed the remaining balance of ₹{remainingForVehicle.toLocaleString('en-IN')}.</p>
                    )}
                    {inputAmount > 0 && !isAmountInvalid && remainingForVehicle > 0 && (
                      <div className="p-2.5 rounded-[8px] bg-sky-50 border border-sky-200 text-xs flex justify-between">
                        <span className="font-bold text-sky-900">Remaining Balance:</span>
                        <span className="font-extrabold text-sky-950">₹{remainingAfterInput.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Bank form */}
                {form.payMode === 'bank' && (
                  <div className="space-y-3">
                    {remainingForVehicle === 0 && (
                      <div className="p-3 rounded-[8px] bg-red-50 text-red-700 text-sm font-extrabold border border-red-200 text-center shadow-sm">
                        No remaining balance available for another payment request.
                      </div>
                    )}
                    {/* Adv mode sub-tabs */}
                    <div className="flex gap-2">
                      {['upi', 'bank_transfer'].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => updateForm(v.id, 'advMode', m)}
                          disabled={remainingForVehicle === 0}
                          className="px-2.5 py-1 rounded-full text-xs font-semibold border transition disabled:opacity-50"
                          style={
                            form.advMode === m
                              ? { background: 'var(--color-success)', color: '#fff', borderColor: 'var(--color-success)' }
                              : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                          }
                        >
                          {m === 'upi' ? '🔳 UPI' : '🏦 Bank Transfer'}
                        </button>
                      ))}
                    </div>

                    <div>
                      <label className="field-label text-xs">Driver Amount (₹)</label>
                      <input
                        type="number"
                        className={`field text-sm disabled:opacity-60 disabled:bg-slate-100 ${isAmountInvalid ? 'border-red-500 bg-red-50 text-red-900' : ''}`}
                        placeholder="Enter amount"
                        value={form.cashAmount}
                        onChange={(e) => updateForm(v.id, 'cashAmount', e.target.value)}
                        disabled={remainingForVehicle === 0}
                      />
                    </div>
                    
                    {isAmountInvalid && (
                      <p className="text-xs font-extrabold text-red-600">Requested amount cannot exceed the remaining balance of ₹{remainingForVehicle.toLocaleString('en-IN')}.</p>
                    )}

                    {inputAmount > 0 && !isAmountInvalid && remainingForVehicle > 0 && (
                      <div className="p-2.5 rounded-[8px] bg-sky-50 border border-sky-200 text-xs flex justify-between">
                        <span className="font-bold text-sky-900">Remaining Balance:</span>
                        <span className="font-extrabold text-sky-950">₹{remainingAfterInput.toLocaleString('en-IN')}</span>
                      </div>
                    )}

                    {form.advMode === 'upi' ? (
                      <div>
                        <label className="field-label text-xs">UPI ID</label>
                        <input
                          className="field text-sm disabled:opacity-60 disabled:bg-slate-100"
                          placeholder="driver@upi"
                          value={form.upiId}
                          onChange={(e) => updateForm(v.id, 'upiId', e.target.value)}
                          disabled={remainingForVehicle === 0}
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="field-label text-xs">Holder Name</label>
                          <input className="field text-sm disabled:opacity-60 disabled:bg-slate-100" placeholder="Name" value={form.bankForm?.holderName || ''}
                            onChange={(e) => updateBankForm(v.id, 'holderName', e.target.value)} disabled={remainingForVehicle === 0} />
                        </div>
                        <div>
                          <label className="field-label text-xs">Account Number</label>
                          <input className="field text-sm disabled:opacity-60 disabled:bg-slate-100" placeholder="Account number" value={form.bankForm?.accountNumber || ''}
                            onChange={(e) => updateBankForm(v.id, 'accountNumber', e.target.value)} disabled={remainingForVehicle === 0} />
                        </div>
                        <div>
                          <label className="field-label text-xs">Bank Name</label>
                          <input className="field text-sm disabled:opacity-60 disabled:bg-slate-100" placeholder="e.g. SBI" value={form.bankForm?.bankName || ''}
                            onChange={(e) => updateBankForm(v.id, 'bankName', e.target.value)} disabled={remainingForVehicle === 0} />
                        </div>
                        <div>
                          <label className="field-label text-xs">IFSC Code</label>
                          <input className="field text-sm disabled:opacity-60 disabled:bg-slate-100" placeholder="SBIN0001234" value={form.bankForm?.ifsc || ''}
                            onChange={(e) => updateBankForm(v.id, 'ifsc', e.target.value)} disabled={remainingForVehicle === 0} />
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => submitBankRequest(v)}
                      disabled={remainingForVehicle === 0 || submitting === v.id + '-bank' || inputAmount <= 0 || isAmountInvalid}
                      className="btn-success w-full text-xs font-extrabold py-2.5 shadow disabled:opacity-50"
                    >
                      {submitting === v.id + '-bank' ? 'Submitting…' : 'Submit Request'}
                    </button>
                  </div>
                )}

                {/* Submitted payments for this vehicle */}
                {vehiclePayments.length > 0 && (
                  <div className="pt-2 space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Submitted Requests</p>
                    {vehiclePayments.map((p) => (
                      <div key={p.id} className="p-2 rounded-[8px] bg-slate-50 border flex justify-between text-xs">
                        <span>{p.advance_mode?.toUpperCase() || p.method?.toUpperCase()} · {new Date(p.created_at).toLocaleString('en-IN')}</span>
                        <span className="font-bold">₹{Number(p.amount).toLocaleString('en-IN')} · <span className="capitalize">{p.status}</span></span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Remaining balance for this vehicle */}
                <div className="p-3 rounded-[10px] bg-amber-50 border border-amber-300 flex items-center justify-between text-xs font-extrabold">
                  <span className="text-amber-900">Remaining Balance for {v.driver_name || `Vehicle ${idx + 1}`}:</span>
                  <span className="text-amber-950">₹{remainingForVehicle.toLocaleString('en-IN')}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Proceed to Next Steps */}
      <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
        {!showNextSteps ? (
          <button
            type="button"
            onClick={async () => {
              if (onProceedClicked) {
                await onProceedClicked();
              }
              setShowNextSteps(true);
            }}
            className="btn-success w-full text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2"
          >
            <span>Proceed</span>
            <span>➔</span>
          </button>
        ) : (
          <div className="space-y-3">
            <h4 className="font-extrabold text-sm text-center text-slate-700">Choose Next Step</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onProceedToPacking}
                className="btn-primary py-4 rounded-[12px] text-base font-extrabold shadow flex flex-col items-center justify-center gap-1"
              >
                <span>📦 Packing</span>
              </button>
              <button
                type="button"
                onClick={onProceedToSeedStocking}
                className="btn-success py-4 rounded-[12px] text-base font-extrabold shadow flex flex-col items-center justify-center gap-1"
              >
                <span>🚐 Seed Van Plan</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
