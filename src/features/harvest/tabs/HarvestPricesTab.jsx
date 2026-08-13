import { useState, useEffect } from 'react';

/**
 * HarvestPricesTab — Prices tab with:
 *   1. Company Price Table (save/load per company, counts 20-200)
 *   2. Spot Payment Table (manually entered rates, counts 20-200)
 *   3. Quick Price Lookup  ← now supports non-round counts via interpolation
 *   4. Quick Revenue Calculator
 */

const FIXED_COUNTS = [20, 25, 30, 40, 50, 60, 70, 80, 100, 120, 150, 200];

const emptyRates = () => FIXED_COUNTS.reduce((acc, c) => ({ ...acc, [c]: '' }), {});

const STORAGE_KEY = 'harvest_company_prices';

function loadSavedCompanies() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * Given a count and a rates object (keyed by FIXED_COUNTS),
 * returns { value, isExact, low, high, interpolated } for display.
 */
function interpolateRate(count, ratesObj) {
  const exactVal = ratesObj[count];
  if (exactVal !== undefined && exactVal !== '') {
    return { value: Number(exactVal), isExact: true };
  }

  // Find surrounding fixed counts that have rates set
  const filled = FIXED_COUNTS.filter((c) => ratesObj[c] !== '' && ratesObj[c] !== undefined);
  if (filled.length === 0) return null;

  const lower = [...filled].reverse().find((c) => c <= count);
  const upper = filled.find((c) => c >= count);

  if (lower === undefined && upper === undefined) return null;
  if (lower === undefined) return { value: Number(ratesObj[upper]), isExact: false, interpolated: true, low: upper, high: upper };
  if (upper === undefined) return { value: Number(ratesObj[lower]), isExact: false, interpolated: true, low: lower, high: lower };
  if (lower === upper) return { value: Number(ratesObj[lower]), isExact: true };

  // Linear interpolation between lower and upper
  const lRate = Number(ratesObj[lower]);
  const uRate = Number(ratesObj[upper]);
  const ratio = (count - lower) / (upper - lower);
  const interpolated = lRate + ratio * (uRate - lRate);

  return { value: interpolated, isExact: false, interpolated: true, low: lower, high: upper };
}

/** Prevent scroll from changing number inputs */
const preventWheel = (e) => e.target.blur();

