import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase, TABLES } from '../../lib/supabaseClient';
import { useSite } from '../../hooks/useSite';
import { computeCadence, formatDate } from '../../hooks/useTrailNettingCadence';
import { aggregateTankStates } from '../seed/payments/seedStocking/stockingUtils';
import { Empty, Spinner } from '../../components/ui/State';
import TrailNettingSettingsModal from './TrailNettingSettingsModal';
import TrailNettingHistoryModal from './TrailNettingHistoryModal';

export default function TankList() {
  const { siteId, selectedSectionId, selectSection } = useSite();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'active'); // 'active' | 'history'
  const [sections, setSections] = useState([]);
  const [activeSectionId, setActiveSectionId] = useState(selectedSectionId || 'all');
  const [pendingTanks, setPendingTanks] = useState([]);
  const [completedTanks, setCompletedTanks] = useState([]);
  const [records, setRecords] = useState({}); // tankId -> records[]
  const [reports, setReports] = useState({}); // tankId -> latest report
  const [stockingTimes, setStockingTimes] = useState({}); // normalizedTankName -> latest billTime
  const [loading, setLoading] = useState(true);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    (async () => {
      try {
        // 1. Fetch sections for this site
        const { data: secs, error: secErr } = await supabase
          .from(TABLES.sections)
          .select('*')
          .eq('site_id', siteId)
          .order('name');

        if (secErr) console.error("Sections Error:", secErr);

        setSections(secs ?? []);

        // 2. Fetch tanks, seed entries, AND completed seed bills in parallel
        const [{ data: tks }, { data: sEntries }, { data: completedBills }] = await Promise.all([
          supabase
            .from(TABLES.tanks)
            .select('*, sections(name)')
            .eq('site_id', siteId)
            .order('name'),
          supabase
            .from(TABLES.seedEntries)
            .select('*')
            .eq('site_id', siteId),
          supabase
            .from(TABLES.bills)
            .select('id, stocking_status_data, selected_tanks, status, stocking_status, updated_at, created_at, outside_workers_data, packing_outside_workers_data')
            .eq('site_id', siteId)
            .eq('type', 'seed')
            .in('status', ['Completed']),
        ]);

        const seedEntryTankIds = new Set(
          (sEntries ?? []).map((se) => se.tank_id || se.tank_name).filter(Boolean)
        );

        const allSiteTanks = tks ?? [];
        const siteTanksMap = new Map();
        for (const t of allSiteTanks) {
          siteTanksMap.set(String(t.name || t.id).trim().toLowerCase(), t);
        }

        // Extract all tank names from completed stocking bills (across all vehicles)
        // and capture their EXACT latest completion timestamp.
        const stockedTankNamesFromBills = new Set();
        const tankStockingTimes = {};

        for (const bill of (completedBills ?? [])) {
          const billTime = new Date(bill.updated_at || bill.created_at || 0).getTime();

          const owBatches = bill.outside_workers_data?.batches || [];
          const topOWSelectedTanks = bill.outside_workers_data?.selectedTanks;
          const legacyPackData = bill.packing_outside_workers_data;

          const hasOWData = owBatches.length > 0 ||
            Boolean(topOWSelectedTanks && Array.isArray(topOWSelectedTanks) && topOWSelectedTanks.length > 0) ||
            Boolean(legacyPackData && Array.isArray(legacyPackData.selectedTanks) && legacyPackData.selectedTanks.length > 0);

          if (hasOWData) {
            // 1. Process directly from Outside Workers Selected Tanks (authoritative source for Trail Netting)
            const selectedTanksFromOW = [];
            if (owBatches.length > 0) {
              owBatches.forEach(b => {
                if (Array.isArray(b.selectedTanks)) {
                  b.selectedTanks.forEach(t => selectedTanksFromOW.push(t));
                }
              });
            } else if (Array.isArray(topOWSelectedTanks)) {
              topOWSelectedTanks.forEach(t => selectedTanksFromOW.push(t));
            } else if (legacyPackData && Array.isArray(legacyPackData.selectedTanks)) {
              legacyPackData.selectedTanks.forEach(t => selectedTanksFromOW.push(t));
            }

            selectedTanksFromOW.forEach(t => {
              if (!t.tankName && !t.tankId && !t.name) return;

              const qtyRaw = t.finalQuantity ?? t.quantity ?? t.remainingQuantity ?? t.totalCount ?? t.count;
              if (qtyRaw !== undefined && qtyRaw !== null && Number(qtyRaw) <= 0) return;

              const rawName = String(t.tankName || t.name || t.tankId).trim();
              const actualTankName = rawName.toLowerCase();

              if (siteTanksMap.has(actualTankName)) {
                stockedTankNamesFromBills.add(actualTankName);
                if (!tankStockingTimes[actualTankName] || billTime > tankStockingTimes[actualTankName]) {
                  tankStockingTimes[actualTankName] = billTime;
                }
              }
            });
          } else if (bill.stocking_status_data && typeof bill.stocking_status_data === 'object') {
            // 2. Process Seed Van Plan / Mixed completions from stocking_status_data
            const sd = bill.stocking_status_data;
            // Process top-level (legacy flat structure)
            if (sd.tankStates && typeof sd.tankStates === 'object') {
              const aggregated = aggregateTankStates(sd.tankStates, sd.transfers || []);
              for (const agg of aggregated) {
                if ((agg.status === 'completed' || agg.status === 'pending') && agg.totalCount > 0) {
                  const actualTankName = String(agg.tankName).trim().toLowerCase();
                  if (siteTanksMap.has(actualTankName)) {
                    stockedTankNamesFromBills.add(actualTankName);
                    if (!tankStockingTimes[actualTankName] || billTime > tankStockingTimes[actualTankName]) {
                      tankStockingTimes[actualTankName] = billTime;
                    }
                  }
                }
              }
            }

            // Process multi-vehicle nested structure
            for (const [vKey, value] of Object.entries(sd)) {
              if (
                vKey !== 'tankStates' && vKey !== 'transfers' && vKey !== 'returnBills' &&
                vKey !== 'supervisorName' && vKey !== 'supervisorPhone' && vKey !== 'supervisorNumber' &&
                vKey !== 'supervisorSignature' && vKey !== 'seedVanCompleted' &&
                value && typeof value === 'object' && value.tankStates && typeof value.tankStates === 'object'
              ) {
                const aggregated = aggregateTankStates(value.tankStates, value.transfers || []);
                for (const agg of aggregated) {
                  if ((agg.status === 'completed' || agg.status === 'pending') && agg.totalCount > 0) {
                    const actualTankName = String(agg.tankName).trim().toLowerCase();
                    if (siteTanksMap.has(actualTankName)) {
                      stockedTankNamesFromBills.add(actualTankName);
                      if (!tankStockingTimes[actualTankName] || billTime > tankStockingTimes[actualTankName]) {
                        tankStockingTimes[actualTankName] = billTime;
                      }
                    }
                  }
                }
              }
            }
          } else if (Array.isArray(bill.selected_tanks)) {
            // 3. Process Packing completions from selected_tanks
            for (const t of bill.selected_tanks) {
              if (Number(t.quantity) > 0) {
                const actualTankName = String(t.name || '').trim().toLowerCase();
                if (siteTanksMap.has(actualTankName)) {
                  stockedTankNamesFromBills.add(actualTankName);
                  if (!tankStockingTimes[actualTankName] || billTime > tankStockingTimes[actualTankName]) {
                    tankStockingTimes[actualTankName] = billTime;
                  }
                }
              }
            }
          }
        }

        const combinedSiteTanks = [...allSiteTanks];

        // Every tank whose Seed Stocking has been completed:
        // - found in seed_entries
        // - OR found in a completed bill's stocking_status_data
        const stocked = combinedSiteTanks.filter(
          (t) =>
            seedEntryTankIds.has(t.id) ||
            seedEntryTankIds.has(t.name) ||
            stockedTankNamesFromBills.has(String(t.name || '').trim().toLowerCase())
        );

        // 3. Fetch records & reports
        const { data: recs } = await supabase
          .from(TABLES.trailNettingRecords)
          .select('*')
          .order('date', { ascending: true });

        const recMap = {};
        (recs ?? []).forEach((r) => {
          (recMap[r.tank_id] ??= []).push(r);
        });
        setRecords(recMap);

        const { data: repData } = await supabase
          .from(TABLES.trailNettingReports)
          .select('*');

        const repMap = {};
        const getReportTimestamp = (report) => {
          if (!report) return 0;
          return new Date(report.updated_at || report.created_at || report.latest_date || report.process_details?.date || 0).getTime();
        };

        (repData ?? []).forEach((rp) => {
          const existing = repMap[rp.tank_id];
          if (!existing) {
            repMap[rp.tank_id] = rp;
          } else {
            const existingTime = getReportTimestamp(existing);
            const rpTime = getReportTimestamp(rp);
            if (rpTime > existingTime) {
              repMap[rp.tank_id] = rp;
            }
          }
        });
        setReports(repMap);

        // Active/pending tanks: completed Seed Order tanks that have NOT completed Trail Netting for the current cycle.
        const pending = stocked.filter((t) => {
          const report = repMap[t.id];
          if (!report) return true; // No report ever — always pending
          if (report.process_details?.status === 'draft') return true;

          const reportTime = getReportTimestamp(report);
          const tName = String(t.name || '').trim().toLowerCase();
          const exactStockingTime = tankStockingTimes[tName];

          if (exactStockingTime) {
            return reportTime < exactStockingTime;
          }

          if (!t.start_date) return false;
          const startTime = new Date(t.start_date).getTime();
          return reportTime < startTime;
        });

        // History tanks: tanks for which a Trail Netting Report was generated for the current cycle
        const completed = combinedSiteTanks.filter((t) => {
          const report = repMap[t.id];
          if (!report) return false;
          if (report.process_details?.status === 'draft') return false;

          const reportTime = getReportTimestamp(report);
          const tName = String(t.name || '').trim().toLowerCase();
          const exactStockingTime = tankStockingTimes[tName];

          if (exactStockingTime) {
            return reportTime >= exactStockingTime;
          }

          if (!t.start_date) return true;
          const startTime = new Date(t.start_date).getTime();
          return reportTime >= startTime;
        });

        setPendingTanks(pending);
        setCompletedTanks(completed);
        setStockingTimes(tankStockingTimes);
      } catch (err) {
        console.error("TankList Data Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [siteId, selectedSectionId]);


  const handleSectionSelect = (secId) => {
    setActiveSectionId(secId);
    if (secId !== 'all') {
      selectSection(secId);
    }
  };

  const currentList = activeTab === 'active' ? pendingTanks : completedTanks;
  const sectionTanks =
    activeSectionId === 'all'
      ? currentList
      : currentList.filter((t) => t.section_id === activeSectionId);
  const activeSectionObj = sections.find((s) => s.id === activeSectionId);

  if (loading) return <Spinner />;
  if (!siteId) return <Empty icon="🗺️" title="Select a site first" />;

  return (
    <div className="space-y-6">
      {/* Top Header & Settings Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Trail Netting</h1>
          <p className="text-xs text-slate-500">
            Completed Seed Order tanks ready for Trail Netting. Completed nettings move to History.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/app/trail-netting/payments')}
            className="btn-secondary text-xs font-bold px-3 py-2 flex items-center gap-1.5 border-emerald-300 text-emerald-900 bg-emerald-50 hover:bg-emerald-100"
          >
            💳 Payments
          </button>
          <button
            onClick={() => navigate('/app/trail-netting/reports')}
            className="btn-secondary text-xs font-bold px-3 py-2 flex items-center gap-1.5"
          >
            📊 View Reports Table
          </button>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="btn-primary text-xs font-bold px-3 py-2 flex items-center gap-1.5"
          >
            ⚙️ Trail Netting Settings
          </button>
        </div>
      </div>

      {/* Main Tab Switcher: [ Active / Pending ] [ History ] */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-sm">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex-1 py-3 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'active'
            ? 'bg-slate-900 text-white shadow-md'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
        >
          <span>🌊 Active / Pending Tanks</span>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${activeTab === 'active' ? 'bg-slate-700 text-slate-100' : 'bg-slate-300 text-slate-700'
              }`}
          >
            {pendingTanks.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-3 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'history'
            ? 'bg-slate-900 text-white shadow-md'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
        >
          <span>📜 History</span>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${activeTab === 'history' ? 'bg-slate-700 text-slate-100' : 'bg-slate-300 text-slate-700'
              }`}
          >
            {completedTanks.length}
          </span>
        </button>
      </div>

      {/* Section Selector Tabs Bar */}
      {sections.length > 0 && (
        <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2 overflow-x-auto scroll-thin">
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 px-3">
            Section:
          </span>
          <button
            onClick={() => handleSectionSelect('all')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 ${activeSectionId === 'all'
              ? 'bg-slate-900 text-white shadow-md'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
          >
            <span>All Sections</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full ${activeSectionId === 'all' ? 'bg-slate-700 text-slate-100' : 'bg-slate-200 text-slate-600'
                }`}
            >
              {currentList.length} tanks
            </span>
          </button>
          {sections.map((sec) => {
            const isActive = sec.id === activeSectionId;
            const count = currentList.filter((t) => t.section_id === sec.id).length;
            return (
              <button
                key={sec.id}
                onClick={() => handleSectionSelect(sec.id)}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 ${isActive
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
              >
                <span>Section {sec.name}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${isActive ? 'bg-slate-700 text-slate-100' : 'bg-slate-200 text-slate-600'
                    }`}
                >
                  {count} tanks
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Section Filter Indicator */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>
          Displaying {activeTab === 'active' ? 'Active / Pending' : 'Completed History'} tanks for{' '}
          <strong>{activeSectionId === 'all' ? 'All Sections' : `Section ${activeSectionObj ? activeSectionObj.name : ''}`}</strong> ({sectionTanks.length} tanks)
        </span>
      </div>

      {/* Tank Cards Grid */}
      {sectionTanks.length === 0 ? (
        <Empty
          icon={activeTab === 'active' ? '🌊' : '📜'}
          title={
            activeTab === 'active'
              ? `No active pending tanks in Section ${activeSectionObj ? activeSectionObj.name : ''}`
              : `No completed Trail Netting history in Section ${activeSectionObj ? activeSectionObj.name : ''}`
          }
          hint={
            activeTab === 'active'
              ? 'Stocked tanks from completed Seed Orders will appear here.'
              : 'Tanks for which Trail Netting has been performed will appear here in History.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sectionTanks.map((t) => {
            const allTankRecords = records[t.id] ?? [];
            const latestReport = reports[t.id];

            if (activeTab === 'history') {
              const cadence = computeCadence({ startDate: t.start_date, records: allTankRecords });
              return (
                <HistoryTankCardTN
                  key={t.id}
                  tank={t}
                  report={latestReport}
                  recordsList={allTankRecords}
                  onViewReport={() => setSelectedHistoryItem({ tank: t, report: latestReport, recordsList: allTankRecords })}
                />
              );
            }

            // For Active/Pending Tab: Filter records for the CURRENT cycle only
            const tName = String(t.name || '').trim().toLowerCase();
            const exactStockingTime = stockingTimes[tName];
            const cycleStartTime = exactStockingTime || (t.start_date ? new Date(t.start_date).getTime() : 0);

            const currentCycleRecords = allTankRecords.filter(r => new Date(r.date).getTime() >= cycleStartTime);
            const cadence = computeCadence({ startDate: t.start_date, records: currentCycleRecords });

            const lastRec = currentCycleRecords[currentCycleRecords.length - 1];
            const latestCountVal = lastRec?.final_count || '—';

            let latestCountDate = '—';
            if (lastRec?.date) {
              latestCountDate = formatDate(lastRec.date);
            } else if (exactStockingTime) {
              latestCountDate = formatDate(new Date(exactStockingTime).toISOString());
            } else if (t.start_date) {
              latestCountDate = formatDate(t.start_date);
            }

            return (
              <TankCardTN
                key={t.id}
                tank={t}
                cadence={cadence}
                latestCount={latestCountVal}
                latestCountDate={latestCountDate}
                nettingCount={currentCycleRecords.length}
                onNet={() => navigate(`/app/trail-netting/${t.id}/checklist`)}
              />
            );
          })}
        </div>
      )}

      {/* Trail Netting Settings Modal */}
      <TrailNettingSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />

      {/* Trail Netting History Complete Details Modal */}
      <TrailNettingHistoryModal
        isOpen={!!selectedHistoryItem}
        onClose={() => setSelectedHistoryItem(null)}
        tank={selectedHistoryItem?.tank}
        report={selectedHistoryItem?.report}
        recordsList={selectedHistoryItem?.recordsList}
      />
    </div>
  );
}

function HistoryTankCardTN({ tank, report, recordsList, onViewReport }) {
  const tankRecords = recordsList ?? [];
  const cadence = computeCadence({ startDate: tank.start_date, records: tankRecords });
  const lastRec = tankRecords[tankRecords.length - 1];
  const latestCountVal = lastRec?.final_count || report?.latest_count || '—';
  const latestCountDate = lastRec?.date
    ? formatDate(lastRec.date)
    : report?.latest_date
      ? formatDate(report.latest_date)
      : tank.start_date
        ? formatDate(tank.start_date)
        : '—';
  const docVal = report?.doc || cadence.day || '—';

  return (
    <div className="rounded-2xl p-5 border border-emerald-200 bg-white shadow-card hover:shadow-md transition-all space-y-4">
      {/* Header Row: Section & Tank Name */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
            {tank.sections?.name ? `Section ${tank.sections.name}` : 'Tank'}
          </span>
          <h3 className="text-xl font-black text-slate-900">
            Tank {tank.name}
          </h3>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
          ✅ Netting Completed
        </span>
      </div>

      {/* Tank Information Grid */}
      <div className="grid grid-cols-2 gap-2 text-center pt-1">
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <p className="text-2xl font-black text-slate-900 font-mono">Day {docVal}</p>
          <p className="text-[10px] font-extrabold uppercase text-slate-500">Days (DOC)</p>
        </div>

        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <p className="text-2xl font-black text-slate-900 font-mono">{tankRecords.length || 1}</p>
          <p className="text-[10px] font-extrabold uppercase text-slate-500">Netting Count</p>
        </div>
      </div>

      {/* Latest Sampling Information */}
      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5 text-xs text-slate-700">
        <div className="flex justify-between items-center">
          <span className="text-slate-500 font-semibold">Completed Count:</span>
          <span className="font-extrabold font-mono text-emerald-700 text-sm">
            {latestCountVal !== '—' ? `${latestCountVal} Count/KG` : '—'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500 font-semibold">Netting Date:</span>
          <span className="font-bold text-slate-800">{latestCountDate}</span>
        </div>
        {tank.hatchery && (
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-semibold">Hatchery:</span>
            <span className="font-bold text-slate-800 truncate max-w-[150px]">{tank.hatchery}</span>
          </div>
        )}
      </div>

      {/* Action Button */}
      <div className="pt-1">
        <button
          onClick={onViewReport}
          className="btn-secondary w-full py-2.5 text-xs font-extrabold flex items-center justify-center gap-2 border-slate-300 text-slate-700 hover:bg-slate-100"
        >
          📊 View Completed Details & Report
        </button>
      </div>
    </div>
  );
}

function TankCardTN({ tank, cadence, latestCount, latestCountDate, nettingCount, onNet }) {
  // Tank completed 45 days or more since seed stocking
  const reachedDay45 = cadence.day >= 45;

  return (
    <div className="rounded-2xl p-5 border border-slate-200 bg-white shadow-card hover:shadow-md transition-all space-y-4">
      {/* Header Row: Section & Tank Name */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
            {tank.sections?.name ? `Section ${tank.sections.name}` : 'Tank'}
          </span>
          <h3 className="text-xl font-black text-slate-900">
            Tank {tank.name}
          </h3>
        </div>
      </div>

      {/* Eligibility Alert (displayed ONLY when completed 45 days or more) */}
      {reachedDay45 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center gap-2 text-emerald-800 text-xs font-extrabold">
          <span className="text-base">✨</span>
          <span>Eligible for Trail Netting</span>
        </div>
      )}

      {/* Tank Information Grid */}
      <div className="grid grid-cols-2 gap-2 text-center pt-1">
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <p className="text-2xl font-black text-slate-900 font-mono">Day {cadence.day}</p>
          <p className="text-[10px] font-extrabold uppercase text-slate-500">Number of Days</p>
        </div>

        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <p className="text-2xl font-black text-slate-900 font-mono">{nettingCount}</p>
          <p className="text-[10px] font-extrabold uppercase text-slate-500">Netting Count</p>
        </div>
      </div>

      {/* Latest Sampling Information */}
      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5 text-xs text-slate-700">
        <div className="flex justify-between items-center">
          <span className="text-slate-500 font-semibold">Latest Count:</span>
          <span className="font-extrabold font-mono text-slate-900 text-sm">
            {latestCount !== '—' ? `${latestCount} Count/KG` : '—'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500 font-semibold">Latest Count Date:</span>
          <span className="font-bold text-slate-800">{latestCountDate}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500 font-semibold">Feed:</span>
          <span className="font-extrabold font-mono text-slate-900 text-sm">
            {tank.feed != null ? `${tank.feed} KG` : '—'}
          </span>
        </div>
      </div>

      {/* Trail Netting Button */}
      <div className="pt-1">
        <button
          onClick={onNet}
          className="btn-primary w-full py-3 text-sm font-extrabold flex items-center justify-center gap-2 shadow-sm hover:shadow transition-all"
        >
          🥢 Trail Netting
        </button>
      </div>
    </div>
  );
}