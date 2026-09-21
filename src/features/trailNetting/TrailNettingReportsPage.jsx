import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, TABLES } from '../../lib/supabaseClient';
import { useSite } from '../../hooks/useSite';
import { useToast } from '../../hooks/useToast';
import { Spinner } from '../../components/ui/State';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import TrailNettingHistoryModal from './TrailNettingHistoryModal';

export default function TrailNettingReportsPage() {
  const { tankId } = useParams();
  const navigate = useNavigate();
  const { siteId, selectedSectionId } = useSite();
  const toast = useToast();
  const tableRef = useRef(null);

  const [tanks, setTanks] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    (async () => {
      // Fetch all master tanks for the site to ensure full tank name resolution
      const { data: tks } = await supabase
        .from(TABLES.tanks)
        .select('*, sections(name)')
        .eq('site_id', siteId)
        .order('name');
      setTanks(tks ?? []);

      // Fetch trail netting reports
      const { data: repData } = await supabase
        .from(TABLES.trailNettingReports)
        .select('*')
        .eq('site_id', siteId);
      setReports(repData ?? []);

      setLoading(false);
    })();
  }, [siteId]);

  // Construct report rows ONLY for tanks that have actually completed Trail Netting
  const reportRows = reports
    .map((rep) => {
      const t = tanks.find((tk) => tk.id === rep.tank_id);
      if (selectedSectionId && t && t.section_id !== selectedSectionId) return null;

      return {
        rawReport: rep,
        tank_id: rep.tank_id,
        tankNo: t?.name || rep.tank_name || `Tank ${rep.tank_id}`,
        hatchery: rep.hatchery || t?.hatchery || '—',
        seedStocked: rep.seed_stocked || t?.quantity || '—',
        survivedSeed: rep.survived_seed || t?.quantity || '—',
        doc: rep.doc ?? '—',
        latestDate: rep.latest_date || '—',
        previDate: rep.previous_date || '—',
        latestCount: rep.latest_count ?? '—',
        previCount: rep.previous_count ?? '—',
        countDiff: rep.count_diff != null ? rep.count_diff : '—',
        growthDiff: rep.growth_diff ?? '—',
        weeklyGrowth: rep.weekly_growth ?? '—',
        feedConspBetween: rep.feed_consp_between ?? '—',
        growthKgsBetween: rep.growth_kgs_between ?? '—',
        fcrBetween: rep.fcr_between ?? '—',
        feedConspTotal: rep.feed_consp_total ?? '—',
        middle1Date: rep.middle_1_date || rep.latest_middle_date || '—',
        middle1Tonnage: rep.middle_1_tonnage ?? '—',
        middle1Count: rep.middle_1_count ?? '—',
        middle2Date: rep.middle_2_date || '—',
        middle2Tonnage: rep.middle_2_tonnage ?? '—',
        middle2Count: rep.middle_2_count ?? '—',
        middle3Date: rep.middle_3_date || '—',
        middle3Tonnage: rep.middle_3_tonnage ?? '—',
        middle3Count: rep.middle_3_count ?? '—',
        middleHarvestedSeed: rep.middle_harvested_seed ?? '—',
        remainingSeed: rep.remaining_seed ?? '—',
        middleTonnageTotal: rep.middle_tonnage_total ?? '—',
        remainingTonnage: rep.remaining_tonnage ?? '—',
        fcr12: rep.fcr_1_2 ?? '—',
        fcr13: rep.fcr_1_3 ?? '—',
        expectedFcr: rep.expected_fcr ?? '—',
        expectedTonnageFeedFcr: rep.expected_tonnage_feed_fcr ?? '—',
        trailnetCount: rep.trailnet_count ?? '—',
        expectedTonnageRemSeed: rep.expected_tonnage_rem_seed ?? '—',
        finalHarvestTonnage: rep.final_harvest_tonnage ?? '—',
        count: rep.final_harvest_count ?? '—',
        totalSeedCatched: rep.total_seed_catched ?? '—',
        survivalPercentage: rep.survival_percentage ?? '—',
      };
    })
    .filter(Boolean);

  const displayRows = reportRows;

  // Filter rows based on Tank Number or Tank Name search query
  const filteredRows = displayRows.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const tNo = String(r.tankNo || '').toLowerCase();
    return tNo.includes(q) || `tank ${tNo}`.includes(q) || `tank${tNo}`.includes(q);
  });

  // Helper to capture full table canvas using live DOM bounding box measurements
  const captureTableCanvas = async (element) => {
    const liveTable = element.tagName === 'TABLE' ? element : (element.querySelector('table') || element);
    const liveRows = Array.from(liveTable.querySelectorAll('tr'));
    const liveCells = Array.from(liveTable.querySelectorAll('th, td'));

    const cellStyles = liveCells.map((cell) => {
      const rect = cell.getBoundingClientRect();
      const compStyle = window.getComputedStyle(cell);
      return {
        width: rect.width,
        height: rect.height,
        padding: compStyle.padding,
        fontSize: compStyle.fontSize,
        whiteSpace: compStyle.whiteSpace,
        wordBreak: compStyle.wordBreak
      };
    });

    const rowHeights = liveRows.map((row) => row.getBoundingClientRect().height);

    // Measure full content dimensions instead of viewport getBoundingClientRect()
    const fullWidth = Math.max(liveTable.scrollWidth, liveTable.offsetWidth, 2300);
    const fullHeight = Math.max(liveTable.scrollHeight, liveTable.offsetHeight);

    return await html2canvas(liveTable, {
      scale: 2,
      useCORS: true,
      logging: false,
      width: fullWidth,
      height: fullHeight,
      windowWidth: fullWidth + 100,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc) => {
        const clonedTable = clonedDoc.querySelector('table') || clonedDoc.body.querySelector('table');
        if (!clonedTable) return;

        // Reset scroll and width constraints on cloned table parent wrappers
        let parent = clonedTable.parentElement;
        while (parent && parent !== clonedDoc.body) {
          parent.style.overflow = 'visible';
          parent.style.overflowX = 'visible';
          parent.style.maxWidth = 'none';
          parent.style.width = 'auto';
          parent = parent.parentElement;
        }

        clonedTable.style.width = `${fullWidth}px`;
        clonedTable.style.minWidth = `${fullWidth}px`;
        clonedTable.style.maxWidth = 'none';
        // DO NOT set tableLayout = 'fixed' because the first row has colSpan={39}, which breaks column distribution

        const clonedRows = Array.from(clonedTable.querySelectorAll('tr'));
        const clonedCells = Array.from(clonedTable.querySelectorAll('th, td'));

        clonedRows.forEach((row, i) => {
          if (rowHeights[i]) {
            row.style.height = `${rowHeights[i]}px`;
            row.style.minHeight = `${rowHeights[i]}px`;
          }
        });

        clonedCells.forEach((cell, i) => {
          if (cellStyles[i]) {
            cell.style.width = `${cellStyles[i].width}px`;
            cell.style.minWidth = `${cellStyles[i].width}px`;
            cell.style.padding = cellStyles[i].padding;
            cell.style.fontSize = cellStyles[i].fontSize;
            cell.style.whiteSpace = cellStyles[i].whiteSpace;
            cell.style.wordBreak = cellStyles[i].wordBreak;

            // Remove maxWidth to prevent clipping if canvas fonts render slightly wider
            cell.style.maxWidth = 'none';

            if (!cell.rowSpan || cell.rowSpan <= 1) {
              cell.style.height = `${cellStyles[i].height}px`;
            }
            cell.style.boxSizing = 'border-box';
          }
        });
      },
    });
  };

  // Download Handlers
  const exportExcel = () => {
    try {
      const element = tableRef.current;
      if (!element) return;
      const tableEl = element.tagName === 'TABLE' ? element : (element.querySelector('table') || element);
      const wb = XLSX.utils.table_to_book(tableEl, { sheet: 'Trail Netting Report' });
      XLSX.writeFile(wb, `Trail_Netting_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Excel file downloaded successfully!');
    } catch (err) {
      console.error('Export Excel Error:', err);
      toast.error('Failed to export Excel file');
    }
  };

  const exportImage = async (format = 'png') => {
    try {
      const element = tableRef.current;
      if (!element) return;

      const canvas = await captureTableCanvas(element);

      const imgData = canvas.toDataURL(`image/${format}`);
      const link = document.createElement('a');
      link.href = imgData;
      link.download = `Trail_Netting_Report_${new Date().toISOString().slice(0, 10)}.${format}`;
      link.click();
      toast.success(`Image (${format.toUpperCase()}) downloaded successfully!`);
    } catch (err) {
      console.error('Export Image Error:', err);
      toast.error('Failed to export Image');
    }
  };

  const exportPDF = async () => {
    try {
      const element = tableRef.current;
      if (!element) return;

      const canvas = await captureTableCanvas(element);

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('landscape', 'mm', 'a3');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const margin = 10;
      const printableWidth = pdfWidth - (margin * 2);
      const renderHeight = (imgProps.height * printableWidth) / imgProps.width;
      const printableHeight = pdfHeight - (margin * 2);

      let heightLeft = renderHeight;
      let position = margin;

      pdf.addImage(imgData, 'PNG', margin, position, printableWidth, renderHeight);
      heightLeft -= printableHeight;

      while (heightLeft > 0) {
        position = position - printableHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, printableWidth, renderHeight);
        heightLeft -= printableHeight;
      }

      pdf.save(`Trail_Netting_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF downloaded successfully!');
    } catch (err) {
      console.error('Export PDF Error:', err);
      toast.error('Failed to export PDF');
    }
  };

  const handleCompleted = async () => {
    if (!tankId) return;
    try {
      const targetReports = reports.filter(r => String(r.tank_id) === String(tankId) && r.process_details?.status === 'draft');
      if (!targetReports.length) {
        // Fallback: if no draft found, maybe already completed.
        navigate('/app/trail-netting', { state: { activeTab: 'history' } });
        return;
      }

      for (const rep of targetReports) {
        const newProcessDetails = {
          ...(rep.process_details || {}),
          status: 'completed'
        };
        const { error } = await supabase
          .from(TABLES.trailNettingReports)
          .update({ process_details: newProcessDetails })
          .eq('tank_id', rep.tank_id)
          .eq('latest_date', rep.latest_date);

        if (error) throw error;
      }

      toast.success('Trail Netting completed and added to History!');
      navigate('/app/trail-netting', { state: { activeTab: 'history' } });
    } catch (err) {
      toast.error('Failed to complete: ' + err.message);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="max-w-[98vw] mx-auto p-4 space-y-6">
      {/* Header & Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            if (tankId) {
              navigate(`/app/trail-netting/${tankId}/sampling`);
            } else {
              navigate('/app/trail-netting');
            }
          }}
          className="text-sm font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
        >
          {tankId ? '← Back to Sampling' : '← Back to Tank List'}
        </button>
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Trail Netting Report & Pattubadi Planning
        </span>
      </div>

      {/* Search Input Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-md">
          <span className="text-slate-400 text-lg">🔍</span>
          <input
            type="text"
            placeholder="Search report by Tank Number or Tank Name (e.g. A1, T1, Tank C1)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="field text-sm w-full py-2 px-3"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-slate-400 hover:text-slate-600 font-bold px-2 py-1"
            >
              Clear
            </button>
          )}
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Showing <strong>{filteredRows.length}</strong> of {displayRows.length} tank report(s)
        </div>
      </div>

      {/* Report Table Card Container */}
      <div className="bg-white rounded-2xl p-4 border border-slate-300 shadow-md space-y-4 overflow-hidden">
        <div className="overflow-x-auto scroll-thin max-w-full">
          <table ref={tableRef} className="w-full text-xs text-left border-collapse font-sans min-w-[2300px]">
            <thead>
              {/* Title Banner Header Row */}
              <tr className="h-[34px]">
                <th
                  colSpan={39}
                  className="text-center font-extrabold text-white py-2 text-sm tracking-wide uppercase border border-slate-200 align-middle box-border bg-blue-950"
                >
                  Trail Netting Report & Pattubadi Planning
                </th>
              </tr>

              {/* Multilevel Column Header Row 1 */}
              <tr className="border border-slate-200 font-bold text-white text-[11px] leading-tight h-[34px] bg-blue-900">
                <th rowSpan={2} className="p-2 border border-slate-200 text-center min-w-[80px] align-middle box-border h-[68px] bg-blue-800">
                  Tank Nos
                </th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-left min-w-[160px] align-middle box-border h-[68px]">Hatchery</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[90px] align-middle box-border h-[68px]">Seed Stocked</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[90px] align-middle box-border h-[68px]">Survived Seed</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-center min-w-[55px] align-middle box-border h-[68px]">DOC</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-center min-w-[85px] align-middle box-border h-[68px]">Latest Date</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-center min-w-[85px] align-middle box-border h-[68px]">Previ Date</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[75px] align-middle box-border h-[68px]">Latest Count</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[75px] align-middle box-border h-[68px]">Previ Count</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[75px] align-middle box-border h-[68px]">Count Diff</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[75px] align-middle box-border h-[68px]">Groth Diff</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[120px] align-middle box-border h-[68px]">Wkly Grth as per Trail Netting</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[105px] align-middle box-border h-[68px]">Betw Period Feed Consp</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[110px] align-middle box-border h-[68px]">Betw Period Growth In Kgs</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[90px] align-middle box-border h-[68px]">Betw Period FCR</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[85px] align-middle box-border h-[68px]">Feed Consp</th>
                <th colSpan={3} className="py-1 px-1 border border-slate-200 text-center bg-blue-800 align-middle box-border h-[34px]">Middle 1</th>
                <th colSpan={3} className="py-1 px-1 border border-slate-200 text-center bg-blue-800 align-middle box-border h-[34px]">Middle 2</th>
                <th colSpan={3} className="py-1 px-1 border border-slate-200 text-center bg-blue-800 align-middle box-border h-[34px]">Middle 3</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[115px] align-middle box-border h-[68px]">Middle Harvested Seed</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[105px] align-middle box-border h-[68px]">Middle Tonnage Total</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[105px] align-middle box-border h-[68px]">Remaining Tonnage</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[105px] align-middle box-border h-[68px]">Remaining Seed</th>
                <th colSpan={2} className="py-1 px-1 border border-slate-200 text-center bg-blue-800 align-middle box-border h-[34px]">If FCR</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-center min-w-[80px] align-middle box-border h-[68px]">Expected FCR</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[150px] align-middle box-border h-[68px]">Expected Tonnage related to Feed & FCR</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-center min-w-[80px] align-middle box-border h-[68px]">Trailnet Count</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[160px] align-middle box-border h-[68px]">Expected Tonnage related to Rem Seed & Trailnet Count</th>
                <th colSpan={2} className="py-1 px-1 border border-slate-200 text-center bg-blue-800 align-middle box-border h-[34px]">Final Harvest</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-right min-w-[105px] align-middle box-border h-[68px]">Total Seed Catched</th>
                <th rowSpan={2} className="p-2 border border-slate-200 text-center min-w-[75px] align-middle box-border h-[68px]">Survival %</th>
              </tr>

              {/* Subheader Row 2 */}
              <tr className="border border-slate-200 font-bold text-slate-700 text-[10px] leading-tight h-[34px] bg-slate-100">
                <th className="py-1 px-1.5 border border-slate-200 text-center min-w-[85px] align-middle box-border h-[34px]">Middle Date</th>
                <th className="py-1 px-1.5 border border-slate-200 text-right min-w-[65px] align-middle box-border h-[34px]">Tonnage</th>
                <th className="py-1 px-1.5 border border-slate-200 text-right min-w-[60px] align-middle box-border h-[34px]">Count</th>
                <th className="py-1 px-1.5 border border-slate-200 text-center min-w-[85px] align-middle box-border h-[34px]">Middle Date</th>
                <th className="py-1 px-1.5 border border-slate-200 text-right min-w-[65px] align-middle box-border h-[34px]">Tonnage</th>
                <th className="py-1 px-1.5 border border-slate-200 text-right min-w-[60px] align-middle box-border h-[34px]">Count</th>
                <th className="py-1 px-1.5 border border-slate-200 text-center min-w-[85px] align-middle box-border h-[34px]">Middle Date</th>
                <th className="py-1 px-1.5 border border-slate-200 text-right min-w-[65px] align-middle box-border h-[34px]">Tonnage</th>
                <th className="py-1 px-1.5 border border-slate-200 text-right min-w-[60px] align-middle box-border h-[34px]">Count</th>
                <th className="py-1 px-1.5 border border-slate-200 text-right min-w-[60px] align-middle box-border h-[34px]">1.2</th>
                <th className="py-1 px-1.5 border border-slate-200 text-right min-w-[60px] align-middle box-border h-[34px]">1.3</th>
                <th className="py-1 px-1.5 border border-slate-200 text-right min-w-[85px] align-middle box-border h-[34px]">Tonnage</th>
                <th className="py-1 px-1.5 border border-slate-200 text-right min-w-[60px] align-middle box-border h-[34px]">Count</th>
              </tr>
            </thead>

            {/* Data Rows */}
            <tbody className="divide-y divide-slate-200 font-mono text-slate-900 bg-white">
              {filteredRows.length > 0 ? (
                filteredRows.map((r, i) => (
                  <tr
                    key={i}
                    onClick={() => {
                      const matchedTank = tanks.find((t) => t.id === r.tank_id || t.name === r.tankNo);
                      setSelectedHistoryItem({ tank: matchedTank, report: r.rawReport || r });
                    }}
                    className="even:bg-slate-50 hover:bg-blue-50 cursor-pointer transition"
                    title="Click to view complete Trail Netting process details"
                  >
                    <td className="p-2 border border-slate-200 font-bold text-center bg-slate-100">
                      {r.tankNo}
                    </td>
                    <td className="p-2 border border-slate-200 font-sans">{r.hatchery}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.seedStocked?.toLocaleString('en-IN')}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.survivedSeed?.toLocaleString('en-IN')}</td>
                    <td className="p-2 border border-slate-200 text-center font-bold">{r.doc}</td>
                    <td className="p-2 border border-slate-200 text-center">{r.latestDate}</td>
                    <td className="p-2 border border-slate-200 text-center">{r.previDate}</td>
                    <td className="p-2 border border-slate-200 text-right font-bold">{r.latestCount}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.previCount}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.countDiff}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.growthDiff}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.weeklyGrowth}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.feedConspBetween}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.growthKgsBetween}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.fcrBetween}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.feedConspTotal}</td>
                    <td className="p-2 border border-slate-200 text-center">{r.middle1Date}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.middle1Tonnage}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.middle1Count}</td>
                    <td className="p-2 border border-slate-200 text-center">{r.middle2Date}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.middle2Tonnage}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.middle2Count}</td>
                    <td className="p-2 border border-slate-200 text-center">{r.middle3Date}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.middle3Tonnage}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.middle3Count}</td>
                    <td className="p-2 border border-slate-200 text-right font-bold">{r.middleHarvestedSeed?.toLocaleString('en-IN')}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.remainingSeed?.toLocaleString('en-IN')}</td>
                    <td className="p-2 border border-slate-200 text-right font-bold">{r.middleTonnageTotal}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.remainingTonnage}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.fcr12}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.fcr13}</td>
                    <td className="p-2 border border-slate-200 text-center">{r.expectedFcr || '—'}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.expectedTonnageFeedFcr || '—'}</td>
                    <td className="p-2 border border-slate-200 text-center">{r.trailnetCount || '—'}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.expectedTonnageRemSeed || '—'}</td>
                    <td className="p-2 border border-slate-200 text-right font-bold">{r.finalHarvestTonnage?.toLocaleString('en-IN')}</td>
                    <td className="p-2 border border-slate-200 text-right">{r.count || '—'}</td>
                    <td className="p-2 border border-slate-200 text-right font-bold">{r.totalSeedCatched?.toLocaleString('en-IN')}</td>
                    <td className="p-2 border border-slate-200 text-center font-bold text-slate-700">{r.survivalPercentage}%</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={39} className="p-8 text-center text-slate-500 font-sans">
                    No report found matching search query &quot;<strong>{searchQuery}</strong>&quot;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Export & Download Controls */}
      <div className="bg-slate-900 text-white rounded-xl p-3 sm:p-5 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h4 className="font-extrabold text-sm sm:text-base text-white">Download & Export</h4>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
            Export the complete Trail Netting Report.
          </p>
        </div>

        <div className="grid grid-cols-2 md:flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={exportPDF}
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-[11px] sm:text-xs font-bold px-2 py-2 sm:px-4 sm:py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
          >
            📄 PDF
          </button>
          <button
            onClick={exportExcel}
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-[11px] sm:text-xs font-bold px-2 py-2 sm:px-4 sm:py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
          >
            📊 Excel
          </button>
          <button
            onClick={() => exportImage('png')}
            className="col-span-2 md:col-span-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-[11px] sm:text-xs font-bold px-2 py-2 sm:px-4 sm:py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
          >
            🖼️ Image
          </button>
        </div>
      </div>

      {/* "Completed" Action Button - ONLY when navigating from a specific tank's flow */}
      {tankId && (
        <div className="pt-2">
          <button
            onClick={handleCompleted}
            className="w-full py-3 sm:py-4 text-sm sm:text-base font-bold sm:font-extrabold flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition bg-slate-900 hover:bg-slate-800 text-white rounded-xl"
          >
            ✅ Completed
          </button>
        </div>
      )}

      {/* Complete Process Details Modal */}
      <TrailNettingHistoryModal
        isOpen={!!selectedHistoryItem}
        onClose={() => setSelectedHistoryItem(null)}
        tank={selectedHistoryItem?.tank}
        report={selectedHistoryItem?.report}
      />
    </div>
  );
}
