import { useState, useRef } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useAuth } from '../../../../hooks/useAuth';
import { useToast } from '../../../../hooks/useToast';
import HarvestChecklist from '../HarvestChecklist';
import BillingPage from '../BillingPage';
import WeightEntryTable from '../WeightEntryTable';
import CountEntryTable from '../CountEntryTable';
import GraderDetailsForm from '../GraderDetailsForm';
import LabourDetailsForm from '../LabourDetailsForm';
import MiddleReviewAndPayment from './MiddleReviewAndPayment';
import { useEffect } from 'react';

/**
 * MiddleHarvestModule — Two-section layout for Middle Harvest:
 *   Section A: Data Entry (Tank Selection, Checklist, Weight Entry, Count & Price)
 *              Users can save multiple tanks and come back.
 *   Section B: Billing Details (Tank Selection, Billing Page, Grader & Buyer,
 *              Labour Details, Reviews & Payments)
 */
export default function MiddleHarvestModule({ siteId, onFinished }) {
  const { user } = useAuth();
  const toast = useToast();

  const [mainSection, setMainSection] = useState('data-entry'); // 'data-entry' | 'billing'

  // ─────────────────────────────────────────────────────────────────────
  // DATA ENTRY STATE
  // ─────────────────────────────────────────────────────────────────────
  const [dataEntryTab, setDataEntryTab] = useState('tank-select'); // per-tank entry sub-tabs
  const [tanks, setTanks] = useState([]);
  const [selectedTankId, setSelectedTankId] = useState('');
  const [checklist, setChecklist] = useState({});
  const [netWeightPerNet, setNetWeightPerNet] = useState('');
  const [weightRows, setWeightRows] = useState([{ id: 1, kgs: '', nets: 2 }]);
  const [countRows, setCountRows] = useState([
    { id: 1, kgs: '1.0', pieces: '60' },
    { id: 2, kgs: '1.0', pieces: '58' },
  ]);
  const [selectedCountIdx, setSelectedCountIdx] = useState(0);
  const [pricePerKg, setPricePerKg] = useState('');

  // Saved tanks array — each entry is a complete tank data snapshot
  const [savedTanks, setSavedTanks] = useState([]);

  // Session ID for ESP32 weighments
  const sessionIdRef = useRef(null);
  if (!sessionIdRef.current) sessionIdRef.current = crypto.randomUUID();
  const sessionId = sessionIdRef.current;

  // ─────────────────────────────────────────────────────────────────────
  // BILLING DETAILS STATE
  // ─────────────────────────────────────────────────────────────────────
  const [billingTab, setBillingTab] = useState('tank-select');
  const [selectedBillingTankIds, setSelectedBillingTankIds] = useState([]);
  const [billingData, setBillingData] = useState({
    harvest_supervisor: '',
    supervisor_phone: '',
    farmer_name: '',
    farm_name: '',
    farmer_phone: '',
    buying_company: '',
    grader_name: '',
    grader_phone: '',
  });
  const [graderData, setGraderData] = useState({
    grader_id: '',
    name: '',
    phone: '',
    vehicle_no: '',
    upi_id: '',
    bank_account: '',
    extra_amount: 0,
    remarks: '',
    buyer_name: '',
    factory_name: '',
    grader_rows: {
      Grader: { persons: '', amount: '' },
      Boys: { persons: '', amount: '' },
      Driver: { persons: '', amount: '' },
    },
  });
  const [labourData, setLabourData] = useState({
    labour_supplier_id: '',
    supplier_name: '',
    phone: '',
    village: '',
    phonepe: '',
    bank_account: '',
    bank_holder: '',
    worker_rows: null,
    remarks: '',
    mestri_signature: '',
  });
  const [generatedBill, setGeneratedBill] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      const { data } = await supabase
        .from(TABLES.tanks)
        .select('*')
        .eq('site_id', siteId)
        .order('name');
      setTanks(data || []);
    })();
  }, [siteId]);

  const selectedTank = tanks.find((t) => t.id === selectedTankId);

  // Computed values for current data entry tank
  const totalWeight = weightRows.reduce((sum, r) => sum + (Number(r.kgs) || 0), 0);
  const totalNets = weightRows.reduce((sum, r) => sum + (Number(r.nets) || 0), 0);
  const netWtPerNet = Number(netWeightPerNet) || 0;
  const totalNetWeight = totalNets * netWtPerNet;
  const grandTotalKgs = Math.max(0, totalWeight - totalNetWeight);
  const selectedCountRow = countRows[selectedCountIdx] || countRows[0];
  const sKg = Number(selectedCountRow?.kgs) || 1;
  const sPcs = Number(selectedCountRow?.pieces) || 0;
  const finalCount = sKg > 0 ? parseFloat((sPcs / sKg).toFixed(2)) : 0;

  const resetDataEntryForNewTank = () => {
    setSelectedTankId('');
    setChecklist({});
    setNetWeightPerNet('');
    setWeightRows([{ id: Date.now(), kgs: '', nets: 2 }]);
    setCountRows([{ id: 1, kgs: '1.0', pieces: '60' }, { id: 2, kgs: '1.0', pieces: '58' }]);
    setSelectedCountIdx(0);
    setPricePerKg('');
    setDataEntryTab('tank-select');
    sessionIdRef.current = crypto.randomUUID();
  };

  const handleSaveTank = () => {
    if (!selectedTankId || grandTotalKgs <= 0) {
      toast.error('Complete weight entry before saving tank');
      return;
    }
    const tankEntry = {
      id: `saved-${selectedTankId}-${Date.now()}`,
      tank_id: selectedTankId,
      tank_name: selectedTank?.name || selectedTankId,
      tank: selectedTank,
      checklist,
      netWeightPerNet,
      weightRows: [...weightRows],
      countRows: [...countRows],
      selectedCountIdx,
      pricePerKg,
      grandTotalKgs,
      finalCount,
      sessionId: sessionIdRef.current,
    };
    setSavedTanks((prev) => {
      // Replace if same tank_id already saved
      const exists = prev.findIndex((s) => s.tank_id === selectedTankId);
      if (exists >= 0) {
        const copy = [...prev];
        copy[exists] = tankEntry;
        return copy;
      }
      return [...prev, tankEntry];
    });
    toast.success(`Tank ${selectedTank?.name} saved!`);
    resetDataEntryForNewTank();
  };

  const handleToggleBillingTank = (savedId) => {
    setSelectedBillingTankIds((prev) =>
      prev.includes(savedId) ? prev.filter((id) => id !== savedId) : [...prev, savedId]
    );
  };

  const selectedBillingTanks = savedTanks.filter((t) => selectedBillingTankIds.includes(t.id));

  const BILLING_TABS = [
    { id: 'tank-select', label: 'Tank Selection', icon: '🗄️' },
    { id: 'billing-page', label: 'Billing Page', icon: '📝' },
    { id: 'grader', label: 'Grader & Buyer', icon: '🚚' },
    { id: 'labour', label: 'Labour Details', icon: '👷' },
    { id: 'review', label: 'Reviews & Payments', icon: '💳' },
  ];

  const DATA_ENTRY_TABS = [
    { id: 'tank-select', label: 'Tank Selection', icon: '🗳️' },
    { id: 'checklist', label: 'Pre-Harvest Checklist', icon: '✅' },
    { id: 'weight', label: 'Weight Entry (ESP32)', icon: '⚖️' },
    { id: 'count-price', label: 'Count & Price', icon: '💰' },
  ];

  const canGoToDataEntryTab = (tabId) => {
    const order = ['tank-select', 'checklist', 'weight', 'count-price'];
    const currentIdx = order.indexOf(dataEntryTab);
    const targetIdx = order.indexOf(tabId);
    return targetIdx <= currentIdx || (tabId === 'checklist' && !!selectedTankId);
  };

  const canGoToBillingTab = (tabId) => {
    const order = ['tank-select', 'billing-page', 'grader', 'labour', 'review'];
    const currentIdx = order.indexOf(billingTab);
    const targetIdx = order.indexOf(tabId);
    if (tabId === 'tank-select') return true;
    if (tabId === 'billing-page') return selectedBillingTankIds.length > 0;
    return targetIdx <= currentIdx;
  };

  return (
    <div className="space-y-6">
      {/* Main Section Switcher */}
      <div className="flex items-center gap-3 bg-white rounded-2xl p-3 border border-slate-200 shadow-card">
        <button
          type="button"
          onClick={() => setMainSection('data-entry')}
          className={`flex-1 py-3 rounded-xl text-sm font-extrabold transition flex items-center justify-center gap-2 ${
            mainSection === 'data-entry'
              ? 'bg-slate-900 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📊</span>
          <span>Data Entry</span>
          {savedTanks.length > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black">
              {savedTanks.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setMainSection('billing')}
          className={`flex-1 py-3 rounded-xl text-sm font-extrabold transition flex items-center justify-center gap-2 ${
            mainSection === 'billing'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>💳</span>
          <span>Billing Details</span>
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION A: DATA ENTRY                                              */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {mainSection === 'data-entry' && (
        <div className="space-y-6">
          {/* Sub-tab navigation */}
          <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-card overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max">
              {DATA_ENTRY_TABS.map((tab, idx) => {
                const isActive = dataEntryTab === tab.id;
                const isAccessible = canGoToDataEntryTab(tab.id);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    disabled={!isAccessible}
                    onClick={() => isAccessible && setDataEntryTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-sm'
                        : isAccessible
                        ? 'text-slate-600 hover:bg-slate-100 cursor-pointer'
                        : 'text-slate-400 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span>{idx + 1}. {tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Saved Tanks Bar */}
          {savedTanks.length > 0 && (
            <div className="rounded-2xl p-4 bg-emerald-50 border border-emerald-200">
              <h4 className="text-xs font-extrabold text-emerald-900 mb-2 flex items-center gap-1.5">
                ✅ Saved Tanks ({savedTanks.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {savedTanks.map((st) => (
                  <span
                    key={st.id}
                    className="px-3 py-1.5 rounded-xl bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5"
                  >
                    <span>Tank {st.tank_name}</span>
                    <span className="text-emerald-300">{st.grandTotalKgs.toFixed(1)} KG</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tab: Tank Selection */}
          {dataEntryTab === 'tank-select' && (
            <div className="space-y-4">
              <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card">
                <h3 className="text-base font-extrabold text-slate-900 mb-1">
                  Select Tank for Middle Harvest
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Select one active tank to enter harvest data. You can save and add more tanks later.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {tanks.map((tk) => {
                    const isSelected = tk.id === selectedTankId;
                    const alreadySaved = savedTanks.some((s) => s.tank_id === tk.id);
                    const doc = tk.start_date
                      ? Math.max(1, Math.floor((Date.now() - new Date(tk.start_date).getTime()) / 86400000))
                      : '—';
                    const isRunning = Number(tk.quantity) > 0 || tk.seed_type;
                    return (
                      <div
                        key={tk.id}
                        onClick={() => setSelectedTankId(tk.id)}
                        className={`rounded-2xl p-4 border-2 transition cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50/70 border-blue-600 shadow-md'
                            : alreadySaved
                            ? 'bg-emerald-50/50 border-emerald-400'
                            : 'bg-slate-50/50 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-lg font-black text-slate-900">Tank {tk.name}</span>
                          <div className="flex items-center gap-1">
                            {alreadySaved && (
                              <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 uppercase">✓ Saved</span>
                            )}
                            <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase ${
                              isRunning ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {isRunning ? 'Running' : 'Empty'}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1 text-xs text-slate-600">
                          <p>DOC: <span className="font-bold text-slate-900">{doc} days</span></p>
                          <p>Seed: <span className="font-bold text-slate-900">{tk.quantity?.toLocaleString('en-IN') || '0'} PL</span></p>
                          <p>Hatchery: {tk.hatchery || 'N/A'}</p>
                          <p>Area: {tk.area_acres} Acres</p>
                        </div>
                        <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-blue-700">
                          <span>{isSelected ? '✓ Selected' : 'Select Tank'}</span>
                          <span>→</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={!selectedTankId}
                  onClick={() => setDataEntryTab('checklist')}
                  className={`btn ${selectedTankId ? 'btn-primary' : 'opacity-50 cursor-not-allowed'}`}
                >
                  Proceed to Safety Checklist →
                </button>
              </div>
            </div>
          )}

          {/* Tab: Pre-Harvest Checklist */}
          {dataEntryTab === 'checklist' && (
            <HarvestChecklist
              checklist={checklist}
              setChecklist={setChecklist}
              siteId={siteId}
              onProceed={() => setDataEntryTab('weight')}
              onBack={() => setDataEntryTab('tank-select')}
            />
          )}

          {/* Tab: Weight Entry */}
          {dataEntryTab === 'weight' && (
            <WeightEntryTable
              weightRows={weightRows}
              setWeightRows={setWeightRows}
              siteId={siteId}
              tankId={selectedTankId}
              sessionId={sessionId}
              netWeightPerNet={netWeightPerNet}
              onNetWeightChange={setNetWeightPerNet}
              harvestType="middle"
              supervisorSignature={billingData.supervisor_signature}
              onSupervisorSignatureChange={(sig) =>
                setBillingData((prev) => ({ ...prev, supervisor_signature: sig }))
              }
              onProceed={() => setDataEntryTab('count-price')}
              onBack={() => setDataEntryTab('checklist')}
            />
          )}

          {/* Tab: Count & Price */}
          {dataEntryTab === 'count-price' && (
            <div className="space-y-4">
              <CountEntryTable
                countRows={countRows}
                setCountRows={setCountRows}
                selectedCountIdx={selectedCountIdx}
                setSelectedCountIdx={setSelectedCountIdx}
                pricePerKg={pricePerKg}
                setPricePerKg={setPricePerKg}
                totalHarvestKgs={grandTotalKgs}
                onProceed={handleSaveTank}
                onBack={() => setDataEntryTab('weight')}
              />
              <div className="flex items-center justify-end pt-2">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleSaveTank}
                    disabled={!pricePerKg || grandTotalKgs <= 0}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    💾 Save Tank & Add Another
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleSaveTank();
                      setMainSection('billing');
                    }}
                    disabled={!pricePerKg || grandTotalKgs <= 0}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    💳 Save & Go to Billing →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION B: BILLING DETAILS                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {mainSection === 'billing' && (
        <div className="space-y-6">
          {/* Billing sub-tab navigation */}
          <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-card overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max">
              {BILLING_TABS.map((tab, idx) => {
                const isActive = billingTab === tab.id;
                const accessible = canGoToBillingTab(tab.id);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    disabled={!accessible}
                    onClick={() => accessible && setBillingTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : accessible
                        ? 'text-slate-600 hover:bg-slate-100 cursor-pointer'
                        : 'text-slate-400 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span>{idx + 1}. {tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* No saved tanks warning */}
          {savedTanks.length === 0 && (
            <div className="rounded-2xl p-6 bg-amber-50 border border-amber-200 text-center">
              <p className="text-amber-800 font-extrabold text-sm">⚠️ No tanks saved yet</p>
              <p className="text-amber-700 text-xs mt-1">Go to Data Entry, complete all steps for at least one tank, and save it before proceeding to Billing.</p>
              <button
                type="button"
                onClick={() => setMainSection('data-entry')}
                className="mt-3 btn btn-primary text-xs"
              >
                ← Go to Data Entry
              </button>
            </div>
          )}

          {/* Billing Tab: Tank Selection (multi-select) */}
          {billingTab === 'tank-select' && savedTanks.length > 0 && (
            <div className="space-y-4">
              <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card">
                <h3 className="text-base font-extrabold text-slate-900 mb-1">
                  Select Tanks for Billing
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Select one or more saved tanks to combine into a single billing process.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {savedTanks.map((st) => {
                    const isSelected = selectedBillingTankIds.includes(st.id);
                    return (
                      <div
                        key={st.id}
                        onClick={() => handleToggleBillingTank(st.id)}
                        className={`rounded-2xl p-4 border-2 cursor-pointer transition ${
                          isSelected
                            ? 'bg-blue-50 border-blue-600 shadow-md'
                            : 'bg-slate-50 border-slate-200 hover:border-blue-400'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-lg font-black text-slate-900">Tank {st.tank_name}</span>
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                            isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-400'
                          }`}>
                            {isSelected && <span className="text-white text-[10px] font-black">✓</span>}
                          </div>
                        </div>
                        <div className="text-xs text-slate-600 space-y-1">
                          <p>Weight: <span className="font-bold text-slate-900">{st.grandTotalKgs.toFixed(2)} KG</span></p>
                          <p>Count: <span className="font-bold text-slate-900">{st.finalCount} / KG</span></p>
                          <p>Rate: <span className="font-bold text-emerald-700">₹{st.pricePerKg}/KG</span></p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {selectedBillingTankIds.length > 0 && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setBillingTab('billing-page')}
                    className="btn btn-primary"
                  >
                    Proceed to Billing Page → ({selectedBillingTankIds.length} tank{selectedBillingTankIds.length > 1 ? 's' : ''})
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Billing Tab: Billing Page */}
          {billingTab === 'billing-page' && (
            <BillingPage
              billingData={billingData}
              setBillingData={setBillingData}
              onProceed={() => setBillingTab('grader')}
              onBack={() => setBillingTab('tank-select')}
            />
          )}

          {/* Billing Tab: Grader & Buyer */}
          {billingTab === 'grader' && (
            <GraderDetailsForm
              graderData={graderData}
              setGraderData={setGraderData}
              billingData={billingData}
              siteId={siteId}
              onProceed={() => setBillingTab('labour')}
              onBack={() => setBillingTab('billing-page')}
            />
          )}

          {/* Billing Tab: Labour Details */}
          {billingTab === 'labour' && (
            <LabourDetailsForm
              labourData={labourData}
              setLabourData={setLabourData}
              siteId={siteId}
              savedTanks={savedTanks}
              tanks={tanks}
              onProceed={() => setBillingTab('review')}
              onBack={() => setBillingTab('grader')}
            />
          )}

          {/* Billing Tab: Reviews & Payments */}
          {billingTab === 'review' && (
            <MiddleReviewAndPayment
              siteId={siteId}
              savedTanks={selectedBillingTanks}
              tanks={tanks}
              billingData={billingData}
              graderData={graderData}
              labourData={labourData}
              generatedBill={generatedBill}
              onGenerateBill={async () => {
                // Basic bill generation
                setIsSubmitting(true);
                try {
                  const billNum = `MHV${new Date().toISOString().slice(0,10).replace(/-/g,'')}${Math.floor(1000+Math.random()*9000)}`;
                  const totalAmt = selectedBillingTanks.reduce((sum, t) => sum + t.grandTotalKgs * Number(t.pricePerKg), 0);
                  const totalKgs = selectedBillingTanks.reduce((sum, t) => sum + t.grandTotalKgs, 0);
                  const tankNames = selectedBillingTanks.map((t) => `Tank ${t.tank_name}`).join(', ');
                  const todayDate = new Date().toISOString().slice(0, 10);
                  const { data: billRows, error: billErr } = await supabase
                    .from(TABLES.bills)
                    .insert({
                      site_id: siteId,
                      bill_number: billNum,
                      type: 'harvest',
                      harvest_type: 'middle',
                      date: todayDate,
                      tank_name: tankNames,
                      kgs: parseFloat(totalKgs.toFixed(3)),
                      total_amount: Math.round(totalAmt),
                      paid_amount: 0,
                      balance_amount: Math.round(totalAmt),
                      status: 'pending',
                      buyer_name: graderData.buyer_name || billingData.buying_company,
                      created_by: user?.id,
                    })
                    .select();
                  if (billErr) throw billErr;
                  setGeneratedBill(Array.isArray(billRows) ? billRows[0] : billRows);
                  toast.success(`Middle Harvest Bill #${billNum} generated & saved to Reports!`);
                } catch (err) {
                  toast.error(err.message || 'Failed to generate bill');
                } finally {
                  setIsSubmitting(false);
                }
              }}
              isSubmitting={isSubmitting}
              onFinished={onFinished}
              onBack={() => setBillingTab('labour')}
            />
          )}
        </div>
      )}
    </div>
  );
}