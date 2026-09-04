import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { useSite } from '../../../hooks/useSite';
import { useToast } from '../../../hooks/useToast';
import { PREDEFINED_FEED_SCHEDULE, getHatcheryTheme } from './feedSchedule';

export default function FeedChartsPage() {
  const { siteId } = useSite();
  const toast = useToast();
  const navigate = useNavigate();

  const [feedCharts, setFeedCharts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search Hatchery state (Dropdown appears ONLY while typing/searching)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHatchery, setSelectedHatchery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Add Hatchery state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHatcheryName, setNewHatcheryName] = useState('');
  const [newFeedNumber, setNewFeedNumber] = useState(PREDEFINED_FEED_SCHEDULE[0]);
  const [newKgs, setNewKgs] = useState('');

  useEffect(() => {
    if (!siteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from(TABLES.feedCharts)
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setFeedCharts(data ?? []);
        setLoading(false);
      });
  }, [siteId]);

  // Unique hatchery names derived from feedCharts
  const hatcheryNames = useMemo(() => {
    const set = new Set(feedCharts.map((fc) => fc.hatchery_name));
    return Array.from(set).filter(Boolean);
  }, [feedCharts]);

  // Filtered hatchery names for search dropdown
  const filteredHatcheries = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return hatcheryNames.filter((h) => h.toLowerCase().includes(q));
  }, [hatcheryNames, searchQuery]);

  async function handleAddFeedChart() {
    if (!newHatcheryName.trim()) return toast.error('Enter Hatchery Name');
    if (!newFeedNumber) return toast.error('Select Feed Number');
    if (!newKgs) return toast.error('Enter Kgs');

    const payload = {
      site_id: siteId,
      hatchery_name: newHatcheryName.trim(),
      feed_number: newFeedNumber,
      kgs: Number(newKgs) || 0,
    };

    const { data, error } = await supabase.from(TABLES.feedCharts).insert(payload).select();
    if (error) return toast.error(error.message);

    const added = (Array.isArray(data) ? data[0] : data) || { id: `fc-${Date.now()}`, ...payload };
    setFeedCharts((prev) => [added, ...prev]);
    setSelectedHatchery(added.hatchery_name);
    setSearchQuery(added.hatchery_name);
    setShowAddForm(false);
    setNewKgs('');
    toast.success(`Feed chart saved for ${added.hatchery_name}`);
  }

  // Active hatchery feed charts sorted strictly by PREDEFINED_FEED_SCHEDULE
  const activeFeedCharts = useMemo(() => {
    const list = selectedHatchery
      ? feedCharts.filter((fc) => fc.hatchery_name === selectedHatchery)
      : feedCharts;

    return [...list].sort((a, b) => {
      const idxA = PREDEFINED_FEED_SCHEDULE.indexOf(a.feed_number);
      const idxB = PREDEFINED_FEED_SCHEDULE.indexOf(b.feed_number);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [feedCharts, selectedHatchery]);

  const activeTheme = getHatcheryTheme(selectedHatchery);

  if (!siteId) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <p className="text-sm text-text-muted">Select a site first.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header & Back Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/app/seed/reports')} className="btn-ghost text-xs font-bold flex items-center gap-1">
          <span>←</span> Back to Reports
        </button>
        <button
          onClick={() => setShowAddForm((s) => !s)}
          className="btn-primary text-xs px-4 py-2 flex items-center gap-1 font-bold"
        >
          <span>+</span> Add New Hatchery
        </button>
      </div>

      <div className="card p-6 border space-y-5" style={{ borderColor: 'var(--color-primary)' }}>
        <div>
          <h2 className="text-xl font-extrabold flex items-center gap-2">
            <span>📋</span> Hatchery Feed Charts Management
          </h2>
          <p className="text-xs text-text-secondary mt-1">
            Centralized repository for hatchery feed numbers and standard schedules. Feed numbers strictly follow the predefined sequence.
          </p>
        </div>

        {/* Add New Hatchery Form */}
        {showAddForm && (
          <div className="p-4 rounded-[12px] space-y-3" style={{ background: 'var(--color-surface)' }}>
            <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Add Hatchery Feed Chart Entry</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="field-label">Hatchery Name *</label>
                <input
                  className="field"
                  placeholder="e.g. Sandhya Hatchery"
                  value={newHatcheryName}
                  onChange={(e) => setNewHatcheryName(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label">Feed Number (Ordered Schedule) *</label>
                <select
                  className="field"
                  value={newFeedNumber}
                  onChange={(e) => setNewFeedNumber(e.target.value)}
                >
                  {PREDEFINED_FEED_SCHEDULE.map((fn) => (
                    <option key={fn} value={fn}>{fn}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Kgs *</label>
                <input
                  type="number"
                  className="field"
                  placeholder="e.g. 200"
                  value={newKgs}
                  onChange={(e) => setNewKgs(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowAddForm(false)} className="btn-ghost text-xs">Cancel</button>
              <button onClick={handleAddFeedChart} className="btn-success text-xs font-bold">Save Entry</button>
            </div>
          </div>
        )}

        {/* Search Hatchery Input (Dropdown appears ONLY while typing) */}
        <div className="relative max-w-md">
          <label className="field-label">Search Hatchery</label>
          <input
            className="field py-2 text-sm"
            placeholder="Type hatchery name to search..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsDropdownOpen(true);
              if (!e.target.value.trim()) setSelectedHatchery('');
            }}
            onFocus={() => {
              if (searchQuery.trim()) setIsDropdownOpen(true);
            }}
          />

          {/* Search Dropdown (Appears only while typing/searching) */}
          {isDropdownOpen && filteredHatcheries.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-[10px] border shadow-lg overflow-hidden bg-white max-h-48 overflow-y-auto">
              {filteredHatcheries.map((h) => (
                <button
                  key={h}
                  onClick={() => {
                    setSelectedHatchery(h);
                    setSearchQuery(h);
                    setIsDropdownOpen(false); // Closes automatically after selection
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface)] flex items-center justify-between border-b last:border-0"
                >
                  <span className="font-semibold">{h}</span>
                  {selectedHatchery === h && <span className="text-success text-xs font-bold">✓ Selected</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Hatchery Theme Banner */}
        {selectedHatchery && (
          <div
            className="p-4 rounded-[12px] flex items-center justify-between shadow-sm"
            style={{ background: activeTheme.headerBg, color: activeTheme.headerText }}
          >
            <div>
              <p className="text-xs uppercase font-bold tracking-wider opacity-80">Selected Hatchery</p>
              <h3 className="text-lg font-extrabold">{selectedHatchery}</h3>
            </div>
            <button
              onClick={() => {
                setSelectedHatchery('');
                setSearchQuery('');
              }}
              className="text-xs px-3 py-1 rounded-full font-bold bg-white/20 hover:bg-white/30 text-white"
            >
              Clear Filter
            </button>
          </div>
        )}

        {/* Feed Schedule Table (Strict Predefined Order) */}
        <div>
          <p className="text-xs font-bold uppercase text-text-muted mb-2">
            Feed Schedule ({activeFeedCharts.length} entries)
          </p>

          {activeFeedCharts.length === 0 ? (
            <p className="text-xs text-text-muted p-4 border rounded-[10px] text-center">
              No feed charts available. Use "+ Add New Hatchery" above to create one.
            </p>
          ) : (
            <div className="overflow-x-auto border rounded-[12px]" style={{ borderColor: 'var(--color-border)' }}>
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-[var(--color-surface)] border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <th className="p-3 font-bold">Sequence</th>
                    <th className="p-3 font-bold">Hatchery Name</th>
                    <th className="p-3 font-bold">Feed Number</th>
                    <th className="p-3 font-bold text-right">Kgs</th>
                  </tr>
                </thead>
                <tbody>
                  {activeFeedCharts.map((fc, idx) => {
                    const theme = getHatcheryTheme(fc.hatchery_name);
                    return (
                      <tr key={fc.id} className="border-b last:border-0 hover:bg-[var(--color-surface)]" style={{ borderColor: 'var(--color-border)' }}>
                        <td className="p-3 font-bold text-text-muted">{idx + 1}</td>
                        <td className="p-3 font-semibold">{fc.hatchery_name}</td>
                        <td className="p-3">
                          <span
                            className="px-2.5 py-1 rounded-full font-extrabold"
                            style={{ background: theme.badgeBg, color: theme.accentColor }}
                          >
                            {fc.feed_number}
                          </span>
                        </td>
                        <td className="p-3 font-extrabold text-right">{fc.kgs} Kg</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
