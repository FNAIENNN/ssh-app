import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, TABLES } from '../../lib/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { computeCadence } from '../../hooks/useTrailNettingCadence';
import { Spinner } from '../../components/ui/State';

export default function ChecklistPage() {
  const { tankId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [tank, setTank] = useState(null);
  const [checklistItems, setChecklistItems] = useState([]);
  const [checkedMap, setCheckedMap] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tankId) return;
    setLoading(true);
    (async () => {
      // Fetch tank details
      const { data: t } = await supabase
        .from(TABLES.tanks)
        .select('*, sections(name)')
        .eq('id', tankId)
        .maybeSingle();
      setTank(t);

      // Fetch dynamic checklist items from Trail Netting Settings
      const { data: settings } = await supabase
        .from(TABLES.trailNettingSettings)
        .select('*')
        .order('id');

      let items = settings || [];
      if (!items.length) {
        items = [
          { id: 'tns-1', label: 'Net' },
          { id: 'tns-2', label: 'Dettol' },
          { id: 'tns-3', label: 'Box' },
          { id: 'tns-4', label: 'Weighing Machine' },
          { id: 'tns-5', label: 'Bucket' },
          { id: 'tns-6', label: 'Rope' },
        ];
      }
      setChecklistItems(items);

      // Initialize all items as unchecked
      const initialMap = {};
      items.forEach((item) => {
        initialMap[item.id] = false;
      });
      setCheckedMap(initialMap);

      setLoading(false);
    })();
  }, [tankId]);

  const toggleItem = (id) => {
    setCheckedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const isAllSelected =
    checklistItems.length > 0 && checklistItems.every((item) => checkedMap[item.id]);

  const toggleSelectAll = () => {
    const nextState = !isAllSelected;
    const nextMap = {};
    checklistItems.forEach((item) => {
      nextMap[item.id] = nextState;
    });
    setCheckedMap(nextMap);
  };

  const handleProceed = () => {
    const countSelected = checklistItems.filter((item) => checkedMap[item.id]).length;
    if (countSelected === 0) {
      toast.warning('Please select at least one checklist item before proceeding.');
      return;
    }

    // Save checked items state in sessionStorage
    sessionStorage.setItem(`tn_checklist_${tankId}`, JSON.stringify(checkedMap));
    toast.success('Checklist verified!');
    navigate(`/app/trail-netting/${tankId}/sampling`);
  };

  if (loading) return <Spinner />;
  if (!tank) return <p className="p-6 text-text-muted">Tank not found.</p>;

  const cadence = computeCadence({ startDate: tank.start_date });

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      {/* Navigation Breadcrumb */}
      <button
        onClick={() => navigate('/app/trail-netting')}
        className="text-sm font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
      >
        ← Back to Tank List
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
            Step 1 of 3: Checklist
          </span>
          <span className="text-xs font-bold text-slate-500">
            {tank.sections?.name ? `Section ${tank.sections.name}` : 'Tank'} · Day {cadence.day}
          </span>
        </div>
        <h1 className="text-2xl font-black text-slate-900">Checklist — Tank {tank.name}</h1>
        <p className="text-xs text-slate-500">
          Verify and complete all required equipment checks loaded from Trail Netting Settings.
        </p>
      </div>

      {/* Checklist Container */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        {/* Top Header & Select All Option */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">Required Equipment & Tools</h3>
            <p className="text-xs text-slate-500">Click anywhere on an item row to toggle selection</p>
          </div>

          {/* Select All Card / Button */}
          <div
            onClick={toggleSelectAll}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all ${
              isAllSelected
                ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm'
                : 'border-slate-300 bg-slate-100 hover:border-slate-400 text-slate-700'
            }`}
          >
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={() => {}}
              className="w-4 h-4 accent-emerald-600 rounded cursor-pointer pointer-events-none"
            />
            <span className="text-xs font-extrabold select-none">
              {isAllSelected ? 'Deselect All' : 'Select All Checklist'}
            </span>
          </div>
        </div>

        {/* Checklist items grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {checklistItems.map((item) => {
            const isChecked = Boolean(checkedMap[item.id]);
            return (
              <div
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer select-none transition-all ${
                  isChecked
                    ? 'border-emerald-500 bg-emerald-50/70 shadow-sm'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100/60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {}}
                  className="w-5 h-5 accent-emerald-600 rounded cursor-pointer pointer-events-none"
                />
                <span
                  className={`text-sm font-bold ${
                    isChecked ? 'text-emerald-900' : 'text-slate-700'
                  }`}
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-2">
        <button
          onClick={handleProceed}
          className="btn-primary w-full py-3.5 text-base font-extrabold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition"
        >
          Proceed to Sampling →
        </button>
      </div>
    </div>
  );
}