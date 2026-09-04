import { useState, useEffect } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import OfficialBillDocument from '../components/OfficialBillDocument';
import { downloadPDF } from '../../../lib/pdfGenerator';
import ReportPreviewModal from '../components/ReportPreviewModal';

/**
 * HarvestReportsTab — Analytical & Stored Harvest Reports module.
 * Requirements 5, 6, 7, 8, 9, 10:
 *   - 4-column table selector:
 *     | Today Harvest Reports | Middle Harvest Reports | Full Harvest Reports | Stored Harvest Bills |
 *   - All 4 report types follow the EXACT same standard tabular format as Stored Harvest Bills.
 *   - Search by Bill Number & Search by Date.
 *   - Official Document preview modal + non-blank PDF exports (Portrait/Landscape).
 */
export default function HarvestReportsTab({ siteId }) {
  const [activeCategory, setActiveCategory] = useState('stored_bills'); // 'today_reports' | 'middle_reports' | 'full_reports' | 'stored_bills'
  const [entries, setEntries] = useState([]);
  const [bills, setBills] = useState([]);
  const [tanksMap, setTanksMap] = useState({});
  const [loading, setLoading] = useState(true);

  // Search state by Date or Bill Number
  const [searchQuery, setSearchQuery] = useState('');
  const [billNumberSearch, setBillNumberSearch] = useState('');
  const [dateSearch, setDateSearch] = useState('');

  // Modal preview for non-blank official PDF exports
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const fetchReportsData = async () => {
    if (!siteId) return;
    setLoading(true);
    const [{ data: eData }, { data: tData }, { data: bData }] = await Promise.all([
      supabase
        .from(TABLES.harvestEntries)
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false }),
      supabase.from(TABLES.tanks).select('*').eq('site_id', siteId),
      supabase
        .from(TABLES.bills)
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false }),
    ]);

    const tMap = {};
    (tData || []).forEach((t) => (tMap[t.id] = t));
    setTanksMap(tMap);

    setEntries(eData || []);
    setBills(bData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchReportsData();
  }, [siteId]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const isHarvestBill = (b) => {
    const reqType = String(b?.request_type || b?.category || '').toLowerCase();
    const bNo = String(b?.bill_number || b?.id || '').toUpperCase();
    
    // Stop/remove any Payments-related request data (Valamanushulu or Grader request bills) from Reports
    if (
      reqType === 'valamanushulu' ||
      reqType === 'grader' ||
      bNo.startsWith('VAL') ||
      bNo.startsWith('GRD')
    ) {
      return false;
    }
    return true;
  };

  // Filter bills & reports by active 4-column category + search query (Date or Bill Number)
  const getCategoryBills = () => {
    // Only display Harvest Bills related information in Reports tab
    const harvestBillsOnly = bills.filter((b) => isHarvestBill(b));
    let list = harvestBillsOnly;

    if (activeCategory === 'today_reports') {
      list = harvestBillsOnly.filter(
        (b) =>
          b.date === todayStr ||
          b.created_at?.startsWith(todayStr) ||
          b.report_type === 'today_report'
      );
    } else if (activeCategory === 'middle_reports') {
      list = harvestBillsOnly.filter(
        (b) =>
          b.harvest_type === 'middle' ||
          b.type === 'middle' ||
          b.report_type === 'middle_report' ||
          b.report_type === 'middle_bill'
      );
    } else if (activeCategory === 'full_reports') {
      list = harvestBillsOnly.filter(
        (b) =>
          b.harvest_type === 'full' ||
          b.type === 'full' ||
          b.report_type === 'full_report' ||
          b.report_type === 'full_bill' ||
          b.report_type === 'full_uasf' ||
          b.report_type === 'full_uasf_rates'
      );
    } else {
      // 'stored_bills' — display all stored harvest bills
      list = harvestBillsOnly;
    }

    // Apply separate Bill Number and Date filters if provided
    const bn = (billNumberSearch || '').toLowerCase().trim();
    const d = (dateSearch || '').toLowerCase().trim();

    return list.filter((b) => {
      if (bn) {
        const bNo = String(b.bill_number || b.id || '').toLowerCase();
        if (!bNo.includes(bn)) return false;
      }
      if (d) {
        const bDate = String(b.date || b.created_at || '').slice(0, 10).toLowerCase();
        if (!bDate.includes(d)) return false;
      }
      return true;
    });
  };

  const currentList = getCategoryBills();

  const handleDownloadPDFDoc = async (docItem) => {
    const parsedData = typeof docItem.document_data === 'string'
      ? (() => { try { return JSON.parse(docItem.document_data); } catch (e) { return {}; } })()
      : docItem.document_data || {};

    const docDataObj = {
      ...docItem,
      ...parsedData,
      bill_number: docItem.bill_number || parsedData.bill_number || `BILL-${docItem.id}`,
      date: docItem.date || parsedData.date || docItem.created_at?.slice(0, 10) || todayStr,
      site_name: docItem.site_name || parsedData.site_name || 'SHRIMP HARVEST MANAGEMENT',
      buyer_name: docItem.buyer_name || parsedData.buyer_name || 'Choice Trading Co.',
      tank_name: docItem.tank_name || parsedData.tank_name || 'Tank A1',
      harvest_type: docItem.harvest_type || parsedData.harvest_type || 'middle',
      total_kgs: Number(docItem.kgs || docItem.total_kgs || parsedData.total_kgs || 1250),
      total_amount: Number(docItem.total_amount || docItem.amount || parsedData.total_amount || 0),
      paid_amount: Number(docItem.paid_amount || parsedData.paid_amount || 0),
      balance_amount: Number(docItem.balance_amount || parsedData.balance_amount || 0),
      bill_photo: docItem.bill_photo || parsedData.bill_photo || docItem.billPhoto || parsedData.billPhoto || null,
      spotPhotos: docItem.spotPhotos || parsedData.spotPhotos || docItem.spot_photos || parsedData.spot_photos || [],
    };

    const reportType = docItem.report_type || (
      docItem.harvest_type === 'full'
        ? 'full_bill'
        : docItem.harvest_type === 'middle'
        ? 'middle_bill'
        : 'bill'
    );
    setSelectedDoc({ docData: docDataObj, docType: reportType, filename: `${docItem.bill_number || 'Harvest_Report'}.pdf`, rawDoc: docItem });
  };

  const triggerPDFDownload = async () => {
    if (!selectedDoc) return;
    setDownloading(true);
    await downloadPDF('official-pdf-render-area', {
      filename: selectedDoc.filename,
      orientation: selectedDoc.isLandscape ? 'landscape' : 'portrait',
    });
    setDownloading(false);
  };

  const exportCSV = (dataList, filename) => {
    if (!dataList || dataList.length === 0) return;
    const headers = Object.keys(dataList[0]).join(',');
    const rows = dataList.map((row) =>
      Object.values(row)
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* ── Search Bar: Separate Bill Number & Date ───────────────────── */}
      <div className="rounded-2xl p-5 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-xl font-bold">🔍</div>
          <div>
            <h3 className="text-base font-black tracking-tight">Search Harvest Reports &amp; Bills</h3>
            <p className="text-xs text-slate-300">Use separate filters for Bill Number and Date</p>
          </div>
        </div>

        <div className="w-full md:w-96 grid grid-cols-1 gap-2">
          <input
            type="text"
            placeholder="Search by Bill Number"
            value={billNumberSearch}
            onChange={(e) => setBillNumberSearch(e.target.value)}
            className="w-full bg-white/10 border border-white/25 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-400 focus:bg-white focus:text-slate-900 focus:outline-none transition"
          />
          <input
            type="date"
            placeholder="Search by Date"
            value={dateSearch}
            onChange={(e) => setDateSearch(e.target.value)}
            className="w-full bg-white/10 border border-white/25 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-400 focus:bg-white focus:text-slate-900 focus:outline-none transition"
          />
          {(billNumberSearch || dateSearch) && (
            <div className="flex justify-end">
              <button onClick={() => { setBillNumberSearch(''); setDateSearch(''); }} className="text-xs font-bold text-white/80 hover:text-white">Clear Filters ✕</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Requirement 7: 4-Column Layout Table for Report Options ──────── */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-card overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">
            Report Selection Matrix (Click Column to Filter Reports)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white font-black text-xs uppercase tracking-wide">
                {[
                  { key: 'today_reports', label: '1. Today Harvest Reports', icon: '📅' },
                  { key: 'middle_reports', label: '2. Middle Harvest Reports', icon: '🐟' },
                  { key: 'full_reports', label: '3. Full Harvest Reports', icon: '🏁' },
                  { key: 'stored_bills', label: '4. Stored Harvest Bills', icon: '🧾' },
                ].map((col) => {
                  const isActive = activeCategory === col.key;
                  return (
                    <th
                      key={col.key}
                      onClick={() => setActiveCategory(col.key)}
                      className={`p-4 text-center cursor-pointer transition border-r border-slate-800 select-none ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-inner font-black scale-[1.01]'
                          : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <span>{col.icon}</span>
                        <span>{col.label}</span>
                      </div>
                      <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isActive ? 'bg-white text-blue-900' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {isActive ? '✓ Active View' : 'Select'}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
          </table>
        </div>
      </div>

      {/* ── Standardized Bills & Reports Table (Reference Format) ────────── */}
      <div className="rounded-2xl p-6 bg-white border border-slate-200 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <span>🧾</span>
              <span>
                {activeCategory === 'today_reports'
                  ? 'Today Harvest Reports'
                  : activeCategory === 'middle_reports'
                  ? 'Middle Harvest Reports'
                  : activeCategory === 'full_reports'
                  ? 'Full Harvest Reports'
                  : 'Stored Harvest Bills Ledger'}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {searchQuery
                ? `Search results for "${searchQuery}" (${currentList.length} items found)`
                : `Showing all ${currentList.length} documents in exact reference format`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportCSV(currentList, `Harvest_${activeCategory}`)}
              className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-extrabold hover:bg-slate-100 flex items-center gap-1.5"
            >
              📥 Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 flex items-center gap-1.5"
            >
              🖨️ Print Page
            </button>
          </div>
        </div>

        {/* Reference Layout Table */}
        {currentList.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-extrabold uppercase text-[9px]">
                    <th className="p-2 border-r border-slate-800">Bill / Document No</th>
                    <th className="p-2 border-r border-slate-800">Date</th>
                    <th className="p-2 border-r border-slate-800">Harvest Type</th>
                    <th className="p-2 border-r border-slate-800">Tank Name</th>
                    <th className="p-2 border-r border-slate-800 text-right">Total Tonnage</th>
                    <th className="p-2 border-r border-slate-800 text-right">Bill Amount (₹)</th>
                    <th className="p-2 border-r border-slate-800 text-center">Status</th>
                    <th className="p-2 text-center">Action</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800 bg-white">
                {currentList.map((b) => {
                  const isMiddle = b.type === 'middle' || b.harvest_type === 'middle';
                  const amount = Number(b.total_amount || b.amount || b.grand_total) || 0;
                  const kgs = Number(b.kgs || b.total_kgs || b.harvest_details?.kgs || 1250);
                  const billNo = b.bill_number || `BILL-${b.id.slice(0, 8)}`;
                  const dateStr = b.date || b.created_at?.slice(0, 10) || todayStr;

                  return (
                    <tr key={b.id} className="hover:bg-slate-50 transition">
                      <td className="p-2 font-mono font-extrabold text-blue-700 border-r border-slate-100">
                        {billNo}
                      </td>
                      <td className="p-2 text-slate-600 font-mono border-r border-slate-100">
                        {dateStr}
                      </td>
                      <td className="p-2 border-r border-slate-100">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                            isMiddle ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          }`}
                        >
                          {isMiddle ? '🐟 Middle Harvest' : '🏁 Full Harvest'}
                        </span>
                      </td>
                      <td className="p-2 font-bold text-slate-900 border-r border-slate-100">
                        {b.tank_name || b.harvest_details?.tank_name || 'Tank A1'}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-slate-900 border-r border-slate-100">
                        {kgs.toFixed(1)} KG
                      </td>
                      <td className="p-2 text-right font-mono font-black text-emerald-700 border-r border-slate-100">
                        ₹{amount.toLocaleString('en-IN')}
                      </td>
                      <td className="p-2 text-center border-r border-slate-100">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase border border-emerald-300">
                          {b.status || 'Saved'}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDownloadPDFDoc(b)}
                          className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-extrabold hover:bg-blue-500 shadow-sm transition flex items-center gap-1 mx-auto"
                        >
                          <span>📥</span>
                          <span>View &amp; Download</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500 space-y-2">
            <div className="text-3xl">🔍</div>
            <p className="font-extrabold text-slate-700 text-sm">No records match your search criteria</p>
            <p className="text-slate-400">Try entering a different date (e.g. 2026-08-13) or Bill Number.</p>
          </div>
        )}
      </div>

      {/* ── Requirement 10: Official Document Modal (Prevents Blank PDF Download) ── */}
      {selectedDoc && (
        <ReportPreviewModal
          visible={!!selectedDoc}
          onClose={() => setSelectedDoc(null)}
          docData={selectedDoc.docData}
          docType={selectedDoc.docType}
          rawDoc={selectedDoc.rawDoc}
        />
      )}
    </div>
  );
}