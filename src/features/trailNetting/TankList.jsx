import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, TABLES } from '../../lib/supabaseClient';
import { useSite } from '../../hooks/useSite';
import { computeCadence, formatDate } from '../../hooks/useTrailNettingCadence';
import { Empty, Spinner } from '../../components/ui/State';

/**
 * Trail Netting tank cards (PRD §8.1).
 * Only tanks in sections that currently HAVE seed stocked appear.
 * Card shows day count + a Trail Netting button (disabled until Day 45).
 * At Day 45: button activates, card border highlights green, alert fires.
 *
 * Cadence: 1st netting Day 45–60; later nettings within 7 days of the last.
 * Next expected date = last netting date + 7 days, shown with the calendar date.
 */
export default function TankList() {
  const { siteId } = useSite();
  const navigate = useNavigate();
  const [tanks, setTanks] = useState([]);
  const [records, setRecords] = useState({}); // tankId -> records[]
  const [loading, setLoading] = useState(true);

  const [hasRecentMiddleHarvest, setHasRecentMiddleHarvest] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    (async () => {
      const [{ data: tks }, { data: hEntries }] = await Promise.all([
        supabase
          .from(TABLES.tanks)
          .select('*, sections(name)')
          .eq('site_id', siteId)
          .order('name'),
        supabase
          .from(TABLES.harvestEntries)
          .select('*')
          .eq('site_id', siteId)
          .eq('harvest_type', 'middle')
          .order('created_at', { ascending: false }),
      ]);

      // Only show stocked tanks (PRD §8.1).
      const stocked = (tks ?? []).filter((t) => Number(t.quantity || 0) > 0);

      // Check if any middle harvest occurred recently
      if (hEntries && hEntries.length > 0) {
        setHasRecentMiddleHarvest(true);
      }

      const { data: recs } = await supabase
        .from(TABLES.trailNettingRecords)
        .select('*')
        .in('tank_id', stocked.map((t) => t.id))
        .order('date', { ascending: true });
      const map = {};
      (recs ?? []).forEach((r) => {
        (map[r.tank_id] ??= []).push(r);
      });
      setTanks(stocked);
      setRecords(map);
      setLoading(false);
    })();
  }, [siteId]);

  if (loading) return <Spinner />;
  if (!siteId) return <Empty icon="🗺️" title="Select a site first" />;
  if (!tanks.length)
    return (
      <Empty
        icon="🥢"
        title="No stocked tanks"
        hint="Stock seed into a tank from the Seed → Sections card to enable trail netting."
      />
    );

  return (
    <div className="space-y-4">
      {hasRecentMiddleHarvest && (
        <div className="rounded-2xl p-4 bg-amber-50 border-2 border-amber-400 text-amber-900 flex items-center gap-3 shadow-md">
          <span className="text-2xl">🔔</span>
          <div>
            <h4 className="font-extrabold text-sm uppercase tracking-wide">Middle Harvest Count Check Alert</h4>
            <p className="text-xs font-bold mt-0.5 text-amber-800">
              Check the count / do the trailnetting to check the count after completing middle harvest.
            </p>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-extrabold mb-1">Trail Netting</h1>
        <p className="text-sm text-text-secondary mb-5">
          Tanks with active seed. First netting window is Day 45–60; later nettings every 7 days.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tanks.map((t) => {
          const cadence = computeCadence({ startDate: t.start_date, records: records[t.id] ?? [] });
          return (
            <TankCardTN
              key={t.id}
              tank={t}
              cadence={cadence}
              onNet={() => navigate(`/app/trail-netting/${t.id}`)}
            />
          );
        })}
      </div>
    </div>
  );
}

function TankCardTN({ tank, cadence, onNet }) {
  const border = {
    due: 'var(--color-success)',
    overdue: 'var(--color-danger)',
    approaching: 'var(--color-warning)',
    waiting: 'var(--color-border)',
  }[cadence.status];

  const statusLabel = {
    due: 'Ready to net',
    overdue: 'Overdue',
    approaching: 'Approaching Day 45',
    waiting: `Day ${cadence.day} / 45`,
  }[cadence.status];

  return (
    <div className="card p-4" style={{ borderColor: border, borderWidth: 2 }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-text-muted">{tank.sections?.name ? `Section ${tank.sections.name}` : 'Tank'}</p>
          <h3 className="text-lg font-extrabold">{tank.name}</h3>
        </div>
        <span
          className="chip"
          style={{
            background: `${border}1a`,
            color: border,
            border: `1px solid ${border}40`,
          }}
        >
          {statusLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-center">
        <div className="rounded-[10px] py-2" style={{ background: 'var(--color-surface)' }}>
          <p className="text-xl font-extrabold" style={{ color: 'var(--color-primary)' }}>
            Day {cadence.day}
          </p>
          <p className="text-[10px] uppercase text-text-muted">since stocking</p>
        </div>
        <div className="rounded-[10px] py-2" style={{ background: 'var(--color-surface)' }}>
          <p className="text-xl font-extrabold" style={{ color: 'var(--color-accent)' }}>
            {cadence.doneCount}
          </p>
          <p className="text-[10px] uppercase text-text-muted">nettings done</p>
        </div>
      </div>

      <div className="mt-3 text-xs text-text-secondary">
        {cadence.nextExpectedDate ? (
          <>
            Next expected: <strong>{formatDate(cadence.nextExpectedDate)}</strong>
            {cadence.lastRecordDate && <> · last on {formatDate(cadence.lastRecordDate)}</>}
          </>
        ) : (
          <>First netting opens on <strong>{formatDate(cadence.windowStart)}</strong></>
        )}
      </div>

      <button
        onClick={onNet}
        disabled={!cadence.canNet}
        className="btn w-full mt-4 text-white"
        style={{ background: cadence.canNet ? 'var(--color-success)' : 'var(--color-text-muted)' }}
      >
        {cadence.canNet ? '🥢 Trail Netting' : `Locked until Day 45`}
      </button>
    </div>
  );
}
