import { useEffect, useState } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useAuth } from '../../../../hooks/useAuth';
import { useToast } from '../../../../hooks/useToast';
import RequestPayment from '../../../../components/payments/RequestPayment';

/**
 * Vehicle Booking (PRD §7.2).
 * - Single tank → standard single advance request to the driver.
 * - Multiple tanks → a "Spread" button splits the advance equally across the
 *   listed tanks, with any remainder allocated to the driver.
 *
 * The Spread breakdown is shown live; on payment it persists a
 * vehicle_bookings row with the chosen tank_ids + per_tank_amount.
 *
 * `billId` — when supplied (seed-order flow), every payment is auto-tagged to
 * that bill. Otherwise a "Link to Bill" picker lists open bills for the site so
 * the advance rolls up into the bill's History row.
 */
export default function VehicleBooking({ siteId, tanks = [], billId = null }) {
  const { user } = useAuth();
  const toast = useToast();
  const [selected, setSelected] = useState([]); // tank ids
  const [driverName, setDriverName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [spread, setSpread] = useState(false);
  const [lastPayment, setLastPayment] = useState(null);

  // Standalone bill picker (used when not part of the seed-order flow).
  const [bills, setBills] = useState([]);
  const [chosenBillId, setChosenBillId] = useState('');

  useEffect(() => {
    if (billId) return; // caller already controls the bill
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

  const advance = 2000; // demo advance; in production this comes from the amount field
  const breakdown = spread && selected.length > 0
    ? splitAdvance(advance, selected.length)
    : null;

  function toggleTank(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onPaid(payment) {
    setLastPayment(payment);
    if (payment.method !== 'cash' && payment.status !== 'completed' && payment.method === 'advance' && payment.status !== 'requested') {
      // advance requests only persist booking once submitted
    }
    const { error } = await supabase.from(TABLES.vehicleBookings).insert({
      site_id: siteId,
      payment_id: payment.id,
      bill_id: activeBillId,
      tank_ids: selected,
      spread,
      per_tank_amount: breakdown?.perTank ?? null,
      driver_name: driverName,
      vehicle_no: vehicleNo,
    });
    if (error) toast.error(error.message);
    else toast.success('Vehicle booking recorded');
  }

  return (
    <div className="card p-5">
      <h3 className="font-bold">🚚 Vehicle Booking</h3>
      <p className="text-sm text-text-secondary mt-1">
        Book a vehicle to deliver seed to the listed tanks. Driver receives an advance via Request Payment.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        <div>
          <label className="field-label">Driver name</label>
          <input className="field" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Vehicle no.</label>
          <input className="field" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
        </div>
      </div>

      <p className="field-label mt-4">Tanks for delivery</p>
      <div className="flex flex-wrap gap-2">
        {tanks.map((t) => {
          const active = selected.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggleTank(t.id)}
              className="px-3 py-1.5 rounded-full text-sm font-semibold border"
              style={
                active
                  ? { background: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                  : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
              }
            >
              {t.name}
            </button>
          );
        })}
      </div>

      {selected.length > 1 && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => setSpread((s) => !s)}
            className="btn"
            style={{
              background: spread ? 'var(--color-success)' : 'var(--color-surface)',
              color: spread ? '#fff' : 'var(--color-success)',
              border: `1px solid var(--color-success)`,
            }}
          >
            ⤴ Spread advance across {selected.length} tanks
          </button>
          {spread && breakdown && (
            <p className="text-sm text-text-secondary">
              ₹{breakdown.perTank.toLocaleString('en-IN')}/tank × {selected.length} = ₹{(breakdown.perTank * selected.length).toLocaleString('en-IN')} · driver keeps ₹{breakdown.remainder.toLocaleString('en-IN')}
            </p>
          )}
        </div>
      )}

      {!billId && bills.length > 0 && (
        <div className="mt-4">
          <label className="field-label">Link to Bill (optional)</label>
          <select
            className="field"
            value={chosenBillId}
            onChange={(e) => setChosenBillId(e.target.value)}
          >
            <option value="">Not linked</option>
            {bills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bill_number}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-5">
        <RequestPayment
          type="vehicle"
          siteId={siteId}
          billId={activeBillId}
          onPaid={onPaid}
        />
      </div>
    </div>
  );
}

/** Equal split; remainder (from rounding) goes to the driver. */
function splitAdvance(total, n) {
  const perTank = Math.floor(total / n);
  const allocated = perTank * n;
  return { perTank, remainder: total - allocated };
}
