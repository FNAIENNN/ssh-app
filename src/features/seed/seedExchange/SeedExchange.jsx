import { useEffect, useMemo, useState } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { useAuth } from '../../../hooks/useAuth';
import { useSite } from '../../../hooks/useSite';
import { useToast } from '../../../hooks/useToast';
import { Empty, Spinner } from '../../../components/ui/State';
import StatCard from '../../../components/ui/StatCard';
import LedgerTable from '../../../components/payments/LedgerTable';
import RequestPayment from '../../../components/payments/RequestPayment';

/**
 * Seed Exchange (PRD §7.3 rework) — a single card with three sections:
 *
 *   1. Seed Exchange      — From/To tank selectors + "Seed Exchanging Chart"
 *                           (weighings) + "Count Table" + Total Kg / Count
 *                           cards. The Submit button commits the A→B transfer.
 *   2. Worker Payments    — Supplier/Mestri combobox + workers line-items
 *                           table + shared Request Payment + history ledger.
 *   3. Overall Report     — before / chart / cards / workers / after view,
 *                           driven by the just-committed (or latest) exchange.
 *
 * Draft state for the chart + count table is lifted into this component, so
 * switching between sections does NOT clear the entered data (per spec).
 */
export default function SeedExchange() {
  const { siteId } = useSite();
  const { user } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState([]);
  const [tanks, setTanks] = useState([]);

  // Active section pill.
  const [section, setSection] = useState('exchange'); // 'exchange' | 'workers' | 'report'

  // ── Draft state (persists across section switches) ──────────────────────
  const [fromSection, setFromSection] = useState('');
  const [toSection, setToSection] = useState('');
  const [fromTankId, setFromTankId] = useState('');
  const [toTankId, setToTankId] = useState('');

  // Seed Exchanging Chart rows: { id, kgs, saved }
  const [weighings, setWeighings] = useState([{ id: uid(), kgs: '', saved: false }]);
  // Count Table rows: { id, kg, pieces }
  const [countRows, setCountRows] = useState([{ id: uid(), kg: '', pieces: '' }]);
  // Index of the count row selected as the "final middle harvest count".
  const [finalCountIndex, setFinalCountIndex] = useState(null);

  // Snapshot of the most recent committed exchange (drives the Overall Report).
  const [committed, setCommitted] = useState(null);

  // Workers-payments draft + history.
  const [workersDraft, setWorkersDraft] = useState(() => emptyWorkersDraft());
  const [workerHistory, setWorkerHistory] = useState([]);

  // ── Load sections + tanks for this site ─────────────────────────────────
  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    (async () => {
      const { data: secs } = await supabase
        .from(TABLES.sections)
        .select('*')
        .eq('site_id', siteId)
        .order('name');
      setSections(secs ?? []);
      const { data: tks } = await supabase
        .from(TABLES.tanks)
        .select('*')
        .eq('site_id', siteId)
        .order('name');
      setTanks(tks ?? []);
      setLoading(false);
    })();
  }, [siteId]);

  // ── Load the latest exchange + workers history so the report renders on a
  //    fresh visit, plus seed the mestri list from saved rows. ─────────────
  useEffect(() => {
    if (!siteId) return;
    (async () => {
      const { data: ex } = await supabase
        .from(TABLES.seedExchanges)
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (ex?.length) setCommitted(normaliseExchange(ex[0], tanks));
      const { data: w } = await supabase
        .from(TABLES.exchangeWorkers)
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false });
      setWorkerHistory(w ?? []);
    })();
  }, [siteId, tanks]);

  // ── Derived tank lists ──────────────────────────────────────────────────
  const fromTanks = useMemo(
    () => tanks.filter((t) => t.section_id === fromSection && Number(t.quantity || 0) > 0),
    [tanks, fromSection]
  );
  const toTanks = useMemo(
    () => tanks.filter((t) => t.section_id === toSection && t.id !== fromTankId),
    [tanks, toSection, fromTankId]
  );
  const fromTankObj = tanks.find((t) => t.id === fromTankId);
  const toTankObj = tanks.find((t) => t.id === toTankId);

  // ── Totals across the draft chart / count table ─────────────────────────
  const totalKgs = weighings.reduce((s, r) => s + (Number(r.kgs) || 0), 0);
  const finalCount = useMemo(() => {
    const row = countRows[finalCountIndex];
    if (!row) return 0;
    const kg = Number(row.kg) || 0;
    const pieces = Number(row.pieces) || 0;
    return kg > 0 ? Math.round(pieces / kg) : 0;
  }, [countRows, finalCountIndex]);
  const totalExchanged = totalKgs * finalCount;

  // ── Seed Exchanging Chart handlers ──────────────────────────────────────
  function setWeighing(id, kgs) {
    setWeighings((prev) => prev.map((r) => (r.id === id ? { ...r, kgs } : r)));
  }
  function saveWeighing(id) {
    setWeighings((prev) => prev.map((r) => (r.id === id ? { ...r, saved: true } : r)));
    toast.success('Weighing saved');
  }
  function editWeighing(id) {
    setWeighings((prev) => prev.map((r) => (r.id === id ? { ...r, saved: false } : r)));
  }
  function removeWeighing(id) {
    setWeighings((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }
  function addWeighing() {
    setWeighings((prev) => [...prev, { id: uid(), kgs: '', saved: false }]);
  }

  // ── Count Table handlers ────────────────────────────────────────────────
  function setCountCell(id, key, val) {
    setCountRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: val } : r)));
  }
  function removeCountRow(id) {
    setCountRows((prev) => prev.filter((r) => r.id !== id));
    setFinalCountIndex(null);
  }
  function addCountRow() {
    setCountRows((prev) => [...prev, { id: uid(), kg: '', pieces: '' }]);
  }

  // ── Commit the exchange ─────────────────────────────────────────────────
  async function submitExchange() {
    if (!fromTankId || !toTankId) return toast.warning('Select both From and To tanks');
    if (fromTankId === toTankId) return toast.error('From and To tanks must differ');
    if (!totalKgs) return toast.warning('Add at least one weighing to the chart');
    if (!finalCount) return toast.warning('Select a final count in the Count Table');

    if (fromTankObj && totalExchanged > Number(fromTankObj.quantity || 0)) {
      return toast.error(`Cannot exchange more than current stock (${fromTankObj.quantity})`);
    }

    const exchangeDate = new Date().toISOString().slice(0, 10);
    const lineageStart = fromTankObj?.start_date ?? exchangeDate;

    const fromSnapshot = {
      id: fromTankObj.id,
      name: fromTankObj.name,
      quantity: Number(fromTankObj.quantity || 0),
      seed_type: fromTankObj.seed_type ?? null,
      hatchery: fromTankObj.hatchery ?? null,
      start_date: fromTankObj.start_date ?? null,
    };
    const toSnapshot = {
      id: toTankObj.id,
      name: toTankObj.name,
      quantity: Number(toTankObj.quantity || 0),
      seed_type: toTankObj.seed_type ?? null,
      hatchery: toTankObj.hatchery ?? null,
      start_date: toTankObj.start_date ?? null,
    };

    const weighingsJson = weighings
      .filter((r) => Number(r.kgs) > 0)
      .map((r) => ({ kgs: Number(r.kgs) }));
    const countRowsJson = countRows
      .map((r) => {
        const kg = Number(r.kg) || 0;
        const pieces = Number(r.pieces) || 0;
        return { kg, pieces, count: kg > 0 ? Math.round(pieces / kg) : 0 };
      })
      .filter((r) => r.kg > 0);

    // 1) Audit row.
    const { data: exRows, error: exErr } = await supabase
      .from(TABLES.seedExchanges)
      .insert({
        site_id: siteId,
        from_tank_id: fromTankId,
        to_tank_id: toTankId,
        no_of_kgs: Number(weighingsJson[0]?.kgs) || 0,
        total_kgs: totalKgs,
        count: finalCount,
        total_exchanged: totalExchanged,
        start_date: lineageStart,
        exchange_date: exchangeDate,
        blind_feed: false,
        weighings: weighingsJson,
        count_rows: countRowsJson,
        final_count: finalCount,
        from_snapshot: fromSnapshot,
        to_snapshot: toSnapshot,
        created_by: user?.id,
      })
      .select();
    if (exErr) return toast.error(exErr.message);

    // 2) Adjust quantities + copy lineage on both tanks.
    await supabase
      .from(TABLES.tanks)
      .update({ quantity: Math.max(0, Number(fromTankObj.quantity) - totalExchanged) })
      .eq('id', fromTankId);
    await supabase
      .from(TABLES.tanks)
      .update({
        quantity: Number(toTankObj.quantity || 0) + totalExchanged,
        seed_type: fromTankObj?.seed_type ?? toTankObj?.seed_type,
        hatchery: fromTankObj?.hatchery ?? toTankObj?.hatchery,
        start_date: lineageStart, // ← lineage preserved
      })
      .eq('id', toTankId);

    // 3) Append a seed_entries log on the "to" tank.
    await supabase.from(TABLES.seedEntries).insert({
      tank_id: toTankId,
      site_id: siteId,
      date: exchangeDate,
      seed_type: fromTankObj?.seed_type ?? '—',
      quantity: totalExchanged,
      hatchery: fromTankObj?.hatchery ?? null,
      source: 'exchanged',
      created_by: user?.id,
    });

    const ex = Array.isArray(exRows) ? exRows[0] : exRows;
    setCommitted(
      normaliseExchange(
        {
          ...ex,
          weighings: weighingsJson,
          count_rows: countRowsJson,
          final_count: finalCount,
          from_snapshot: fromSnapshot,
          to_snapshot: toSnapshot,
          total_kgs: totalKgs,
          total_exchanged: totalExchanged,
        },
        tanks
      )
    );

    // Reflect the quantity changes locally without a full reload.
    setTanks((prev) =>
      prev.map((t) => {
        if (t.id === fromTankId) return { ...t, quantity: Math.max(0, Number(t.quantity) - totalExchanged) };
        if (t.id === toTankId)
          return {
            ...t,
            quantity: Number(t.quantity || 0) + totalExchanged,
            seed_type: fromTankObj?.seed_type ?? t.seed_type,
            hatchery: fromTankObj?.hatchery ?? t.hatchery,
            start_date: lineageStart,
          };
        return t;
      })
    );

    toast.success('Seed exchanged — quantities updated app-wide');
    setSection('report');
  }

  // ── Render gates ────────────────────────────────────────────────────────
  if (loading) return <Spinner />;
  if (!siteId) return <Empty icon="🗺️" title="Select a site first" />;

  return (
    <div className="space-y-4">
      <SectionNav active={section} onChange={setSection} />

      {section === 'exchange' && (
        <SeedExchangeSection
          sections={sections}
          fromSection={fromSection}
          setFromSection={(v) => { setFromSection(v); setFromTankId(''); }}
          toSection={toSection}
          setToSection={(v) => { setToSection(v); setToTankId(''); }}
          fromTanks={fromTanks}
          toTanks={toTanks}
          fromTankId={fromTankId}
          setFromTankId={setFromTankId}
          toTankId={toTankId}
          setToTankId={setToTankId}
          fromTankObj={fromTankObj}
          toTankObj={toTankObj}
          weighings={weighings}
          countRows={countRows}
          finalCountIndex={finalCountIndex}
          setWeighing={setWeighing}
          saveWeighing={saveWeighing}
          editWeighing={editWeighing}
          removeWeighing={removeWeighing}
          addWeighing={addWeighing}
          setCountCell={setCountCell}
          removeCountRow={removeCountRow}
          addCountRow={addCountRow}
          setFinalCountIndex={setFinalCountIndex}
          totalKgs={totalKgs}
          finalCount={finalCount}
          submitExchange={submitExchange}
        />
      )}

      {section === 'workers' && (
        <WorkersSection
          siteId={siteId}
          draft={workersDraft}
          setDraft={setWorkersDraft}
          exchangeId={committed?.id ?? null}
          history={workerHistory}
          onSaved={(row) => setWorkerHistory((prev) => [row, ...prev])}
        />
      )}

      {section === 'report' && (
        <OverallReportSection committed={committed} history={workerHistory} />
      )}
    </div>
  );
}

