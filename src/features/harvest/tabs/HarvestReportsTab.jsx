import { useState, useEffect } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';

/**
 * ViewBillModal — Modal component to view and print full official stored bills & reports from Reports archive.
 */
function ViewBillModal({ bill, onClose }) {
  const [activeTab, setActiveTab] = useState('middle-bill'); // 'middle-bill' | 'middle-report' | 'uasf-rates'

  if (!bill) return null;

  const isMiddle = bill.type === 'middle' || bill.harvest_type === 'middle';
  const details = bill.harvest_details || {};
  const savedTanks = details.savedTanks || [
    {
      tank_name: bill.tank_name?.replace('Tank ', '') || 'A1',
      finalCount: bill.final_count || 50,
      grandTotalKgs: Number(bill.kgs || bill.total_kgs || 1000),
      pricePerKg: bill.price_per_kg || (bill.kgs > 0 ? Math.round(Number(bill.total_amount || 0) / Number(bill.kgs)) : 350),
    },
  ];

  const billingData = details.billingData || {};
  const graderData = details.graderData || {};
  const labourData = details.labourData || {};
  const billPhoto = bill.bill_photo || details.billPhoto || null;
  const spotPhotos = bill.spot_photos || details.spotPhotos || [];
  const uasfBillNo = bill.uasf_bill_no || details.uasfBillNo || `UASF-${bill.bill_number || '1001'}`;
  const buyingRates = bill.buying_rates || details.buyingRates || {
    30: 420, 40: 380, 50: 350, 60: 320, 70: 290, 80: 260,
  };

  const totalHarvestKgs = savedTanks.reduce((sum, t) => sum + (Number(t.grandTotalKgs) || 0), 0);
  const totalTonnageTons = (totalHarvestKgs / 1000).toFixed(3);
  const totalBillAmount = Number(bill.total_amount || bill.amount) || savedTanks.reduce((sum, t) => sum + (Number(t.grandTotalKgs) * Number(t.pricePerKg)), 0);

  const siteName = billingData.farm_name || 'Shrimp Harvest Site';
  const buyerCompanyName = bill.buyer_name || billingData.buying_company || graderData.buyer_name || 'Buying Company';

  const handlePrintModal = () => {
    const styleEl = document.createElement('style');
    styleEl.id = '__modal_print_style__';
    const isLandscape = activeTab === 'middle-report';
    styleEl.textContent = `@page { size: ${isLandscape ? 'A4 landscape' : 'A4 portrait'}; margin: 10mm 12mm; }`;
    document.head.appendChild(styleEl);

    const originalTitle = document.title;
    document.title = ''; // Suppress browser filename header
    window.print();
    document.title = originalTitle;

    setTimeout(() => {
      const el = document.getElementById('__modal_print_style__');
      if (el) el.remove();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl overflow-hidden my-auto border border-slate-200 print:shadow-none print:border-none print:w-full print:max-w-none">
        
        {/* Modal Header — Hidden on Print */}
        <div className="bg-slate-900 p-4 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧾</span>
            <div>
              <h3 className="text-sm font-extrabold tracking-tight">Official Bill &amp; Report Archive — #{bill.bill_number}</h3>
              <p className="text-[11px] text-slate-400">Date: {bill.date || bill.created_at?.slice(0, 10)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setActiveTab('middle-bill')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeTab === 'middle-bill' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                🧧 Harvest Bill
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('middle-report')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeTab === 'middle-report' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                📊 Harvest Report
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('uasf-rates')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeTab === 'uasf-rates' ? 'bg-amber-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                🏷️ UASF Rates
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrintModal}
              className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-extrabold rounded-xl shadow-sm hover:from-emerald-600 hover:to-teal-700 flex items-center gap-1.5"
            >
              🖨️ Download PDF / Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold text-sm"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Printable Content Body */}
        <div className="p-6 max-h-[80vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-0">
          
          {/* OPTION A: Harvest Bill Tab */}
          {activeTab === 'middle-bill' && (
            <div id="printable-bill-document" className="space-y-6 text-left bg-white font-sans">
              <div className="text-center space-y-2 border-b border-slate-200 pb-4">
                <span className="text-[10px] font-extrabold tracking-widest text-blue-600 uppercase bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                  OFFICIAL HARVEST BILL DOCUMENT
                </span>
                <h1 className="text-2xl font-black text-slate-900">{siteName}</h1>
                <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-600 pt-1">
                  <span><strong>Bill No:</strong> <span className="font-mono font-bold text-blue-700">{bill.bill_number}</span></span>
                  <span><strong>Date:</strong> {bill.date || bill.created_at?.slice(0, 10)}</span>
                  <span><strong>Buyer:</strong> <span className="font-bold text-slate-900">{buyerCompanyName}</span></span>
                </div>
              </div>

              {/* Tank & Weight Summary Table */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">📋 Tank &amp; Weight Summary</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900 text-white uppercase text-[10px] font-extrabold">
                      <tr>
                        <th className="p-3">S.No</th>
                        <th className="p-3">Tank Name</th>
                        <th className="p-3 text-center">Harvest Count</th>
                        <th className="p-3 text-right">Net Weight (KG)</th>
                        <th className="p-3 text-right">Price per KG</th>
                        <th className="p-3 text-right">Total Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800 bg-white">
                      {savedTanks.map((tk, idx) => {
                        const kgs = Number(tk.grandTotalKgs) || 0;
                        const price = Number(tk.pricePerKg) || 0;
                        const rowAmt = Math.round(kgs * price);
                        return (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-3 font-bold text-slate-500">{idx + 1}</td>
                            <td className="p-3 font-extrabold text-slate-900">Tank {tk.tank_name}</td>
                            <td className="p-3 text-center font-bold font-mono">{tk.finalCount || 50} count</td>
                            <td className="p-3 text-right font-mono font-bold text-blue-700">{kgs.toFixed(1)} KG</td>
                            <td className="p-3 text-right font-mono">₹{price}</td>
                            <td className="p-3 text-right font-mono font-black text-slate-900">₹{rowAmt.toLocaleString('en-IN')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-900 text-white font-extrabold">
                      <tr>
                        <td colSpan={3} className="p-3 uppercase tracking-wider text-[11px]">Grand Total</td>
                        <td className="p-3 text-right font-mono text-blue-300">{totalHarvestKgs.toFixed(1)} KG ({totalTonnageTons} T)</td>
                        <td></td>
                        <td className="p-3 text-right font-mono text-emerald-300">₹{totalBillAmount.toLocaleString('en-IN')}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Uploaded Middle Harvest Photo */}
              {billPhoto && (
                <div className="pt-4 border-t border-slate-200 space-y-2 bill-photo-print">
                  <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                    <span>📷</span> Middle Harvest Bill Photo
                  </h4>
                  <div className="rounded-xl overflow-hidden border border-slate-300 max-w-md bg-white">
                    <img src={billPhoto} alt="Middle Harvest Bill Photo" className="max-h-64 object-contain w-full" />
                  </div>
                </div>
              )}

              {/* Signatures */}
              <div className="pt-6 border-t border-slate-200 grid grid-cols-3 gap-4 text-center text-xs text-slate-500 signature-block">
                <div>
                  <div className="h-12 border-b border-slate-300 mb-1"></div>
                  <span className="font-bold">Middle Harvest Incharge</span>
                </div>
                <div>
                  <div className="h-12 border-b border-slate-300 mb-1"></div>
                  <span className="font-bold">Grader / Contractor Sign</span>
                </div>
                <div>
                  <div className="h-12 border-b border-slate-300 mb-1"></div>
                  <span className="font-bold">Authorized Manager Sign</span>
                </div>
              </div>
            </div>
          )}

          {/* OPTION B: Middle Harvest Performance Report (Landscape) */}
          {activeTab === 'middle-report' && (
            <div id="printable-report-document" className="space-y-6 text-left bg-white font-sans">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <span className="text-[10px] font-extrabold tracking-widest text-emerald-600 uppercase bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    MIDDLE HARVEST REPORT (LANDSCAPE FORMAT)
                  </span>
                  <h2 className="text-xl font-black text-slate-900 mt-1">Middle Harvest Performance &amp; FCR Report</h2>
                </div>
                <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg">
                  Date: {bill.date || bill.created_at?.slice(0, 10)}
                </span>
              </div>

              {/* Full Width Landscape Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
                <table className="w-full text-xs text-left border-collapse min-w-[900px]">
                  <thead className="bg-slate-900 text-white text-[10px] font-extrabold uppercase tracking-wider">
                    <tr>
                      <th className="p-3 border-r border-slate-800">Tank No.</th>
                      <th className="p-3 border-r border-slate-800">No. of Acres</th>
                      <th className="p-3 border-r border-slate-800">Stocking Date</th>
                      <th className="p-3 border-r border-slate-800">Harvest Date</th>
                      <th className="p-3 border-r border-slate-800 text-center">Days</th>
                      <th className="p-3 border-r border-slate-800 text-right">Seed Stocked</th>
                      <th className="p-3 border-r border-slate-800 text-right">Seed Catched</th>
                      <th className="p-3 border-r border-slate-800 text-center">Survival %</th>
                      <th className="p-3 border-r border-slate-800 text-center bg-blue-900 text-blue-200">Remaining Survival %</th>
                      <th colSpan={3} className="p-2 border-r border-slate-800 text-center bg-emerald-950 text-emerald-300">
                        Middle 1
                        <div className="grid grid-cols-3 border-t border-emerald-800 mt-1 pt-1 text-[9px] normal-case">
                          <span>Date</span>
                          <span>Count</span>
                          <span>Tonnage</span>
                        </div>
                      </th>
                      <th className="p-3 border-r border-slate-800 text-right">Tank Feed</th>
                      <th className="p-3">Hatchery Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium text-slate-800 bg-white">
                    {savedTanks.map((st, idx) => {
                      const harvestDate = bill.date || bill.created_at?.slice(0, 10);
                      const stockingDate = st.tank?.start_date || '2026-05-01';
                      const days = stockingDate
                        ? Math.max(1, Math.floor((Date.now() - new Date(stockingDate).getTime()) / 86400000))
                        : 48;
                      const seedStocked = Number(st.tank?.quantity || 100000);
                      const seedCatched = Math.round(seedStocked * 0.85);
                      const harvestPieces = st.finalCount > 0 ? Math.round(st.grandTotalKgs * st.finalCount) : 0;
                      const survival = seedStocked > 0 ? ((seedCatched / seedStocked) * 100).toFixed(1) : '85.0';
                      const remainingSurvival = seedStocked > 0 ? Math.max(0, ((seedCatched - harvestPieces) / seedStocked) * 100).toFixed(1) : '62.5';
                      const tankFeedKg = st.tank?.feed_consumption || (st.grandTotalKgs * 1.3).toFixed(1);

                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-3 border-r border-slate-100 font-bold text-slate-900">Tank {st.tank_name}</td>
                          <td className="p-3 border-r border-slate-100 text-center font-mono">{st.tank?.area_acres || '2.5'} ac</td>
                          <td className="p-3 border-r border-slate-100 font-mono text-slate-600">{stockingDate}</td>
                          <td className="p-3 border-r border-slate-100 font-mono text-slate-600">{harvestDate}</td>
                          <td className="p-3 border-r border-slate-100 text-center font-mono font-bold">{days}</td>
                          <td className="p-3 border-r border-slate-100 text-right font-mono">{seedStocked.toLocaleString()}</td>
                          <td className="p-3 border-r border-slate-100 text-right font-mono">{seedCatched.toLocaleString()}</td>
                          <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-emerald-700">{survival}%</td>
                          <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-blue-700 bg-blue-50/50">{remainingSurvival}%</td>
                          <td className="p-3 border-r border-slate-100 text-center font-mono text-slate-700 bg-emerald-50/40">{harvestDate}</td>
                          <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-blue-700 bg-emerald-50/40">{st.finalCount}</td>
                          <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-slate-900 bg-emerald-50/40">{st.grandTotalKgs?.toFixed?.(2) || st.grandTotalKgs} KG</td>
                          <td className="p-3 border-r border-slate-100 text-right font-mono font-bold text-slate-900">{tankFeedKg} KG</td>
                          <td className="p-3 text-slate-600">{st.tank?.hatchery || 'Sri Venkateswara'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* OPTION C: UASF Rates Tab */}
          {activeTab === 'uasf-rates' && (
            <div id="printable-uasf-document" className="space-y-6 text-left bg-white font-sans">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <span className="text-[10px] font-extrabold tracking-widest text-amber-600 uppercase bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                    UASF RATE BREAKDOWN
                  </span>
                  <h2 className="text-xl font-black text-slate-900 mt-1">UASF Rates</h2>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono">
                  <div><span className="text-[10px] text-slate-500 block">Date</span><span className="font-bold">{bill.date || bill.created_at?.slice(0, 10)}</span></div>
                  <div><span className="text-[10px] text-slate-500 block">UASF Bill No.</span><span className="font-bold text-blue-700">{uasfBillNo}</span></div>
                  <div><span className="text-[10px] text-slate-500 block">Buyer</span><span className="font-bold">{buyerCompanyName}</span></div>
                  <div><span className="text-[10px] text-slate-500 block">Tonnage</span><span className="font-bold text-emerald-700">{totalTonnageTons} T</span></div>
                </div>
              </div>

              {/* Table 1: Standard UASF Rates Table */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">📊 Table 1: Standard UASF Rates Table</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                      <tr>
                        <th className="p-3 border-r border-slate-800">Tank No</th>
                        <th className="p-3 border-r border-slate-800 text-center">Count</th>
                        <th className="p-3 border-r border-slate-800 text-right">UASF Rate (₹/KG)</th>
                        <th className="p-3 border-r border-slate-800 text-right">Total Weight (KGS)</th>
                        <th className="p-3 text-right">Total Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {savedTanks.map((st, idx) => (
                        <tr key={idx}>
                          <td className="p-3 border-r border-slate-100 font-bold text-slate-900">Tank {st.tank_name}</td>
                          <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-blue-700">{st.finalCount}</td>
                          <td className="p-3 border-r border-slate-100 text-right font-mono">₹{st.pricePerKg}</td>
                          <td className="p-3 border-r border-slate-100 text-right font-mono">{st.grandTotalKgs?.toFixed?.(2) || st.grandTotalKgs} KG</td>
                          <td className="p-3 text-right font-mono font-extrabold text-emerald-700">
                            ₹{Math.round((st.grandTotalKgs || 0) * (st.pricePerKg || 0)).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100 border-t border-slate-300 font-black text-xs">
                      <tr>
                        <td colSpan={3} className="p-3 border-r border-slate-200 uppercase">Standard UASF Total:</td>
                        <td className="p-3 border-r border-slate-200 text-right font-mono">{totalHarvestKgs.toFixed(2)} KG</td>
                        <td className="p-3 text-right font-mono text-emerald-700 text-sm">₹{Math.round(totalBillAmount).toLocaleString('en-IN')}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Linked Middle Harvest Photo */}
              <div className="pt-4 border-t border-slate-200 space-y-2 bill-photo-print">
                <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                  <span>🔗</span> Middle Harvest Bill Photo (Auto-Linked)
                </h4>
                {billPhoto ? (
                  <div className="rounded-xl overflow-hidden border border-slate-300 max-w-md bg-white">
                    <img src={billPhoto} alt="Linked Middle Harvest Bill Photo" className="max-h-60 object-contain w-full" />
                    <span className="block text-[10px] text-slate-600 bg-slate-50 p-1.5 text-center font-bold border-t border-slate-200">
                      ✓ Auto-linked from Middle Harvest Bill #{bill.bill_number}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No Middle Harvest photo attached to this record.</p>
                )}
              </div>

              {/* Spot Payment Screenshots */}
              {spotPhotos.length > 0 && (
                <div className="pt-4 border-t border-slate-200 space-y-3 bill-photo-print">
                  <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                    <span>💳</span> Spot Payment Screenshot Photos ({spotPhotos.length})
                  </h4>
                  <div className="flex flex-wrap gap-4">
                    {spotPhotos.map((photo, idx) => (
                      <div key={photo.id || idx} className="rounded-xl overflow-hidden border-2 border-emerald-500 shadow-md bg-white">
                        <img src={photo.src || photo} alt={`Spot Photo #${idx + 1}`} className="h-40 object-cover" />
                        <span className="block bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 text-center">
                          ✓ Spot Payment Screenshot #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default function HarvestReportsTab({ siteId }) {
  const [bills, setBills] = useState([]);
  const [tanksMap, setTanksMap] = useState({});
  const [activeSubTab, setActiveSubTab] = useState('todays'); // 'todays' | 'middle' | 'full' | 'bills'
  const [selectedBillModal, setSelectedBillModal] = useState(null);

  // Search parameters for filters
  const [searchDate, setSearchDate] = useState('');
  const [searchBillNo, setSearchBillNo] = useState('');

  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      const [{ data: bData }, { data: tData }] = await Promise.all([
        supabase
          .from(TABLES.bills)
          .select('*')
          .eq('site_id', siteId)
          .order('created_at', { ascending: false }),
        supabase.from(TABLES.tanks).select('id, name').eq('site_id', siteId),
      ]);

      const tMap = {};
      (tData || []).forEach((t) => (tMap[t.id] = t.name));
      setTanksMap(tMap);

      setBills(bData || []);
    })();
  }, [siteId]);

  // Filtered bills archive
  const filteredBills = bills.filter((b) => {
    const bDate = String(b.date || b.created_at || '').slice(0, 10);
    if (searchDate && !bDate.includes(searchDate)) return false;
    if (searchBillNo && !String(b.bill_number || '').toLowerCase().includes(searchBillNo.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6 text-left">
      
      {/* View Bill Modal */}
      {selectedBillModal && (
        <ViewBillModal bill={selectedBillModal} onClose={() => setSelectedBillModal(null)} />
      )}

      {/* Header Banner */}
      <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 block">
            REPORTS &amp; DOCUMENTS ARCHIVE
          </span>
          <h2 className="text-xl font-black text-white">Generated Bills &amp; Harvest Reports</h2>
          <p className="text-xs text-slate-300 mt-0.5">View and re-download official Middle Harvest Bills, Landscape Reports, and UASF Rates Cards.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
          >
            🖨️ Print Page
          </button>
        </div>
      </div>

      {/* Date & Bill Number Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          
          {/* Date Search Input */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-300">
            <span className="text-xs font-extrabold text-slate-700">📅 Search by Date:</span>
            <input
              type="date"
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
              className="bg-white text-slate-900 font-mono text-xs p-1 rounded-lg border border-slate-300 focus:outline-none"
            />
            {searchDate && (
              <button type="button" onClick={() => setSearchDate('')} className="text-xs font-bold text-slate-400 hover:text-slate-600">✕</button>
            )}
          </div>

          {/* Bill Number Input */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-300">
            <span className="text-xs font-extrabold text-slate-700">🧾 Search by Bill #:</span>
            <input
              type="text"
              placeholder="e.g. MHV20260809..."
              value={searchBillNo}
              onChange={(e) => setSearchBillNo(e.target.value)}
              className="bg-white text-slate-900 font-mono text-xs px-2 py-1 rounded-lg border border-slate-300 focus:outline-none w-44"
            />
            {searchBillNo && (
              <button type="button" onClick={() => setSearchBillNo('')} className="text-xs font-bold text-slate-400 hover:text-slate-600">✕</button>
            )}
          </div>
        </div>

        {(searchDate || searchBillNo) && (
          <button
            type="button"
            onClick={() => {
              setSearchDate('');
              setSearchBillNo('');
            }}
            className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200"
          >
            Clear Search Filter
          </button>
        )}
      </div>

      {/* Saved Bills Table */}
      <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <span>📋</span> Stored Harvest Bills Archive ({filteredBills.length})
          </h3>
        </div>

        {filteredBills.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
            <p className="text-xl mb-1">🔍</p>
            <p className="font-extrabold text-slate-700">No matching bills found</p>
            <p className="mt-1">Try entering a different date or bill number.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-extrabold">
                  <th className="p-3">Bill Number</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Buyer / Company</th>
                  <th className="p-3">Tank Name</th>
                  <th className="p-3 text-right">Total Tonnage</th>
                  <th className="p-3 text-right">Bill Amount (₹)</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filteredBills.map((b) => {
                  const amount = Number(b.total_amount || b.amount) || 0;
                  const tankName = tanksMap[b.tank_id] || b.tank_name || 'Tank A1';

                  return (
                    <tr key={b.id || b.bill_number} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-mono font-extrabold text-blue-700">
                        {b.bill_number}
                      </td>
                      <td className="p-3 font-mono text-slate-500">
                        {b.date || b.created_at?.slice(0, 10)}
                      </td>
                      <td className="p-3 font-bold text-slate-900">
                        {b.buyer_name || 'Buying Company'}
                      </td>
                      <td className="p-3 font-bold text-slate-700">
                        {tankName}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">
                        {Number(b.kgs || 0).toFixed(1)} KG
                      </td>
                      <td className="p-3 text-right font-mono font-black text-emerald-700">
                        ₹{amount.toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase">
                          Saved
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedBillModal(b)}
                          className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[11px] font-extrabold hover:bg-slate-800 transition"
                        >
                          👁️ View / Download Bill
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
