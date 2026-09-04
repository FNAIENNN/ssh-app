import { useState, useRef, useEffect } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { downloadPDF } from '../../../lib/pdfGenerator';
import RequestPayment from '../../../components/payments/RequestPayment';

/** Prevent scroll/wheel from changing number inputs */
const preventWheel = (e) => e.target.blur();

/**
 * ReviewAndPayment — Step 8 sub-tabs container for Harvest Wizard.
 * 3 Sections:
 *   1. Harvest Bill
 *   2. Tank FCR
 *   3. UASF Rates
 * PDF download available for all 3 sub-tabs.
 */
export default function ReviewAndPayment({
  siteId,
  harvestType = 'middle',
  selectedTank,
  tanks = [],
  billingData = {},
  weightRows = [],
  grandTotalKgs = 0,
  countRows = [],
  selectedCountIdx = 0,
  finalCount = 0,
  pricePerKg = '',
  graderData = {},
  labourData = {},
  sessionId,
  generatedBill,
  onGenerateBill,
  onFinished,
  onBack,
}) {
  const [activeSubTab, setActiveSubTab] = useState('harvest-bill'); // 'harvest-bill' | 'tank-fcr' | 'uasf-rates'

  // UASF Bill Number
  const [uasfBillNo, setUasfBillNo] = useState(() => {
    if (generatedBill?.bill_number) return generatedBill.bill_number;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `UASF-${dateStr}-${rand}`;
  });

  // Photo upload state for Buying Company Uploaded Bill
  const [uploadedBillPhoto, setUploadedBillPhoto] = useState(null);
  const [uploadedPhotoPreview, setUploadedPhotoPreview] = useState(null);
  const [spotPaymentPhotos, setSpotPaymentPhotos] = useState([]);

  // Toggle for Weighment Detail Table (Sub-Tab 1)
  const [enableWeighmentTable, setEnableWeighmentTable] = useState(false);

  // Multi-Tank Data for same-day harvest table (Sub-Tab 1 & 3)
  const [harvestTanks, setHarvestTanks] = useState([
    {
      tank_id: selectedTank?.id || 't1',
      tank_name: selectedTank?.name || 'Tank A1',
      count: finalCount || 60,
      kgs: grandTotalKgs || 1250.45,
      uasf_rate: Number(pricePerKg) || 380,
      company_rate: Number(pricePerKg) || 380,
    },
  ]);

  // Sync when props change
  useEffect(() => {
    if (selectedTank || grandTotalKgs || finalCount) {
      setHarvestTanks((prev) => {
        const primary = {
          tank_id: selectedTank?.id || 't1',
          tank_name: selectedTank?.name || 'Tank A1',
          count: finalCount || 60,
          kgs: grandTotalKgs || 1250.45,
          uasf_rate: Number(pricePerKg) || 380,
          company_rate: Number(pricePerKg) || 380,
        };
        if (!prev.length) return [primary];
        // update first row with current active tank data
        const updated = [...prev];
        updated[0] = { ...updated[0], ...primary };
        return updated;
      });
    }
  }, [selectedTank, grandTotalKgs, finalCount, pricePerKg]);

  // Add extra tank row for multi-tank harvested crop on same day
  const handleAddHarvestTankRow = () => {
    const nextTankIndex = harvestTanks.length + 1;
    const availableTank = tanks.find((t) => !harvestTanks.some((ht) => ht.tank_id === t.id)) || tanks[0];
    setHarvestTanks((prev) => [
      ...prev,
      {
        tank_id: availableTank?.id || `t${nextTankIndex}`,
        tank_name: availableTank?.name || `Tank A${nextTankIndex}`,
        count: 65,
        kgs: 850.0,
        uasf_rate: Number(pricePerKg) || 380,
        company_rate: Number(pricePerKg) || 380,
      },
    ]);
  };

  const handleUpdateHarvestTankRow = (index, field, value) => {
    setHarvestTanks((prev) => {
      const copy = [...prev];
      if (field === 'tank_id') {
        const found = tanks.find((t) => t.id === value);
        copy[index].tank_id = value;
        if (found) copy[index].tank_name = found.name;
      } else {
        copy[index][field] = value;
      }
      return copy;
    });
  };

  const handleRemoveHarvestTankRow = (index) => {
    if (harvestTanks.length <= 1) return;
    setHarvestTanks((prev) => prev.filter((_, i) => i !== index));
  };

  // Image Upload Handler for the Harvest Bill photo
  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadedBillPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedPhotoPreview(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    // Persist uploaded bill photo to the stored bill row if one exists
    (async () => {
      try {
        const fileBase64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onloadend = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(file);
        });

        // Prefer explicit generatedBill id, otherwise match by bill_number + site
        let billRow = null;
        const billId = generatedBill?.id || generatedBill?.ID || null;
        if (billId) {
          const { data } = await supabase.from(TABLES.bills).select('id,document_data').eq('id', billId).single();
          billRow = data;
        } else {
          const billNumber = uasfBillNo;
          const { data } = await supabase.from(TABLES.bills).select('id,document_data').eq('bill_number', billNumber).eq('site_id', siteId).maybeSingle();
          billRow = data || null;
        }

        if (!billRow) return;
        const existingDoc = (billRow && billRow.document_data) || {};
        const newDoc = { ...existingDoc, bill_photo: fileBase64 };
        await supabase.from(TABLES.bills).update({ document_data: newDoc }).eq('id', billRow.id);
      } catch (err) {
        console.warn('Failed to persist uploaded bill photo:', err);
      }
    })();
  };

  // Spot payment capture is separate from the bill photo and must render only once
  const handleSpotPhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setSpotPaymentPhotos((prev) => [...prev, { id: Date.now(), src: reader.result, name: file.name }]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    // Persist spot photo into stored bill row if available so Reports UASF shows it
    (async () => {
      try {
        const fileBase64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onloadend = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(file);
        });

        let billRow = null;
        const billId = generatedBill?.id || generatedBill?.ID || null;
        if (billId) {
          const { data } = await supabase.from(TABLES.bills).select('id,document_data').eq('id', billId).single();
          billRow = data;
        } else {
          const billNumber = uasfBillNo;
          const { data } = await supabase.from(TABLES.bills).select('id,document_data').eq('bill_number', billNumber).eq('site_id', siteId).maybeSingle();
          billRow = data || null;
        }

        if (!billRow) return;
        const existingDoc = (billRow && billRow.document_data) || {};
        const existingSpots = Array.isArray(existingDoc.spotPhotos) ? existingDoc.spotPhotos : [];
        const newSpots = [...existingSpots, { id: Date.now(), src: fileBase64, name: file.name }];
        const newDoc = { ...existingDoc, spotPhotos: newSpots };
        await supabase.from(TABLES.bills).update({ document_data: newDoc }).eq('id', billRow.id);
      } catch (err) {
        console.warn('Failed to persist spot photo:', err);
      }
    })();
  };

  const handleRemoveSpotPhoto = (id) => {
    setSpotPaymentPhotos((prev) => prev.filter((photo) => photo.id !== id));
  };

  // Sub-Tab 2: Tank FCR & Medical Data State
  const [fcrRecords, setFcrRecords] = useState([
    {
      id: 1,
      tank_no: selectedTank?.name || 'Tank A1',
      acres: selectedTank?.area_acres || 2.5,
      stocking_date: selectedTank?.start_date || '2026-05-01',
      harvest_date: new Date().toISOString().slice(0, 10),
      seed_stocked: 150000,
      seed_catched: 128000,
      feed_consumption_kg: 3200,
      middle_harvests: [
        { date: '2026-07-10', count: 85, kgs: 450.0 },
        { date: '2026-07-25', count: 70, kgs: 600.0 },
      ],
      final_harvest_kg: grandTotalKgs || 1250.45,
      tank_feed_brand: 'C.P. Aqua Supreme 3S',
      hatchery_branch: selectedTank?.hatchery ? `${selectedTank.hatchery} - Nellore` : 'Sri Venkateswara - Nellore',
    },
  ]);

  // Medical Consumption State for Tank
  const [medicalLogs, setMedicalLogs] = useState([
    { id: 1, medicine_name: 'Super Probiotic Plus', quantity: 15, unit: 'Liters', frequency: 'Weekly', purpose: 'Water Quality & Gut Health' },
    { id: 2, medicine_name: 'Min-Cal Premium Minerals', quantity: 50, unit: 'KGs', frequency: 'Bi-Weekly', purpose: 'Moulting & Shell Hardening' },
    { id: 3, medicine_name: 'C-Vita Immune Booster', quantity: 8, unit: 'KGs', frequency: 'Daily Topdressing', purpose: 'Immunity & Growth Support' },
    { id: 4, medicine_name: 'Bio-Clean Soil Sanitizer', quantity: 20, unit: 'Liters', frequency: 'Monthly', purpose: 'Pond Bottom Sludge Treatment' },
  ]);

  const [newMed, setNewMed] = useState({ medicine_name: '', quantity: '', unit: 'KGs', purpose: '' });

  const handleAddMedicine = () => {
    if (!newMed.medicine_name || !newMed.quantity) return;
    setMedicalLogs((prev) => [
      ...prev,
      {
        id: Date.now(),
        medicine_name: newMed.medicine_name,
        quantity: Number(newMed.quantity),
        unit: newMed.unit,
        frequency: 'As Applied',
        purpose: newMed.purpose || 'General Treatment',
      },
    ]);
    setNewMed({ medicine_name: '', quantity: '', unit: 'KGs', purpose: '' });
  };

  // Printable Reference for PDF Generation
  const printRef = useRef(null);

  const getCurrentDocTypeForSave = () => {
    if (harvestType === 'full') {
      return activeSubTab === 'tank-fcr'
        ? 'full_report'
        : activeSubTab === 'uasf-rates'
        ? 'full_uasf_rates'
        : 'full_bill';
    }

    return activeSubTab === 'tank-fcr' ? 'middle_report' : activeSubTab === 'uasf-rates' ? 'uasf_rates' : 'middle_bill';
  };

  const persistCurrentDocument = async () => {
    if (harvestType !== 'full') return;

    const docType = getCurrentDocTypeForSave();
    const docDataObj = {
      bill_number: uasfBillNo,
      date: new Date().toISOString().slice(0, 10),
      site_id: siteId,
      site_name: farmName,
      buyer_name: buyingCompanyName,
      factory_name: graderData.factory_name || '',
      grader_name: graderName,
      supervisor_name: supervisorName,
      tank_name: harvestTanks.map((t) => `Tank ${t.tank_name}`).join(', ') || 'Tank A1',
      harvest_type: 'full',
      total_kgs: totalHarvestKgs,
      price_per_kg: Number(pricePerKg) || 0,
      total_amount: companyTotalAmount,
      paid_amount: 0,
      balance_amount: companyTotalAmount,
      savedTanks: harvestTanks,
      weightRows,
      bill_photo: uploadedPhotoPreview,
      spotPhotos: spotPaymentPhotos,
      medicalLogs,
      supervisor_signature: billingData.supervisor_signature || null,
      grader_signature: graderData.grader_signature || null,
      grader_rows: graderData.grader_rows || null,
      worker_rows: labourData.worker_rows || null,
    };

    try {
      const { data: inserted, error: insertErr } = await supabase.from(TABLES.bills).insert({
        site_id: siteId,
        bill_number: uasfBillNo,
        type: 'harvest',
        harvest_type: 'full',
        report_type: docType,
        date: new Date().toISOString().slice(0, 10),
        tank_name: docDataObj.tank_name,
        kgs: parseFloat(totalHarvestKgs.toFixed(3)),
        total_amount: Math.round(companyTotalAmount),
        paid_amount: 0,
        balance_amount: Math.round(companyTotalAmount),
        status: 'pending',
        buyer_name: buyingCompanyName,
        document_data: docDataObj,
      }).select();

      if (insertErr) throw insertErr;

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
      console.warn('Full Harvest document save skipped:', err);
    }
  };

  const handleDownloadPDF = async (tabName) => {
    if (harvestType === 'full') {
      await persistCurrentDocument();
    }

    const getPrintableId = () => {
      if (activeSubTab === 'harvest-bill') return 'printable-bill-document';
      if (activeSubTab === 'tank-fcr') return 'printable-report-document';
      if (activeSubTab === 'uasf-rates') return 'printable-uasf-document';
      return 'printable-bill-document';
    };

    const elementId = getPrintableId();
    const filename = `${tabName.replace(/\s+/g, '_')}_${uasfBillNo}.pdf`;
    const isLandscape = activeSubTab === 'tank-fcr';
    try {
      await downloadPDF(elementId, { filename, orientation: isLandscape ? 'landscape' : 'portrait' });
    } catch (err) {
      console.warn('PDF export failed, falling back to print', err);
      const originalTitle = document.title;
      document.title = filename;
      window.print();
      document.title = originalTitle;
    }
  };

  // Helper values
  const buyingCompanyName = billingData.buying_company || graderData.buyer_name || 'Sri Laxmi Seafoods Exporters';
  const farmName = billingData.farm_name || 'Oryxen Shrimp Farms - Unit 1';
  const farmerName = billingData.farmer_name || 'Ram Kumar';
  const farmerPhone = billingData.farmer_phone || '9876543210';
  const graderName = graderData.name || billingData.grader_name || 'Ramesh Graders & Co.';
  const graderPhone = graderData.phone || billingData.grader_phone || '9848022338';
  const supervisorName = billingData.harvest_supervisor || 'Venkateswara Rao';
  const supervisorPhone = billingData.supervisor_phone || '9123456789';

  // Overall Tonnage & Amounts
  const totalHarvestKgs = harvestTanks.reduce((sum, r) => sum + (Number(r.kgs) || 0), 0);
  const totalTonnageTons = (totalHarvestKgs / 1000).toFixed(3);

  const uasfTotalAmount = harvestTanks.reduce((sum, r) => sum + (Number(r.kgs) || 0) * (Number(r.uasf_rate) || 0), 0);
  const companyTotalAmount = harvestTanks.reduce((sum, r) => sum + (Number(r.kgs) || 0) * (Number(r.company_rate) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Header & Sub-Tab Navigation */}
      <div className="bg-slate-900 rounded-2xl p-4 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-xl font-bold">
            📑
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight">Step 8: Review & Payments</h2>
            <p className="text-xs text-slate-400">
              Generated Harvest Bills, Tank FCR calculations, and UASF Rate settlements
            </p>
          </div>
        </div>

        {/* 3 Sub-Tabs Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-800 p-1.5 rounded-xl border border-slate-700">
          <button
            type="button"
            onClick={() => setActiveSubTab('harvest-bill')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeSubTab === 'harvest-bill'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
          >
            <span>🧾</span>
            <span>1. Harvest Bill</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('tank-fcr')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeSubTab === 'tank-fcr'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
          >
            <span>📊</span>
            <span>2. Tank FCR</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('uasf-rates')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeSubTab === 'uasf-rates'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
          >
            <span>🏷️</span>
            <span>3. UASF Rates</span>
          </button>
        </div>

        {/* Global Download PDF Action */}
        <button
          type="button"
          onClick={() =>
            handleDownloadPDF(
              activeSubTab === 'harvest-bill'
                ? 'Harvest Bill'
                : activeSubTab === 'tank-fcr'
                ? 'Tank FCR Report'
                : 'UASF Rates'
            )
          }
          className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl font-extrabold text-xs shadow-lg transition flex items-center gap-1.5"
        >
          <span>📥</span>
          <span>Download PDF</span>
        </button>
      </div>

      {/* Printable Area Wrapper */}
      <div ref={printRef} className="print:p-0">
        {/* ========================================================================= */}
        {/* SUB-TAB 1: HARVEST BILL                                                   */}
        {/* ========================================================================= */}
        {activeSubTab === 'harvest-bill' && (
          <div className="space-y-6">
            {/* Top Middle Header Card — Printable starts directly at Official Harvest Bill Header */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card text-center relative space-y-4" id="printable-bill-document">
              <div className="max-w-2xl mx-auto space-y-2">
                <span className="text-[10px] font-extrabold tracking-widest text-blue-600 uppercase bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                  OFFICIAL HARVEST BILL
                </span>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  <h1 className="text-2xl font-black text-slate-900">{buyingCompanyName}</h1>
                  <span className="hidden sm:inline text-slate-300">•</span>
                  <span className="text-sm font-mono font-black text-blue-700 bg-blue-50 px-3 py-1 rounded-xl border border-blue-200">
                    Bill No: {uasfBillNo}
                  </span>
                </div>

                <div className="text-left bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1 text-xs text-slate-700 mt-4">
                  <p>
                    <strong className="font-bold text-slate-900">1. Farm name :</strong> {farmName}
                  </p>
                  <p>
                    <strong className="font-bold text-slate-900">2. Phone number :</strong> {farmerPhone}
                  </p>
                </div>
              </div>

              {/* Main Harvest Tank Table (3 Columns) */}
              <div className="mt-6 text-left space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <span>📋</span> Harvested Tanks & Weight Summary
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddHarvestTankRow}
                    className="text-xs text-blue-600 font-bold hover:underline print:hidden"
                  >
                    + Add Same-Day Harvest Tank
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                      <tr>
                        <th className="p-3 border-r border-slate-800">1. Tank no</th>
                        <th className="p-3 border-r border-slate-800 text-center">2. Count</th>
                        <th className="p-3 text-right">3. Kgs (Total weight after removing net weight including grams)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-medium text-slate-800 bg-white">
                      {harvestTanks.map((ht, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition">
                          <td className="p-3 border-r border-slate-100 font-bold text-slate-900">
                            {harvestTanks.length > 1 ? (
                              <select
                                value={ht.tank_id}
                                onChange={(e) => handleUpdateHarvestTankRow(idx, 'tank_id', e.target.value)}
                                className="p-1 rounded bg-slate-100 border border-slate-300 font-bold text-xs"
                              >
                                {tanks.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              ht.tank_name
                            )}
                          </td>
                          <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-blue-700">
                            <input
                              type="number"
                              value={ht.count}
                              onChange={(e) => handleUpdateHarvestTankRow(idx, 'count', Number(e.target.value))}
                              onWheel={preventWheel}
                              className="w-20 p-1 rounded bg-slate-50 border border-slate-200 text-center font-bold font-mono text-xs"
                            />
                          </td>
                          <td className="p-3 text-right font-mono font-extrabold text-slate-900">
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="number"
                                step="0.001"
                                value={ht.kgs}
                                onChange={(e) => handleUpdateHarvestTankRow(idx, 'kgs', Number(e.target.value))}
                                onWheel={preventWheel}
                                className="w-28 p-1 rounded bg-slate-50 border border-slate-200 text-right font-mono font-bold text-xs"
                              />
                              <span className="text-slate-500 font-normal">KGS</span>
                              {harvestTanks.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveHarvestTankRow(idx)}
                                  className="text-red-500 hover:text-red-700 font-bold px-1 print:hidden"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100 border-t border-slate-300 font-black text-xs text-slate-900">
                      <tr>
                        <td colSpan={2} className="p-3 border-r border-slate-200 uppercase">
                          Overall Total Harvest KGs:
                        </td>
                        <td className="p-3 text-right font-mono text-blue-700 text-sm">
                          {totalHarvestKgs.toFixed(3)} KGS ({totalTonnageTons} Tons)
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Cards Below Table: Grader Card & Supervisor Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-left">
                {/* Card 1: Grader Details */}
                <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🚚</span>
                    <h4 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider">
                      Grader Details Card
                    </h4>
                  </div>
                  <div className="space-y-1 text-xs text-slate-800 font-medium">
                    <p>
                      <strong className="font-bold text-slate-900">1. Grader name:</strong> {graderName}
                    </p>
                    <p>
                      <strong className="font-bold text-slate-900">2. Phone number (grader):</strong>{' '}
                      {graderPhone}
                    </p>
                  </div>
                </div>

                {/* Card 2: Supervisor Details */}
                <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">👨‍🌾</span>
                    <h4 className="text-xs font-extrabold text-emerald-900 uppercase tracking-wider">
                      Harvest Supervisor Card
                    </h4>
                  </div>
                  <div className="space-y-1 text-xs text-slate-800 font-medium">
                    <p>
                      <strong className="font-bold text-slate-900">1. Harvest supervisor:</strong> {supervisorName}
                    </p>
                    <p>
                      <strong className="font-bold text-slate-900">2. Phone number (harvest supervisor):</strong>{' '}
                      {supervisorPhone}
                    </p>
                  </div>
                </div>
              </div>

              {/* Separate Weighment Tables for Every Enabled Tank */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 text-left space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                      <span>⚖️</span> Weighment Tables (Separate per Tank)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Separate box weighment tables for each enabled harvest tank
                    </p>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl border border-slate-300 transition print:hidden">
                    <input
                      type="checkbox"
                      checked={enableWeighmentTable}
                      onChange={(e) => setEnableWeighmentTable(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-xs font-extrabold text-slate-800">
                      {enableWeighmentTable ? 'Enabled (Showing Separate Tables)' : 'Enable Weighment Tables'}
                    </span>
                  </label>
                </div>

                {enableWeighmentTable ? (
                  <div className="space-y-6">
                    {harvestTanks.map((ht) => (
                      <div key={ht.tank_id} className="space-y-2">
                        <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5 bg-slate-100 p-2 rounded-lg border border-slate-200">
                          <span>📦</span> Tank {ht.tank_name} Weighment Table ({weightRows.length} weighments)
                        </h4>
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-800 text-white font-extrabold text-[10px] uppercase">
                              <tr>
                                <th className="p-2.5">Box #</th>
                                <th className="p-2.5">Gross Weight (KG)</th>
                                <th className="p-2.5">Nets Count</th>
                                <th className="p-2.5">Tare Weight (KG)</th>
                                <th className="p-2.5 text-right">Net Weight (KG)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 font-mono text-slate-800 bg-white">
                              {weightRows.length > 0 ? (
                                weightRows.map((r, idx) => {
                                  const gross = Number(r.kgs) || 0;
                                  const nets = Number(r.nets) || 2;
                                  const netTare = nets * (Number(billingData.net_weight) || 0);
                                  const netWt = Math.max(0, gross - netTare);
                                  return (
                                    <tr key={idx} className="hover:bg-slate-50">
                                      <td className="p-2.5 font-bold text-slate-900">Box #{idx + 1}</td>
                                      <td className="p-2.5">{gross.toFixed(2)} KG</td>
                                      <td className="p-2.5">{nets} nets</td>
                                      <td className="p-2.5 text-slate-500">{netTare.toFixed(2)} KG</td>
                                      <td className="p-2.5 text-right font-extrabold text-blue-700">
                                        {netWt.toFixed(3)} KG
                                      </td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td colSpan={5} className="p-4 text-center text-slate-400 font-sans">
                                    No detailed weighments recorded for Tank {ht.tank_name}.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                            <tfoot className="bg-slate-100 font-black text-xs text-slate-900 border-t border-slate-300">
                              <tr>
                                <td colSpan={4} className="p-2.5 uppercase">Tank {ht.tank_name} Net Total:</td>
                                <td className="p-2.5 text-right font-mono text-blue-700 text-sm">{(Number(ht.kgs) || 0).toFixed(3)} KG</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                    <span>Weighment tables are currently hidden. Click "Enable" to display detailed per-tank box weighment tables.</span>
                    <span className="font-bold font-mono text-blue-700">{weightRows.length} Weighment Rows</span>
                  </div>
                )}
              </div>

              {/* Count Card Below Weighment Details */}
              <div className="bg-amber-50/70 p-5 rounded-2xl border border-amber-200 text-left space-y-3">
                <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                  <h4 className="text-xs font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🔍</span> Count Selection Details Card
                  </h4>
                  <span className="text-xs font-mono font-black px-2.5 py-0.5 bg-amber-200/70 text-amber-950 rounded-lg">
                    Selected Count: {finalCount.toFixed(2)} count / kg
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-amber-200">
                    <span className="text-[10px] text-slate-500 block">Sample Weight</span>
                    <span className="font-bold font-mono text-slate-900">
                      {countRows[selectedCountIdx]?.kgs || '1.0'} KG
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-amber-200">
                    <span className="text-[10px] text-slate-500 block">Sample Pieces</span>
                    <span className="font-bold font-mono text-slate-900">
                      {countRows[selectedCountIdx]?.pieces || '60'} Pcs
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-amber-200">
                    <span className="text-[10px] text-slate-500 block">Calculated Count</span>
                    <span className="font-black font-mono text-amber-700">{finalCount.toFixed(2)}</span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-amber-200">
                    <span className="text-[10px] text-slate-500 block">Harvest Rate / KG</span>
                    <span className="font-black font-mono text-emerald-700">₹ {pricePerKg || '380'}</span>
                  </div>
                </div>
              </div>

              {/* Photo Upload Option for Buying Company Uploaded Bill */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-left space-y-4 print:hidden">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <span>📷</span> Upload Buying Company Bill Photo
                    </h4>
                    <p className="text-xs text-slate-500">
                      Attach physical signed bill image uploaded by buying company driver/representative
                    </p>
                  </div>

                  <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs transition shadow-sm print:hidden">
                    <span>Upload Bill Photo</span>
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </label>
                </div>

                {uploadedPhotoPreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-slate-300 max-w-md mx-auto group">
                    <img
                      src={uploadedPhotoPreview}
                      alt="Buying Company Uploaded Bill"
                      className="w-full max-h-72 object-contain bg-slate-900"
                    />
                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-3 print:hidden">
                      <a
                        href={uploadedPhotoPreview}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-white text-slate-900 rounded-lg text-xs font-bold"
                      >
                        🔍 View Full
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadedBillPhoto(null);
                          setUploadedPhotoPreview(null);
                        }}
                        className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center text-xs text-slate-500 space-y-2">
                    <div className="text-2xl">📸</div>
                    <p className="font-semibold text-slate-700">No bill photo uploaded yet</p>
                    <p>Click "Upload Bill Photo" above to upload buying company's printed copy.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TAB 2: TANK FCR                                                       */}
        {/* ========================================================================= */}
        {activeSubTab === 'tank-fcr' && (
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-6 text-left" id="printable-report-document">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <span className="text-[10px] font-extrabold tracking-widest text-emerald-600 uppercase bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  FCR & PERFORMANCE ANALYSIS
                </span>
                <h2 className="text-xl font-black text-slate-900 mt-1">Tank Feed Conversion Ratio (FCR)</h2>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-500 block font-medium">Site ID: {siteId || 'SITE-1'}</span>
                <span className="text-xs font-mono font-bold text-slate-700">Date: {new Date().toLocaleDateString('en-IN')}</span>
              </div>
            </div>

            {/* Unmerged 16-Column Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-900 text-white text-[10px] font-extrabold uppercase tracking-wider">
                  <tr>
                    <th rowSpan={2} className="p-3 border-r border-slate-800">1. Tank no.</th>
                    <th rowSpan={2} className="p-3 border-r border-slate-800">2. No. of acres</th>
                    <th rowSpan={2} className="p-3 border-r border-slate-800">3. Seed stocking date</th>
                    <th rowSpan={2} className="p-3 border-r border-slate-800">4. Harvest date</th>
                    <th rowSpan={2} className="p-3 border-r border-slate-800 text-center">5. No. of days</th>
                    <th rowSpan={2} className="p-3 border-r border-slate-800 text-right">6. Seed stocked</th>
                    <th rowSpan={2} className="p-3 border-r border-slate-800 text-right">7. Seed catched</th>
                    <th rowSpan={2} className="p-3 border-r border-slate-800 text-center">8. Survival %</th>
                    <th rowSpan={2} className="p-3 border-r border-slate-800 text-right">9. Tank feed consumption</th>
                    
                    {/* Column 10: Middle Harvest with 3 UNMERGED sub-columns */}
                    <th colSpan={3} className="p-2 border-r border-slate-800 text-center bg-emerald-950 text-emerald-300">
                      10. Middle Harvest
                    </th>

                    <th rowSpan={2} className="p-3 border-r border-slate-800 text-right">11. Harvest</th>
                    <th rowSpan={2} className="p-3 border-r border-slate-800 text-right font-black text-amber-300">
                      12. Tank yield (middle+harvest)
                    </th>
                    <th rowSpan={2} className="p-3 border-r border-slate-800 text-center font-black text-emerald-300">
                      13. Tank FCR
                    </th>
                    <th rowSpan={2} className="p-3 border-r border-slate-800 text-right font-black text-blue-300">14. Total Feed (KG)</th>
                    <th rowSpan={2} className="p-3 border-r border-slate-800 text-right">15. Yield/acre</th>
                    <th rowSpan={2} className="p-3">16. Hatchery & branch</th>
                  </tr>
                  {/* Distinct sub-header row for Middle Harvest: Date, Count, Tonnage */}
                  <tr className="bg-emerald-900 text-emerald-200 text-[9px] font-extrabold">
                    <th className="p-2 border-r border-slate-800 text-center">Date</th>
                    <th className="p-2 border-r border-slate-800 text-center">Count</th>
                    <th className="p-2 border-r border-slate-800 text-center">Tonnage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium text-slate-800 bg-white">
                  {fcrRecords.map((rec) => {
                    const days = Math.max(
                      1,
                      Math.floor((new Date(rec.harvest_date) - new Date(rec.stocking_date)) / (1000 * 60 * 60 * 24))
                    );
                    const survival = ((rec.seed_catched / rec.seed_stocked) * 100).toFixed(1);

                    const totalMiddleKgs = rec.middle_harvests.reduce((sum, m) => sum + m.kgs, 0);
                    const totalYieldKgs = totalMiddleKgs + rec.final_harvest_kg;
                    const totalYieldTons = (totalYieldKgs / 1000).toFixed(3);
                    const fcr = (rec.feed_consumption_kg / totalYieldKgs).toFixed(2);
                    const yieldPerAcre = (totalYieldTons / rec.acres).toFixed(2);

                    const mhFirst = rec.middle_harvests[0] || { date: '—', count: '—', kgs: 0 };

                    return (
                      <tr key={rec.id} className="hover:bg-slate-50 transition">
                        <td className="p-3 border-r border-slate-100 font-bold text-slate-900">{rec.tank_no}</td>
                        <td className="p-3 border-r border-slate-100 text-center font-mono">{rec.acres} acres</td>
                        <td className="p-3 border-r border-slate-100 font-mono text-slate-600">{rec.stocking_date}</td>
                        <td className="p-3 border-r border-slate-100 font-mono text-slate-600">{rec.harvest_date}</td>
                        <td className="p-3 border-r border-slate-100 text-center font-mono font-bold">{days} days</td>
                        <td className="p-3 border-r border-slate-100 text-right font-mono">{rec.seed_stocked.toLocaleString()}</td>
                        <td className="p-3 border-r border-slate-100 text-right font-mono">{rec.seed_catched.toLocaleString()}</td>
                        <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-emerald-700">
                          {survival}%
                        </td>
                        <td className="p-3 border-r border-slate-100 text-right font-mono font-bold text-slate-900">
                          {rec.feed_consumption_kg.toLocaleString()} KG
                        </td>

                        {/* Middle Harvest 3 UNMERGED sub-column cells side-by-side */}
                        <td className="p-3 border-r border-slate-100 text-center font-mono text-slate-700 bg-emerald-50/40">{mhFirst.date}</td>
                        <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-blue-700 bg-emerald-50/40">{mhFirst.count}</td>
                        <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-slate-900 bg-emerald-50/40">{mhFirst.kgs.toFixed(1)} kg</td>

                        <td className="p-3 border-r border-slate-100 text-right font-mono font-bold text-blue-700">
                          {rec.final_harvest_kg.toFixed(2)} KG
                        </td>
                        <td className="p-3 border-r border-slate-100 text-right font-mono font-extrabold text-slate-900 bg-amber-50/60">
                          {totalYieldKgs.toFixed(2)} KG ({totalYieldTons} T)
                        </td>
                        <td className="p-3 border-r border-slate-100 text-center font-mono font-black text-emerald-700 bg-emerald-50/60 text-sm">
                          {fcr}
                        </td>
                        <td className="p-3 border-r border-slate-100 font-mono font-bold text-right text-slate-900">
                          {rec.feed_consumption_kg.toLocaleString()} KG
                        </td>
                        <td className="p-3 border-r border-slate-100 text-right font-mono font-bold text-slate-900">
                          {yieldPerAcre} T/Acre
                        </td>
                        <td className="p-3 text-slate-600">{rec.hatchery_branch}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Medical Consumption Section Below Table */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <span>💊</span> Medical Consumption Details (Applied Quantity per Tank)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Full log of healthcare, minerals, probiotics, and soil conditioners applied to this tank
                  </p>
                </div>
              </div>

              {/* Medicine Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">S.No</th>
                      <th className="p-3">Medicine / Product Name</th>
                      <th className="p-3 text-right">Applied Quantity</th>
                      <th className="p-3">Unit</th>
                      <th className="p-3">Application Frequency</th>
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

              {/* Interactive Add Medicine Form */}
              <div className="p-4 bg-white rounded-xl border border-slate-200 flex flex-wrap items-center gap-3 print:hidden">
                <span className="text-xs font-bold text-slate-700">Add Medicine Log:</span>
                <input
                  type="text"
                  placeholder="Medicine Name"
                  value={newMed.medicine_name}
                  onChange={(e) => setNewMed({ ...newMed, medicine_name: e.target.value })}
                  className="p-1.5 rounded-lg border border-slate-300 text-xs font-medium w-44"
                />
                <input
                  type="number"
                  placeholder="Qty"
                  value={newMed.quantity}
                  onChange={(e) => setNewMed({ ...newMed, quantity: e.target.value })}
                  onWheel={preventWheel}
                  className="p-1.5 rounded-lg border border-slate-300 text-xs font-medium w-20"
                />
                <select
                  value={newMed.unit}
                  onChange={(e) => setNewMed({ ...newMed, unit: e.target.value })}
                  className="p-1.5 rounded-lg border border-slate-300 text-xs font-medium"
                >
                  <option value="KGs">KGs</option>
                  <option value="Liters">Liters</option>
                  <option value="Packs">Packs</option>
                  <option value="Bags">Bags</option>
                </select>
                <input
                  type="text"
                  placeholder="Purpose / Remark"
                  value={newMed.purpose}
                  onChange={(e) => setNewMed({ ...newMed, purpose: e.target.value })}
                  className="p-1.5 rounded-lg border border-slate-300 text-xs font-medium flex-1 min-w-[140px]"
                />
                <button
                  type="button"
                  onClick={handleAddMedicine}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold rounded-lg transition"
                >
                  + Add Log
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TAB 3: UASF RATES                                                     */}
        {/* ========================================================================= */}
        {activeSubTab === 'uasf-rates' && (
          <div id="printable-uasf-document" className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-6 text-left">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <span className="text-[10px] font-extrabold tracking-widest text-amber-600 uppercase bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                  UASF RATE BREAKDOWN
                </span>
                <h2 className="text-xl font-black text-slate-900 mt-1">UASF Rates & Buying Company Matrix</h2>
              </div>

              {/* 4 Metadata Options at top */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-500 block">1. Date</span>
                  <span className="font-extrabold text-slate-900">{new Date().toLocaleDateString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">2. UASF bill no.</span>
                  <span className="font-mono font-black text-blue-700">{uasfBillNo}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">3. Farmer name</span>
                  <span className="font-extrabold text-slate-900">{farmerName}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">4. Tonnage</span>
                  <span className="font-mono font-black text-emerald-700">{totalTonnageTons} Tons ({totalHarvestKgs.toFixed(2)} KG)</span>
                </div>
              </div>
            </div>

            {/* Table 1: Standard UASF Rates Table */}
            <div className="space-y-2">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span>📊</span> 5. Standard UASF Rates Table (by Tank & Count)
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
                  <tbody className="divide-y divide-slate-200 font-medium text-slate-800 bg-white">
                    {harvestTanks.map((ht, idx) => {
                      const rowTotal = (Number(ht.kgs) || 0) * (Number(ht.uasf_rate) || 0);
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-3 border-r border-slate-100 font-bold text-slate-900">{ht.tank_name}</td>
                          <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-blue-700">
                            {ht.count}
                          </td>
                          <td className="p-3 border-r border-slate-100 text-right font-mono font-bold text-slate-900">
                            ₹ {Number(ht.uasf_rate).toLocaleString('en-IN')}
                          </td>
                          <td className="p-3 border-r border-slate-100 text-right font-mono text-slate-900">
                            {Number(ht.kgs).toFixed(2)} KG
                          </td>
                          <td className="p-3 text-right font-mono font-extrabold text-emerald-700">
                            ₹ {Math.round(rowTotal).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 border-t border-slate-300 font-black text-xs text-slate-900">
                    <tr>
                      <td colSpan={3} className="p-3 border-r border-slate-200 uppercase">
                        Standard UASF Total:
                      </td>
                      <td className="p-3 border-r border-slate-200 text-right font-mono">
                        {totalHarvestKgs.toFixed(2)} KG
                      </td>
                      <td className="p-3 text-right font-mono text-emerald-700 text-sm">
                        ₹ {Math.round(uasfTotalAmount).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Buying Company Section & Table 2 (Editable Option) */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-700">
                    <strong className="font-extrabold text-slate-900">7. Buying company name :</strong>{' '}
                    <span className="font-bold text-blue-700">{buyingCompanyName}</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    8. Buying company rate per tank (Editable Option)
                  </p>
                </div>
                <span className="text-[10px] font-extrabold px-2.5 py-1 bg-amber-100 text-amber-900 rounded-lg border border-amber-300">
                  ✏️ Rates below are editable
                </span>
              </div>

              {/* Table 2: Editable Buying Company Rates */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs text-left">
                  <thead className="bg-amber-950 text-amber-100 font-extrabold uppercase text-[10px]">
                    <tr>
                      <th className="p-3 border-r border-amber-900">Tank No</th>
                      <th className="p-3 border-r border-amber-900 text-center">Count</th>
                      <th className="p-3 border-r border-amber-900 text-right">Company Rate (₹/KG) [Editable]</th>
                      <th className="p-3 border-r border-amber-900 text-right">Total Weight (KGS)</th>
                      <th className="p-3 text-right">Company Total Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium text-slate-800 bg-white">
                    {harvestTanks.map((ht, idx) => {
                      const rowCompanyTotal = (Number(ht.kgs) || 0) * (Number(ht.company_rate) || 0);
                      return (
                        <tr key={idx} className="hover:bg-amber-50/40">
                          <td className="p-3 border-r border-slate-100 font-bold text-slate-900">{ht.tank_name}</td>
                          <td className="p-3 border-r border-slate-100 text-center font-mono font-bold text-blue-700">
                            {ht.count}
                          </td>
                          <td className="p-3 border-r border-slate-100 text-right font-mono font-bold">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-slate-500">₹</span>
                              <input
                                type="number"
                                value={ht.company_rate}
                                onChange={(e) =>
                                  handleUpdateHarvestTankRow(idx, 'company_rate', Number(e.target.value))
                                }
                                onWheel={preventWheel}
                                className="w-24 p-1 rounded bg-amber-50 border border-amber-300 text-right font-mono font-black text-amber-900 text-xs focus:ring-amber-500"
                              />
                            </div>
                          </td>
                          <td className="p-3 border-r border-slate-100 text-right font-mono text-slate-900">
                            {Number(ht.kgs).toFixed(2)} KG
                          </td>
                          <td className="p-3 text-right font-mono font-extrabold text-amber-900">
                            ₹ {Math.round(rowCompanyTotal).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-amber-100/80 border-t border-amber-300 font-black text-xs text-amber-950">
                    <tr>
                      <td colSpan={3} className="p-3 border-r border-amber-200 uppercase">
                        Buying Company Total Bill Amount:
                      </td>
                      <td className="p-3 border-r border-amber-200 text-right font-mono">
                        {totalHarvestKgs.toFixed(2)} KG
                      </td>
                      <td className="p-3 text-right font-mono text-amber-950 text-sm">
                        ₹ {Math.round(companyTotalAmount).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {uploadedPhotoPreview && (
              <div className="bg-blue-50 p-5 rounded-2xl border border-blue-200 text-left space-y-3">
                <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                  <span>📷</span> Harvest Bill Uploaded Photo
                </h4>
                <div className="rounded-xl overflow-hidden border border-blue-300 bg-white">
                  <img src={uploadedPhotoPreview} alt="Harvest Bill Uploaded Photo" className="w-full max-h-72 object-contain" />
                </div>
              </div>
            )}

            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-left space-y-4">
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
                    onChange={handleSpotPhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {spotPaymentPhotos.length > 0 ? (
                <div className="flex items-center gap-3 flex-wrap">
                  {spotPaymentPhotos.map((photo) => (
                    <div key={photo.id} className="relative rounded-xl overflow-hidden border-2 border-emerald-500 shadow-md">
                      <img src={photo.src} alt={photo.name} className="h-32 object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveSpotPhoto(photo.id)}
                        className="absolute top-1 right-1 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  No spot payment screenshots uploaded. Click '+ Add Photo' to upload payment proofs.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bill Generation Footer Section (Payment options removed) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-4 print:hidden">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              🧾 Official Harvest Bill Settlement
            </h3>
            <p className="text-xs text-slate-500">
              Generate and print official clean bill document.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={onBack} className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-extrabold hover:bg-slate-100">
              ← Back to Labour
            </button>
            <button
              type="button"
              onClick={async () => {
                if (harvestType === 'full') {
                  await persistCurrentDocument();
                }
                await onGenerateBill();
              }}
              className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-extrabold text-xs shadow-md transition"
            >
              🧾 Generate Official Harvest Bill
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
              onClick={() => handleDownloadPDF('Official_Harvest_Bill')}
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
