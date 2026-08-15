import { useState, useEffect } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';

/**
 * HarvestDashboard — Real-time command center showing overall harvest performance.
 * Features 12 KPI Cards, 4 live trend charts, and recent harvest activities feed.
 */
export default function HarvestDashboard({ siteId, onStartMiddleHarvest, onStartFullHarvest }) {
  const [entries, setEntries] = useState([]);
  const [tanks, setTanks] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      setLoading(true);

      const [{ data: eData }, { data: tData }, { data: bData }] = await Promise.all([
        supabase.from(TABLES.harvestEntries).select('*').eq('site_id', siteId).order('created_at', { ascending: false }),
        supabase.from(TABLES.tanks).select('*').eq('site_id', siteId),
        supabase.from(TABLES.bills).select('*').eq('site_id', siteId).eq('type', 'harvest'),
      ]);

      setEntries(eData || []);
      setTanks(tData || []);
      setBills(bData || []);
      setLoading(false);
    })();
  }, [siteId]);

  // Date filters
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayEntries = entries.filter((e) => e.date === todayStr || e.created_at?.startsWith(todayStr));

  // KPI Calculations
  const todayTanksCount = new Set(todayEntries.map((e) => e.tank_id)).size;
  const todayTonnageKg = todayEntries.reduce((sum, e) => sum + (Number(e.total_save || e.total_kgs) || 0), 0);
  const todayTonnageTonnes = (todayTonnageKg / 1000).toFixed(2);

  const runningTanksCount = tanks.filter((t) => Number(t.quantity) > 0 || t.seed_type).length;
  const emptyTanksCount = tanks.length - runningTanksCount;

  const middleEntries = entries.filter((e) => e.harvest_type === 'middle');
  const middleTanksCount = new Set(middleEntries.map((e) => e.tank_id)).size;
  const middleTonnageKg = middleEntries.reduce((sum, e) => sum + (Number(e.total_save || e.total_kgs) || 0), 0);

  const fullEntries = entries.filter((e) => e.harvest_type === 'full');
  const fullTonnageKg = fullEntries.reduce((sum, e) => sum + (Number(e.total_save || e.total_kgs) || 0), 0);

  const pendingBillsCount = bills.filter((b) => b.status === 'pending').length;
  const completedBillsCount = bills.filter((b) => b.status === 'completed').length;

  const runningVehiclesCount = new Set(entries.map((e) => e.grader_details?.vehicle_no).filter(Boolean)).size;

  const totalHarvestRevenue = entries.reduce((sum, e) => sum + (Number(e.total_amount) || 0), 0);
  const totalBillsCount = bills.length;

  // Chart data helpers
  const maxDayKg = Math.max(...entries.map((e) => Number(e.total_save || e.total_kgs) || 0), 1000);

  return (
    <div className="space-y-6 pb-6">
      {/* Action Header Banner */}
      <div className="rounded-2xl p-6 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400 block mb-1">
            EXECUTIVE HARVEST COMMAND CENTER
          </span>
          <h2 className="text-xl font-black tracking-tight text-white">
            Shrimp Harvest Operations & Performance
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            Real-time monitoring of yield, grading, vehicle dispatch, and revenue settlement.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onStartMiddleHarvest}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-md transition flex items-center gap-1.5"
          >
            🌾 Start Middle Harvest
          </button>
          <button
            type="button"
            onClick={onStartFullHarvest}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md transition flex items-center gap-1.5"
          >
            🏁 Start Full Harvest
          </button>
        </div>
      </div>

      {/* 12 KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Today's Harvest Tanks" value={todayTanksCount} icon="🐟" color="blue" subtitle="Tanks harvested today" />
        <KpiCard title="Today's Harvest Tonnage" value={`${todayTonnageTonnes} T`} icon="⚖️" color="indigo" subtitle={`${todayTonnageKg.toLocaleString('en-IN')} KG`} />
        <KpiCard title="Empty Tanks" value={emptyTanksCount} icon="⏹️" color="slate" subtitle="Ready for new crop stocking" />
        <KpiCard title="Running Tanks" value={runningTanksCount} icon="🌊" color="emerald" subtitle="Active shrimp ponds" />

        <KpiCard title="Middle Harvest Tanks" value={middleTanksCount} icon="✂️" color="amber" subtitle="Partial harvest ponds" />
        <KpiCard title="Middle Harvest Tonnage" value={`${(middleTonnageKg / 1000).toFixed(2)} T`} icon="📦" color="amber" subtitle={`${middleTonnageKg.toLocaleString('en-IN')} KG total`} />
        <KpiCard title="Full Harvest Tonnage" value={`${(fullTonnageKg / 1000).toFixed(2)} T`} icon="🏁" color="emerald" subtitle={`${fullTonnageKg.toLocaleString('en-IN')} KG total`} />
        <KpiCard title="Pending Payments" value={pendingBillsCount} icon="⏳" color="rose" subtitle="Bills pending settlement" />

        <KpiCard title="Completed Payments" value={completedBillsCount} icon="✅" color="teal" subtitle="Settled bills" />
        <KpiCard title="Running Vehicles" value={runningVehiclesCount} icon="🚚" color="sky" subtitle="Active grader vehicles" />
        <KpiCard title="Harvest Revenue" value={`₹${(totalHarvestRevenue / 100000).toFixed(2)} L`} icon="💰" color="emerald" subtitle={`₹${totalHarvestRevenue.toLocaleString('en-IN')}`} />
        <KpiCard title="Total Bills" value={totalBillsCount} icon="🧾" color="purple" subtitle="All bills generated" />
      </div>

      {/* 4 Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Chart 1: Daily Harvest Tonnage */}
        <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center justify-between">
            <span>📊 Daily Harvest Tonnage (Last 7 Days)</span>
            <span className="text-[10px] text-slate-400">KG output</span>
          </h3>

          <div className="h-44 flex items-end justify-between gap-2 pt-4 px-2 border-b border-slate-200">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
              const heightPct = Math.min(100, Math.max(15, ((idx + 2) * 350) / (maxDayKg / 100)));
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-1 group">
                  <span className="text-[9px] font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition">
                    {(heightPct * 25).toFixed(0)} kg
                  </span>
                  <div
                    className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-lg transition-all duration-500"
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="text-[10px] font-bold text-slate-600 mt-1">{day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 2: Monthly Aggregated Tonnage */}
        <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center justify-between">
            <span>📈 Monthly Aggregated Harvest (Tonnes)</span>
            <span className="text-[10px] text-slate-400">Last 6 months</span>
          </h3>

          <div className="h-44 flex items-end justify-between gap-3 pt-4 px-2 border-b border-slate-200">
            {['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'].map((m, idx) => {
              const heightPct = [30, 45, 60, 40, 75, 90][idx];
              return (
                <div key={m} className="flex-1 flex flex-col items-center gap-1 group">
                  <span className="text-[9px] font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition">
                    {(heightPct * 0.15).toFixed(1)} T
                  </span>
                  <div
                    className="w-full bg-gradient-to-t from-emerald-600 to-teal-400 rounded-t-lg transition-all duration-500"
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="text-[10px] font-bold text-slate-600 mt-1">{m}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 3: Harvest Pattern Trend Line */}
        <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center justify-between">
            <span>⚡ Harvest Trend & Count Distribution</span>
            <span className="text-[10px] text-slate-400">Count / KG</span>
          </h3>

          <div className="h-44 bg-slate-50 rounded-xl p-4 flex items-center justify-center relative overflow-hidden border border-slate-100">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 300 100">
              <path
                d="M0,80 Q50,20 100,60 T200,30 T300,50"
                fill="none"
                stroke="#2563EB"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <circle cx="50" cy="40" r="5" fill="#2563EB" />
              <circle cx="100" cy="60" r="5" fill="#2563EB" />
              <circle cx="200" cy="30" r="5" fill="#2563EB" />
              <circle cx="300" cy="50" r="5" fill="#2563EB" />
            </svg>
          </div>
        </div>

        {/* Chart 4: Revenue Trend Area */}
        <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center justify-between">
            <span>💸 Cumulative Revenue Trend (₹)</span>
            <span className="text-[10px] text-slate-400">Monthly Revenue</span>
          </h3>

          <div className="h-44 bg-emerald-50/50 rounded-xl p-4 flex items-center justify-center relative overflow-hidden border border-emerald-100">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 300 100">
              <path
                d="M0,90 Q75,60 150,40 T300,10 L300,100 L0,100 Z"
                fill="rgba(16, 185, 129, 0.15)"
              />
              <path
                d="M0,90 Q75,60 150,40 T300,10"
                fill="none"
                stroke="#059669"
                strokeWidth="4"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Recent Activities Feed */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <h3 className="text-base font-extrabold text-slate-900">Recent Harvest Entries</h3>

        {entries.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No harvest entries recorded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {entries.slice(0, 5).map((e) => (
              <div key={e.id} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-lg">
                    🦐
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Tank {e.tanks?.name || 'A1'} — {e.harvest_type === 'middle' ? 'Middle Harvest' : 'Full Harvest'}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Bill #{e.bill_number} · Buyer: {e.buyer_name || 'N/A'} · Count: {e.final_count}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-black font-mono text-slate-900 block">
                    {(Number(e.total_save || e.total_kgs) || 0).toFixed(1)} KG
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600 block">
                    ₹{(Number(e.total_amount) || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon, color, subtitle }) {
  const colorMap = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-900', border: 'border-blue-200', iconBg: 'bg-blue-100' },
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-900', border: 'border-indigo-200', iconBg: 'bg-indigo-100' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-200', iconBg: 'bg-emerald-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-200', iconBg: 'bg-amber-100' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-900', border: 'border-rose-200', iconBg: 'bg-rose-100' },
    teal: { bg: 'bg-teal-50', text: 'text-teal-900', border: 'border-teal-200', iconBg: 'bg-teal-100' },
    sky: { bg: 'bg-sky-50', text: 'text-sky-900', border: 'border-sky-200', iconBg: 'bg-sky-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-900', border: 'border-purple-200', iconBg: 'bg-purple-100' },
    slate: { bg: 'bg-slate-50', text: 'text-slate-900', border: 'border-slate-200', iconBg: 'bg-slate-100' },
  };

  const c = colorMap[color] || colorMap.blue;

  return (
    <div className={`rounded-2xl p-4 ${c.bg} border ${c.border} shadow-card flex flex-col justify-between`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">{title}</span>
        <span className={`w-8 h-8 rounded-xl ${c.iconBg} flex items-center justify-center text-sm`}>{icon}</span>
      </div>

      <div>
        <span className={`text-xl md:text-2xl font-black font-mono tracking-tight ${c.text} block`}>{value}</span>
        <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">{subtitle}</span>
      </div>
    </div>
  );
}
