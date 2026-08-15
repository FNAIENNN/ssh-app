import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, TABLES } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { useSite } from '../../hooks/useSite';
import { useToast } from '../../hooks/useToast';
import { computeCadence, formatDate } from '../../hooks/useTrailNettingCadence';
import { Spinner } from '../../components/ui/State';

/**
 * Trail Netting page (PRD §8.2 / §8.3).
 * 1. Checklist (Box / Nets / Dettol / Weighing Machine) — all required.
 * 2. Sampling table (S.No / No. of Kgs / Count + Total).
 * 3. Proceed & Save → writes trail_netting_record + updates the canonical
 *    trail_netting_reports row + sets next_expected_date per the cadence rule.
 *
 * Also renders the per-tank history table (PRD §8.3) below the form.
 */
const CHECKLIST = [
  { key: 'box', label: 'Box' },
  { key: 'nets', label: 'Nets' },
  { key: 'dettol', label: 'Dettol' },
  { key: 'weighing_machine', label: 'Weighing Machine' },
];

export default function TrailNettingPage() {
  const { tankId } = useParams();
  const navigate = useNavigate();
  const { siteId } = useSite();
  const { user } = useAuth();
  const toast = useToast();

  const [tank, setTank] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const [checks, setChecks] = useState({ box: false, nets: false, dettol: false, weighing_machine: false });
  const [rows, setRows] = useState([{ no_of_kgs: '', count: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tankId) return;
    setLoading(true);
    (async () => {
      const { data: t } = await supabase
        .from(TABLES.tanks)
        .select('*, sections(name)')
        .eq('id', tankId)
        .maybeSingle();
      setTank(t);
      const { data: recs } = await supabase
        .from(TABLES.trailNettingRecords)
        .select('*')
        .eq('tank_id', tankId)
        .order('date', { ascending: true });
      setRecords(recs ?? []);
      setLoading(false);
    })();
  }, [tankId]);

  const cadence = computeCadence({ startDate: tank?.start_date, records });
  const allChecked = CHECKLIST.every((c) => checks[c.key]);

  const finalCount = rows.reduce((sum, r) => sum + (Number(r.count) || 0), 0);

  function setRow(i, key, val) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { no_of_kgs: '', count: '' }]);
  }

  async function save() {
    if (!allChecked) return toast.warning('Complete the checklist first');
    if (!finalCount) return toast.warning('Add at least one sampling row');

    setSaving(true);
    const today = new Date();
    const next = new Date(today);
    next.setDate(next.getDate() + 7);

    const prevRecord = records[records.length - 1] ?? null;
    const prevCount = prevRecord?.final_count ?? null;
    const countDiff = prevCount != null ? finalCount - prevCount : null;

    const { data: recordRows, error } = await supabase
      .from(TABLES.trailNettingRecords)
      .insert({
        tank_id: tankId,
        site_id: siteId,
        date: today.toISOString().slice(0, 10),
        samples: rows.map((r) => ({ no_of_kgs: Number(r.no_of_kgs) || 0, count: Number(r.count) || 0 })),
        final_count: finalCount,
        next_expected_date: next.toISOString().slice(0, 10),
        count_diff: countDiff,
        created_by: user?.id,
      })
      .select();
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    const record = (Array.isArray(recordRows) ? recordRows[0] : recordRows) || { id: `tnr-${Date.now()}` };

    // 2) Update canonical report row (upsert) — feeds Reports card (PRD §8.4).
    const doc = cadence.day; // days of culture
    const reportPayload = {
      tank_id: tankId,
      site_id: siteId,
      hatchery: tank?.hatchery,
      seed_stocked: tank?.quantity,
      survived_seed: tank?.quantity,
      doc,
      latest_date: today.toISOString().slice(0, 10),
      previous_date: prevRecord?.date ?? null,
      latest_count: finalCount,
      previous_count: prevCount,
      count_diff: countDiff,
      // Growth/feed/FCR fields are populated by finance/field in a later pass;
      // left null here so the canonical report renders truthfully.
    };
    await supabase.from(TABLES.trailNettingReports).upsert(reportPayload, { onConflict: 'tank_id,latest_date' });

    // 3) Checklist record.
    await supabase.from(TABLES.trailNettingChecklists).insert({
      tank_id: tankId,
      ...checks,
      completed_at: new Date().toISOString(),
    });

    setSaving(false);
    toast.success('Trail netting saved — Reports updated');
    setRecords((prev) => [...prev, record]);
    setRows([{ no_of_kgs: '', count: '' }]);
  }

  if (loading) return <Spinner />;
  if (!tank) return <p className="p-6 text-text-muted">Tank not found.</p>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <button onClick={() => navigate('/app/trail-netting')} className="text-sm" style={{ color: 'var(--color-primary)' }}>
        ← Back to tanks
      </button>

      <div>
        <p className="text-xs text-text-muted">
          {tank.sections?.name ? `Section ${tank.sections.name}` : 'Tank'} · Day {cadence.day}
        </p>
        <h1 className="text-2xl font-extrabold">Trail Netting — {tank.name}</h1>
        <p className="text-sm text-text-secondary">
          {cadence.nextExpectedDate
            ? `Last netted ${cadence.lastRecordDate ? formatDate(cadence.lastRecordDate) : '—'} · next expected ${formatDate(cadence.nextExpectedDate)}`
            : `First netting window opens ${formatDate(cadence.windowStart)}`}
        </p>
      </div>

      {/* 1) Checklist */}
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
        <h3 className="font-bold mb-3" style={{ color: 'var(--color-text-primary)' }}>Checklist</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {CHECKLIST.map((c) => {
            const on = checks[c.key];
            return (
              <button
                key={c.key}
                onClick={() => setChecks((p) => ({ ...p, [c.key]: !p[c.key] }))}
                style={{
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 8px',
                  border: `2px solid ${on ? 'var(--color-success)' : 'var(--color-border)'}`,
                  background: on ? 'var(--color-success-bg)' : 'rgba(248,249,252,0.85)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  boxShadow: on ? '0 2px 8px rgba(5,150,105,0.15)' : 'none',
                }}
              >
                <span style={{ fontSize: 18 }}>{on ? '✅' : '⬜'}</span>
                <span
                  style={{
                    fontSize: 12, fontWeight: 700,
                    color: on ? 'var(--color-success)' : 'var(--color-text-secondary)',
                  }}
                >
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2) Sampling table */}
      <div
        className={`transition ${allChecked ? '' : 'opacity-50 pointer-events-none'}`}
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
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Sampling</h3>
          <button onClick={addRow} className="btn-ghost text-sm">+ Row</button>
        </div>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                <th className="text-left font-bold px-3 py-2 text-xs text-text-secondary">S.No</th>
                <th className="text-left font-bold px-3 py-2 text-xs text-text-secondary">No. of Kgs</th>
                <th className="text-left font-bold px-3 py-2 text-xs text-text-secondary">Count</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">
                    <input type="number" className="field py-1.5 w-28" value={r.no_of_kgs}
                      onChange={(e) => setRow(i, 'no_of_kgs', e.target.value)} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" className="field py-1.5 w-28" value={r.count}
                      onChange={(e) => setRow(i, 'count', e.target.value)} />
                  </td>
                </tr>
              ))}
              <tr className="font-extrabold">
                <td className="px-3 py-2" colSpan={2}>Total</td>
                <td className="px-3 py-2" style={{ color: 'var(--color-primary)' }}>{finalCount.toLocaleString('en-IN')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <button onClick={save} disabled={saving} className="btn-success w-full mt-4">
          {saving ? 'Saving…' : '✓ Proceed & Save'}
        </button>
      </div>

      {/* 3) Per-tank history (PRD §8.3) */}
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
        <h3 className="font-bold mb-3">Trail Netting History</h3>
        {records.length === 0 ? (
          <p className="text-sm text-text-muted">No netting history yet.</p>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                  {['Trail Netted On', 'Final Count', 'Prev Count', 'Count Diff', 'Next Expected'].map((h) => (
                    <th key={h} className="text-left font-bold px-3 py-2 text-xs text-text-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={r.id} className="border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
                    <td className="px-3 py-2">{formatDate(r.date)}</td>
                    <td className="px-3 py-2 font-semibold">{r.final_count.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">{records[i - 1]?.final_count.toLocaleString('en-IN') ?? '—'}</td>
                    <td className="px-3 py-2" style={{ color: (r.count_diff ?? 0) < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                      {r.count_diff != null ? `${r.count_diff > 0 ? '+' : ''}${r.count_diff}` : '—'}
                    </td>
                    <td className="px-3 py-2">{r.next_expected_date ? formatDate(r.next_expected_date) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
