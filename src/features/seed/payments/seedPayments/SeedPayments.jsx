import { useEffect, useMemo, useState } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useAuth } from '../../../../hooks/useAuth';
import { useSite } from '../../../../hooks/useSite';
import { useToast } from '../../../../hooks/useToast';
import { nextBillNumber } from '../../../../lib/bills';
import RequestPayment from '../../../../components/payments/RequestPayment';
import VehicleBooking from '../vehicleBooking/VehicleBooking';

/**
 * Seed Payments — Seed Order (PRD §7.2).
 *
 * Flow:
 *   1. Pick one or more sections (multi-select).
 *   2. The empty tanks of those sections are listed; each row has a quantity
 *      input + a green Select button. Selected tanks join the order.
 *   3. Enter Seed Type + PL Size, Hatchery, Per Piece Price.
 *      Overall Quantity (Σ selected) and Overall Price (per-piece × qty) are
 *      computed automatically.
 *   4. Proceed to Pay → generates a bill number (e.g. akiv0001), persists a
 *      `bills` row, then unlocks the Request Payment panel prefilled with the
 *      overall price and linked to the bill.
 *   5. On a completed payment, a seed_entry (with PL Size) is written for every
 *      selected tank and the tank snapshot is updated; the payment is tagged
 *      with the bill id so it rolls up into History.
 *
 * `resumeBill` (optional) is supplied when the user is sent back here from
 * History to clear a pending amount — it prefills the bill and the pending
 * amount into Request Payment.
 */
