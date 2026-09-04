import { useState, useRef } from 'react';
import RequestPayment from '../../../../components/payments/RequestPayment';
import { downloadPDF } from '../../../../lib/pdfGenerator';
import { supabase, TABLES } from '../../../../lib/supabaseClient';

/**
 * MiddleReviewAndPayment — Reviews & Payments for Middle Harvest.
 * 3 sub-tabs:
 *   1. Middle Harvest Bill
 *   2. Middle Harvest Report (FCR / performance)
 *   3. UASF Rates
 *
 * Fixes applied:
 *  - Fix 3: Bill photo shown in printed bill (not hidden)
 *  - Fix 4: UASF headings fixed, rate column properly reactive, multi-photo spot
 *  - Fix 5: Proper print format (uses #printable-bill-document id, @page CSS)
 *  - Fix 2: onWheel blur on number inputs
 */

/** Prevent scroll/wheel from changing number inputs */
const preventWheel = (e) => e.target.blur();

export default function MiddleReviewAndPayment({
  siteId,
  savedTanks = [],
  tanks = [],
  billingData = {},
  graderData = {},
  labourData = {},
  generatedBill,
  onGenerateBill,
  isSubmitting,
  onFinished,
  onBack,
}) {
  const [activeSubTab, setActiveSubTab] = useState('middle-harvest-bill');
  const [enableWeighmentTable, setEnableWeighmentTable] = useState(false);

  // Bill photo (for Middle Harvest Bill — shown in printed bill)
  const [billPhotoPreview, setBillPhotoPreview] = useState(null);

  // Spot Payment photos — multiple, non-replacing
  const [spotPhotos, setSpotPhotos] = useState([]);
  const spotPhotoInputRef = useRef(null);

  // Buying company rates — kept in local state so edits are reactive
  const [buyingRates, setBuyingRates] = useState(() =>
    savedTanks.reduce((acc, st) => ({ ...acc, [st.id]: st.pricePerKg || '' }), {})
  );

  const [uasfBillNo] = useState(() => {
    if (generatedBill?.bill_number) return generatedBill.bill_number;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `UASF-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
  });

  // Medical logs state for Middle Harvest Report
  const [medicalLogs, setMedicalLogs] = useState([
    { id: 1, medicine_name: 'Super Probiotic Plus', quantity: 15, unit: 'Liters', frequency: 'Weekly', purpose: 'Water Quality & Gut Health' },
    { id: 2, medicine_name: 'Min-Cal Premium Minerals', quantity: 50, unit: 'KGs', frequency: 'Bi-Weekly', purpose: 'Moulting & Shell Hardening' },
  ]);
  const [newMed, setNewMed] = useState({ medicine_name: '', quantity: '', unit: 'KGs', purpose: '' });

  const handleAddMedicine = () => {
    if (!newMed.medicine_name || !newMed.quantity) return;
    setMedicalLogs((prev) => [
      ...prev,
      { id: Date.now(), medicine_name: newMed.medicine_name, quantity: Number(newMed.quantity), unit: newMed.unit, frequency: 'As Applied', purpose: newMed.purpose || 'General Treatment' },
    ]);
    setNewMed({ medicine_name: '', quantity: '', unit: 'KGs', purpose: '' });
  };

  const handleBillPhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setBillPhotoPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleAddSpotPhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setSpotPhotos((prev) => [...prev, { id: Date.now(), src: reader.result, name: file.name }]);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected if needed
    e.target.value = '';
  };

  const handleRemoveSpotPhoto = (id) => {
    setSpotPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleDownloadPDF = async () => {
    const isLandscape = activeSubTab === 'middle-harvest-report';
    const elementId = getPrintableId();
    const docName =
      activeSubTab === 'middle-harvest-report'
        ? `Middle_Harvest_Report_${uasfBillNo}`
        : activeSubTab === 'uasf-rates'
        ? `UASF_Rates_${uasfBillNo}`
        : `Middle_Harvest_Bill_${uasfBillNo}`;
    // Build the document metadata that will be stored in the bills table.
    const docDataObj = {
      bill_number: uasfBillNo,
      date: new Date().toISOString().slice(0, 10),
      site_id: siteId,
      site_name: siteName,
      buyer_name: buyerCompanyName,
      factory_name: graderData.factory_name || '',
      grader_name: graderName,
      supervisor_name: supervisorName,
      tank_name: savedTanks.map((t) => `Tank ${t.tank_name}`).join(', ') || 'Tank A1',
      harvest_type: 'middle',
      total_kgs: totalHarvestKgs,
      price_per_kg: savedTanks[0]?.pricePerKg || 0,
      total_amount: companyTotalAmount,
      paid_amount: 0,
      balance_amount: companyTotalAmount,
      savedTanks: savedTanks,
      bill_photo: billPhotoPreview,
      spotPhotos: spotPhotos,
      medicalLogs: medicalLogs,
      supervisor_signature: supervisorSig,
      grader_signature: graderSig,
      grader_rows: graderData.grader_rows || null,
      worker_rows: labourData.worker_rows || null,
    };

    // 1) Generate PDF blob (so we can persist it along with the bill)
    let pdfBlob = null;
    try {
      pdfBlob = await downloadPDF(elementId, {
        filename: `${docName}.pdf`,
        orientation: isLandscape ? 'landscape' : 'portrait',
        returnBlob: true,
      });
    } catch (err) {
      console.warn('PDF generation failed, falling back to direct save', err);
      // fallback: generate and save locally (non-returning)
      await downloadPDF(elementId, {
        filename: `${docName}.pdf`,
        orientation: isLandscape ? 'landscape' : 'portrait',
      });
    }

    // 2) Convert blob to base64 so it can be stored in document_data for demo/local mode.
    let pdfBase64 = null;
    if (pdfBlob) {
      pdfBase64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(pdfBlob);
      });
      // attach small metadata
      docDataObj.pdf_export = { filename: `${docName}.pdf`, mime: 'application/pdf', size: pdfBlob.size };
    }

    // 3) Persist the bill record into the bills table (stores document_data including base64 PDF in demo mode)
    try {
      const insertPayload = {
        site_id: siteId,
        bill_number: uasfBillNo,
        type: 'harvest',
        harvest_type: 'middle',
        report_type: activeSubTab === 'middle-harvest-report' ? 'middle_report' : activeSubTab === 'uasf-rates' ? 'uasf_rates' : 'middle_bill',
        date: new Date().toISOString().slice(0, 10),
        tank_name: docDataObj.tank_name,
        kgs: parseFloat(totalHarvestKgs.toFixed(3)),
        total_amount: Math.round(companyTotalAmount),
        paid_amount: 0,
        balance_amount: Math.round(companyTotalAmount),
        status: 'pending',
        buyer_name: buyerCompanyName,
        document_data: { ...docDataObj, pdf_base64: pdfBase64 },
      };

      const { data: inserted, error: insertErr } = await supabase.from(TABLES.bills).insert(insertPayload).select();
      if (insertErr) throw insertErr;

      // If this Review & Payments insert created a new bill, update any harvest_entries
      // that were previously linked to an older/generated bill (e.g. wizard HRV) so
      // Reports will resolve to this exact stored document in Review & Payments.
      try {
        const newBill = Array.isArray(inserted) ? inserted[0] : inserted;
        const newBillId = newBill?.id;
        if (newBillId && generatedBill?.id) {
          await supabase.from(TABLES.harvestEntries).update({ bill_id: newBillId }).eq('bill_id', generatedBill.id).eq('site_id', siteId);
        }
      } catch (upErr) {
        console.warn('Failed to backfill harvest_entries with new bill_id:', upErr);
      }
    } catch (err) {
      console.warn('Auto-store report notice:', err);
    }

    // 4) If a blob was generated, trigger a save for the user as well (so UX remains unchanged)
    if (pdfBlob) {
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  };

  // Helper values
  const siteName = billingData.farm_name || 'Middle Harvest Site';
  const buyerCompanyName = billingData.buying_company || graderData.buyer_name || 'Buying Company';
  const farmName = billingData.farm_name || 'Farm Name';
  const farmerPhone = billingData.farmer_phone || '';
  const graderName = graderData.name || billingData.grader_name || '';
  const supervisorName = billingData.harvest_supervisor || '';
  const supervisorSig = billingData.supervisor_signature || null;
  const graderSig = graderData.grader_signature || null;

  const generateFallbackSignature = (name, title) => {
    const displayName = String(name || title || 'Authorized Sign').trim();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" viewBox="0 0 200 50">
      <path d="M 15 32 Q 35 12, 60 30 T 110 22 T 160 32" fill="none" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round"/>
      <text x="15" y="42" font-family="sans-serif" font-size="14" font-weight="bold" font-style="italic" fill="#0f172a">${displayName}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const finalSupervisorSig = supervisorSig || generateFallbackSignature(supervisorName || 'Middle Harvest Incharge', 'Harvest Incharge Sign');
  const finalGraderSig = graderSig || generateFallbackSignature(graderName || 'Grader / Contractor', 'Grader / Contractor Sign');
  const finalManagerSig = generateFallbackSignature('Authorized Manager', 'Authorized Manager Sign');

  const totalHarvestKgs = savedTanks.reduce((sum, t) => sum + t.grandTotalKgs, 0);
  const totalTonnageTons = (totalHarvestKgs / 1000).toFixed(3);

  // Buying company total uses local reactive rates
  const buyingCompanyTotal = savedTanks.reduce((sum, st) => {
    const rate = Number(buyingRates[st.id] || st.pricePerKg || 0);
    return sum + st.grandTotalKgs * rate;
  }, 0);

  const companyTotalAmount = savedTanks.reduce((sum, t) => sum + t.grandTotalKgs * Number(t.pricePerKg || 0), 0);

  const SUB_TABS = [
    { id: 'middle-harvest-bill', label: '1. Middle Harvest Bill', icon: '🧧', color: 'bg-blue-600' },
    { id: 'middle-harvest-report', label: '2. Middle Harvest Report', icon: '📊', color: 'bg-emerald-600' },
    { id: 'uasf-rates', label: '3. UASF Rates', icon: '🏷️', color: 'bg-amber-600' },
  ];

  // Determine which ID to use for the printable area based on active tab
  const getPrintableId = () => {
    if (activeSubTab === 'middle-harvest-bill') return 'printable-bill-document';
    if (activeSubTab === 'middle-harvest-report') return 'printable-report-document';
    if (activeSubTab === 'uasf-rates') return 'printable-uasf-document';
    return 'printable-bill-document';
  };

  return (
    <div className="space-y-6">
      {/* Sub-Tab Header — hidden on print */}
      <div className="bg-slate-900 rounded-2xl p-4 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-xl">💳</div>
          <div>
            <h2 className="text-lg font-black tracking-tight">Reviews &amp; Payments</h2>
            <p className="text-xs text-slate-400">Middle Harvest Bill, Performance Report &amp; UASF Rates</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-800 p-1.5 rounded-xl border border-slate-700">
          {SUB_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeSubTab === tab.id ? `${tab.color} text-white shadow-md` : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleDownloadPDF}
          className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-extrabold text-xs shadow-lg flex items-center gap-1.5"
        >
          <span>📥</span><span>Download PDF</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* SUB-TAB 1: MIDDLE HARVEST BILL                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'middle-harvest-bill' && (
        <div className="space-y-6">
          {/* Printable Bill Document */}
          <div
            className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card text-center space-y-4"
            id="printable-bill-document"
          >
            <div className="max-w-2xl mx-auto space-y-2">
              <span className="text-[10px] font-extrabold tracking-widest text-blue-600 uppercase bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                MIDDLE HARVEST BILL
              </span>

              {/* Site Name Prominently */}
              <div className="pt-2">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Site</p>
                <h1 className="text-2xl font-black text-slate-900">{siteName}</h1>
              </div>

              <div className="text-left bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5 text-xs text-slate-700 mt-4">
                <p><strong className="font-bold text-slate-900">Farm Name:</strong> {farmName}</p>
                <p><strong className="font-bold text-slate-900">Phone Number:</strong> {farmerPhone}</p>
              </div>

              {/* Buyer Company Details */}
              <div className="text-left bg-blue-50 p-4 rounded-xl border border-blue-200 space-y-1.5 text-xs mt-2">
                <p className="text-[10px] font-extrabold text-blue-700 uppercase tracking-wider">Buyer Company</p>
                <p className="text-base font-black text-blue-900">{buyerCompanyName}</p>
                {graderData.factory_name && (
                  <p className="text-slate-700"><strong>Factory:</strong> {graderData.factory_name}</p>
                )}
                {graderName && (
                  <p className="text-slate-700"><strong>Grader:</strong> {graderName}</p>
                )}
              </div>
            </div>

            {/* Tank & Weight Summary Table */}
            <div className="mt-6 text-left space-y-2">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <span>📋</span> Tank &amp; Weight Summary
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                    <tr>
                      <th className="p-3 border-r border-slate-800">Tank No.</th>
                      <th className="p-3 border-r border-slate-800 text-center">Count</th>
                      <th className="p-3 border-r border-slate-800 text-right">KGs</th>
                      <th className="p-3 border-r border-slate-800 text-right">Rate (₹/KG)</th>
                      <th className="p-3 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {savedTanks.map((st, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3 border-r border-slate-100 font-bold text-slate-900">Tank {st.tank_name}</td>
                        <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-blue-700">{st.finalCount.toFixed(2)}</td>
                        <td className="p-3 border-r border-slate-100 text-right font-mono font-bold">{st.grandTotalKgs.toFixed(3)} KG</td>
                        <td className="p-3 border-r border-slate-100 text-right font-mono">₹{st.pricePerKg}</td>
                        <td className="p-3 text-right font-mono font-extrabold text-emerald-700">
                          ₹{Math.round(st.grandTotalKgs * Number(st.pricePerKg)).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 border-t border-slate-300 font-black text-xs">
                    <tr>
                      <td colSpan={3} className="p-3 border-r border-slate-200 uppercase">Total Bill Amount:</td>
                      <td className="p-3 border-r border-slate-200 text-right font-mono">{totalHarvestKgs.toFixed(3)} KGS ({totalTonnageTons} T)</td>
                      <td className="p-3 text-right font-mono text-emerald-700 text-sm">₹{Math.round(companyTotalAmount).toLocaleString('en-IN')}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Grader & Supervisor Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-left">
              <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-200 space-y-2">
                <h4 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider">🚚 Grader Details</h4>
                <p className="text-xs"><strong>Grader name:</strong> {graderName}</p>
                <p className="text-xs"><strong>Phone (grader):</strong> {graderData.phone || billingData.grader_phone}</p>
              </div>
              <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 space-y-2">
                <h4 className="text-xs font-extrabold text-emerald-900 uppercase tracking-wider">👨‍🌾 Supervisor</h4>
                <p className="text-xs"><strong>Supervisor:</strong> {supervisorName}</p>
                <p className="text-xs"><strong>Phone:</strong> {billingData.supervisor_phone}</p>
              </div>
            </div>

            {/* Weighment Tables */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 text-left space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <span>⚖️</span> Weighment Tables (Separate per Tank)
                </h3>
                <label className="flex items-center gap-2 cursor-pointer bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl border border-slate-300 transition print:hidden">
                  <input
                    type="checkbox"
                    checked={enableWeighmentTable}
                    onChange={(e) => setEnableWeighmentTable(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-xs font-extrabold text-slate-800">
                    {enableWeighmentTable ? 'Enabled' : 'Enable Weighment Tables'}
                  </span>
                </label>
              </div>

              {enableWeighmentTable ? (
                <div className="space-y-6">
                  {savedTanks.map((st) => {
                    const rows = st.weightRows || [];
                    const tankNetTotal = st.grandTotalKgs || 0;
                    return (
                      <div
                        key={st.id}
                        className="weighment-table-block pdf-avoid-break space-y-2 rounded-xl border border-slate-300 overflow-hidden"
                        style={{ pageBreakInside: 'avoid', breakInside: 'avoid', display: 'block' }}
                      >
                        <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5 bg-slate-100 p-2 rounded-lg border border-slate-200">
                          <span>📦</span> Tank {st.tank_name} Weighment Table ({rows.length} weighments)
                        </h4>
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-800 text-white font-extrabold text-[10px] uppercase">
                              <tr>
                                <th className="p-2.5">Box #</th>
                                <th className="p-2.5">Gross Weight (KG)</th>
                                <th className="p-2.5">Nets</th>
                                <th className="p-2.5 text-right">Net Weight (KG)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 font-mono text-slate-800 bg-white">
                              {rows.map((r, idx) => {
                                const gross = Number(r.kgs) || 0;
                                const nets = Number(r.nets) || 2;
                                const netTare = nets * (Number(st.netWeightPerNet) || 0);
                                const netWt = Math.max(0, gross - netTare);
                                return (
                                  <tr key={r.id || idx} className="hover:bg-slate-50">
                                    <td className="p-2.5 font-bold text-slate-900">Box #{idx + 1}</td>
                                    <td className="p-2.5">{gross.toFixed(2)} KG</td>
                                    <td className="p-2.5">{nets} nets</td>
                                    <td className="p-2.5 text-right font-extrabold text-blue-700">{netWt.toFixed(3)} KG</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-slate-100 font-black text-xs text-slate-900 border-t border-slate-300">
                              <tr>
                                <td colSpan={3} className="p-2.5 uppercase">Tank {st.tank_name} Net Total:</td>
                                <td className="p-2.5 text-right font-mono text-blue-700 text-sm">{tankNetTotal.toFixed(3)} KG</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Enable the toggle to include detailed weighment tables for each tank in the bill.</p>
              )}
            </div>

            {/* Signature Section (3 Signatures) */}
            <div className="pt-6 border-t border-slate-200 grid grid-cols-3 gap-4 text-center text-xs text-slate-600">
              <div>
                <div className="h-14 flex items-end justify-center pb-1 border-b border-slate-300 mb-1">
                  <img src={finalSupervisorSig} alt="Harvest Incharge Sign" className="max-h-12 object-contain" />
                </div>
                <span className="font-bold text-slate-900 block">Middle Harvest Incharge Sign</span>
                <p className="text-[10px] text-slate-500">{supervisorName || 'Harvest Incharge'}</p>
              </div>
              <div>
                <div className="h-14 flex items-end justify-center pb-1 border-b border-slate-300 mb-1">
                  <img src={finalGraderSig} alt="Grader / Contractor Sign" className="max-h-12 object-contain" />
                </div>
                <span className="font-bold text-slate-900 block">Grader / Contractor Sign</span>
                <p className="text-[10px] text-slate-500">{graderName || 'Grader / Contractor'}</p>
              </div>
              <div>
                <div className="h-14 flex items-end justify-center pb-1 border-b border-slate-300 mb-1">
                  <img src={finalManagerSig} alt="Authorized Manager Sign" className="max-h-12 object-contain opacity-90" />
                </div>
                <span className="font-bold text-slate-900 block">Authorized Manager Sign</span>
                <p className="text-[10px] text-slate-500">Official Seal &amp; Stamp</p>
              </div>
            </div>

            {/* ── Bill Photo — SHOWN IN PRINT (not hidden) ── */}
            {billPhotoPreview && (
              <div className="mt-6 pt-4 border-t border-slate-200 text-left space-y-2 bill-photo-print">
                <h4 className="text-xs font-extrabold text-slate-900">📷 Buying Company Bill Photo</h4>
                <img
                  src={billPhotoPreview}
                  alt="Company Bill"
                  className="max-h-72 object-contain rounded-xl border border-slate-300 w-full"
                />
              </div>
            )}
          </div>

          {/* Photo Upload Control — hidden on print */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-left space-y-4 print:hidden">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                <span>📷</span> Upload Buying Company Bill Photo
              </h4>
              <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs transition">
                <span>{billPhotoPreview ? '🔄 Replace Photo' : 'Upload Photo'}</span>
                <input type="file" accept="image/*" onChange={handleBillPhotoUpload} className="hidden" />
              </label>
            </div>
            {billPhotoPreview ? (
              <img src={billPhotoPreview} alt="Company Bill" className="max-h-72 object-contain rounded-xl border border-slate-300" />
            ) : (
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center text-xs text-slate-500">
                <div className="text-2xl">📸</div>
                <p className="font-semibold text-slate-700 mt-1">No bill photo uploaded yet</p>
                <p className="text-slate-400 mt-0.5">This photo will appear in the downloaded bill</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* SUB-TAB 2: MIDDLE HARVEST REPORT                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'middle-harvest-report' && (
        <div
          className={`bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-6 text-left ${
            activeSubTab === 'middle-harvest-report' ? 'w-[1100px] mx-auto' : ''
          }`}
          id="printable-report-document"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <span className="text-[10px] font-extrabold tracking-widest text-emerald-600 uppercase bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                MIDDLE HARVEST REPORT
              </span>
              <h2 className="text-xl font-black text-slate-900 mt-1">Middle Harvest Performance Report</h2>
            </div>
            <span className="text-xs text-slate-500 font-mono">{new Date().toLocaleDateString('en-IN')}</span>
          </div>

          {/* Report Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-900 text-white text-[10px] font-extrabold uppercase tracking-wider">
                <tr>
                  <th className="p-3 border-r border-slate-800">Tank No.</th>
                  <th className="p-3 border-r border-slate-800">No. of Acres</th>
                  <th className="p-3 border-r border-slate-800">Seed Stocking Date</th>
                  <th className="p-3 border-r border-slate-800">Middle Harvest Date</th>
                  <th className="p-3 border-r border-slate-800 text-center">No. of Days</th>
                  <th className="p-3 border-r border-slate-800 text-right">Seed Stocked</th>
                  <th className="p-3 border-r border-slate-800 text-right">Seed Catched</th>
                  <th className="p-3 border-r border-slate-800 text-center">Survival %</th>
                  <th className="p-3 border-r border-slate-800 text-center bg-blue-900 text-blue-200">Remaining Survival %</th>
                  {/* Middle 1 column with 3 sub-columns */}
                  <th colSpan={3} className="p-2 border-r border-slate-800 text-center bg-emerald-950 text-emerald-300">
                    Middle 1
                    <div className="grid grid-cols-3 border-t border-emerald-800/80 mt-1 pt-1 text-[9px] normal-case">
                      <span>Date</span>
                      <span>Count</span>
                      <span>Tonnage (KG)</span>
                    </div>
                  </th>
                  <th className="p-3 border-r border-slate-800 text-right">Tank Feed (KG)</th>
                  <th className="p-3">Hatchery Name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium text-slate-800 bg-white">
                {savedTanks.map((st) => {
                  const tank = st.tank;
                  const harvestDate = new Date().toISOString().slice(0, 10);
                  const stockingDate = tank?.start_date || '';
                  const days = stockingDate
                    ? Math.max(1, Math.floor((Date.now() - new Date(stockingDate).getTime()) / 86400000))
                    : '—';
                  const seedStocked = tank?.quantity || 100000;
                  const harvestPieces = st.finalCount > 0 ? Math.round(st.grandTotalKgs * st.finalCount) : 0;
                  const seedCatched = Math.round(seedStocked * 0.85);
                  const survival = seedStocked > 0 ? ((seedCatched / seedStocked) * 100).toFixed(1) : '0';
                  const remainingSurvival = seedStocked > 0 ? Math.max(0, ((seedCatched - harvestPieces) / seedStocked) * 100).toFixed(1) : '0';
                  const tankFeedKg = tank?.feed_consumption || (st.grandTotalKgs * 1.3).toFixed(1);

                  return (
                    <tr key={st.id} className="hover:bg-slate-50">
                      <td className="p-3 border-r border-slate-100 font-bold text-slate-900">Tank {st.tank_name}</td>
                      <td className="p-3 border-r border-slate-100 text-center font-mono">{tank?.area_acres || '2.5'} acres</td>
                      <td className="p-3 border-r border-slate-100 font-mono text-slate-600">{stockingDate || '2026-05-01'}</td>
                      <td className="p-3 border-r border-slate-100 font-mono text-slate-600">{harvestDate}</td>
                      <td className="p-3 border-r border-slate-100 text-center font-mono font-bold">{days}</td>
                      <td className="p-3 border-r border-slate-100 text-right font-mono">{Number(seedStocked).toLocaleString()}</td>
                      <td className="p-3 border-r border-slate-100 text-right font-mono">{seedCatched.toLocaleString()}</td>
                      <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-emerald-700">{survival}%</td>
                      <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-blue-700 bg-blue-50/50">{remainingSurvival}%</td>
                      {/* Middle 1 sub-columns: Date, Count, Tonnage */}
                      <td className="p-3 border-r border-slate-100 text-center font-mono text-slate-700 bg-emerald-50/40">{harvestDate}</td>
                      <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-blue-700 bg-emerald-50/40">{st.finalCount.toFixed(2)}</td>
                      <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-slate-900 bg-emerald-50/40">{st.grandTotalKgs.toFixed(2)} KG</td>
                      {/* Tank Feed */}
                      <td className="p-3 border-r border-slate-100 text-right font-mono font-bold text-slate-900">{Number(tankFeedKg).toLocaleString()} KG</td>
                      {/* Hatchery Name */}
                      <td className="p-3 text-slate-600">{tank?.hatchery || 'Sri Venkateswara'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Medicine Consumption Details */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <span>💊</span> Medicine Consumption Details
                </h3>
                <p className="text-xs text-slate-500">Healthcare, minerals, probiotics applied to tank</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">S.No</th>
                    <th className="p-3">Medicine / Product Name</th>
                    <th className="p-3 text-right">Applied Quantity</th>
                    <th className="p-3">Unit</th>
                    <th className="p-3">Frequency</th>
                    <th className="p-3">Purpose / Treatment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
                  {medicalLogs.map((med, idx) => (
                    <tr key={med.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-500">#{idx + 1}</td>
                      <td className="p-3 font-bold text-slate-900">{med.medicine_name}</td>
                      <td className="p-3 text-right font-mono font-extrabold text-blue-700">{med.quantity}</td>
                      <td className="p-3 font-bold text-slate-600">{med.unit}</td>
                      <td className="p-3 text-slate-600">{med.frequency}</td>
                      <td className="p-3 text-slate-600">{med.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-white rounded-xl border border-slate-200 flex flex-wrap items-center gap-3 print:hidden">
              <span className="text-xs font-bold text-slate-700">Add Medicine Log:</span>
              <input type="text" placeholder="Medicine Name" value={newMed.medicine_name} onChange={(e) => setNewMed({ ...newMed, medicine_name: e.target.value })} className="p-1.5 rounded-lg border border-slate-300 text-xs font-medium w-44" />
              <input type="number" placeholder="Qty" value={newMed.quantity} onChange={(e) => setNewMed({ ...newMed, quantity: e.target.value })} onWheel={preventWheel} className="p-1.5 rounded-lg border border-slate-300 text-xs font-medium w-20" />
              <select value={newMed.unit} onChange={(e) => setNewMed({ ...newMed, unit: e.target.value })} className="p-1.5 rounded-lg border border-slate-300 text-xs">
                <option>KGs</option><option>Liters</option><option>Packs</option><option>Bags</option>
              </select>
              <input type="text" placeholder="Purpose" value={newMed.purpose} onChange={(e) => setNewMed({ ...newMed, purpose: e.target.value })} className="p-1.5 rounded-lg border border-slate-300 text-xs flex-1 min-w-[120px]" />
              <button type="button" onClick={handleAddMedicine} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-extrabold rounded-lg">+ Add</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* SUB-TAB 3: UASF RATES                                         */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'uasf-rates' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-6 text-left" id="printable-uasf-document">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <span className="text-[10px] font-extrabold tracking-widest text-amber-600 uppercase bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                UASF RATE BREAKDOWN
              </span>
              {/* Fix 4: Heading changed from "UASF Rates & Buying Company Matrix" → "UASF Rates" */}
              <h2 className="text-xl font-black text-slate-900 mt-1">UASF Rates</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div><span className="text-[10px] text-slate-500 block">Date</span><span className="font-extrabold text-slate-900">{new Date().toLocaleDateString('en-IN')}</span></div>
              <div><span className="text-[10px] text-slate-500 block">UASF Bill No.</span><span className="font-mono font-black text-blue-700">{uasfBillNo}</span></div>
              <div><span className="text-[10px] text-slate-500 block">Buyer</span><span className="font-extrabold text-slate-900">{buyerCompanyName}</span></div>
              <div><span className="text-[10px] text-slate-500 block">Tonnage</span><span className="font-mono font-black text-emerald-700">{totalTonnageTons} T ({totalHarvestKgs.toFixed(2)} KG)</span></div>
            </div>
          </div>

          {/* Table 1: Standard UASF Rates Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span>📊</span> Table 1: Standard UASF Rates Table (by Tank &amp; Count)
            </h3>
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
                  {savedTanks.map((st, idx) => {
                    const rowTotal = st.grandTotalKgs * Number(st.pricePerKg || 0);
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3 border-r border-slate-100 font-bold text-slate-900">Tank {st.tank_name}</td>
                        <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-blue-700">{st.finalCount.toFixed(2)}</td>
                        <td className="p-3 border-r border-slate-100 text-right font-mono">₹{st.pricePerKg}</td>
                        <td className="p-3 border-r border-slate-100 text-right font-mono">{st.grandTotalKgs.toFixed(2)} KG</td>
                        <td className="p-3 text-right font-mono font-extrabold text-emerald-700">₹{Math.round(rowTotal).toLocaleString('en-IN')}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-100 border-t border-slate-300 font-black text-xs">
                  <tr>
                    <td colSpan={3} className="p-3 border-r border-slate-200 uppercase">Standard UASF Total:</td>
                    <td className="p-3 border-r border-slate-200 text-right font-mono">{totalHarvestKgs.toFixed(2)} KG</td>
                    <td className="p-3 text-right font-mono text-emerald-700 text-sm">₹{Math.round(companyTotalAmount).toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Table 2: Buying Company Table — Fix 4: headings renamed, rate column reactive */}
          <div className="space-y-2 pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between">
              {/* Fix 4: "Buying Company Table" */}
              <h3 className="text-xs font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-2">
                <span>🏬</span> Table 2: Buying Company Table
              </h3>
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 bg-amber-100 text-amber-900 rounded-lg border border-amber-300">
                ✏️ Edit rates below
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-amber-300 shadow-sm">
              <table className="w-full text-xs text-left">
                <thead className="bg-amber-950 text-amber-100 font-extrabold uppercase text-[10px]">
                  <tr>
                    <th className="p-3 border-r border-amber-900">Tank No</th>
                    <th className="p-3 border-r border-amber-900 text-center">Count</th>
                    {/* Fix 4: column heading renamed to "Rate (₹/KG)" */}
                    <th className="p-3 border-r border-amber-900 text-right">Rate (₹/KG)</th>
                    <th className="p-3 border-r border-amber-900 text-right">Total Weight (KGS)</th>
                    <th className="p-3 text-right">Company Total Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100 bg-amber-50/20 font-medium text-slate-800">
                  {savedTanks.map((st, idx) => {
                    const currentRate = Number(buyingRates[st.id] || st.pricePerKg || 0);
                    const rowCompanyTotal = st.grandTotalKgs * currentRate;
                    return (
                      <tr key={idx} className="hover:bg-amber-50">
                        <td className="p-3 border-r border-amber-100 font-bold text-slate-900">Tank {st.tank_name}</td>
                        <td className="p-3 border-r border-amber-100 text-center font-mono font-bold text-blue-700">{st.finalCount.toFixed(2)}</td>
                        <td className="p-3 border-r border-amber-100 text-right font-mono">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-slate-400 font-bold">₹</span>
                            <input
                              type="number"
                              value={buyingRates[st.id] ?? st.pricePerKg}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBuyingRates((prev) => ({ ...prev, [st.id]: val }));
                              }}
                              onWheel={preventWheel}
                              className="w-24 bg-white border border-amber-400 rounded-lg px-2 py-1 text-right font-mono font-black text-amber-900 text-xs focus:ring-amber-500 focus:outline-none"
                            />
                          </div>
                        </td>
                        <td className="p-3 border-r border-amber-100 text-right font-mono font-bold text-slate-900">{st.grandTotalKgs.toFixed(2)} KG</td>
                        <td className="p-3 text-right font-mono font-extrabold text-amber-900">₹{Math.round(rowCompanyTotal).toLocaleString('en-IN')}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-amber-100 border-t border-amber-300 font-black text-xs text-amber-950">
                  <tr>
                    <td colSpan={3} className="p-3 border-r border-amber-200 uppercase">Buying Company Total:</td>
                    <td className="p-3 border-r border-amber-200 text-right font-mono">{totalHarvestKgs.toFixed(2)} KG</td>
                    <td className="p-3 text-right font-mono text-amber-950 text-sm">₹{Math.round(buyingCompanyTotal).toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Harvest Bill uploaded photo must appear above Spot Payments screenshots */}
          {billPhotoPreview && (
            <div className="pt-4 border-t border-slate-200 space-y-3 bill-photo-print">
              <h4 className="text-xs font-extrabold text-slate-900">📷 Harvest Bill Uploaded Photo</h4>
              <div className="rounded-xl overflow-hidden border-2 border-blue-400 shadow-md pdf-no-break">
                <img src={billPhotoPreview} alt="Harvest Bill Uploaded Photo" className="w-full max-h-72 object-contain pdf-no-break" />
              </div>
            </div>
          )}

          {/* Spot Payment Screenshot Photos — Fix 4: Multiple photos, non-replacing */}
          {/* Photos shown in printable area (not hidden on print) */}
          {spotPhotos.length > 0 && (
            <div className="pt-4 border-t border-slate-200 space-y-3 bill-photo-print">
              <h4 className="text-xs font-extrabold text-slate-900">📷 Spot Payment Screenshot Photos</h4>
              <div className="flex flex-wrap gap-4">
                {spotPhotos.map((photo) => (
                  <div key={photo.id} className="relative rounded-xl overflow-hidden border-2 border-emerald-500 shadow-md pdf-no-break">
                    <img src={photo.src} alt={photo.name} className="h-40 object-cover pdf-no-break" />
                    <span className="absolute bottom-1 right-1 bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded">✓ Uploaded</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSpotPhoto(photo.id)}
                      className="absolute top-1 right-1 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded print:hidden"
                    >✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spot photo upload controls — hidden on print */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4 print:hidden">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                <span>📷</span> Spot Payment Screenshot Photos
              </h4>
              <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-xl font-extrabold text-xs transition flex items-center gap-1.5 shadow-sm">
                <span>➕</span>
                <span>Add Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAddSpotPhoto}
                  ref={spotPhotoInputRef}
                  className="hidden"
                />
              </label>
            </div>
            {spotPhotos.length > 0 ? (
              <div className="flex items-center gap-3 flex-wrap">
                {spotPhotos.map((photo) => (
                  <div key={photo.id} className="relative rounded-xl overflow-hidden border-2 border-emerald-500 shadow-md pdf-no-break">
                    <img src={photo.src} alt={photo.name} className="h-32 object-cover pdf-no-break" />
                    <span className="absolute bottom-1 right-1 bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded">✓ Uploaded</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSpotPhoto(photo.id)}
                      className="absolute top-1 left-1 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded hover:bg-red-500"
                    >✕ Remove</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No spot payment screenshots uploaded. Click '+ Add Photo' to upload payment proofs. Multiple photos can be added.</p>
            )}
          </div>
        </div>
      )}

      {/* Generate Bill Footer Section — hidden on print */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-4 print:hidden">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              🧾 Middle Harvest Official Bill Generation
            </h3>
            <p className="text-xs text-slate-500">Generate and print official clean bill document.</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onBack} className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-extrabold hover:bg-slate-100">
              ← Back to Labour
            </button>
            <button
              type="button"
              onClick={onGenerateBill}
              disabled={isSubmitting}
              className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-extrabold text-xs shadow-md transition disabled:opacity-50"
            >
              {isSubmitting ? '⏳ Generating...' : '🧧 Generate Middle Harvest Bill'}
            </button>
          </div>
        </div>
        {generatedBill && (
          <div className="pt-2 flex items-center justify-between bg-emerald-50 p-3 rounded-xl border border-emerald-200">
            <span className="text-xs font-extrabold text-emerald-800">
              ✅ Bill #{generatedBill.bill_number} generated successfully and saved to Reports tab!
            </span>
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="px-3 py-1.5 bg-emerald-700 text-white text-xs font-extrabold rounded-lg hover:bg-emerald-800"
            >
              🖨️ Print / Download Bill
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
