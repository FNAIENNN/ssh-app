import { useState, useEffect } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../hooks/useToast';
import HarvestChecklist from './HarvestChecklist';
import WeightEntryTable from './WeightEntryTable';
import CountEntryTable from './CountEntryTable';
import GraderDetailsForm from './GraderDetailsForm';
import LabourDetailsForm from './LabourDetailsForm';
import RequestPayment from '../../../components/payments/RequestPayment';
import HarvestBillModal from './HarvestBillModal';

/**
 * HarvestWizard — Full 7-step wizard for Middle Harvest and Full Harvest.
 * Integrates:
 *   - Tank selection with DOC
 *   - 9-step Pre-harvest checklist
 *   - ESP32 Auto Weighing Machine integration
 *   - Count calculation & pricing
 *   - Grader & Labour details
 *   - Unified payment method using RequestPayment component & bill generation
 */
export default function HarvestWizard({ siteId, harvestType = 'middle', onFinished }) {
  const { user } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(1); // 1 to 7

  // Data state
  const [tanks, setTanks] = useState([]);
  const [selectedTankId, setSelectedTankId] = useState('');

  // Step 2: Checklist
  const [checklist, setChecklist] = useState({
    permission: false,
    waterLevel: false,
    harvestNet: false,
    iceReady: false,
    vehicleReady: false,
    packingReady: false,
    labourReady: false,
    countSample: false,
    supervisorApproval: false,
  });

  // Step 3: Weights
  const [weightRows, setWeightRows] = useState([
    { id: 1, kgs: '', loose: '0' },
    { id: 2, kgs: '', loose: '0' },
    { id: 3, kgs: '', loose: '0' },
  ]);

  // Step 4: Counts & Price
  const [countRows, setCountRows] = useState([
    { id: 1, kgs: '1.0', pieces: '60' },
    { id: 2, kgs: '1.0', pieces: '58' },
  ]);
  const [selectedCountIdx, setSelectedCountIdx] = useState(0);
  const [pricePerKg, setPricePerKg] = useState('');

  // Step 5: Grader & Destination
  const [graderData, setGraderData] = useState({
    grader_id: '',
    name: '',
    phone: '',
    vehicle_no: '',
    upi_id: '',
    bank_account: '',
    driver_bata: 500,
    packing_bata: 1200,
    extra_payment: 0,
    buyer_name: '',
    factory_name: '',
  });

  // Step 6: Labour
  const [labourData, setLabourData] = useState({
    labour_supplier_id: '',
    supplier_name: '',
    phone: '',
    main_workers: 10,
    main_rate: 600,
    guntu_workers: 4,
    guntu_rate: 700,
    chethi_workers: 2,
    chethi_rate: 500,
  });

  // Step 7: Generated Bill & Modal state
  const [generatedBill, setGeneratedBill] = useState(null);
  const [savedHarvestEntry, setSavedHarvestEntry] = useState(null);
  const [showBillModal, setShowBillModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load tanks for this site
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

  // Weight totals
  const totalKgs = weightRows.reduce((sum, r) => sum + (Number(r.kgs) || 0), 0);
  const totalLoose = weightRows.reduce((sum, r) => sum + (Number(r.loose) || 0), 0);
  const totalSaveKgs = Math.max(0, totalKgs - totalLoose);

  // Count selection
  const selectedCountRow = countRows[selectedCountIdx] || countRows[0];
  const sKg = Number(selectedCountRow?.kgs) || 1;
  const sPcs = Number(selectedCountRow?.pieces) || 0;
  const finalCount = sKg > 0 ? Math.round(sPcs / sKg) : 0;

  const totalHarvestAmount = Math.round(totalSaveKgs * (Number(pricePerKg) || 0));

  // Grader & Labour Expenses
  const graderExpense =
    (Number(graderData.driver_bata) || 0) +
    (Number(graderData.packing_bata) || 0) +
    (Number(graderData.extra_payment) || 0);

  const labourExpense =
    (Number(labourData.main_workers) || 0) * (Number(labourData.main_rate) || 0) +
    (Number(labourData.guntu_workers) || 0) * (Number(labourData.guntu_rate) || 0) +
    (Number(labourData.chethi_workers) || 0) * (Number(labourData.chethi_rate) || 0);

  const estimatedProfit = totalHarvestAmount - (graderExpense + labourExpense);

  // Generate unique bill number: HRV + YYYYMMDD + 4 digits
  const generateBillNumber = () => {
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `HRV${todayStr}${rand}`;
  };

  // Submit Harvest & Generate Bill
  const handleGenerateBill = async () => {
    if (!selectedTankId || totalSaveKgs <= 0 || !pricePerKg) {
      toast.error('Complete all required steps before generating bill');
      return;
    }

    setIsSubmitting(true);
    const billNum = generateBillNumber();

    try {
      // 1. Insert Bill row into `bills` table
      const billPayload = {
        site_id: siteId,
        bill_number: billNum,
        type: 'harvest',
        harvest_type: harvestType,
        tank_id: selectedTankId,
        total_amount: totalHarvestAmount,
        paid_amount: 0,
        balance_amount: totalHarvestAmount,
        status: 'pending',
        buyer_name: graderData.buyer_name,
        factory_name: graderData.factory_name,
        created_by: user?.id,
      };

      const { data: billRows, error: billErr } = await supabase
        .from(TABLES.bills)
        .insert(billPayload)
        .select();

      if (billErr) throw billErr;
      const createdBill = (Array.isArray(billRows) ? billRows[0] : billRows) || {
        id: `bill-${Date.now()}`,
        ...billPayload,
      };

      // 2. Insert Harvest Entry row
      const harvestPayload = {
        site_id: siteId,
        tank_id: selectedTankId,
        harvest_type: harvestType,
        date: new Date().toISOString().slice(0, 10),
        doc: selectedTank?.start_date
          ? Math.max(1, Math.floor((Date.now() - new Date(selectedTank.start_date).getTime()) / 86400000))
          : 50,
        total_kgs: totalKgs,
        total_loose: totalLoose,
        total_save: totalSaveKgs,
        final_count: finalCount,
        price_per_kg: Number(pricePerKg),
        total_amount: totalHarvestAmount,
        buyer_name: graderData.buyer_name,
        factory_name: graderData.factory_name,
        grader_id: graderData.grader_id || null,
        grader_details: { ...graderData, total_expense: graderExpense },
        labour_supplier_id: labourData.labour_supplier_id || null,
        labour_details: { ...labourData, grand_total: labourExpense },
        bill_id: createdBill.id,
        bill_number: billNum,
        checklist,
        created_by: user?.id,
      };

      const { data: entryRows, error: entryErr } = await supabase
        .from(TABLES.harvestEntries)
        .insert(harvestPayload)
        .select();

      if (entryErr) throw entryErr;
      const createdEntry = (Array.isArray(entryRows) ? entryRows[0] : entryRows) || harvestPayload;

      // 3. If Full Harvest -> Auto update tank status to "ready_harvest = false" or quantity = 0 / empty
      if (harvestType === 'full') {
        await supabase
          .from(TABLES.tanks)
          .update({
            quantity: 0,
            ready_harvest: false,
            seed_type: null,
            hatchery: null,
            start_date: null,
          })
          .eq('id', selectedTankId);
        toast.success(`Tank ${selectedTank?.name} status updated to Empty`);
      }

      setGeneratedBill(createdBill);
      setSavedHarvestEntry(createdEntry);
      setShowBillModal(true);
      toast.success(`Harvest Bill #${billNum} generated successfully!`);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to save harvest entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepsList = [
    '1. Tank Selection',
    '2. Pre-Harvest Checklist',
    '3. Weight Entry (ESP32)',
    '4. Count & Price',
    '5. Grader & Buyer',
    '6. Labour Details',
    '7. Review & Payment',
  ];

  return (
    <div className="space-y-6">
      {/* Wizard Step Stepper Navigation Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card overflow-x-auto">
        <div className="flex items-center justify-between min-w-[700px]">
          {stepsList.map((stLabel, idx) => {
            const stNum = idx + 1;
            const active = step === stNum;
            const completed = step > stNum;

            return (
              <button
                key={stNum}
                type="button"
                onClick={() => completed && setStep(stNum)}
                disabled={!completed && !active}
                className={`flex items-center gap-2 text-xs font-bold transition px-3 py-1.5 rounded-xl ${
                  active
                    ? 'bg-slate-900 text-white shadow-md'
                    : completed
                    ? 'text-emerald-700 hover:bg-emerald-50 cursor-pointer'
                    : 'text-slate-400 opacity-60 cursor-not-allowed'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-mono ${
                    active
                      ? 'bg-blue-500 text-white'
                      : completed
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {completed ? '✓' : stNum}
                </span>
                <span className="whitespace-nowrap">{stLabel.split('. ')[1]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 1: Tank Selection */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-card">
            <h3 className="text-base font-extrabold text-slate-900 mb-1">
              Select Tank for {harvestType === 'middle' ? 'Middle (Partial) Harvest' : 'Full (Final) Harvest'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Select an active running tank to initiate the harvest workflow.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {tanks.map((tk) => {
                const isSelected = tk.id === selectedTankId;
                const doc = tk.start_date
                  ? Math.max(1, Math.floor((Date.now() - new Date(tk.start_date).getTime()) / 86400000))
                  : '—';
                const isRunning = Number(tk.quantity) > 0 || tk.seed_type;

                return (
                  <div
                    key={tk.id}
                    onClick={() => setSelectedTankId(tk.id)}
                    className={`rounded-2xl p-4 border-2 transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-600 shadow-md'
                        : 'bg-slate-50/50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-black text-slate-900">Tank {tk.name}</span>
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase ${
                          isRunning
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isRunning ? 'Running' : 'Empty'}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-slate-600">
                      <p>
                        DOC:{' '}
                        <span className="font-bold text-slate-900">{doc} days</span>
                      </p>
                      <p>
                        Seed Stocked:{' '}
                        <span className="font-bold text-slate-900">
                          {tk.quantity ? tk.quantity.toLocaleString('en-IN') : '0'} PL
                        </span>
                      </p>
                      <p>Hatchery: {tk.hatchery || 'N/A'}</p>
                      <p>Area: {tk.area_acres} Acres</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-blue-700">
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
              onClick={() => setStep(2)}
              className={`btn ${selectedTankId ? 'btn-primary' : 'opacity-50 cursor-not-allowed'}`}
            >
              Proceed to Safety Checklist →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Harvest Checklist */}
      {step === 2 && (
        <HarvestChecklist
          checklist={checklist}
          setChecklist={setChecklist}
          onProceed={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}

      {/* STEP 3: Weight Entry with ESP32 Scale */}
      {step === 3 && (
        <WeightEntryTable
          weightRows={weightRows}
          setWeightRows={setWeightRows}
          onProceed={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      )}

      {/* STEP 4: Count & Price Entry */}
      {step === 4 && (
        <CountEntryTable
          countRows={countRows}
          setCountRows={setCountRows}
          selectedCountIdx={selectedCountIdx}
          setSelectedCountIdx={setSelectedCountIdx}
          pricePerKg={pricePerKg}
          setPricePerKg={setPricePerKg}
          totalHarvestKgs={totalSaveKgs}
          onProceed={() => setStep(5)}
          onBack={() => setStep(3)}
        />
      )}

      {/* STEP 5: Grader & Destination */}
      {step === 5 && (
        <GraderDetailsForm
          graderData={graderData}
          setGraderData={setGraderData}
          siteId={siteId}
          onProceed={() => setStep(6)}
          onBack={() => setStep(4)}
        />
      )}

      {/* STEP 6: Labour Details */}
      {step === 6 && (
        <LabourDetailsForm
          labourData={labourData}
          setLabourData={setLabourData}
          siteId={siteId}
          onProceed={() => setStep(7)}
          onBack={() => setStep(5)}
        />
      )}

      {/* STEP 7: Review & Generate Bill + RequestPayment integration */}
      {step === 7 && (
        <div className="space-y-6">
          {/* Executive Summary Card */}
          <div className="rounded-2xl p-6 bg-slate-900 text-white shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-extrabold tracking-wider text-blue-400 uppercase block">
                  HARVEST REVIEW SUMMARY ({harvestType.toUpperCase()})
                </span>
                <h3 className="text-xl font-black text-white">Tank {selectedTank?.name || 'A1'}</h3>
              </div>
              <span className="text-xs px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full font-bold">
                Ready to Bill
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Net KGs Harvested</span>
                <span className="text-xl font-black font-mono text-blue-300">
                  {totalSaveKgs.toFixed(1)} KG
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Final Count</span>
                <span className="text-xl font-black font-mono text-amber-300">
                  {finalCount} count
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Price per KG</span>
                <span className="text-xl font-black font-mono text-emerald-300">
                  ₹{Number(pricePerKg).toLocaleString('en-IN')}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Total Revenue</span>
                <span className="text-xl font-black font-mono text-emerald-400">
                  ₹{totalHarvestAmount.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs">
              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                <span className="text-[10px] text-slate-400 block">Grader & Transport:</span>
                <span className="font-bold font-mono text-white">₹{graderExpense.toLocaleString('en-IN')}</span>
              </div>

              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                <span className="text-[10px] text-slate-400 block">Labour Wages:</span>
                <span className="font-bold font-mono text-white">₹{labourExpense.toLocaleString('en-IN')}</span>
              </div>

              <div className="bg-emerald-950/80 p-3 rounded-xl border border-emerald-700/60">
                <span className="text-[10px] text-emerald-300 block">Est. Net Profit:</span>
                <span className="font-black font-mono text-emerald-400">
                  ₹{estimatedProfit.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleGenerateBill}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 rounded-xl text-white font-extrabold text-sm shadow-lg transition"
            >
              {isSubmitting ? 'Generating Bill...' : '🧾 Generate Printable Harvest Bill'}
            </button>
          </div>

          {/* Established Payment Method Integration (RequestPayment) */}
          {generatedBill && (
            <div className="rounded-2xl p-6 bg-white border border-slate-200 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    💳 Record Harvest Payment — Bill #{generatedBill.bill_number}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Use our established payment method (Cash / Advance Request) to record payments for this bill.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBillModal(true)}
                  className="btn-secondary text-xs font-bold"
                >
                  👁️ View Bill Invoice
                </button>
              </div>

              <RequestPayment
                type="vehicle"
                siteId={siteId}
                relatedTankId={selectedTankId}
                billId={generatedBill.id}
                prefillAmount={generatedBill.total_amount}
                onPaid={(payTxn) => {
                  toast.success(`Payment of ₹${payTxn.amount} recorded for Bill #${generatedBill.bill_number}`);
                  onFinished?.();
                }}
              />
            </div>
          )}

          {/* Footer Back Button */}
          <div className="flex justify-start">
            <button type="button" onClick={() => setStep(6)} className="btn-secondary">
              ← Back to Labour Details
            </button>
          </div>
        </div>
      )}

      {/* Printable Bill Modal */}
      {showBillModal && (
        <HarvestBillModal
          bill={generatedBill}
          harvestEntry={savedHarvestEntry}
          tank={selectedTank}
          onClose={() => setShowBillModal(false)}
        />
      )}
    </div>
  );
}
