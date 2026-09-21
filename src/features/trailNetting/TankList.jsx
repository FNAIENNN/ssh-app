import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase, TABLES } from '../../lib/supabaseClient';
import { useSite } from '../../hooks/useSite';
import { computeCadence, formatDate } from '../../hooks/useTrailNettingCadence';
import { aggregateTankStates } from '../seed/payments/seedStocking/stockingUtils';
import { buildTankCardData, currentCycleNettingRecords } from './tankCardData';
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
  const [seedEntries, setSeedEntries] = useState([]);
  const [stockingTimes, setStockingTimes] = useState({}); // normalizedTankName -> latest billTime
  const [showMenu, setShowMenu] = useState(false);
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
        setSeedEntries(sEntries ?? []);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Trail Netting</h1>
            <p className="text-xs text-slate-500 mt-1">
              Completed Seed Order tanks ready for Trail Netting.
            </p>
          </div>
          <button
            onClick={() => navigate('/app/trail-netting/payments')}
            className="btn-secondary text-xs font-bold px-3 py-1.5 flex items-center gap-1.5 border-emerald-300 text-emerald-900 bg-emerald-50 hover:bg-emerald-100 rounded-lg self-start sm:self-auto"
          >
            💳 Payments
          </button>
        </div>

        <div className="absolute top-5 right-5 sm:static">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors flex items-center justify-center w-8 h-8"
          >
            <span className="font-bold text-lg leading-none">⋮</span>
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-5 sm:right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                <button
                  onClick={() => { setShowMenu(false); navigate('/app/trail-netting/reports'); }}
                  className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  📊 View Reports Table
                </button>
                <div className="h-px bg-slate-100 w-full" />
                <button
                  onClick={() => { setShowMenu(false); setShowSettingsModal(true); }}
                  className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  ⚙️ Trail Netting Settings
                </button>
              </div>
            </>
          )}
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
            const currentCycleRecords = currentCycleNettingRecords(t, allTankRecords);
            const cadence = computeCadence({ startDate: t.start_date, records: currentCycleRecords });
            const cardData = buildTankCardData({ tank: t, seedEntries, records: allTankRecords, report: latestReport });

            return (
              <TankCardTN
                key={t.id}
                tank={t}
                cadence={cadence}
                cardData={cardData}
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
    <div className="h-full rounded-2xl p-4 border-2 border-slate-200 bg-slate-50/50 hover:border-slate-300 transition flex flex-col">
      {/* Header Row: Tank Name & Status */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
            {tank.sections?.name ? `Section ${tank.sections.name}` : 'Tank'}
          </span>
          <h3 className="text-lg font-black text-slate-900 leading-tight">
            Tank {tank.name}
          </h3>
        </div>
        <span className="shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
          Completed
        </span>
      </div>

      {/* Completed netting details follow the Harvest card label/value pattern. */}
      <div className="space-y-1.5 text-xs text-slate-600 flex-1">
        <CardRow label="DOC / Number of Days" value={`Day ${docVal}`} />
        <CardRow label="Netting Count" value={tankRecords.length || 1} />
        <CardRow label="Completed Count" value={latestCountVal !== '—' ? `${latestCountVal} Count/KG` : '—'} />
        <CardRow label="Netting Date" value={latestCountDate} />
        <CardRow label="Hatchery" value={tank.hatchery || '—'} />
      </div>

      {/* Bottom action retains the existing report callback. */}
      <div className="mt-4 pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={onViewReport}
          className="w-full flex items-center justify-between text-xs font-bold text-blue-700 hover:text-blue-900 transition-colors"
        >
          <span>View Completed Details &amp; Report</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}

function TankCardTN({ tank, cadence, cardData, onNet }) {
  // Tank completed 45 days or more since seed stocking
  const reachedDay45 = cadence.day >= 45;

  return (
    <div className="h-full rounded-2xl p-4 border-2 border-slate-200 bg-slate-50/50 hover:border-slate-300 transition flex flex-col">
      {/* Header Row: Tank Name & Status */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
            {tank.sections?.name ? `Section ${tank.sections.name}` : 'Tank'}
          </span>
          <h3 className="text-lg font-black text-slate-900 leading-tight">
            Tank {tank.name}
          </h3>
        </div>
        <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${cadence.status === 'overdue'
          ? 'bg-red-50 text-red-700 border-red-200'
          : cadence.canNet
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
            : 'bg-slate-200 text-slate-600 border-slate-300'
          }`}>
          {cadence.status === 'overdue' ? 'Overdue' : cadence.canNet ? 'Eligible' : 'Active'}
        </span>
      </div>

      {/* Eligibility note (displayed ONLY when completed 45 days or more) */}
      {reachedDay45 && (
        <div className="mb-3 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
          <span aria-hidden="true">✓</span>
          <span>Eligible for Trail Netting</span>
        </div>
      )}

      {/* Tank details follow the Harvest card label/value pattern. */}
      <div className="space-y-1.5 text-xs text-slate-600 flex-1">
        <CardRow label="DOC / Number of Days" value={`Day ${cadence.day}`} />
        <CardRow label="Seed Quantity" value={cardData.quantity ? `${Number(cardData.quantity).toLocaleString('en-IN')} PL` : '—'} />
        <CardRow label="Feed" value={cardData.feed != null ? `${Number(cardData.feed).toLocaleString('en-IN')} KG` : '—'} />
        <CardRow label="Latest Count" value={cardData.latestCount != null ? `${cardData.latestCount} Count/KG` : '—'} />
        <CardRow label="Latest Count Date" value={formatDate(cardData.latestCountDate)} />
        <CardRow label="Hatchery" value={cardData.hatchery} />
        <CardRow label="Netting Count" value={cardData.nettingCount} />
      </div>

      {/* Bottom action retains the existing navigation callback. */}
      <div className="mt-4 pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={onNet}
          className="w-full flex items-center justify-between text-xs font-bold text-blue-700 hover:text-blue-900 transition-colors"
        >
          <span>Trail Netting</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}

function CardRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-slate-600">{label}:</span>
      <span className="font-bold text-slate-900 text-right break-words">{value}</span>
    </div>
  );
}
