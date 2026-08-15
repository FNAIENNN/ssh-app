import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { useSite } from '../../../hooks/useSite';
import { useToast } from '../../../hooks/useToast';
import { Empty, Spinner } from '../../../components/ui/State';
import TrailNettingReportTable from '../../../components/tables/TrailNettingReportTable';

/**
 * Reports Card (PRD §7.5 / §8.4).
 * Aggregates output from every module. The Trail Netting section uses the
 * canonical "Trail Netting Report & Pattubadi" table format.
 * Supports CSV download of the consolidated trail-netting report.
 */
export default function Reports() {
  const { siteId } = useSite();
  const toast = useToast();
  const [reportRows, setReportRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Feed Charts state
  const [showFeedCharts, setShowFeedCharts] = useState(false);
  const [feedCharts, setFeedCharts] = useState([]);
  const [showAddHatchery, setShowAddHatchery] = useState(false);
  const [hatcherySearch, setHatcherySearch] = useState('');
  const [newChart, setNewChart] = useState({ hatcheryName: '', feedNumber: '', kgs: '' });

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    supabase
      .from(TABLES.trailNettingReports)
      .select('*, tanks(name)')
      .eq('site_id', siteId)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        const rows = (data ?? []).map((r) => ({
          ...r,
          tank_name: r.tanks?.name ?? r.tank_id?.slice?.(0, 4) ?? '—',
        }));
        setReportRows(rows);
        setLoading(false);
      });

    // Load feed charts
    supabase
      .from(TABLES.feedCharts)
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setFeedCharts(data ?? []);
      });
  }, [siteId]);

  async function handleAddHatcheryFeed() {
    if (!newChart.hatcheryName.trim()) return toast.error('Enter Hatchery Name');
    if (!newChart.feedNumber.trim()) return toast.error('Enter Feed Number');
    if (!newChart.kgs) return toast.error('Enter Kgs');

    const payload = {
      site_id: siteId,
      hatchery_name: newChart.hatcheryName.trim(),
      feed_number: newChart.feedNumber.trim(),
      kgs: Number(newChart.kgs) || 0,
    };

    const { data, error } = await supabase.from(TABLES.feedCharts).insert(payload).select();
    if (error) return toast.error(error.message);

    const added = (Array.isArray(data) ? data[0] : data) || { id: `fc-${Date.now()}`, ...payload };
    setFeedCharts((prev) => [added, ...prev]);
    setNewChart({ hatcheryName: '', feedNumber: '', kgs: '' });
    setShowAddHatchery(false);
    toast.success('Hatchery feed chart saved successfully');
  }

  function downloadCSV() {
    if (!reportRows.length) return toast.warning('No report rows to export');
    const headers = [
      'Tank Nos', 'Hatchery', 'Seed Stocked', 'Survived Seed', 'DOC',
      'Latest Date', 'Previous Date', 'Latest Count', 'Previous Count',
      'Count Diff', 'Growth Diff', 'Weekly Growth', 'Feed Consp Between',
      'Growth Kgs Between', 'FCR Between', 'Feed Consp Total',
    ];
    const lines = [headers.join(',')];
    for (const r of reportRows) {
      lines.push([
        r.tank_name, r.hatchery ?? '', r.seed_stocked ?? '', r.survived_seed ?? '',
        r.doc ?? '', r.latest_date ?? '', r.previous_date ?? '',
        r.latest_count ?? '', r.previous_count ?? '', r.count_diff ?? '',
        r.growth_diff ?? '', r.weekly_growth ?? '', r.feed_consp_between ?? '',
        r.growth_kgs_between ?? '', r.fcr_between ?? '', r.feed_consp_total ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ssh-trail-netting-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  }

  const filteredFeedCharts = feedCharts.filter(
    (fc) =>
      !hatcherySearch.trim() ||
      fc.hatchery_name?.toLowerCase().includes(hatcherySearch.toLowerCase()) ||
      fc.feed_number?.toLowerCase().includes(hatcherySearch.toLowerCase())
  );

  if (loading) return <Spinner />;
  if (!siteId) return <Empty icon="🗺️" title="Select a site first" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold">📊 Reports</h3>
          <p className="text-sm text-text-secondary">
            Consolidated Trail Netting Report &amp; Pattubadi (PRD §8.4 canonical format).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Feed Charts button before Download CSV button */}
          <button
            onClick={() => navigate('/app/seed/feed-charts')}
            className="btn font-semibold"
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-primary)',
              border: '1px solid var(--color-primary)',
            }}
          >
            📋 Feed Charts
          </button>
          <button onClick={downloadCSV} className="btn-primary">⬇ Download CSV</button>
        </div>
      </div>

      {/* Feed Charts Management Panel */}
      {showFeedCharts && (
        <div className="card p-5 border space-y-4" style={{ borderColor: 'var(--color-primary)' }}>
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-base flex items-center gap-2">
              <span>🍱</span> Feed Charts Management
            </h4>
            <button
              onClick={() => setShowAddHatchery((s) => !s)}
              className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
            >
              <span>+</span> Add Hatchery
            </button>
          </div>

          {showAddHatchery && (
            <div className="p-4 rounded-[12px] space-y-3" style={{ background: 'var(--color-surface)' }}>
              <p className="text-xs font-bold uppercase text-text-muted">Add Hatchery Feed Chart</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="field-label">Hatchery Name *</label>
                  <input
                    className="field"
                    placeholder="e.g. ABC Hatchery"
                    value={newChart.hatcheryName}
                    onChange={(e) => setNewChart({ ...newChart, hatcheryName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">Feed Number *</label>
                  <input
                    className="field"
                    placeholder="e.g. Feed 1"
                    value={newChart.feedNumber}
                    onChange={(e) => setNewChart({ ...newChart, feedNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">Kgs *</label>
                  <input
                    type="number"
                    className="field"
                    placeholder="e.g. 200"
                    value={newChart.kgs}
                    onChange={(e) => setNewChart({ ...newChart, kgs: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowAddHatchery(false)} className="btn-ghost text-xs">Cancel</button>
                <button onClick={handleAddHatcheryFeed} className="btn-success text-xs">Save Feed Chart</button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <input
              className="field text-sm"
              placeholder="🔍 Search Hatcheries..."
              value={hatcherySearch}
              onChange={(e) => setHatcherySearch(e.target.value)}
            />

            {filteredFeedCharts.length === 0 ? (
              <p className="text-xs text-text-muted py-2">No feed charts recorded yet. Click "+ Add Hatchery" to create one.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredFeedCharts.map((fc) => (
                  <div key={fc.id} className="p-3 rounded-[10px] border flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
                    <div>
                      <p className="font-bold text-sm">{fc.hatchery_name}</p>
                      <p className="text-xs text-text-secondary">{fc.feed_number}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-extrabold" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                      {fc.kgs} Kg
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <TrailNettingReportTable rows={reportRows} />
    </div>
  );
}