export default function SeedPayments({ siteId, resumeBill, onResumeCleared }) {
  const { user } = useAuth();
  const { site } = useSite();
  const toast = useToast();

  const [sections, setSections] = useState([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState([]);
  const [emptyTanks, setEmptyTanks] = useState([]);
  const [tankQtys, setTankQtys] = useState({}); // { [tankId]: "qty" }
  const [selectedTankIds, setSelectedTankIds] = useState([]);

  const [seedType, setSeedType] = useState('');
  const [plSize, setPlSize] = useState('');
  const [hatchery, setHatchery] = useState('');
  const [perPiecePrice, setPerPiecePrice] = useState('');

  const [bill, setBill] = useState(null);
  const [proceeding, setProceeding] = useState(false);
  const [resumePrefill, setResumePrefill] = useState(null); // { amount, billId }

  // ── Sections for this site ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: secs } = await supabase
        .from(TABLES.sections)
        .select('*')
        .eq('site_id', siteId)
        .order('name');
      setSections(secs ?? []);
    })();
  }, [siteId]);

  // ── Empty tanks across all selected sections ────────────────────────────
  useEffect(() => {
    if (!selectedSectionIds.length) {
      setEmptyTanks([]);
      return;
    }
    (async () => {
      const { data: tanks } = await supabase
        .from(TABLES.tanks)
        .select('*')
        .in('section_id', selectedSectionIds)
        .order('name');
      setEmptyTanks((tanks ?? []).filter((t) => Number(t.quantity || 0) === 0));
    })();
  }, [selectedSectionIds]);

  // ── Resume a pending bill (redirected from History) ─────────────────────
  useEffect(() => {
    if (!resumeBill) return;
    (async () => {
      const { data: pays } = await supabase
        .from(TABLES.payments)
        .select('*')
        .eq('bill_id', resumeBill.id);
      const total =
        Number(resumeBill.seed_total || 0) +
        Number(resumeBill.vehicle_total || 0) +
        Number(resumeBill.workers_total || 0);
      const paid = (pays ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const pending = Math.max(0, total - paid);
      setBill(resumeBill);
      setSeedType(resumeBill.seed_type ?? '');
      setHatchery(resumeBill.hatchery ?? '');
      setPlSize(resumeBill.pl_size ?? '');
      setResumePrefill({ amount: pending, billId: resumeBill.id });
      toast.info(`Resuming bill ${resumeBill.bill_number} — pending ₹${pending.toLocaleString('en-IN')}`);
    })();
  }, [resumeBill]);

  // ── Derived totals ──────────────────────────────────────────────────────
  const overallQuantity = useMemo(
    () =>
      selectedTankIds.reduce(
        (sum, id) => sum + (Number(tankQtys[id]) || 0),
        0
      ),
    [selectedTankIds, tankQtys]
  );
  const overallPrice = useMemo(
    () => Math.round((Number(perPiecePrice) || 0) * overallQuantity),
    [perPiecePrice, overallQuantity]
  );

  function toggleSection(id) {
    setSelectedSectionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setSelectedTankIds([]);
    setTankQtys({});
  }

  function selectTank(id) {
    const qty = Number(tankQtys[id]) || 0;
    if (!qty) {
      toast.warning('Enter a quantity before selecting the tank');
      return;
    }
    setSelectedTankIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // ── Proceed to Pay → create the bill ────────────────────────────────────
  async function proceedToPay() {
    if (!selectedTankIds.length) return toast.warning('Select at least one tank');
    if (!seedType) return toast.warning('Enter seed type');
    if (!perPiecePrice) return toast.warning('Enter per piece price');
    if (!overallQuantity) return toast.warning('Overall quantity is zero');

    setProceeding(true);
    // Next sequence for this site.
    const { data: existing } = await supabase
      .from(TABLES.bills)
      .select('bill_number')
      .eq('site_id', siteId);
    const billNumber = nextBillNumber(site?.name, existing ?? []);

    const payload = {
      site_id: siteId,
      bill_number: billNumber,
      type: 'seed',
      seed_total: overallPrice,
      vehicle_total: 0,
      workers_total: 0,
      per_piece_price: Number(perPiecePrice) || 0,
      overall_quantity: overallQuantity,
      pl_size: Number(plSize) || null,
      seed_type: seedType,
      hatchery: hatchery || null,
      status: 'open',
      created_by: user?.id,
    };
    const { data: insertedRows, error } = await supabase
      .from(TABLES.bills)
      .insert(payload)
      .select();
    setProceeding(false);
    if (error) return toast.error(error.message);
    const data = (Array.isArray(insertedRows) ? insertedRows[0] : insertedRows) || { id: payload.bill_number, ...payload };
    setBill(data);
    setResumePrefill({ amount: overallPrice, billId: data.id });
    toast.success(`Bill ${data.bill_number || payload.bill_number} generated`);
  }

  // ── After a payment completes: write seed entries + update tanks ─────────
  async function onPaid(payment) {
    if (!bill) return;
    const today = new Date().toISOString().slice(0, 10);
    const selectedTanks = emptyTanks.filter((t) => selectedTankIds.includes(t.id));

    await Promise.all(
      selectedTanks.map((t) =>
        supabase.from(TABLES.seedEntries).insert({
          tank_id: t.id,
          site_id: siteId,
          date: today,
          seed_type: seedType,
          quantity: Number(tankQtys[t.id]) || 0,
          pl_size: Number(plSize) || null,
          hatchery,
          source: 'stocked',
          payment_id: payment.id,
          bill_id: bill.id,
          created_by: user?.id,
        })
      )
    );
    await Promise.all(
      selectedTanks.map((t) =>
        supabase
          .from(TABLES.tanks)
          .update({
            quantity: Number(t.quantity || 0) + (Number(tankQtys[t.id]) || 0),
            seed_type: seedType,
            hatchery,
            start_date: t.start_date ?? today,
          })
          .eq('id', t.id)
      )
    );
    toast.success('Tank records auto-populated');
    if (resumeBill) onResumeCleared?.();
  }

  const formReady = selectedTankIds.length > 0 && seedType && perPiecePrice && overallQuantity;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Order form */}
      <div className="card p-5">
        {/* Bill number (once generated) */}
        {bill && (
          <div
            className="mb-4 rounded-[12px] px-4 py-3 flex items-center justify-between"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
              boxShadow: '0 2px 10px rgba(26,26,46,0.25)',
            }}
          >
            <span className="text-xs font-semibold text-white/80">Bill Number</span>
            <span className="text-lg font-extrabold tracking-wide text-white">
              {bill.bill_number}
            </span>
          </div>
        )}

        <h3 className="font-bold mb-3">Seed Order</h3>

        {/* Sections — multi-select */}
        <label className="field-label">Section (select multiple)</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {sections.map((s) => {
            const active = selectedSectionIds.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggleSection(s.id)}
                className="px-3 py-1.5 rounded-full text-sm font-semibold border transition"
                style={
                  active
                    ? { background: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                    : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                }
              >
                Section {s.name}
              </button>
            );
          })}
          {sections.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No sections for this site.</p>
          )}
        </div>

        {/* Tanks (empty tanks of selected sections) */}
        <label className="field-label">
          Tank{selectedSectionIds.length ? ' — empty tanks' : ''}
        </label>
        {emptyTanks.length === 0 ? (
          <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
            {selectedSectionIds.length
              ? 'No empty tanks in the selected sections.'
              : 'Select sections to list their empty tanks.'}
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {emptyTanks.map((t) => {
              const selected = selectedTankIds.includes(t.id);
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-2 rounded-[12px] px-3 py-2 border"
                  style={{
                    borderColor: selected ? 'var(--color-success)' : 'var(--color-border)',
                    background: selected ? 'var(--color-success-bg)' : 'var(--color-surface)',
                  }}
                >
                  <span className="text-sm font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {t.name}
                    <span className="text-[11px] font-normal" style={{ color: 'var(--color-text-muted)' }}>
                      {' '}· {Number(t.area_acres || 0).toFixed(2)} ac
                    </span>
                  </span>
                  <input
                    type="number"
                    placeholder="Qty"
                    className="field py-1.5 w-28"
                    value={tankQtys[t.id] ?? ''}
                    onChange={(e) =>
                      setTankQtys((p) => ({ ...p, [t.id]: e.target.value }))
                    }
                  />
                  <button
                    onClick={() => selectTank(t.id)}
                    className="btn-success px-3 py-1.5 text-xs"
                  >
                    {selected ? '✓ Selected' : 'Select'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Seed type + PL size */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="field-label">Seed Type</label>
            <input className="field" value={seedType} onChange={(e) => setSeedType(e.target.value)} placeholder="e.g. Vannamei PL" />
          </div>
          <div>
            <label className="field-label">PL Size</label>
            <input
              type="number"
              className="field"
              value={plSize}
              onChange={(e) => setPlSize(e.target.value)}
              placeholder="Count at stocking"
            />
          </div>
        </div>

        {/* Hatchery (unchanged) */}
        <div className="mb-3">
          <label className="field-label">Hatchery</label>
          <input className="field" value={hatchery} onChange={(e) => setHatchery(e.target.value)} placeholder="Source hatchery" />
        </div>

        {/* Overall quantity (read-only) */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="field-label">Overall Quantity</label>
            <input
              readOnly
              className="field font-bold"
              style={{ background: 'var(--color-surface-dark)', color: 'var(--color-primary)' }}
              value={overallQuantity ? overallQuantity.toLocaleString('en-IN') : ''}
              placeholder="Σ selected tanks"
            />
          </div>
          <div>
            <label className="field-label">Per Piece Price (₹)</label>
            <input
              type="number"
              className="field"
              value={perPiecePrice}
              onChange={(e) => setPerPiecePrice(e.target.value)}
              placeholder="e.g. 1.10"
            />
          </div>
        </div>

        {/* Overall price (read-only) */}
        <div className="mb-4">
          <label className="field-label">Overall Price (₹)</label>
          <input
            readOnly
            className="field font-extrabold"
            style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}
            value={overallPrice ? overallPrice.toLocaleString('en-IN') : ''}
            placeholder="per piece × overall quantity"
          />
        </div>

        <button
          onClick={proceedToPay}
          disabled={!formReady || proceeding}
          className="btn-success w-full"
        >
          {proceeding ? 'Generating bill…' : 'Proceed to Pay'}
        </button>
        {!formReady && (
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
            Select tank(s), enter seed type &amp; per piece price to continue.
          </p>
        )}
      </div>

      {/* Request Payment (cash & request) — unlocked once a bill exists */}
      <div className={bill ? '' : 'opacity-60 pointer-events-none'}>
        {bill ? (
          <RequestPayment
            type="seed"
            siteId={siteId}
            billId={bill.id}
            prefillAmount={resumePrefill?.amount ?? overallPrice}
            onPaid={onPaid}
          />
        ) : (
          <div className="card p-5">
            <h3 className="font-bold mb-2">Request Payment</h3>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Fill the order and click <strong>Proceed to Pay</strong> to generate a bill and unlock payment.
            </p>
          </div>
        )}
      </div>

      {/* Vehicle booking (advance to driver) */}
      {selectedTankIds.length > 0 && (
        <div className="lg:col-span-2">
          <VehicleBooking
            siteId={siteId}
            billId={bill?.id}
            tanks={emptyTanks.filter((t) => selectedTankIds.includes(t.id))}
          />
        </div>
      )}
    </div>
  );
}
