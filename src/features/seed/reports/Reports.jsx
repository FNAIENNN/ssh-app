import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    supabase
      .from(TABLES.trailNettingReports)
      .select('*, tanks(name)')
      .eq('site_id', siteId)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        // flatten tank name onto each row for the table component
        const rows = (data ?? []).map((r) => ({
          ...r,
          tank_name: r.tanks?.name ?? r.tank_id?.slice?.(0, 4) ?? '—',
        }));
        setReportRows(rows);
        setLoading(false);
      });
  }, [siteId]);

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
        <button onClick={downloadCSV} className="btn-primary">⬇ Download CSV</button>
      </div>

      <TrailNettingReportTable rows={reportRows} />
    </div>
  );
}
