import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, TABLES } from '../../lib/supabaseClient';
import { useSite } from '../../hooks/useSite';
import { useToast } from '../../hooks/useToast';
import { Empty } from '../../components/ui/State';

const SESSIONS = [
  { name: 'Morning', icon: '☀️', meal: 'Tiffins' },
  { name: 'Afternoon', icon: '🌤️', meal: 'Lunch' },
  { name: 'Night', icon: '🌙', meal: 'Dinner' },
];
const STAGES = ['Ordered', 'Canteen Received', 'Dispatched', 'Received'];

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function formatDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatTime(d = new Date()) {
  return (d instanceof Date ? d : new Date(d)).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
function sessionIndexNow() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return 0;
  if (h >= 12 && h < 18) return 1;
  return 2;
}
function yesCount(list) {
  return list.filter((x) => x.foodStatus === 'yes').length;
}

/**
 * Shared canteen food request module.
 * `source` is 'seed' or 'harvest' so each tab keeps its own submit flow and history.
 */
export default function FoodModule({ source = 'seed' }) {
  const { siteId, site } = useSite();
  const toast = useToast();
  const isHarvest = source === 'harvest';
  const moduleLabel = isHarvest ? 'Harvest' : 'Seed';
  const accent = isHarvest ? '#E6A817' : 'var(--color-primary)';

  const [tab, setTab] = useState('prepare');
  const [workerTab, setWorkerTab] = useState('regular');
  const [shifts, setShifts] = useState(['Morning', 'Afternoon', 'Evening']);
  const [regular, setRegular] = useState([]);
  const [outside, setOutside] = useState([]);
  const [guests, setGuests] = useState([]);
  const [others, setOthers] = useState([]);
  const [guestName, setGuestName] = useState('');
  const [otherName, setOtherName] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(sessionIndexNow);
  const [stage, setStage] = useState(-1);
  const [orderId, setOrderId] = useState('');
  const [ordered, setOrdered] = useState({ regular: 0, outside: 0, extras: 0, total: 0 });
  const [received, setReceived] = useState({ regular: 0, outside: 0, extras: 0 });
  const [sessionSaved, setSessionSaved] = useState(false);
  const [detailDay, setDetailDay] = useState(null);

  const loadHistory = useCallback(async () => {
    if (!siteId) return;
    const [{ data: subs }, { data: sess }] = await Promise.all([
      supabase.from(TABLES.foodSubmissions).select('*').eq('site_id', siteId).eq('source', source).order('created_at', { ascending: false }),
      supabase.from(TABLES.foodSessions).select('*').eq('site_id', siteId).eq('source', source).order('created_at', { ascending: false }),
    ]);
    setHistory(subs ?? []);
    setSessions(sess ?? []);
  }, [siteId, source]);

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      const [{ data: pays }, { data: suppliers }, { data: harvests }] = await Promise.all([
        supabase.from(TABLES.payments).select('*').eq('site_id', siteId).eq('type', 'outside_worker'),
        supabase.from(TABLES.labourSuppliers).select('*').eq('site_id', siteId),
        supabase.from(TABLES.harvestEntries).select('*').eq('site_id', siteId),
      ]);

      const seedRegular = [
        { id: `${source}-rw-1`, name: 'Ravi Kumar', status: 'Active', foodStatus: 'yes' },
        { id: `${source}-rw-2`, name: 'Suresh Babu', status: 'Active', foodStatus: 'yes' },
        { id: `${source}-rw-3`, name: 'Lakshmi', status: 'Active', foodStatus: 'no' },
      ];
      const harvestRegular = [
        { id: `${source}-rw-1`, name: 'Harvest Crew A', status: 'Active', foodStatus: 'yes' },
        { id: `${source}-rw-2`, name: 'Grader Helper', status: 'Active', foodStatus: 'yes' },
        { id: `${source}-rw-3`, name: 'Weighing Operator', status: 'Active', foodStatus: 'yes' },
      ];
      setRegular(isHarvest ? harvestRegular : seedRegular);

      const batches = [];
      (suppliers ?? []).forEach((s) => {
        batches.push({
          id: s.id,
          name: s.name || 'Labour batch',
          totalWorkers: Number(s.default_workers || 8) || 8,
          count: Number(s.default_workers || 4) || 4,
          extra: '',
        });
      });
      (pays ?? []).slice(0, 4).forEach((p, i) => {
        if (batches.some((b) => b.id === p.id)) return;
        batches.push({
          id: p.id || `ow-${i}`,
          name: p.holder_name || p.supervisor_name || p.note || `Outside batch ${i + 1}`,
          totalWorkers: 10,
          count: 4,
          extra: '',
        });
      });
      if (isHarvest) {
        (harvests ?? []).forEach((h) => {
          const n = Number(h.labour_details?.main_workers || 0) + Number(h.labour_details?.guntu_workers || 0);
          if (!n) return;
          batches.push({
            id: `hv-${h.id}`,
            name: h.labour_details?.supplier_name || 'Harvest labour',
            totalWorkers: n,
            count: n,
            extra: h.harvest_type || '',
          });
        });
      }
      if (!batches.length) {
        batches.push({
          id: `${source}-ow-demo`,
          name: isHarvest ? 'Harvest outside crew' : 'Net mending crew',
          totalWorkers: 8,
          count: 4,
          extra: '',
        });
      }
      setOutside(batches);
      await loadHistory();
    })();
  }, [siteId, source, isHarvest, loadHistory]);

  const counts = useMemo(() => {
    const regularN = yesCount(regular);
    const outsideN = outside.reduce((s, b) => s + (Number(b.count) || 0), 0);
    const guestN = yesCount(guests);
    const otherN = yesCount(others);
    return {
      regular: regularN,
      outside: outsideN,
      guest: guestN,
      other: otherN,
      extras: guestN + otherN,
      total: regularN + outsideN + guestN + otherN,
    };
  }, [regular, outside, guests, others]);

  const balance = {
    regular: received.regular - ordered.regular,
    outside: received.outside - ordered.outside,
    extras: received.extras - ordered.extras,
    total: received.regular + received.outside + received.extras - ordered.total,
  };

  function toggleShift(name) {
    setShifts((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]));
  }
  function markAll(list, setter, status) {
    setter(list.map((x) => ({ ...x, foodStatus: status })));
  }
  function addGuest() {
    const name = guestName.trim();
    if (!name) return toast.error('Enter guest name');
    setGuests((prev) => [...prev, { id: `gst-${Date.now()}`, name, foodStatus: 'yes' }]);
    setGuestName('');
  }
  function addOther() {
    const name = otherName.trim();
    if (!name) return toast.error('Enter item name');
    setOthers((prev) => [...prev, { id: `oth-${Date.now()}`, name, foodStatus: 'yes' }]);
    setOtherName('');
  }

  async function persistSession(nextStage, extra = {}) {
    if (!siteId || !orderId) return;
    await supabase.from(TABLES.foodSessions).upsert({
      id: `${orderId}-${currentSession}`,
      site_id: siteId,
      source,
      submission_id: orderId,
      session_name: SESSIONS[currentSession].name,
      session_index: currentSession,
      attendance_date: todayKey(),
      stage: nextStage,
      ordered_regular: ordered.regular,
      ordered_outside: ordered.outside,
      ordered_guests_other: ordered.extras,
      ordered_total: ordered.total,
      received_regular: extra.received?.regular ?? received.regular,
      received_outside: extra.received?.outside ?? received.outside,
      received_guests_other: extra.received?.extras ?? received.extras,
      date: todayKey(),
    });
  }

  async function submitToCanteen() {
    if (!shifts.length) return toast.warning('Select at least one shift');
    if (counts.total <= 0) return toast.error('No people selected for food');
    if (!siteId) return toast.error('Select a site first');
    setSubmitting(true);
    const payload = [
      ...regular.filter((x) => x.foodStatus === 'yes').map((x) => ({ entryType: 'Regular Worker', ...x, peopleCount: 1 })),
      ...outside.filter((b) => Number(b.count) > 0).map((b) => ({
        entryType: 'Outside Worker', id: b.id, name: b.name, peopleCount: Number(b.count), extraInfo: b.extra,
      })),
      ...guests.filter((x) => x.foodStatus === 'yes').map((x) => ({ entryType: 'Guest', ...x, peopleCount: 1 })),
      ...others.filter((x) => x.foodStatus === 'yes').map((x) => ({ entryType: 'Other', ...x, peopleCount: 1 })),
    ];
    const row = {
      site_id: siteId,
      source,
      module: moduleLabel,
      shifts,
      regular_worker_count: counts.regular,
      outside_worker_count: counts.outside,
      guest_count: counts.guest,
      other_count: counts.other,
      remarks: remarks.trim(),
      payload,
      status: 'Submitted',
      attendance_date: todayKey(),
    };
    const { data, error } = await supabase.from(TABLES.foodSubmissions).insert(row).select();
    if (error) {
      setSubmitting(false);
      return toast.error(error.message);
    }
    const saved = Array.isArray(data) ? data[0] : data;
    await supabase.from(TABLES.foodOrders).insert({
      site_id: siteId,
      source,
      module: moduleLabel,
      payload: { ...row, id: saved?.id },
      status: 'queued',
    });
    const nextOrdered = {
      regular: counts.regular,
      outside: counts.outside,
      extras: counts.extras,
      total: counts.total,
    };
    setHistory((prev) => [saved || { ...row, id: `food-${Date.now()}`, created_at: new Date().toISOString() }, ...prev]);
    setOrderId(saved?.id || `food-${Date.now()}`);
    setOrdered(nextOrdered);
    setReceived({ regular: 0, outside: 0, extras: 0 });
    setStage(0);
    setSessionSaved(false);
    setRemarks('');
    setSubmitting(false);
    setTab('status');
    toast.success(`${moduleLabel} food list sent to Admin & Canteen`);
  }

  async function markCanteenReceived() {
    if (stage < 0) return toast.warning('Submit a food request first');
    const next = { regular: ordered.regular, outside: ordered.outside, extras: ordered.extras };
    setReceived(next);
    setStage(1);
    await persistSession('received', { received: next });
    toast.success('Canteen received order');
  }
  async function markDispatched() {
    if (stage < 1) return toast.warning('Wait until canteen receives the order');
    setStage(2);
    await persistSession('dispatched');
    toast.success('Food dispatched');
  }
  async function saveSession() {
    if (stage < 2) return toast.warning('Wait for dispatch before saving the session');
    setStage(3);
    setSessionSaved(true);
    const sessionData = {
      site_id: siteId,
      source,
      submission_id: orderId,
      session_name: SESSIONS[currentSession].name,
      session_index: currentSession,
      stage: 'completed',
      ordered_regular: ordered.regular,
      ordered_outside: ordered.outside,
      ordered_guests_other: ordered.extras,
      ordered_total: ordered.total,
      received_regular: received.regular,
      received_outside: received.outside,
      received_guests_other: received.extras,
      date: todayKey(),
      time: formatTime(),
      icon: SESSIONS[currentSession].icon,
    };
    await supabase.from(TABLES.foodSessions).insert(sessionData);
    setSessions((prev) => [...prev.filter((s) => !(s.date === todayKey() && s.session_index === currentSession)), { ...sessionData, id: `sess-${Date.now()}` }]);
    toast.success(`${SESSIONS[currentSession].name} session saved`);
    setTimeout(() => {
      const next = (currentSession + 1) % 3;
      setCurrentSession(next);
      setStage(-1);
      setSessionSaved(false);
      setOrdered({ regular: 0, outside: 0, extras: 0, total: 0 });
      setReceived({ regular: 0, outside: 0, extras: 0 });
      setOrderId('');
    }, 800);
  }

  const groupedHistory = useMemo(() => {
    const map = {};
    history.forEach((r) => {
      const key = (r.attendance_date || r.created_at || '').slice(0, 10) || todayKey();
      (map[key] ??= []).push(r);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [history]);

  const todaySessions = sessions.filter((s) => (s.date || s.attendance_date) === todayKey());

  if (!siteId) return <Empty icon="🗺️" title="Select a site first" />;

  const TABS = [
    { id: 'prepare', label: 'Prepare' },
    { id: 'workers', label: 'Workers' },
    { id: 'history', label: 'History' },
    { id: 'status', label: 'Status' },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 flex flex-wrap items-start justify-between gap-3" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: accent }}>
            {moduleLabel} · Canteen request
          </p>
          <h2 className="text-lg font-black">Food Management</h2>
          <p className="text-xs text-slate-500">
            Site <span className="font-bold">{site?.name}</span> · Submit a dedicated {moduleLabel.toLowerCase()} food list to Admin & Canteen
          </p>
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap ${
                tab === t.id ? 'bg-white shadow text-slate-900' : 'text-slate-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'prepare' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Stat label="Regular" value={counts.regular} sub={`${regular.length} workers`} color="#15803d" />
            <Stat label="Outside" value={counts.outside} sub={`${outside.length} batches`} color={accent} />
            <Stat label="Guests" value={counts.guest} sub={`${guests.length} entries`} color="#d97706" />
            <Stat label="Others" value={counts.other} sub={`${others.length} items`} color="#7c3aed" />
          </div>

          <div className="card p-4 space-y-3">
            <p className="text-xs font-extrabold uppercase text-slate-500">Shifts</p>
            <div className="flex flex-wrap gap-2">
              {['Morning', 'Afternoon', 'Evening'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleShift(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                    shifts.includes(s) ? 'text-white' : 'bg-white text-slate-600'
                  }`}
                  style={shifts.includes(s) ? { background: accent, borderColor: accent } : { borderColor: 'var(--color-border)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4 space-y-2">
            <h3 className="font-extrabold text-sm">Final food count preview</h3>
            <PreviewRow label="Regular Workers" value={counts.regular} />
            <PreviewRow label="Outside Workers" value={counts.outside} />
            <PreviewRow label="Guests" value={counts.guest} />
            <PreviewRow label="Others" value={counts.other} />
            <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <span className="font-black text-sm">Total people for food</span>
              <span className="text-xl font-black" style={{ color: accent }}>{counts.total}</span>
            </div>
          </div>

          <div className="card p-4 space-y-2">
            <h3 className="font-extrabold text-sm">Final remarks</h3>
            <textarea
              className="field min-h-[72px] text-sm"
              placeholder={`Optional note for ${moduleLabel.toLowerCase()} canteen request…`}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={submitToCanteen}
            className="btn-primary w-full py-3 font-extrabold"
            style={isHarvest ? { background: accent, borderColor: accent } : undefined}
          >
            {submitting ? 'Sending…' : `Send ${moduleLabel} food list to Admin & Canteen`}
          </button>
        </div>
      )}

      {tab === 'workers' && (
        <div className="space-y-3">
          <div className="flex gap-1 bg-white p-1 rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--color-border)' }}>
            {[
              { id: 'regular', label: 'Regular' },
              { id: 'outside', label: 'Outside' },
              { id: 'guests', label: 'Guests & Others' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setWorkerTab(t.id)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-extrabold ${
                  workerTab === t.id ? 'bg-slate-900 text-white' : 'text-slate-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {workerTab === 'regular' && (
            <PeopleList
              title="Regular workers"
              items={regular}
              onToggle={(id) => setRegular((prev) => prev.map((x) => (x.id === id ? { ...x, foodStatus: x.foodStatus === 'yes' ? 'no' : 'yes' } : x)))}
              onAllYes={() => markAll(regular, setRegular, 'yes')}
              onAllNo={() => markAll(regular, setRegular, 'no')}
            />
          )}

          {workerTab === 'outside' && (
            <div className="space-y-3">
              {outside.map((b) => (
                <div key={b.id} className="card p-4 space-y-2">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-extrabold text-sm">{b.name}</p>
                      <p className="text-[11px] text-slate-500">Total in batch: {b.totalWorkers}</p>
                    </div>
                  </div>
                  <label className="field-label">Food count</label>
                  <input
                    type="number"
                    min="0"
                    max={b.totalWorkers}
                    className="field"
                    value={b.count}
                    onChange={(e) => {
                      const n = Math.max(0, Math.min(b.totalWorkers, Number(e.target.value) || 0));
                      setOutside((prev) => prev.map((x) => (x.id === b.id ? { ...x, count: n } : x)));
                    }}
                  />
                  <label className="field-label">Extra info</label>
                  <input
                    className="field"
                    value={b.extra}
                    onChange={(e) => setOutside((prev) => prev.map((x) => (x.id === b.id ? { ...x, extra: e.target.value } : x)))}
                  />
                </div>
              ))}
            </div>
          )}

          {workerTab === 'guests' && (
            <div className="space-y-4">
              <PeopleList
                title="Guests"
                items={guests}
                onToggle={(id) => setGuests((prev) => prev.map((x) => (x.id === id ? { ...x, foodStatus: x.foodStatus === 'yes' ? 'no' : 'yes' } : x)))}
                onRemove={(id) => setGuests((prev) => prev.filter((x) => x.id !== id))}
                onAllYes={() => markAll(guests, setGuests, 'yes')}
                onAllNo={() => markAll(guests, setGuests, 'no')}
              />
              <div className="flex gap-2">
                <input className="field flex-1" placeholder="Guest name" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
                <button type="button" className="btn-primary px-4" onClick={addGuest}>Add</button>
              </div>
              <PeopleList
                title="Others"
                items={others}
                onToggle={(id) => setOthers((prev) => prev.map((x) => (x.id === id ? { ...x, foodStatus: x.foodStatus === 'yes' ? 'no' : 'yes' } : x)))}
                onRemove={(id) => setOthers((prev) => prev.filter((x) => x.id !== id))}
                onAllYes={() => markAll(others, setOthers, 'yes')}
                onAllNo={() => markAll(others, setOthers, 'no')}
              />
              <div className="flex gap-2">
                <input className="field flex-1" placeholder="Other item" value={otherName} onChange={(e) => setOtherName(e.target.value)} />
                <button type="button" className="btn-primary px-4" onClick={addOther}>Add</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Records" value={history.length} sub={`${moduleLabel} submissions`} color={accent} />
            <Stat label="Last total" value={history[0] ? (history[0].regular_worker_count || 0) + (history[0].outside_worker_count || 0) + (history[0].guest_count || 0) + (history[0].other_count || 0) : 0} sub="people" color="#15803d" />
          </div>
          {groupedHistory.length === 0 ? (
            <Empty icon="🍱" title="No food submissions yet" hint={`Submit a ${moduleLabel.toLowerCase()} food list from Prepare.`} />
          ) : (
            groupedHistory.map(([day, rows]) => {
              const parcels = rows.reduce((s, r) => s + (Number(r.regular_worker_count) || 0) + (Number(r.outside_worker_count) || 0) + (Number(r.guest_count) || 0) + (Number(r.other_count) || 0), 0);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setDetailDay(detailDay === day ? null : day)}
                  className="card p-4 w-full text-left flex items-center justify-between"
                >
                  <span className="font-extrabold text-sm">{formatDate(day)}</span>
                  <span className="text-xs font-black px-2 py-1 rounded-full" style={{ background: `${accent}22`, color: accent }}>
                    {parcels} parcels · {rows.length} {moduleLabel.toLowerCase()}
                  </span>
                </button>
              );
            })
          )}
          {detailDay && (
            <div className="card p-4 text-sm space-y-1">
              {(groupedHistory.find(([d]) => d === detailDay)?.[1] || []).map((r) => (
                <p key={r.id}>
                  {formatTime(r.created_at)} · R {r.regular_worker_count} · O {r.outside_worker_count} · G {r.guest_count} · X {r.other_count}
                  {r.remarks ? ` · ${r.remarks}` : ''}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'status' && (
        <div className="space-y-4">
          <div className="rounded-2xl p-4 text-white" style={{ background: `linear-gradient(135deg, ${accent}, #0f172a)` }}>
            <p className="text-xl font-black">
              {SESSIONS[currentSession].icon} {SESSIONS[currentSession].name} — {SESSIONS[currentSession].meal}
            </p>
            <p className="text-xs opacity-80">{stage >= 0 ? 'Order in progress' : 'No active order'} · {formatTime()}</p>
          </div>

          <div className="card p-4 space-y-3">
            <h3 className="font-extrabold text-sm">Food status</h3>
            {stage < 0 ? (
              <p className="text-sm text-slate-500">Submit a {moduleLabel.toLowerCase()} food list to start tracking.</p>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-1 text-[10px] font-bold text-center">
                  {STAGES.map((s, i) => (
                    <span key={s} className={i <= stage ? 'text-emerald-700' : 'text-slate-400'}>{s}</span>
                  ))}
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${((stage + 1) / 4) * 100}%` }} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-ghost text-xs" onClick={markCanteenReceived}>Canteen received</button>
                  <button type="button" className="btn-ghost text-xs" onClick={markDispatched}>Dispatched</button>
                </div>
              </>
            )}
          </div>

          <div className="card p-4 overflow-x-auto">
            <h3 className="font-extrabold text-sm mb-2">Order summary</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left py-1">Category</th>
                  <th>Ordered</th>
                  <th>Received</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                <SumRow label="Regular" o={ordered.regular} r={received.regular} b={balance.regular} />
                <SumRow label="Outside" o={ordered.outside} r={received.outside} b={balance.outside} />
                <SumRow label="Guests & Others" o={ordered.extras} r={received.extras} b={balance.extras} />
                <SumRow label="Total" o={ordered.total} r={received.regular + received.outside + received.extras} b={balance.total} bold />
              </tbody>
            </table>
          </div>

          <div className="card p-4 grid grid-cols-3 gap-2">
            <CountField label="Regular" value={received.regular} onChange={(v) => setReceived((p) => ({ ...p, regular: v }))} />
            <CountField label="Outside" value={received.outside} onChange={(v) => setReceived((p) => ({ ...p, outside: v }))} />
            <CountField label="Guests & Others" value={received.extras} onChange={(v) => setReceived((p) => ({ ...p, extras: v }))} />
          </div>

          <button
            type="button"
            disabled={stage < 2 || sessionSaved}
            onClick={saveSession}
            className="btn-primary w-full py-3 font-extrabold disabled:opacity-50"
            style={isHarvest ? { background: accent, borderColor: accent } : undefined}
          >
            {sessionSaved ? 'Session saved' : stage >= 2 ? `Save ${moduleLabel} session` : stage >= 0 ? 'Waiting for dispatch…' : 'No active order'}
          </button>

          <div className="grid grid-cols-3 gap-2">
            {SESSIONS.map((s, i) => {
              const rec = todaySessions.find((x) => Number(x.session_index) === i);
              return (
                <div key={s.name} className="card p-3 text-center">
                  <p>{s.icon}</p>
                  <p className="text-[11px] font-extrabold">{s.name}</p>
                  <p className="text-[10px] text-slate-500">{rec ? `${rec.ordered_total || 0} parcels` : '0 parcels'}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, color }) {
  return (
    <div className="card p-3">
      <p className="text-2xl font-black leading-none" style={{ color }}>{value}</p>
      <p className="text-xs font-extrabold mt-1">{label}</p>
      <p className="text-[10px] text-slate-500">{sub}</p>
    </div>
  );
}
function PreviewRow({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-extrabold">{value}</span>
    </div>
  );
}
function PeopleList({ title, items, onToggle, onRemove, onAllYes, onAllNo }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-sm">{title}</h3>
        <div className="flex gap-2">
          <button type="button" className="text-[11px] font-bold text-emerald-700" onClick={onAllYes}>All YES</button>
          <button type="button" className="text-[11px] font-bold text-red-600" onClick={onAllNo}>All NO</button>
        </div>
      </div>
      {items.length === 0 && <p className="text-xs text-slate-500">No entries yet.</p>}
      {items.map((item) => {
        const on = item.foodStatus === 'yes';
        return (
          <div key={item.id} className="card p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-sm truncate">{item.name}</p>
              <p className="text-[11px] text-slate-500 truncate">{item.id}</p>
            </div>
            <button
              type="button"
              onClick={() => onToggle(item.id)}
              className={`px-3 py-1 rounded-full text-[11px] font-black ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-red-50 text-red-600'}`}
            >
              {on ? 'YES' : 'NO'}
            </button>
            {onRemove && (
              <button type="button" className="text-red-500 text-sm" onClick={() => onRemove(item.id)}>✕</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
function SumRow({ label, o, r, b, bold }) {
  return (
    <tr className={bold ? 'font-black' : ''}>
      <td className="py-1">{label}</td>
      <td className="text-center">{o}</td>
      <td className="text-center">{r}</td>
      <td className={`text-center ${b >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{b >= 0 ? `+${b}` : b}</td>
    </tr>
  );
}
function CountField({ label, value, onChange }) {
  return (
    <label className="text-[10px] font-bold text-slate-500">
      {label}
      <input
        type="number"
        min="0"
        className="field mt-1 text-center"
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
    </label>
  );
}
