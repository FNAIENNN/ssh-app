import { useState, useRef, useEffect } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { useAuth } from '../../../../hooks/useAuth';
import { useToast } from '../../../../hooks/useToast';
import HarvestChecklist from '../HarvestChecklist';
import BillingPage from '../BillingPage';
import WeightEntryTable from '../WeightEntryTable';
import CountEntryTable from '../CountEntryTable';
import GraderDetailsForm from '../GraderDetailsForm';
import LabourDetailsForm from '../LabourDetailsForm';
import ReviewAndPayment from '../ReviewAndPayment';

/**
 * FullHarvestModule — Two-section layout for Full Harvest.
 * Mirrors MiddleHarvestModule structure but uses original ReviewAndPayment
 * (Harvest Bill, Tank FCR, UASF Rates unchanged).
 * On full harvest completion, tank is set to empty.
 */
export default function FullHarvestModule({ siteId, onFinished }) {
  const { user } = useAuth();
  const toast = useToast();

  const [mainSection, setMainSection] = useState('data-entry');

  // Data Entry State
  const [dataEntryTab, setDataEntryTab] = useState('tank-select');
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
  const [savedTanks, setSavedTanks] = useState([]);

  const sessionIdRef = useRef(null);
  if (!sessionIdRef.current) sessionIdRef.current = crypto.randomUUID();
  const sessionId = sessionIdRef.current;

  // Billing Details State
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
      const { data } = await supabase.from(TABLES.tanks).select('*').eq('site_id', siteId).order('name');
      setTanks(data || []);
    })();
  }, [siteId]);

  const selectedTank = tanks.find((t) => t.id === selectedTankId);

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
      const exists = prev.findIndex((s) => s.tank_id === selectedTankId);
      if (exists >= 0) { const copy = [...prev]; copy[exists] = tankEntry; return copy; }
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

  // For ReviewAndPayment: derive values from first selected billing tank
  const primaryTank = selectedBillingTanks[0];
  const reviewGrandTotalKgs = selectedBillingTanks.reduce((sum, t) => sum + t.grandTotalKgs, 0);
  const reviewFinalCount = primaryTank?.finalCount || 0;
  const reviewPricePerKg = primaryTank?.pricePerKg || '';
  const reviewWeightRows = primaryTank?.weightRows || [];

  const handleGenerateBill = async () => {
    if (!primaryTank) return;
    setIsSubmitting(true);
    try {
      const billNum = `FHV${new Date().toISOString().slice(0,10).replace(/-/g,'')}${Math.floor(1000+Math.random()*9000)}`;
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
          harvest_type: 'full',
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
      const createdBill = Array.isArray(billRows) ? billRows[0] : billRows;
      // Mark all tanks as empty for full harvest
      for (const st of selectedBillingTanks) {
        await supabase.from(TABLES.tanks).update({ quantity: 0, ready_harvest: false, seed_type: null, hatchery: null, start_date: null }).eq('id', st.tank_id);
        toast.success(`Tank ${st.tank_name} set to Empty`);
      }
      setGeneratedBill(createdBill);
      toast.success(`Full Harvest Bill #${billNum} generated & saved to Reports!`);
    } catch (err) {
      toast.error(err.message || 'Failed to generate bill');
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const DATA_ENTRY_TABS = [
    { id: 'tank-select', label: 'Tank Selection', icon: '🗳️' },
    { id: 'checklist', label: 'Pre-Harvest Checklist', icon: '✅' },
    { id: 'weight', label: 'Weight Entry (ESP32)', icon: '⚖️' },
    { id: 'count-price', label: 'Count & Price', icon: '💰' },
  ];

  const BILLING_TABS = [
    { id: 'tank-select', label: 'Tank Selection', icon: '🗄️' },
    { id: 'billing-page', label: 'Billing Page', icon: '📝' },
    { id: 'grader', label: 'Grader & Buyer', icon: '🚚' },
    { id: 'labour', label: 'Labour Details', icon: '👷' },
    { id: 'review', label: 'Reviews & Payments', icon: '💳' },
  ];

  return (
    <div className="space-y-6">
      {/* Main Section Switcher */}
      <div className="flex items-center gap-3 bg-white rounded-2xl p-3 border border-slate-200 shadow-card">
        <button
          type="button"
          onClick={() => setMainSection('data-entry')}
          className={`flex-1 py-3 rounded-xl text-sm font-extrabold transition flex items-center justify-center gap-2 ${
            mainSection === 'data-entry' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📊</span><span>Data Entry</span>
          {savedTanks.length > 0 && <span className="ml-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black">{savedTanks.length}</span>}
        </button>
        <button
          type="button"
          onClick={() => setMainSection('billing')}
          className={`flex-1 py-3 rounded-xl text-sm font-extrabold transition flex items-center justify-center gap-2 ${
            mainSection === 'billing' ? 'bg-red-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🏁</span><span>Billing Details</span>
        </button>
      </div>

      {/* DATA ENTRY SECTION */}
      {mainSection === 'data-entry' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-card overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max">
              {DATA_ENTRY_TABS.map((tab, idx) => {
                const isActive = dataEntryTab === tab.id;
                const accessible = canGoToDataEntryTab(tab.id);
                return (
                  <button key={tab.id} type="button" disabled={!accessible} onClick={() => accessible && setDataEntryTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                      isActive ? 'bg-slate-900 text-white shadow-sm' : accessible ? 'text-slate-600 hover:bg-slate-100 cursor-pointer' : 'text-slate-400 opacity-50 cursor-not-allowed'
                    }`}>
                    <span>{tab.icon}</span><span>{idx + 1}. {tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {savedTanks.length > 0 && (
            <div className="rounded-2xl p-4 bg-emerald-50 border border-emerald-200">
              <h4 className="text-xs font-extrabold text-emerald-900 mb-2">✅ Saved Tanks ({savedTanks.length})</h4>
              <div className="flex flex-wrap gap-2">
                {savedTanks.map((st) => (
                  <span key={st.id} className="px-3 py-1.5 rounded-xl bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5">
                    <span>Tank {st.tank_name}</span><span className="text-emerald-300">{st.grandTotalKgs.toFixed(1)} KG</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {dataEntryTab === 'tank-select' && (
            <div className="space-y-4">
              <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card">
                <h3 className="text-base font-extrabold text-slate-900 mb-1">Select Tank for Full Harvest</h3>
                <p className="text-xs text-slate-500 mb-4">Tank will be emptied after full harvest bill is generated.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {tanks.map((tk) => {
                    const isSelected = tk.id === selectedTankId;
                    const alreadySaved = savedTanks.some((s) => s.tank_id === tk.id);
                    const doc = tk.start_date ? Math.max(1, Math.floor((Date.now() - new Date(tk.start_date).getTime()) / 86400000)) : '—';
                    const isRunning = Number(tk.quantity) > 0 || tk.seed_type;
                    return (
                      <div key={tk.id} onClick={() => setSelectedTankId(tk.id)}
                        className={`rounded-2xl p-4 border-2 transition cursor-pointer ${
                          isSelected ? 'bg-red-50/70 border-red-600 shadow-md' : alreadySaved ? 'bg-emerald-50/50 border-emerald-400' : 'bg-slate-50/50 border-slate-200 hover:border-slate-300'
                        }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-lg font-black text-slate-900">Tank {tk.name}</span>
                          <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase ${
                            isRunning ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-200 text-slate-600'
                          }`}>{isRunning ? 'Running' : 'Empty'}</span>
                        </div>
                        <div className="space-y-1 text-xs text-slate-600">
                          <p>Tank No: <span className="font-bold text-slate-900">{tk.tank_no || tk.name || tk.id}</span></p>
                          <p>DOC: <span className="font-bold text-slate-900">{doc} days</span></p>
                          <p>Seed: <span className="font-bold text-slate-900">{tk.quantity?.toLocaleString('en-IN') || '0'} PL</span></p>
                          <p>Tank Feed: <span className="font-bold text-slate-900">{tk.feed || tk.tank_feed || tk.total_feed || '0'} kg</span></p>
                          <p>latest count: <span className="font-bold text-slate-900">{tk.latest_count || tk.count || 'N/A'}</span></p>
                        </div>
                        <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-red-700">
                          <span>{isSelected ? '✓ Selected' : 'Select Tank'}</span><span>→</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end">
                <button type="button" disabled={!selectedTankId} onClick={() => setDataEntryTab('checklist')}
                  className={`btn ${selectedTankId ? 'btn-primary' : 'opacity-50 cursor-not-allowed'}`}>
                  Proceed to Safety Checklist →
                </button>
              </div>
            </div>
          )}

          {dataEntryTab === 'checklist' && (
            <HarvestChecklist checklist={checklist} setChecklist={setChecklist} siteId={siteId}
              onProceed={() => setDataEntryTab('weight')} onBack={() => setDataEntryTab('tank-select')} />
          )}

          {dataEntryTab === 'weight' && (
            <WeightEntryTable weightRows={weightRows} setWeightRows={setWeightRows} siteId={siteId}
              tankId={selectedTankId} sessionId={sessionId} netWeightPerNet={netWeightPerNet}
              onNetWeightChange={setNetWeightPerNet}
              harvestType="full"
              supervisorSignature={billingData.supervisor_signature}
              onSupervisorSignatureChange={(sig) =>
                setBillingData((prev) => ({ ...prev, supervisor_signature: sig }))
              }
              onProceed={() => setDataEntryTab('count-price')} onBack={() => setDataEntryTab('checklist')} />
          )}

          {dataEntryTab === 'count-price' && (
            <div className="space-y-4">
              <CountEntryTable countRows={countRows} setCountRows={setCountRows}
                selectedCountIdx={selectedCountIdx} setSelectedCountIdx={setSelectedCountIdx}
                pricePerKg={pricePerKg} setPricePerKg={setPricePerKg}
                totalHarvestKgs={grandTotalKgs}
                onProceed={handleSaveTank} onBack={() => setDataEntryTab('weight')} />
              <div className="flex items-center justify-end pt-2">
                <div className="flex gap-3">
                  <button type="button" onClick={handleSaveTank} disabled={!pricePerKg || grandTotalKgs <= 0}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold transition disabled:opacity-50 disabled:cursor-not-allowed">
                    💾 Save Tank & Add Another
                  </button>
                  <button type="button" onClick={() => { handleSaveTank(); setMainSection('billing'); }}
                    disabled={!pricePerKg || grandTotalKgs <= 0}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold transition disabled:opacity-50 disabled:cursor-not-allowed">
                    🏁 Save & Go to Billing →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* BILLING DETAILS SECTION */}
      {mainSection === 'billing' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-card overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max">
              {BILLING_TABS.map((tab, idx) => {
                const isActive = billingTab === tab.id;
                const accessible = canGoToBillingTab(tab.id);
                return (
                  <button key={tab.id} type="button" disabled={!accessible} onClick={() => accessible && setBillingTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                      isActive ? 'bg-red-600 text-white shadow-sm' : accessible ? 'text-slate-600 hover:bg-slate-100 cursor-pointer' : 'text-slate-400 opacity-50 cursor-not-allowed'
                    }`}>
                    <span>{tab.icon}</span><span>{idx + 1}. {tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {savedTanks.length === 0 && (
            <div className="rounded-2xl p-6 bg-amber-50 border border-amber-200 text-center">
              <p className="text-amber-800 font-extrabold text-sm">⚠️ No tanks saved yet</p>
              <button type="button" onClick={() => setMainSection('data-entry')} className="mt-3 btn btn-primary text-xs">← Go to Data Entry</button>
            </div>
          )}

          {billingTab === 'tank-select' && savedTanks.length > 0 && (
            <div className="space-y-4">
              <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card">
                <h3 className="text-base font-extrabold text-slate-900 mb-1">Select Tanks for Full Harvest Billing</h3>
                <p className="text-xs text-slate-500 mb-4">Selected tanks will all be set to EMPTY after billing.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {savedTanks.map((st) => {
                    const isSelected = selectedBillingTankIds.includes(st.id);
                    return (
                      <div key={st.id} onClick={() => handleToggleBillingTank(st.id)}
                        className={`rounded-2xl p-4 border-2 cursor-pointer transition ${
                          isSelected ? 'bg-red-50 border-red-600 shadow-md' : 'bg-slate-50 border-slate-200 hover:border-red-400'
                        }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-lg font-black text-slate-900">Tank {st.tank_name}</span>
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                            isSelected ? 'bg-red-600 border-red-600' : 'border-slate-400'
                          }`}>{isSelected && <span className="text-white text-[10px] font-black">✓</span>}</div>
                        </div>
                        <div className="text-xs text-slate-600 space-y-1">
                          <p>Weight: <span className="font-bold text-slate-900">{st.grandTotalKgs.toFixed(2)} KG</span></p>
                          <p>Count: <span className="font-bold text-slate-900">{st.finalCount} / KG</span></p>
                          <p>Rate: <span className="font-bold text-red-700">₹{st.pricePerKg}/KG</span></p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {selectedBillingTankIds.length > 0 && (
                <div className="flex justify-end">
                  <button type="button" onClick={() => setBillingTab('billing-page')} className="btn btn-primary">
                    Proceed to Billing Page → ({selectedBillingTankIds.length} tank{selectedBillingTankIds.length > 1 ? 's' : ''})
                  </button>
                </div>
              )}
            </div>
          )}

          {billingTab === 'billing-page' && (
            <BillingPage billingData={billingData} setBillingData={setBillingData}
              onProceed={() => setBillingTab('grader')} onBack={() => setBillingTab('tank-select')} />
          )}

          {billingTab === 'grader' && (
            <GraderDetailsForm graderData={graderData} setGraderData={setGraderData}
              billingData={billingData} siteId={siteId}
              onProceed={() => setBillingTab('labour')} onBack={() => setBillingTab('billing-page')} />
          )}

          {billingTab === 'labour' && (
            <LabourDetailsForm labourData={labourData} setLabourData={setLabourData}
              siteId={siteId} onProceed={() => setBillingTab('review')} onBack={() => setBillingTab('grader')} />
          )}

          {billingTab === 'review' && (
            <ReviewAndPayment
              siteId={siteId}
              harvestType="full"
              selectedTank={primaryTank?.tank}
              tanks={tanks}
              billingData={billingData}
              weightRows={reviewWeightRows}
              grandTotalKgs={reviewGrandTotalKgs}
              countRows={primaryTank?.countRows || []}
              selectedCountIdx={primaryTank?.selectedCountIdx || 0}
              finalCount={reviewFinalCount}
              pricePerKg={reviewPricePerKg}
              graderData={graderData}
              labourData={labourData}
              sessionId={primaryTank?.sessionId || ''}
              generatedBill={generatedBill}
              onGenerateBill={handleGenerateBill}
              onFinished={onFinished}
              onBack={() => setBillingTab('labour')}
            />
          )}
        </div>
      )}
    </div>
  );
}