export default function HarvestPricesTab({ siteId }) {
  // ── Company Price Table ──────────────────────────────────────────────────
  const [companyName, setCompanyName] = useState('');
  const [companyRates, setCompanyRates] = useState(emptyRates());
  const [savedCompanies, setSavedCompanies] = useState(loadSavedCompanies);
  const [loadCompany, setLoadCompany] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  // ── Spot Payment Table ───────────────────────────────────────────────────
  const [spotRates, setSpotRates] = useState(emptyRates());

  // ── Quick Price Lookup ───────────────────────────────────────────────────
  const [searchCount, setSearchCount] = useState('');

  // ── Quick Revenue Calculator ─────────────────────────────────────────────
  const [revenueKg, setRevenueKg] = useState('');
  const [calcCount, setCalcCount] = useState('');

  // Load company rates when dropdown changes
  useEffect(() => {
    if (loadCompany && savedCompanies[loadCompany]) {
      setCompanyName(loadCompany);
      setCompanyRates(savedCompanies[loadCompany]);
    }
  }, [loadCompany]);

  const handleSaveCompany = () => {
    if (!companyName.trim()) return;
    const updated = { ...savedCompanies, [companyName.trim()]: companyRates };
    setSavedCompanies(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setSaveMsg(`✓ Saved "${companyName.trim()}"`);
    setTimeout(() => setSaveMsg(''), 3000);
  };

  const updateCompanyRate = (count, val) => {
    setCompanyRates((prev) => ({ ...prev, [count]: val }));
  };

  const updateSpotRate = (count, val) => {
    setSpotRates((prev) => ({ ...prev, [count]: val }));
  };

  // Price lookup — interpolation for non-fixed counts
  const lookupCount = searchCount !== '' ? Number(searchCount) : null;
  const spotResult = lookupCount !== null ? interpolateRate(lookupCount, spotRates) : null;
  const companyResult = lookupCount !== null ? interpolateRate(lookupCount, companyRates) : null;

  // Revenue calculator — use spot rates if available, then company rates
  const allRates = FIXED_COUNTS.map((c) => ({
    count: c,
    rate: spotRates[c] || companyRates[c] || '',
  })).filter((r) => r.rate);

  const calcPrice = allRates.find((r) => String(r.count) === calcCount)?.rate || 0;
  const calcRevenue = (Number(revenueKg) || 0) * (Number(calcPrice) || 0);

  return (
    <div className="space-y-8 pb-6">
      {/* ── Header Banner ───────────────────────────────────────────────── */}
      <div className="rounded-2xl p-5 bg-gradient-to-r from-violet-900 via-purple-900 to-slate-900 text-white shadow-xl">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-violet-400 block mb-1">
          MARKET PRICE REFERENCE
        </span>
        <h2 className="text-xl font-black tracking-tight text-white">
          Shrimp Price Management Board
        </h2>
        <p className="text-xs text-slate-300 mt-1">
          Manage company-specific price lists and spot payment rates by shrimp count.
        </p>
      </div>

      {/* ── 1 & 2. Quick Lookup + Revenue Calculator at Top ──────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Quick Price Lookup */}
        <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900">🔍 Quick Price Lookup</h3>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">Enter Count (shrimp/kg)</label>
            <input
              type="number"
              placeholder="e.g. 55"
              value={searchCount}
              onChange={(e) => setSearchCount(e.target.value)}
              onWheel={preventWheel}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-lg font-black font-mono text-slate-900 focus:bg-white focus:border-violet-600 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400 mt-1">Supports exact &amp; non-standard counts — uses interpolation if needed</p>
          </div>

          {searchCount && lookupCount !== null && (
            <div className="space-y-2">
              {/* Spot Rate Result */}
              <div className={`rounded-xl p-4 ${spotResult ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-amber-700 uppercase">Spot Rate for {lookupCount} count</span>
                  {spotResult && !spotResult.isExact && (
                    <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 border border-amber-300">
                      ≈ Interpolated ({spotResult.low}↔{spotResult.high})
                    </span>
                  )}
                  {spotResult && spotResult.isExact && (
                    <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">✓ Exact</span>
                  )}
                </div>
                {spotResult ? (
                  <span className="text-2xl font-black font-mono text-amber-900 block">₹{spotResult.value.toFixed(2)} / KG</span>
                ) : (
                  <span className="text-xs text-slate-500 block">No spot rates set yet</span>
                )}
              </div>

              {/* Company Rate Result */}
              <div className={`rounded-xl p-4 ${companyResult ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">
                    Company Rate{companyName ? ` (${companyName})` : ''} for {lookupCount} count
                  </span>
                  {companyResult && !companyResult.isExact && (
                    <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800 border border-emerald-300">
                      ≈ Interpolated ({companyResult.low}↔{companyResult.high})
                    </span>
                  )}
                  {companyResult && companyResult.isExact && (
                    <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">✓ Exact</span>
                  )}
                </div>
                {companyResult ? (
                  <span className="text-2xl font-black font-mono text-emerald-900 block">₹{companyResult.value.toFixed(2)} / KG</span>
                ) : (
                  <span className="text-xs text-slate-500 block">No company rates set yet</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 2. Quick Revenue Calculator */}
        <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900">💰 Quick Revenue Calculator</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Harvest Weight (KG)</label>
              <input
                type="number"
                placeholder="e.g. 1500"
                value={revenueKg}
                onChange={(e) => setRevenueKg(e.target.value)}
                onWheel={preventWheel}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold font-mono text-slate-900 focus:bg-white focus:border-violet-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Select Count &amp; Rate</label>
              <select
                value={calcCount}
                onChange={(e) => setCalcCount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:bg-white focus:border-violet-600 focus:outline-none"
              >
                <option value="">-- Select Count --</option>
                {allRates.map((r) => (
                  <option key={r.count} value={String(r.count)}>
                    {r.count} count — ₹{r.rate}/KG
                  </option>
                ))}
              </select>
            </div>
            {calcRevenue > 0 && (
              <div className="rounded-xl p-4 bg-gradient-to-br from-violet-900 to-slate-900 text-white">
                <span className="text-[10px] font-bold text-violet-300 uppercase block">Estimated Revenue</span>
                <span className="text-2xl font-black font-mono text-white block mt-1">
                  ₹{calcRevenue.toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-slate-400 block mt-1">
                  {revenueKg} KG × ₹{calcPrice}/KG
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. Company Price Table ──────────────────────────────────────── */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-base font-extrabold text-slate-900">🏢 Company Price Table</h3>
          {saveMsg && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 px-3 py-1 rounded-xl">
              {saveMsg}
            </span>
          )}
        </div>

        {/* Company Name Input + Load */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-bold text-slate-700 block">Company Name</label>
            <input
              type="text"
              placeholder="e.g. Apex Frozen Foods Pvt Ltd"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:bg-white focus:border-violet-500 focus:outline-none"
            />
          </div>
          <div className="sm:w-64 space-y-1">
            <label className="text-xs font-bold text-slate-700 block">Load Saved Company</label>
            <select
              value={loadCompany}
              onChange={(e) => setLoadCompany(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:bg-white focus:border-violet-500 focus:outline-none"
            >
              <option value="">-- Select company --</option>
              {Object.keys(savedCompanies).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleSaveCompany}
              disabled={!companyName.trim()}
              className="px-4 py-2 rounded-xl bg-violet-700 hover:bg-violet-600 text-white font-extrabold text-xs disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
            >
              💾 Save
            </button>
          </div>
        </div>

        {/* Company Rate Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-extrabold border-b border-slate-200">
                <th className="p-3 w-14 text-center">S.No</th>
                <th className="p-3">Count (Shrimp / KG)</th>
                <th className="p-3">Rate (₹/KG)</th>
                <th className="p-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {FIXED_COUNTS.map((count, idx) => (
                <tr key={count} className="hover:bg-slate-50/60 transition">
                  <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-9 h-9 rounded-xl bg-violet-100 text-violet-800 font-black text-sm flex items-center justify-center font-mono">
                        {count}
                      </span>
                      <span className="font-semibold text-slate-700">count/kg</span>
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 font-bold text-sm">₹</span>
                      <input
                        type="number"
                        placeholder="Enter rate"
                        value={companyRates[count]}
                        onChange={(e) => updateCompanyRate(count, e.target.value)}
                        onWheel={preventWheel}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 font-mono text-sm font-bold text-slate-900 focus:bg-white focus:border-violet-500 focus:outline-none"
                      />
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    {companyRates[count] ? (
                      <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase">Set ✓</span>
                    ) : (
                      <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase">Not Set</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 4. Spot Payment Rates Table ─────────────────────────────────── */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">💵 Spot Payment Table</h3>
          <p className="text-xs text-slate-500 mt-1">Enter current spot market rates per shrimp count.</p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-extrabold border-b border-slate-200">
                <th className="p-3 w-14 text-center">S.No</th>
                <th className="p-3">Count (Shrimp / KG)</th>
                <th className="p-3">Spot Rate (₹/KG)</th>
                <th className="p-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {FIXED_COUNTS.map((count, idx) => (
                <tr key={count} className="hover:bg-slate-50/60 transition">
                  <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 font-black text-sm flex items-center justify-center font-mono">
                        {count}
                      </span>
                      <span className="font-semibold text-slate-700">count/kg</span>
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 font-bold text-sm">₹</span>
                      <input
                        type="number"
                        placeholder="Enter spot rate"
                        value={spotRates[count]}
                        onChange={(e) => updateSpotRate(count, e.target.value)}
                        onWheel={preventWheel}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 font-mono text-sm font-bold text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    {spotRates[count] ? (
                      <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 uppercase">Set ✓</span>
                    ) : (
                      <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase">Not Set</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
