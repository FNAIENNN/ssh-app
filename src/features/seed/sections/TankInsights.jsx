import { useEffect, useState } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { daysSinceStart, formatDate } from '../../../hooks/useTrailNettingCadence';
import {
  piecesPerKgFromRecord,
  feedConsumptionFromReport,
  latestNettingRecord,
} from '../../../lib/seedMetrics';

/**
 * Per-tank insight cards shown under the seed-entry table (PRD §7.1).
 *
 * 1. Feed Consumption  — kgs consumed + no. of days, side-heading "Feed Consumption".
 * 2. Overall Count     — no. of days, netting date, and the highlighted count
 *                        (pieces/kg, derived from the latest trail-netting record —
 *                        the app-wide count definition).
 * 3. Middle Harvest    — placeholder section; content added in a later pass.
 *
 * Data comes from trail_netting_records / trail_netting_reports (PRD §8).
 */
export default function TankInsights({ tank }) {
  const [report, setReport] = useState(null);
  const [record, setRecord] = useState(null);
  const [middleHarvests, setMiddleHarvests] = useState([]);

  useEffect(() => {
    if (!tank?.id) {
      setReport(null);
      setRecord(null);
      setMiddleHarvests([]);
      return;
    }
    let active = true;
    (async () => {
      const { data: reports } = await supabase
        .from(TABLES.trailNettingReports)
        .select('*')
        .eq('tank_id', tank.id)
        .order('latest_date', { ascending: false });
      const { data: records } = await supabase
        .from(TABLES.trailNettingRecords)
        .select('*')
        .eq('tank_id', tank.id)
        .order('date', { ascending: true });
      const { data: harvests } = await supabase
        .from(TABLES.harvestEntries)
        .select('*')
        .eq('tank_id', tank.id)
        .eq('harvest_type', 'middle')
        .order('created_at', { ascending: false });

      if (!active) return;
      setReport(reports?.[0] ?? null);
      setRecord(latestNettingRecord(records ?? []));
      setMiddleHarvests(harvests ?? []);
    })();
    return () => {
      active = false;
    };
  }, [tank?.id]);

  if (!tank) return null;

  const days = daysSinceStart(tank.start_date);
  const feedKgs = feedConsumptionFromReport(report);
  const count = piecesPerKgFromRecord(record);

  const totalMiddleKg = middleHarvests.reduce((sum, h) => sum + (Number(h.total_save || h.total_kgs) || 0), 0);

  return (
    <div className="space-y-4">
      {/* 1) Feed Consumption + 2) Overall Count side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Feed Consumption */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: 16 }}>🍚</span>
            <h4 className="text-sm font-extrabold" style={{ color: 'var(--color-text-primary)' }}>
              Feed Consumption
            </h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Kgs consumed"
              value={feedKgs != null ? `${Number(feedKgs).toLocaleString('en-IN')} kg` : '—'}
              accent="var(--color-info)"
              bg="var(--color-info-bg)"
            />
            <Metric
              label="No. of days"
              value={`${days} d`}
              accent="var(--color-warning)"
              bg="var(--color-warning-bg)"
            />
          </div>
          {feedKgs == null && (
            <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
              No feed report for this tank yet.
            </p>
          )}
        </div>

        {/* Overall Count */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: 16 }}>🦐</span>
            <h4 className="text-sm font-extrabold" style={{ color: 'var(--color-text-primary)' }}>
              Overall Count
            </h4>
            <span
              className="chip ml-auto"
              style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}
            >
              per kg
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="No. of days"
              value={`${days} d`}
              accent="var(--color-warning)"
              bg="var(--color-warning-bg)"
            />
            <Metric
              label="Date"
              value={record?.date ? formatDate(record.date) : '—'}
              accent="var(--color-info)"
              bg="var(--color-info-bg)"
            />
          </div>
          <div
            className="mt-3 rounded-[12px] px-4 py-3 flex items-center justify-between"
            style={{
              background: 'linear-gradient(135deg, var(--color-success-bg) 0%, var(--color-info-bg) 100%)',
              border: '1px solid rgba(5,150,105,0.25)',
            }}
          >
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
              Count (pcs/kg)
            </span>
            <span
              className="text-xl font-extrabold"
              style={{ color: 'var(--color-success)' }}
            >
              {count != null ? Number(count).toLocaleString('en-IN') : '—'}
            </span>
          </div>
          {count == null && (
            <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
              No trail-netting record yet — count appears after the first netting.
            </p>
          )}
        </div>
      </div>

      {/* 3) Middle Harvest Section */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 16 }}>🌾</span>
            <h4 className="text-sm font-extrabold" style={{ color: 'var(--color-text-primary)' }}>
              Middle Harvest History
            </h4>
          </div>

          <a
            href="/app/harvest"
            className="btn-primary text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 font-bold"
          >
            🌾 Go to Harvest Tab →
          </a>
        </div>

        {middleHarvests.length === 0 ? (
          <div className="rounded-xl p-3 bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center justify-between">
            <span>No middle harvest recorded for Tank {tank.name} yet.</span>
            <a href="/app/harvest" className="text-blue-600 font-bold underline">
              Start Harvest
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between items-center bg-blue-50 p-2.5 rounded-xl border border-blue-200 text-xs font-bold text-blue-900">
              <span>Total Middle Harvest Tonnage:</span>
              <span className="font-mono text-sm">{totalMiddleKg.toFixed(1)} KG</span>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {middleHarvests.map((h) => (
                <div key={h.id} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900">
                      {(Number(h.total_save || h.total_kgs) || 0).toFixed(1)} KG ({h.final_count} count)
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Date: {h.date} · Bill #{h.bill_number}
                    </span>
                  </div>
                  <span className="font-mono font-extrabold text-emerald-700">
                    ₹{Number(h.total_amount).toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, accent, bg }) {
  return (
    <div className="rounded-[12px] px-3 py-2.5" style={{ background: bg }}>
      <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </p>
      <p className="text-base font-extrabold mt-0.5" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}
