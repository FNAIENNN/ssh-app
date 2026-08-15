import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { useSite } from '../../../hooks/useSite';
import { useToast } from '../../../hooks/useToast';
import { PREDEFINED_FEED_SCHEDULE, getHatcheryTheme } from '../reports/feedSchedule';

export default function FeedApplication({
  stockingDate,
  setStockingDate,
  numberOfDays,
  setNumberOfDays,
  kgPerDay,
  setKgPerDay,
}) {
  const { siteId } = useSite();
  const toast = useToast();
  const navigate = useNavigate();

  const [tanks, setTanks] = useState([]);
  const [feedCharts, setFeedCharts] = useState([]);

  // Hatchery selection (searchable dropdown)
  const [selectedHatchery, setSelectedHatchery] = useState('');
  const [hatcherySearch, setHatcherySearch] = useState('');
  const [isHatcheryDropdownOpen, setIsHatcheryDropdownOpen] = useState(false);

  // Per-feed number count map: { [feedNumber]: count }
  const [feedCounts, setFeedCounts] = useState(() => {
    const map = {};
    PREDEFINED_FEED_SCHEDULE.forEach((fn) => {
      map[fn] = 0;
    });
    // Default sample count for demo
    map['1C'] = 3;
    map['1C + 2C'] = 4;
    return map;
  });

  // Blind Chart visibility & editable cells state
  const [showBlindChart, setShowBlindChart] = useState(false);
  const [timesMap, setTimesMap] = useState({});
  const [tankCellsMap, setTankCellsMap] = useState({});

  useEffect(() => {
    if (!siteId) return;
    supabase
      .from(TABLES.tanks)
      .select('*')
      .eq('site_id', siteId)
      .order('name')
      .then(({ data }) => setTanks(data ?? []));

    supabase
      .from(TABLES.feedCharts)
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setFeedCharts(data ?? []));
  }, [siteId]);

  // Derived hatchery names list
  const hatcheries = useMemo(() => {
    const set = new Set(feedCharts.map((fc) => fc.hatchery_name));
    return Array.from(set).filter(Boolean);
  }, [feedCharts]);

  // Filtered hatcheries for search
  const filteredHatcheries = useMemo(() => {
    if (!hatcherySearch.trim()) return hatcheries;
    const q = hatcherySearch.toLowerCase();
    return hatcheries.filter((h) => h.toLowerCase().includes(q));
  }, [hatcheries, hatcherySearch]);

  function setFeedCount(feedNum, count) {
    setFeedCounts((prev) => ({
      ...prev,
      [feedNum]: Math.max(0, Number(count) || 0),
    }));
  }

  // Expanded feed sequence array based on entered counts
  const expandedFeedSequence = useMemo(() => {
    const seq = [];
    PREDEFINED_FEED_SCHEDULE.forEach((fn) => {
      const cnt = feedCounts[fn] || 0;
      for (let i = 0; i < cnt; i++) {
        seq.push(fn);
      }
    });
    return seq;
  }, [feedCounts]);

  // Total days calculated from expanded feed counts
  const totalFeedDays = expandedFeedSequence.length || Number(numberOfDays) || 7;

  // Format date helper: DD/MM/YYYY
  function formatDateDDMMYYYY(dateObj) {
    const d = String(dateObj.getDate()).padStart(2, '0');
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const y = dateObj.getFullYear();
    return `${d}/${m}/${y}`;
  }

  // Generate Blind Chart Rows
  const blindChartRows = useMemo(() => {
    const startDate = stockingDate ? new Date(stockingDate) : new Date();
    const rows = [];

    for (let i = 0; i < totalFeedDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = formatDateDDMMYYYY(d);
      const feedNum = expandedFeedSequence[i] || PREDEFINED_FEED_SCHEDULE[i % PREDEFINED_FEED_SCHEDULE.length];

      rows.push({
        sNo: i + 1,
        date: dateStr,
        feedNumber: feedNum,
        dayIdx: i,
      });
    }
    return rows;
  }, [totalFeedDays, stockingDate, expandedFeedSequence]);

  const hatcheryTheme = getHatcheryTheme(selectedHatchery);

  return (
    <div className="card p-6 space-y-6 border" style={{ borderColor: 'var(--color-primary)' }}>
      {/* Heading strictly: Feed Selection */}
      <h3 className="font-extrabold text-xl flex items-center gap-2">
        <span>🍱</span> Feed Selection
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Stocking Date */}
        <div>
          <label className="field-label">Stocking Date *</label>
          <input
            type="date"
            className="field"
            value={stockingDate}
            onChange={(e) => setStockingDate(e.target.value)}
          />
        </div>

        {/* Number of Days */}
        <div>
          <label className="field-label">Number of Days *</label>
          <select
            className="field"
            value={numberOfDays}
            onChange={(e) => setNumberOfDays(Number(e.target.value))}
          >
            {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d} {d === 1 ? 'Day' : 'Days'}
              </option>
            ))}
          </select>
        </div>

        {/* KG Per Day */}
        <div>
          <label className="field-label">KG Per Day *</label>
          <input
            type="number"
            step="0.1"
            className="field"
            placeholder="e.g. 2.0"
            value={kgPerDay}
            onChange={(e) => setKgPerDay(e.target.value)}
          />
        </div>
      </div>

      {/* Searchable Hatchery Selection with + Button */}
      <div className="p-4 rounded-[12px] space-y-3" style={{ background: 'var(--color-surface)' }}>
        <label className="field-label">Select Hatchery *</label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              className="field py-2 text-sm"
              placeholder="Search & select hatchery..."
              value={hatcherySearch || selectedHatchery}
              onChange={(e) => {
                setHatcherySearch(e.target.value);
                setIsHatcheryDropdownOpen(true);
                if (!e.target.value.trim()) setSelectedHatchery('');
              }}
              onFocus={() => {
                setIsHatcheryDropdownOpen(true);
              }}
            />

            {/* Dropdown appears ONLY while typing/searching */}
            {isHatcheryDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-[10px] border shadow-lg bg-white max-h-48 overflow-y-auto">
                {filteredHatcheries.length === 0 ? (
                  <div className="p-3 text-xs text-text-muted">
                    No matching hatchery. Click "+" to add new hatchery in Reports.
                  </div>
                ) : (
                  filteredHatcheries.map((h) => (
                    <button
                      key={h}
                      onClick={() => {
                        setSelectedHatchery(h);
                        setHatcherySearch(h);
                        setIsHatcheryDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface)] flex items-center justify-between border-b last:border-0"
                    >
                      <span className="font-semibold">{h}</span>
                      {selectedHatchery === h && <span className="text-success text-xs font-bold">✓ Selected</span>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* + Button redirects to Reports -> Feed Charts -> Add New Hatchery */}
          <button
            onClick={() => navigate('/app/seed/feed-charts')}
            className="w-10 h-10 rounded-[10px] bg-primary text-white font-extrabold flex items-center justify-center text-lg shadow-sm"
            title="Redirect to Reports -> Feed Charts -> Add New Hatchery"
          >
            +
          </button>
        </div>
      </div>

      {/* After Selecting Hatchery: Feed Numbers list in predefined order with Number of Days (Count) inputs */}
      {selectedHatchery && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm text-primary flex items-center gap-2">
              <span>📋</span> Feed Schedule Counts for {selectedHatchery}
            </h4>
            <span className="text-xs text-text-muted">Strict Predefined Sequence</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {PREDEFINED_FEED_SCHEDULE.map((fn) => (
              <div key={fn} className="p-3 rounded-[10px] border flex items-center justify-between bg-[var(--color-surface)]" style={{ borderColor: 'var(--color-border)' }}>
                <div>
                  <span className="font-bold text-xs text-primary">{fn}</span>
                  <p className="text-[10px] text-text-muted">Feed Number</p>
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-[10px] text-text-muted">Count:</label>
                  <input
                    type="number"
                    min="0"
                    className="field py-1 px-2 text-xs w-16 text-center font-bold"
                    value={feedCounts[fn] ?? 0}
                    onChange={(e) => setFeedCount(fn, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-3">
            <button
              onClick={() => setShowBlindChart(true)}
              className="btn-success text-base px-6 py-2.5 flex items-center gap-2 font-extrabold"
            >
              <span>📊</span>
              <span>Generate Blind Chart</span>
            </button>
          </div>
        </div>
      )}

      {/* Blind Feed Chart Output */}
      {showBlindChart && (
        <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          {/* Header with Selected Hatchery & Current Date DD/MM/YYYY */}
          <div
            className="p-4 rounded-[12px] flex items-center justify-between shadow-md"
            style={{ background: hatcheryTheme.headerBg, color: hatcheryTheme.headerText }}
          >
            <div>
              <p className="text-xs uppercase font-extrabold tracking-wider opacity-90">Blind Feed Chart</p>
              <h3 className="text-xl font-extrabold">{selectedHatchery || 'Sandhya Hatchery'}</h3>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold">Current Date: {formatDateDDMMYYYY(new Date())}</p>
              <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase" style={{ background: 'rgba(255,255,255,0.25)' }}>
                Theme: {hatcheryTheme.name}
              </span>
            </div>
          </div>

          {/* Table Structure: S.No, Date (DD/MM/YYYY), Feed Number, No. of Times, Tank Columns */}
          <div className="overflow-x-auto scroll-thin border rounded-[12px]" style={{ borderColor: hatcheryTheme.borderColor }}>
            <table className="w-full text-xs text-left">
              <thead>
                <tr style={{ background: hatcheryTheme.headerBg, color: hatcheryTheme.headerText }}>
                  <th className="p-2.5 font-bold">S.No</th>
                  <th className="p-2.5 font-bold">Date (DD/MM/YYYY)</th>
                  <th className="p-2.5 font-bold">Feed Number</th>
                  <th className="p-2.5 font-bold">No. of Times</th>
                  {tanks.map((t) => (
                    <th key={t.id} className="p-2.5 font-bold text-center border-l" style={{ borderColor: 'rgba(255,255,255,0.2)' }}>
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {blindChartRows.map((r) => (
                  <tr
                    key={r.sNo}
                    className="border-b last:border-0 hover:bg-opacity-50 transition"
                    style={{ borderColor: 'var(--color-border)', background: r.sNo % 2 === 0 ? hatcheryTheme.tableBg || 'var(--color-surface)' : '#FFFFFF' }}
                  >
                    <td className="p-2.5 font-bold text-text-muted">{r.sNo}</td>
                    <td className="p-2.5 font-bold">{r.date}</td>
                    <td className="p-2.5">
                      <span
                        className="px-2.5 py-1 rounded-full font-extrabold text-xs"
                        style={{ background: hatcheryTheme.badgeBg, color: hatcheryTheme.accentColor }}
                      >
                        {r.feedNumber}
                      </span>
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        placeholder="Times"
                        className="field py-1 px-2 text-xs w-20"
                        value={timesMap[r.dayIdx] || ''}
                        onChange={(e) => setTimesMap({ ...timesMap, [r.dayIdx]: e.target.value })}
                      />
                    </td>
                    {tanks.map((t) => {
                      const cellKey = `${r.dayIdx}-${t.id}`;
                      return (
                        <td key={t.id} className="p-2 border-l text-center" style={{ borderColor: 'var(--color-border)' }}>
                          <input
                            type="text"
                            placeholder="—"
                            className="field py-1 px-2 text-xs w-16 text-center"
                            value={tankCellsMap[cellKey] || ''}
                            onChange={(e) => setTankCellsMap({ ...tankCellsMap, [cellKey]: e.target.value })}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
