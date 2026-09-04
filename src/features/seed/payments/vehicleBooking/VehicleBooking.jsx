import { useEffect, useState, useMemo } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useAuth } from '../../../../hooks/useAuth';
import { useToast } from '../../../../hooks/useToast';
import { autosaveBillStep } from '../../../../lib/bills';

export default function VehicleBooking({ siteId, tanks: initialTanks = [], billId = null, initialVehicles = null, onBack = null, onCompleteVehicleBooking = null, onNewTankAdded = null }) {
  const { user } = useAuth();
  const toast = useToast();

  const [tanks, setTanks] = useState(initialTanks);
  const [vehicles, setVehicles] = useState(() => {
    if (initialVehicles && initialVehicles.length > 0) {
      return initialVehicles;
    }
    return [{ id: `temp-${Date.now()}`, driverName: '', vehicleNo: '', transportCharges: '', selectedTanks: [], spread: false, collapsed: false }];
  });

  const [loading, setLoading] = useState(!initialVehicles && !!billId);
  const [submitting, setSubmitting] = useState(false);

  // Standalone bill picker
  const [bills, setBills] = useState([]);
  const [chosenBillId, setChosenBillId] = useState('');

  // Add new tank inline form state
  const [activeAddTankVehicleId, setActiveAddTankVehicleId] = useState(null);
  const [newTankNumber, setNewTankNumber] = useState('');
  const [addingTank, setAddingTank] = useState(false);

  useEffect(() => {
    setTanks(initialTanks);
  }, [initialTanks]);

  useEffect(() => {
    if (billId) return;
    (async () => {
      const { data } = await supabase
        .from(TABLES.bills)
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false });
      setBills(data ?? []);
    })();
  }, [siteId, billId]);

  const activeBillId = billId ?? (chosenBillId || null);

  useEffect(() => {
    if (!activeBillId) return;
    if (initialVehicles && initialVehicles.length > 0) {
      setLoading(false);
      return;
    }
    async function loadVehicles() {
      setLoading(true);
      const { data } = await supabase
        .from(TABLES.vehicleBookings)
        .select('*')
        .eq('bill_id', activeBillId)
        .order('created_at', { ascending: true });
      if (data && data.length > 0) {
        setVehicles(
          data.map((v) => ({
            id: v.id,
            driverName: v.driver_name || '',
            vehicleNo: v.vehicle_no || '',
            transportCharges: v.transport_charges?.toString() || '',
            selectedTanks: v.tank_ids || [],
            spread: v.spread || false,
            collapsed: false,
          }))
        );
      } else {
        setVehicles([
          { id: `temp-${Date.now()}`, driverName: '', vehicleNo: '', transportCharges: '', selectedTanks: [], spread: false, collapsed: false },
        ]);
      }
      setLoading(false);
    }
    loadVehicles();
  }, [activeBillId, initialVehicles]);

  function updateVehicle(id, field, value) {
    setVehicles((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v))
    );
  }

  function toggleVehicleTank(vehicleId, tankId) {
    setVehicles((prev) =>
      prev.map((v) => {
        if (v.id !== vehicleId) return v;
        const active = v.selectedTanks.includes(tankId);
        const next = active
          ? v.selectedTanks.filter((x) => x !== tankId)
          : [...v.selectedTanks, tankId];
        return { ...v, selectedTanks: next };
      })
    );
  }

  function toggleCollapseVehicle(id) {
    setVehicles((prev) =>
      prev.map((v) => (v.id === id ? { ...v, collapsed: !v.collapsed } : v))
    );
  }

  function handleAddNewVehicle() {
    setVehicles((prev) => [
      ...prev,
      { id: `temp-${Date.now()}`, driverName: '', vehicleNo: '', transportCharges: '', selectedTanks: [], spread: false, collapsed: false },
    ]);
  }

  async function saveVehicle(vehicleId) {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    if (!vehicle.driverName.trim() && !vehicle.vehicleNo.trim() && vehicle.selectedTanks.length === 0) {
      return toast.error("Enter vehicle details before saving.");
    }

    setSubmitting(true);
    const payload = {
      site_id: siteId,
      bill_id: activeBillId,
      tank_ids: vehicle.selectedTanks,
      spread: vehicle.spread,
      driver_name: vehicle.driverName,
      vehicle_no: vehicle.vehicleNo,
      transport_charges: Number(vehicle.transportCharges) || 0,
    };

    let newId = vehicle.id;

    if (String(vehicle.id).startsWith('temp-')) {
      payload.created_at = new Date().toISOString();
      const { data, error } = await supabase.from(TABLES.vehicleBookings).insert(payload).select();
      if (error) { setSubmitting(false); return toast.error(error.message); }
      if (data && data[0]) {
        newId = data[0].id;
      }
    } else {
      const { error } = await supabase.from(TABLES.vehicleBookings).update(payload).eq('id', vehicle.id);
      if (error) { setSubmitting(false); return toast.error(error.message); }
    }

    const updatedList = vehicles.map(v => 
      v.id === vehicleId ? { ...v, id: newId, collapsed: true } : v
    );
    setVehicles(updatedList);

    if (activeBillId) {
       const bookedVehicles = updatedList.filter(v => v.driverName || v.vehicleNo || v.selectedTanks.length > 0);
       await autosaveBillStep(
         supabase, TABLES, activeBillId,
         { vehicle_booking_data: { vehicles: bookedVehicles } },
         'Vehicle Booking Saved', user?.email
       );
    }
    setSubmitting(false);
    toast.success(`Vehicle saved successfully.`);
  }

  async function removeVehicle(id) {
    if (vehicles.length <= 1) return;
    setVehicles((prev) => prev.filter((v) => v.id !== id));
    
    // If it's a real DB record, delete it from the database immediately
    if (!String(id).startsWith('temp-')) {
      await supabase.from(TABLES.vehicleBookings).delete().eq('id', id);
    }
  }

  async function handleSaveNewTank(vehicleId) {
    if (!newTankNumber.trim()) return toast.error('Enter Tank Number / Name');
    setAddingTank(true);

    // Get section ID for site
    const { data: secs } = await supabase.from(TABLES.sections).select('id').eq('site_id', siteId).limit(1);
    const secId = secs?.[0]?.id;
    if (!secId) {
      setAddingTank(false);
      return toast.error('No section found for this site. Create a section first.');
    }

    const { data, error } = await supabase
      .from(TABLES.tanks)
      .insert({
        site_id: siteId,
        section_id: secId,
        name: newTankNumber.trim(),
        quantity: 0,
      })
      .select();

    setAddingTank(false);
    if (error) {
      return toast.error(error.message);
    }

    const createdTank = data?.[0] || { id: `t-${Date.now()}`, name: newTankNumber.trim(), quantity: 0 };
    setTanks((prev) => [...prev, createdTank]);

    // Auto select this newly created tank for the current vehicle
    toggleVehicleTank(vehicleId, createdTank.id);

    // Notify parent context about the newly added tank
    onNewTankAdded?.(createdTank);

    setNewTankNumber('');
    setActiveAddTankVehicleId(null);
    toast.success(`Tank ${createdTank.name} created and selected!`);
  }

  // ── Pay: Validate → Save Booking → Open Vehicle Payments ──────────────────
  async function handlePay() {
    // Validate: at least one vehicle must have driver name or vehicle number
    const filledVehicles = vehicles.filter(
      (v) => v.driverName.trim() || v.vehicleNo.trim() || v.selectedTanks.length > 0
    );
    if (filledVehicles.length === 0) {
      return toast.error('Enter at least one vehicle\'s driver name or vehicle number before paying');
    }

    setSubmitting(true);
    const updatedVehiclesList = [];

    for (const vehicle of vehicles) {
      if (vehicle.driverName || vehicle.vehicleNo || vehicle.selectedTanks.length > 0) {
        const payload = {
          site_id: siteId,
          bill_id: activeBillId,
          tank_ids: vehicle.selectedTanks,
          spread: vehicle.spread,
          driver_name: vehicle.driverName,
          vehicle_no: vehicle.vehicleNo,
          transport_charges: Number(vehicle.transportCharges) || 0,
        };

        let newId = vehicle.id;

        if (String(vehicle.id).startsWith('temp-')) {
          payload.created_at = new Date().toISOString();
          const { data } = await supabase.from(TABLES.vehicleBookings).insert(payload).select();
          if (data && data[0]) {
            newId = data[0].id; // Get the real UUID
          }
        } else {
          await supabase.from(TABLES.vehicleBookings).update(payload).eq('id', vehicle.id);
        }

        updatedVehiclesList.push({ ...vehicle, id: newId });
      } else {
        // Keep empty vehicles in the UI list if they exist
        updatedVehiclesList.push(vehicle);
      }
    }

    // Update React state with correct UUIDs so subsequent saves work properly
    setVehicles(updatedVehiclesList);

    const bookedVehicles = updatedVehiclesList.filter(v => v.driverName || v.vehicleNo || v.selectedTanks.length > 0);

    if (activeBillId) {
      await autosaveBillStep(
        supabase,
        TABLES,
        activeBillId,
        { vehicle_booking_data: { vehicles: bookedVehicles } },
        'Vehicle Booking Saved',
        user?.email
      );
    }

    setSubmitting(false);
    toast.success('Vehicle booking saved! Proceeding to Vehicle Payments.');

    // Open Vehicle Payments immediately
    onCompleteVehicleBooking?.(activeBillId);
  }

  if (loading) {
    return (
      <div className="card p-12 max-w-4xl mx-auto flex items-center justify-center border-dashed border-2" style={{ borderColor: 'var(--color-border)' }}>
        <p className="text-sm font-bold text-text-muted animate-pulse">Loading saved vehicle data...</p>
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-6 max-w-4xl mx-auto">
      {/* ── Consistent Back Button (top-left, black) ───────────────────────── */}
      {onBack && (
        <div>
          <button
            type="button"
            onClick={onBack}
            className="btn-ghost text-sm font-bold flex items-center gap-1.5"
            style={{ color: '#000' }}
          >
            <span style={{ color: '#000', fontSize: '1rem' }}>←</span>
            <span style={{ color: '#000' }}>Back</span>
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-extrabold text-xl">🚚 Vehicle Booking</h3>
          <p className="text-sm text-text-secondary">
            Book vehicles for seed delivery and allocate tanks per vehicle.
          </p>
        </div>
      </div>

      {!billId && bills.length > 0 && (
        <div>
          <label className="field-label">Link to Seed Order Bill (optional)</label>
          <select
            className="field max-w-xs text-sm font-semibold"
            value={chosenBillId}
            onChange={(e) => setChosenBillId(e.target.value)}
          >
            <option value="">Not linked</option>
            {bills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bill_number} ({b.hatchery || 'Seed Order'})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* List of Vehicles */}
      <div className="space-y-4">
        {vehicles.map((v, idx) => {
          // Available tanks for vehicle v = all tanks NOT allocated to other vehicles
          const otherVehicleAllocated = new Set();
          vehicles.forEach((other) => {
            if (other.id !== v.id) other.selectedTanks.forEach((id) => otherVehicleAllocated.add(id));
          });
          const availableTanks = tanks.filter((t) => !otherVehicleAllocated.has(t.id));

          // Render Collapsed Summary Card if collapsed === true
          if (v.collapsed) {
            const selectedTankNames = v.selectedTanks
              .map((id) => tanks.find((t) => t.id === id)?.name)
              .filter(Boolean);

            return (
              <div
                key={v.id}
                className="p-4 rounded-[12px] border flex items-center justify-between transition shadow-sm"
                style={{ background: 'var(--color-surface-dark)', borderColor: 'var(--color-border)' }}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-primary">🚛 Vehicle {idx + 1}</span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{ background: 'var(--color-primary)20', color: 'var(--color-primary)' }}>
                      {v.vehicleNo || 'No vehicle number'}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary">
                    Driver: <strong>{v.driverName || 'N/A'}</strong> · Assigned Tanks ({selectedTankNames.length}):{' '}
                    <strong>{selectedTankNames.length > 0 ? selectedTankNames.join(', ') : 'None'}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleCollapseVehicle(v.id)}
                  className="btn-ghost text-xs font-bold px-3 py-1.5 border rounded-[8px]"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                >
                  ✎ Edit Vehicle {idx + 1}
                </button>
              </div>
            );
          }

          // Render Expanded Vehicle Card
          return (
            <div
              key={v.id}
              className="p-5 rounded-[14px] border space-y-4 shadow-sm"
              style={{ borderColor: 'var(--color-primary)', background: 'var(--color-surface)' }}
            >
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-base text-primary flex items-center gap-2">
                  <span>🚛</span> Vehicle {idx + 1} Details
                </h4>
                <div className="flex items-center gap-2">

                  {vehicles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeVehicle(v.id)}
                      className="text-xs text-danger font-bold"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Driver Name, Vehicle Number & Transport Charges */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="field-label">Driver Name</label>
                  <input
                    className="field text-sm"
                    placeholder="Driver Name"
                    value={v.driverName}
                    onChange={(e) => updateVehicle(v.id, 'driverName', e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Vehicle Number</label>
                  <input
                    className="field text-sm"
                    placeholder="e.g. AP 39 X 1234"
                    value={v.vehicleNo}
                    onChange={(e) => updateVehicle(v.id, 'vehicleNo', e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Transport Charges (₹)</label>
                  <input
                    type="number"
                    className="field text-sm font-semibold"
                    placeholder="e.g. 2500"
                    value={v.transportCharges}
                    onChange={(e) => updateVehicle(v.id, 'transportCharges', e.target.value)}
                  />
                </div>
              </div>

              {/* Tank Selection with Add New Tank option */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="field-label mb-0">Tank Selection (Available Unallocated Tanks)</p>
                  <button
                    type="button"
                    onClick={() => setActiveAddTankVehicleId(activeAddTankVehicleId === v.id ? null : v.id)}
                    className="btn-primary text-xs px-2.5 py-1 font-bold flex items-center gap-1"
                  >
                    <span>+</span> Add New Tank
                  </button>
                </div>

                {/* Inline Add New Tank Form */}
                {activeAddTankVehicleId === v.id && (
                  <div className="p-3 rounded-[10px] border space-y-2" style={{ background: 'var(--color-surface-dark)', borderColor: 'var(--color-border)' }}>
                    <p className="text-xs font-bold text-text-secondary">Enter New Tank Number / Name</p>
                    <div className="flex items-center gap-2">
                      <input
                        className="field text-sm flex-1"
                        placeholder="e.g. Tank A-6"
                        value={newTankNumber}
                        onChange={(e) => setNewTankNumber(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveNewTank(v.id)}
                        disabled={addingTank}
                        className="btn-success text-xs px-3 py-2 font-bold whitespace-nowrap"
                      >
                        {addingTank ? 'Saving…' : 'Save Tank'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveAddTankVehicleId(null);
                          setNewTankNumber('');
                        }}
                        className="btn-ghost text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {availableTanks.length === 0 ? (
                  <p className="text-xs text-text-muted italic">No unallocated tanks available.</p>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {availableTanks.map((t) => {
                      const selected = v.selectedTanks.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleVehicleTank(v.id, t.id)}
                          className="px-3.5 py-1.5 rounded-full text-xs font-semibold border transition"
                          style={
                            selected
                              ? { background: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                              : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                          }
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Individual Vehicle Save Button */}
              <div className="pt-2 border-t flex justify-end" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => saveVehicle(v.id)}
                  disabled={submitting}
                  className="btn-success text-sm px-6 py-2.5 font-bold shadow-sm"
                >
                  {submitting ? 'Saving...' : 'Save Vehicle Details'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total Transport Charges Summary (Requirement #12) */}
      <div className="p-4 rounded-[12px] bg-slate-100 border flex justify-between items-center text-sm font-extrabold" style={{ borderColor: 'var(--color-border)' }}>
        <span className="text-slate-800">🚛 Total Transport Charges:</span>
        <span className="text-lg text-primary">
          ₹{vehicles.reduce((sum, v) => sum + (Number(v.transportCharges) || 0), 0).toLocaleString('en-IN')}
        </span>
      </div>

      {/* Add New Vehicle Button */}
      <button
        type="button"
        onClick={handleAddNewVehicle}
        className="btn-primary w-full text-sm font-bold py-2.5 flex items-center justify-center gap-2 shadow-sm"
      >
        <span>+</span> Add New Vehicle
      </button>

      {/* Footer: Pay Button — validates + saves bookings + opens Vehicle Payments */}
      <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <button
          type="button"
          onClick={handlePay}
          disabled={submitting}
          className="btn-success w-full text-base font-extrabold py-3.5 shadow-lg flex items-center justify-center gap-2"
        >
          <span>💳</span>
          <span>{submitting ? 'Saving…' : 'Pay'}</span>
        </button>
      </div>
    </div>
  );
}
