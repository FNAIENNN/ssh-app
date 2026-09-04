import { useEffect, useState } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { useSite } from '../../../hooks/useSite';
import { Empty, Spinner } from '../../../components/ui/State';
import SectionCard from '../../../components/cards/SectionCard';
import TankCard from '../../../components/cards/TankCard';
import SeedTable from '../../../components/tables/SeedTable';
import TankInsights from './TankInsights';

/**
 * Sections Card (PRD §7.1).
 * Sections → Tanks (with area) → per-tank seed data table.
 */
export default function Sections() {
  const { siteId } = useSite();
  const [sections, setSections] = useState([]);
  const [tanksBySection, setTanksBySection] = useState({});
  const [activeSection, setActiveSection] = useState(null);
  const [activeTank, setActiveTank] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load sections + tanks for this site.
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
      const { data: tanks } = await supabase
        .from(TABLES.tanks)
        .select('*')
        .eq('site_id', siteId)
        .order('name');
      const map = {};
      (tanks ?? []).forEach((t) => {
        (map[t.section_id] ??= []).push(t);
      });
      setTanksBySection(map);
      setLoading(false);
      if (secs?.length) setActiveSection(secs[0]);
    })();
  }, [siteId]);

  // Load seed entries for the selected tank (via the days-completed view).
  useEffect(() => {
    if (!activeTank) return;
    let active = true;
    supabase
      .from('v_seed_entries')
      .select('*')
      .eq('tank_id', activeTank.id)
      .order('date', { ascending: false })
      .then(({ data }) => {
        if (active) setEntries(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [activeTank]);

  if (loading) return <Spinner />;
  if (!sections.length)
    return <Empty icon="🗂️" title="No sections" hint="Add sections for this site to begin." />;

  return (
    <div className="space-y-5">
      {/* Sections */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {sections.map((s) => (
          <SectionCard
            key={s.id}
            section={s}
            tanks={tanksBySection[s.id] ?? []}
            active={activeSection?.id === s.id}
            onSelect={(sec) => {
              setActiveSection(sec);
              setActiveTank(null);
            }}
          />
        ))}
      </div>

      {/* Tanks under active section */}
      {activeSection && (
        <div
          style={{
            background: 'rgba(255,255,255,0.78)',
            backdropFilter: 'blur(16px) saturate(180%)',
            WebkitBackdropFilter: 'blur(16px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.60)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-card)',
            padding: '16px',
          }}
        >
          <p
            style={{
              fontSize: 13, fontWeight: 700, marginBottom: 12,
              color: 'var(--color-text-primary)',
            }}
          >
            Section {activeSection.name} — Tanks
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(tanksBySection[activeSection.id] ?? []).map((t) => (
              <TankCard
                key={t.id}
                tank={t}
                active={activeTank?.id === t.id}
                onSelect={setActiveTank}
              />
            ))}
            {(tanksBySection[activeSection.id] ?? []).length === 0 && (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No tanks in this section yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Per-tank seed table + insight cards */}
      {activeTank && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-bold mb-2">
              Seed entries for tank {activeTank.name}
            </p>
            <SeedTable entries={entries} tankName={activeTank.name} />
          </div>
          <TankInsights tank={activeTank} />
        </div>
      )}
    </div>
  );
}
