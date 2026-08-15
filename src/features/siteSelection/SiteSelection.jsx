import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, TABLES } from '../../lib/supabaseClient';
import { useSite } from '../../hooks/useSite';
import { useToast } from '../../hooks/useToast';
import SiteCard from '../../components/cards/SiteCard';
import { PageHeader, Empty, Spinner } from '../../components/ui/State';

/**
 * Post-auth landing — Site Selection (PRD §4).
 * Search bar + dropdown of sites from the `sites` table (seeded from "Aqua").
 * User selects a site → "Add Site" → creates a Site Card and opens Dashboard.
 *
 * For v1 every signed-in user can see/access all sites; RLS policies in the
 * migration gate writes by role, so this stays safe.
 */
export default function SiteSelection() {
  const navigate = useNavigate();
  const { sites, loading, selectSite, refreshSites } = useSite();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [stats, setStats] = useState({}); // siteId -> { sections, tanks, acres }
  const [adding, setAdding] = useState(false);

  // Compute per-site summary stats once sites load.
  useEffect(() => {
    (async () => {
      const out = {};
      for (const s of sites) {
        const { count: sections } = await supabase
          .from(TABLES.sections)
          .select('*', { count: 'exact', head: true })
          .eq('site_id', s.id);
        const { data: tanks } = await supabase
          .from(TABLES.tanks)
          .select('area_acres')
          .eq('site_id', s.id);
        out[s.id] = {
          sections: sections ?? 0,
          tanks: tanks?.length ?? 0,
          acres: (tanks ?? []).reduce((sum, t) => sum + Number(t.area_acres || 0), 0),
        };
      }
      setStats(out);
    })();
  }, [sites]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.region?.toLowerCase().includes(q) ||
        s.source?.toLowerCase().includes(q)
    );
  }, [sites, query]);

  function open(site) {
    selectSite(site.id);
    toast.success(`Opened ${site.name}`);
    navigate('/app/seed');
  }

  async function addSite() {
    if (!query.trim()) return toast.warning('Type a site name to add');
    setAdding(true);
    const { data: rows, error } = await supabase
      .from(TABLES.sites)
      .insert({ name: query.trim(), source: 'Manual' })
      .select();
    setAdding(false);
    if (error) return toast.error(error.message);
    const data = (Array.isArray(rows) ? rows[0] : rows) || { id: `site-${Date.now()}`, name: query.trim(), source: 'Manual' };
    toast.success('Site created');
    setQuery('');
    await refreshSites();
    open(data);
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <PageHeader
        title="Select a site"
        subtitle="Pick a hatchery site to open its dashboard. Sites are seeded from the Aqua master data."
      />

      <div className="flex gap-2 mb-6">
        <input
          className="field flex-1"
          placeholder="Search sites… (e.g. Akividu)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button onClick={addSite} disabled={adding} className="btn-primary">
          {adding ? 'Adding…' : '+ Add Site'}
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <Empty
          icon="🗺️"
          title="No sites found"
          hint="Type a new site name above and tap “Add Site” to create one."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <SiteCard key={s.id} site={s} stats={stats[s.id]} onOpen={open} />
          ))}
        </div>
      )}
    </div>
  );
}