// ===========================================================================
// Section nav (pills — mirrors the Payments tab pattern)
// ===========================================================================
const SECTIONS = [
  { id: 'exchange', label: '🔁 Seed Exchange' },
  { id: 'workers', label: '👷 Worker Payments' },
  { id: 'report', label: '📊 Overall Report' },
];

function SectionNav({ active, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className="px-4 py-2 rounded-full text-sm font-semibold border transition"
          style={
            active === s.id
              ? { background: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
              : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
          }
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ===========================================================================
// 1) Seed Exchange section
// ===========================================================================
function GlassCard({ title, subtitle, children }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.78)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.60)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        padding: '20px',
      }}
    >
      {title && <h3 className="font-bold mb-1">{title}</h3>}
      {subtitle && <p className="text-sm text-text-secondary mb-4">{subtitle}</p>}
      {children}
    </div>
  );
}

function SeedExchangeSection(props) {
  const {
    sections, fromSection, setFromSection, toSection, setToSection,
    fromTanks, toTanks, fromTankId, setFromTankId, toTankId, setToTankId,
    fromTankObj, toTankObj,
    weighings, countRows, finalCountIndex,
    setWeighing, saveWeighing, editWeighing, removeWeighing, addWeighing,
    setCountCell, removeCountRow, addCountRow, setFinalCountIndex,
    totalKgs, finalCount, submitExchange,
  } = props;

  return (
    <div className="space-y-4">
      {/* From/To selectors (the original seed-exchange data, now in its own section) */}
      <GlassCard
        title="🔁 Seed Exchange"
        subtitle="Move seed stock between tanks. Lineage (start date) is preserved; quantities update everywhere."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="field-label">From Section</label>
            <select className="field" value={fromSection} onChange={(e) => setFromSection(e.target.value)}>
              <option value="">Select…</option>
              {sections.map((s) => <option key={s.id} value={s.id}>Section {s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">To Section</label>
            <select className="field" value={toSection} onChange={(e) => setToSection(e.target.value)}>
              <option value="">Select…</option>
              {sections.map((s) => <option key={s.id} value={s.id}>Section {s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">From Tank (stocked)</label>
            <select className="field" value={fromTankId} onChange={(e) => setFromTankId(e.target.value)}>
              <option value="">Select…</option>
              {fromTanks.map((t) => (
                <option key={t.id} value={t.id}>{t.name} — {Number(t.quantity).toLocaleString('en-IN')} seed</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">To Tank</label>
            <select className="field" value={toTankId} onChange={(e) => setToTankId(e.target.value)}>
              <option value="">Select…</option>
              {toTanks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        {(fromTankObj || toTankObj) && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {fromTankObj && (
              <div className="rounded-[10px] px-3 py-2" style={{ background: 'var(--color-info-bg)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-info)' }}>From Tank</p>
                <p className="text-sm font-bold">{fromTankObj.name} — {Number(fromTankObj.quantity || 0).toLocaleString('en-IN')} seed</p>
                {fromTankObj.hatchery && (
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>({fromTankObj.hatchery})</p>
                )}
              </div>
            )}
            {toTankObj && (
              <div className="rounded-[10px] px-3 py-2" style={{ background: 'var(--color-success-bg)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-success)' }}>To Tank</p>
                <p className="text-sm font-bold">{toTankObj.name} — {Number(toTankObj.quantity || 0).toLocaleString('en-IN')} seed</p>
                {Number(toTankObj.quantity || 0) > 0 && toTankObj.hatchery && (
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>({toTankObj.hatchery})</p>
                )}
              </div>
            )}
          </div>
        )}
      </GlassCard>

      {/* Seed Exchanging Chart */}
      <GlassCard title="Seed Exchanging Chart" subtitle="Enter the kgs weighed at each weighing. Save each row, delete with 🗑️, or add more with ➕.">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                {['S.No', 'Kgs', ''].map((h) => (
                  <th key={h} className="text-left font-bold px-3 py-2 text-xs text-text-secondary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weighings.map((r, i) => (
                <tr key={r.id} className="border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">
                    {r.saved ? (
                      <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                        {Number(r.kgs || 0).toLocaleString('en-IN')} kg
                      </span>
                    ) : (
                      <input
                        type="number"
                        className="field py-1.5 w-32"
                        placeholder="kgs"
                        value={r.kgs}
                        onChange={(e) => setWeighing(r.id, e.target.value)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 justify-end">
                      {r.saved ? (
                        <button onClick={() => editWeighing(r.id)} className="text-xs font-semibold" style={{ color: 'var(--color-info)' }}>✎ Edit</button>
                      ) : (
                        <button
                          onClick={() => saveWeighing(r.id)}
                          className="btn-success px-3 py-1 text-xs"
                          disabled={!r.kgs}
                        >
                          Save
                        </button>
                      )}
                      <button
                        onClick={() => removeWeighing(r.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        title="Delete row"
                        style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <button onClick={addWeighing} className="btn-ghost text-sm">➕ Add weighing</button>
        </div>
      </GlassCard>

      {/* Count Table */}
      <GlassCard title="Count Table" subtitle="Weigh a sample kg, count the seed pieces — count = pieces ÷ kg. Select one row as the final count.">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                {['S.No', 'Kg', 'Pieces', 'Count', 'Final', ''].map((h) => (
                  <th key={h} className="text-left font-bold px-3 py-2 text-xs text-text-secondary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {countRows.map((r, i) => {
                const kg = Number(r.kg) || 0;
                const pieces = Number(r.pieces) || 0;
                const count = kg > 0 ? Math.round(pieces / kg) : 0;
                const selected = finalCountIndex === i;
                return (
                  <tr key={r.id} className="border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2">
                      <input type="number" className="field py-1.5 w-20" placeholder="kg" value={r.kg}
                        onChange={(e) => setCountCell(r.id, 'kg', e.target.value)} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" className="field py-1.5 w-24" placeholder="pieces" value={r.pieces}
                        onChange={(e) => setCountCell(r.id, 'pieces', e.target.value)} />
                    </td>
                    <td className="px-3 py-2 font-semibold">{count}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setFinalCountIndex(i)}
                        className={selected ? 'btn-success px-3 py-1 text-xs' : 'btn-ghost px-3 py-1 text-xs'}
                      >
                        {selected ? '✓ Selected' : 'Select'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {countRows.length > 1 && (
                        <button
                          onClick={() => removeCountRow(r.id)}
                          className="w-7 h-7 rounded-full flex items-center justify-center"
                          title="Delete row"
                          style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
                        >
                          🗑️
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Final middle harvest count readout — updates as the selection changes. */}
        <div className="mt-3 flex items-center gap-2 rounded-[10px] px-3 py-2"
          style={{ background: 'var(--color-success-bg)', border: '1px solid var(--color-success)' }}>
          <span className="text-sm">🎯</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-success)' }}>
            Final middle harvest count: <strong>{finalCount.toLocaleString('en-IN')}</strong>
          </span>
        </div>
        <div className="mt-2">
          <button onClick={addCountRow} className="btn-ghost text-sm">➕ Add row</button>
        </div>
      </GlassCard>

      {/* Total Kg + Count cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <StatCard icon="⚖️" label="Total Kg" value={totalKgs.toLocaleString('en-IN')} color="var(--color-info)" />
        <StatCard icon="🎯" label="Count (final)" value={finalCount.toLocaleString('en-IN')} color="var(--color-success)" />
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <button onClick={submitExchange} className="btn-primary">Submit</button>
      </div>
    </div>
  );
}

// ===========================================================================
// 2) Worker Payments section
// ===========================================================================
function emptyWorkersDraft() {
  // Pre-seeded batches (spec).
  const batches = ['Vala Manushulu', 'Chethi Valalu', 'Guntu Valalu', 'Bike', 'Auto', 'Beta'];
  return {
    mestriName: '',
    rows: batches.map((b) => ({ id: uid(), batch: b, noOfPeople: '', amount: '' })),
  };
}

function WorkersSection({ siteId, draft, setDraft, exchangeId, history, onSaved }) {
  const grandTotal = draft.rows.reduce(
    (s, r) => s + (Number(r.noOfPeople) || 0) * (Number(r.amount) || 0),
    0
  );

  // Mestri list — persisted per site (localStorage), so previously-typed names
  // reappear in the dropdown on the next visit.
  const mestriKey = `ssh.mestri.${siteId}`;
  const [mestriList, setMestriList] = useState(() => {
    try { return JSON.parse(localStorage.getItem(mestriKey) || '[]'); } catch { return []; }
  });

  function setMestri(name) {
    setDraft((d) => ({ ...d, mestriName: name }));
  }

  function setRow(id, key, val) {
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((r) => (r.id === id ? { ...r, [key]: val } : r)),
    }));
  }
  function addRow() {
    setDraft((d) => ({ ...d, rows: [...d.rows, { id: uid(), batch: '', noOfPeople: '', amount: '' }] }));
  }
  function removeRow(id) {
    setDraft((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== id) }));
  }

  // Persist the workers line-items so the report / history can show them.
  async function saveWorkers(paymentId) {
    if (!draft.mestriName.trim()) {
      return null;
    }
    const lineItems = draft.rows
      .map((r) => ({
        batch: r.batch,
        no_of_people: Number(r.noOfPeople) || 0,
        amount: Number(r.amount) || 0,
        total: (Number(r.noOfPeople) || 0) * (Number(r.amount) || 0),
      }))
      .filter((r) => r.batch || r.no_of_people || r.amount);

    const payload = {
      site_id: siteId,
      exchange_id: exchangeId,
      mestri_name: draft.mestriName.trim(),
      line_items: lineItems,
      grand_total: lineItems.reduce((s, r) => s + r.total, 0),
      payment_id: paymentId ?? null,
    };
    const { data, error } = await supabase.from(TABLES.exchangeWorkers).insert(payload).select();
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;

    // Remember the mestri name for the dropdown.
    const next = Array.from(new Set([...mestriList, draft.mestriName.trim()]));
    setMestriList(next);
    localStorage.setItem(mestriKey, JSON.stringify(next));

    onSaved?.(row);
    return row;
  }

  async function onPaid(payment) {
    const row = await saveWorkers(payment?.id ?? null);
    if (row) {
      setDraft(emptyWorkersDraft());
    }
  }

  const columns = ['Seed Exchange Batch', 'No. of People', 'Amount', 'Total Amount', ''];
  const historyRows = history.map((w) => [
    <span className="text-xs font-bold">{w.mestri_name}</span>,
    <span className="text-xs">{w.line_items?.length ?? 0} batch{(w.line_items?.length ?? 0) === 1 ? '' : 'es'}</span>,
    <span className="text-xs font-extrabold">₹{Number(w.grand_total || 0).toLocaleString('en-IN')}</span>,
    w.payment_id ? (
      <span className="chip" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>Paid</span>
    ) : (
      <span className="chip" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>Unpaid</span>
    ),
  ]);

  return (
    <div className="space-y-4">
      <GlassCard title="👷 Worker Payments" subtitle="Select the supplier/mestri and enter the workers for this exchange. Payment uses the same Request Payment panel as the rest of the app.">
        <label className="field-label">Supplier / Mestri</label>
        <input
          className="field"
          list="ssh-mestri-list"
          placeholder="Type or select a mestri name"
          value={draft.mestriName}
          onChange={(e) => setMestri(e.target.value)}
        />
        <datalist id="ssh-mestri-list">
          {mestriList.map((m) => <option key={m} value={m} />)}
        </datalist>

        <div className="mt-4 overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                {columns.map((h) => (
                  <th key={h} className="text-left font-bold px-3 py-2 text-xs text-text-secondary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draft.rows.map((r) => {
                const total = (Number(r.noOfPeople) || 0) * (Number(r.amount) || 0);
                return (
                  <tr key={r.id} className="border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
                    <td className="px-3 py-2">
                      <input className="field py-1.5 w-44" value={r.batch}
                        onChange={(e) => setRow(r.id, 'batch', e.target.value)} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" className="field py-1.5 w-24" value={r.noOfPeople}
                        onChange={(e) => setRow(r.id, 'noOfPeople', e.target.value)} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" className="field py-1.5 w-28" value={r.amount}
                        onChange={(e) => setRow(r.id, 'amount', e.target.value)} />
                    </td>
                    <td className="px-3 py-2 font-semibold" style={{ color: 'var(--color-primary)' }}>
                      ₹{total.toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeRow(r.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        title="Delete row"
                        style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="font-extrabold">
                <td className="px-3 py-2" colSpan={3}>Total Amount</td>
                <td className="px-3 py-2" style={{ color: 'var(--color-success)' }}>₹{grandTotal.toLocaleString('en-IN')}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <button onClick={addRow} className="btn-ghost text-sm">➕ Add row</button>
        </div>
      </GlassCard>

      {/* Payment — same shared component used across the app. */}
      <div className="card p-4">
        <h3 className="font-bold mb-1">Payment</h3>
        <p className="text-sm text-text-secondary mb-3">
          Pay the workers total (₹{grandTotal.toLocaleString('en-IN')}) via the standard payment path.
        </p>
        <RequestPayment
          type="outside_worker"
          siteId={siteId}
          prefillAmount={grandTotal || null}
          onPaid={onPaid}
        />
      </div>

      {/* History */}
      <LedgerTable
        title="👷 Workers Payment History"
        subtitle="Past worker-payment sessions for this site"
        color="var(--color-warning)"
        icon="👷"
        emptyText="No worker payments yet."
        columns={['Mestri', 'Batches', 'Total', 'Status']}
        rows={historyRows}
      />
    </div>
  );
}

// ===========================================================================
// 3) Overall Report section
// ===========================================================================
function OverallReportSection({ committed, history }) {
  if (!committed) {
    return (
      <Empty
        icon="📊"
        title="No exchange submitted yet"
        hint="Fill in the Seed Exchange section (chart + count) and click Submit to see the consolidated report here."
      />
    );
  }

  const {
    from_snapshot: fromSnap,
    to_snapshot: toSnap,
    weighings = [],
    count_rows: countRows = [],
    final_count: finalCount = 0,
    total_kgs: totalKgs = 0,
    total_exchanged: totalExchanged = 0,
  } = committed;

  const fromBefore = Number(fromSnap?.quantity || 0);
  const toBefore = Number(toSnap?.quantity || 0);
  const fromAfter = Math.max(0, fromBefore - Number(totalExchanged || 0));
  const toAfter = toBefore + Number(totalExchanged || 0);

  const committedWorkers = history.filter((w) => w.exchange_id === committed.id);

  return (
    <div className="space-y-4">
      {/* Before seed exchange */}
      <GlassCard title="Before Seed Exchange" subtitle="Tank states at the time of exchange.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-[10px] px-3 py-2" style={{ background: 'var(--color-info-bg)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-info)' }}>From Tank</p>
            <p className="text-sm font-bold">{fromSnap?.name ?? '—'} — {fromBefore.toLocaleString('en-IN')} seed</p>
            {fromSnap?.hatchery && (
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>({fromSnap.hatchery})</p>
            )}
          </div>
          <div className="rounded-[10px] px-3 py-2" style={{ background: 'var(--color-success-bg)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-success)' }}>To Tank</p>
            <p className="text-sm font-bold">{toSnap?.name ?? '—'} — {toBefore.toLocaleString('en-IN')} seed</p>
            {toBefore > 0 && toSnap?.hatchery && (
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>({toSnap.hatchery})</p>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Seed Exchanging Chart (read-only) */}
      <GlassCard title="Seed Exchanging Chart">
        <ReadTable
          headers={['S.No', 'Kgs']}
          rows={weighings.map((w, i) => [i + 1, `${Number(w.kgs || 0).toLocaleString('en-IN')} kg`])}
        />
      </GlassCard>

      {/* Total Kg + Count cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <StatCard icon="⚖️" label="Total Kg" value={Number(totalKgs || 0).toLocaleString('en-IN')} color="var(--color-info)" />
        <StatCard icon="🎯" label="Count" value={Number(finalCount || 0).toLocaleString('en-IN')} color="var(--color-success)" />
      </div>

      {/* Workers payment table */}
      <GlassCard title="Worker Payments">
        {committedWorkers.length === 0 ? (
          <p className="text-xs text-text-muted py-2">No worker payments recorded for this exchange yet.</p>
        ) : (
          committedWorkers.map((w) => (
            <div key={w.id} className="mb-4">
              <p className="text-sm font-bold mb-1">Mestri: {w.mestri_name}</p>
              <ReadTable
                headers={['Batch', 'No. of People', 'Amount', 'Total Amount']}
                rows={(w.line_items || []).map((r) => [
                  r.batch || '—',
                  r.no_of_people || 0,
                  `₹${Number(r.amount || 0).toLocaleString('en-IN')}`,
                  `₹${Number(r.total || 0).toLocaleString('en-IN')}`,
                ])}
                footer={[
                  'Total Amount',
                  '',
                  '',
                  `₹${Number(w.grand_total || 0).toLocaleString('en-IN')}`,
                ]}
              />
            </div>
          ))
        )}
      </GlassCard>

      {/* After seed exchange */}
      <GlassCard title="After Seed Exchange" subtitle="Remaining seed in the From tank and the new total in the To tank.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-[10px] px-3 py-2" style={{ background: 'var(--color-info-bg)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-info)' }}>From Tank (remaining)</p>
            <p className="text-sm font-bold">{fromSnap?.name ?? '—'}</p>
            <p className="text-sm">
              <span style={{ color: 'var(--color-text-muted)' }}>{fromBefore.toLocaleString('en-IN')}</span>
              <span className="mx-2" style={{ color: 'var(--color-text-muted)' }}>→</span>
              <strong style={{ color: 'var(--color-info)' }}>{fromAfter.toLocaleString('en-IN')}</strong> seed
            </p>
          </div>
          <div className="rounded-[10px] px-3 py-2" style={{ background: 'var(--color-success-bg)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-success)' }}>To Tank (new total)</p>
            <p className="text-sm font-bold">{toSnap?.name ?? '—'}</p>
            <p className="text-sm">
              <span style={{ color: 'var(--color-text-muted)' }}>{toBefore.toLocaleString('en-IN')}</span>
              <span className="mx-2" style={{ color: 'var(--color-text-muted)' }}>→</span>
              <strong style={{ color: 'var(--color-success)' }}>{toAfter.toLocaleString('en-IN')}</strong> seed
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-[10px] px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1"
          style={{ background: 'var(--color-surface-dark)' }}>
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            e.g. <strong>{fromSnap?.name ?? 'A'}</strong>: {fromBefore.toLocaleString('en-IN')} → {fromAfter.toLocaleString('en-IN')} ·{' '}
            <strong>{toSnap?.name ?? 'B'}</strong>: {toBefore.toLocaleString('en-IN')} → {toAfter.toLocaleString('en-IN')}
          </span>
        </div>

        <div className="mt-2 text-[11px] flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'var(--color-text-muted)' }}>
          <span>
            To tank start date = From tank original start date
            {fromSnap?.start_date ? ` (${fromSnap.start_date})` : ''}.
          </span>
          <span>Exchange date: {committed.exchange_date ?? '—'}.</span>
        </div>
      </GlassCard>
    </div>
  );
}

function ReadTable({ headers, rows, footer }) {
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
            {headers.map((h) => (
              <th key={h} className="text-left font-bold px-3 py-2 text-xs text-text-secondary">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td className="px-3 py-2 text-xs text-text-muted" colSpan={headers.length}>No rows.</td></tr>
          )}
          {rows.map((cells, i) => (
            <tr key={i} className="border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
              {cells.map((c, j) => (
                <td key={j} className="px-3 py-2">{c}</td>
              ))}
            </tr>
          ))}
          {footer && (
            <tr className="font-extrabold">
              {footer.map((c, i) => (
                <td key={i} className="px-3 py-2" style={i === footer.length - 1 ? { color: 'var(--color-success)' } : undefined}>{c}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ===========================================================================
// helpers
// ===========================================================================
function uid() {
  return 'w-' + Math.random().toString(36).slice(2, 10);
}

/** Shape a raw seed_exchanges row (DB or just-inserted) into the report model. */
function normaliseExchange(row) {
  if (!row) return null;
  return {
    ...row,
    weighings: row.weighings ?? [],
    count_rows: row.count_rows ?? [],
    final_count: Number(row.final_count ?? row.count ?? 0),
    total_kgs: Number(row.total_kgs ?? 0),
    total_exchanged: Number(row.total_exchanged ?? 0),
    from_snapshot: row.from_snapshot ?? null,
    to_snapshot: row.to_snapshot ?? null,
  };
}
