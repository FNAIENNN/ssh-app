
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, TABLES } from '../../lib/supabaseClient';
import { useSite } from '../../hooks/useSite';
import { computeCadence, formatDate } from '../../hooks/useTrailNettingCadence';
import { Empty, Spinner } from '../../components/ui/State';
import TrailNettingSettingsModal from './TrailNettingSettingsModal';

export default function TankList() {
  const { siteId, selectedSectionId, selectSection } = useSite();
  const navigate = useNavigate();

  const [sections, setSections] = useState([]);
  const [activeSectionId, setActiveSectionId] = useState(selectedSectionId);
  const [tanks, setTanks] = useState([]);
  const [records, setRecords] = useState({}); // tankId -> records[]
  const [reports, setReports] = useState({}); // tankId -> latest report
  const [loading, setLoading] = useState(true);

  const [showSettingsModal, setShowSettingsModal] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    (async () => {
      // 1. Fetch sections for this site
      const { data: secs } = await supabase
        .from(TABLES.sections)
        .select('*')
        .eq('site_id', siteId)
        .order('name');

      setSections(secs ?? []);

      // Determine active section: selectedSectionId -> or first section
      const activeSec = selectedSectionId || (secs && secs.length > 0 ? secs[0].id : null);
      setActiveSectionId(activeSec);

      // 2. Fetch tanks for site
      const { data: tks } = await supabase
        .from(TABLES.tanks)
        .select('*, sections(name)')
        .eq('site_id', siteId)
        .order('name');

      const stocked = (tks ?? []).filter((t) => Number(t.quantity || 0) > 0);
      setTanks(stocked);

      // 3. Fetch records & reports
      if (stocked.length > 0) {
        const { data: recs } = await supabase
          .from(TABLES.trailNettingRecords)
          .select('*')
          .in('tank_id', stocked.map((t) => t.id))
          .order('date', { ascending: true });

        const recMap = {};
        (recs ?? []).forEach((r) => {
          (recMap[r.tank_id] ??= []).push(r);
        });
        setRecords(recMap);

        const { data: repData } = await supabase
          .from(TABLES.trailNettingReports)
          .select('*')
          .in('tank_id', stocked.map((t) => t.id));

        const repMap = {};
        (repData ?? []).forEach((rp) => {
          repMap[rp.tank_id] = rp;
        });
        setReports(repMap);
      }

      setLoading(false);
    })();
  }, [siteId, selectedSectionId]);

  const handleSectionSelect = (secId) => {
    setActiveSectionId(secId);
    selectSection(secId);
  };

  // Filter tanks belonging ONLY to the selected section
  const sectionTanks = tanks.filter((t) => t.section_id === activeSectionId);
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
            Stocked tanks scoped to Section. First netting: Day 45–60. Subsequent nettings: every 7 days.
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

      {/* Section Selector Tabs Bar */}
      {sections.length > 0 && (
        <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2 overflow-x-auto scroll-thin">
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 px-3">
            Section:
          </span>
          {sections.map((sec) => {
            const isActive = sec.id === activeSectionId;
            const count = tanks.filter((t) => t.section_id === sec.id).length;
            return (
              <button
                key={sec.id}
                onClick={() => handleSectionSelect(sec.id)}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <span>Section {sec.name}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    isActive ? 'bg-slate-700 text-slate-100' : 'bg-slate-200 text-slate-600'
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
      {activeSectionObj && (
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>
            Displaying tanks for <strong>Section {activeSectionObj.name}</strong> ({sectionTanks.length} stocked tanks)
          </span>
        </div>
      )}

      {/* Tank Cards Grid */}
      {sectionTanks.length === 0 ? (
        <Empty
          icon="🌊"
          title={`No stocked tanks in Section ${activeSectionObj ? activeSectionObj.name : ''}`}
          hint="Select another section above or stock seed into tanks from Seed → Sections."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sectionTanks.map((t) => {
            const tankRecords = records[t.id] ?? [];
            const cadence = computeCadence({ startDate: t.start_date, records: tankRecords });
            const latestReport = reports[t.id];

            // Latest count & date details
            const lastRec = tankRecords[tankRecords.length - 1];
            const latestCountVal = lastRec?.final_count || latestReport?.latest_count || '—';
            const latestCountDate = lastRec?.date
              ? formatDate(lastRec.date)
              : latestReport?.latest_date
              ? formatDate(latestReport.latest_date)
              : t.start_date
              ? formatDate(t.start_date)
              : '—';

            return (
              <TankCardTN
                key={t.id}
                tank={t}
                cadence={cadence}
                latestCount={latestCountVal}
                latestCountDate={latestCountDate}
                nettingCount={tankRecords.length}
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