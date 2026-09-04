import { useState, useEffect, useRef } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../hooks/useToast';
import HarvestChecklist from './HarvestChecklist';
import BillingPage from './BillingPage';
import WeightEntryTable from './WeightEntryTable';
import CountEntryTable from './CountEntryTable';
import GraderDetailsForm from './GraderDetailsForm';
import LabourDetailsForm from './LabourDetailsForm';
import RequestPayment from '../../../components/payments/RequestPayment';
import HarvestBillModal from './HarvestBillModal';
import ReviewAndPayment from './ReviewAndPayment';


/**
 * HarvestWizard — Full 8-step wizard for Middle Harvest and Full Harvest.
 * Steps:
 *   1. Tank Selection
 *   2. Pre-Harvest Checklist
 *   3. Billing Page (NEW)
 *   4. Weight Entry (ESP32)
 *   5. Count & Price
 *   6. Grader & Buyer
 *   7. Labour Details
 *   8. Review & Payments
 */
export default function HarvestWizard({ siteId, harvestType = 'middle', onFinished }) {
  const { user } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(1); // 1 to 8

  // Generate a stable session ID for this harvest session (used to group weighments)
  const sessionIdRef = useRef(null);
  if (!sessionIdRef.current) {
    sessionIdRef.current = crypto.randomUUID();
  }
  const sessionId = sessionIdRef.current;

  // Data state
  const [tanks, setTanks] = useState([]);
  const [selectedTankId, setSelectedTankId] = useState('');

  // Step 2: Checklist
  const [checklist, setChecklist] = useState({});

  // Step 3: Billing Page
  const [billingData, setBillingData] = useState({
    harvest_supervisor: '',
    supervisor_phone: '',
    farmer_name: '',
    farm_name: '',
    farmer_phone: '',
    buying_company: '',
    grader_name: '',
    grader_phone: '',
    net_weight: '', // kg per net — used in WeightEntryTable
  });

  // Step 4: Weights — updated structure: { id, kgs, nets }
  const [weightRows, setWeightRows] = useState([
    { id: 1, kgs: '', nets: 2 },
    { id: 2, kgs: '', nets: 2 },
    { id: 3, kgs: '', nets: 2 },
  ]);

  // Step 5: Counts & Price
  const [countRows, setCountRows] = useState([
    { id: 1, kgs: '1.0', pieces: '60' },
    { id: 2, kgs: '1.0', pieces: '58' },
  ]);
  const [selectedCountIdx, setSelectedCountIdx] = useState(0);
  const [pricePerKg, setPricePerKg] = useState('');

  // Step 6: Grader & Destination
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

  // Step 7: Labour
  const [labourData, setLabourData] = useState({
    labour_supplier_id: '',
    supplier_name: '',
    phone: '',
    village: '',
    phonepe: '',
    bank_account: '',
    bank_holder: '',
    worker_rows: null, // set by LabourDetailsForm
    remarks: '',
    mestri_signature: '',
  });

  // Step 8: Generated Bill & Modal state
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

  // Weight totals — grand total after net deductions
  const totalWeight = weightRows.reduce((sum, r) => sum + (Number(r.kgs) || 0), 0);
  const totalNets = weightRows.reduce((sum, r) => sum + (Number(r.nets) || 0), 0);
  const netWtPerNet = Number(billingData.net_weight) || 0;
  const totalNetWeight = totalNets * netWtPerNet;
  const grandTotalKgs = Math.max(0, totalWeight - totalNetWeight);

  // Count selection — decimal
  const selectedCountRow = countRows[selectedCountIdx] || countRows[0];
  const sKg = Number(selectedCountRow?.kgs) || 1;
  const sPcs = Number(selectedCountRow?.pieces) || 0;
  const finalCount = sKg > 0 ? parseFloat((sPcs / sKg).toFixed(2)) : 0;

  const totalHarvestAmount = Math.round(grandTotalKgs * (Number(pricePerKg) || 0));

  // Grader & Labour Expenses
  const graderRows = graderData.grader_rows || {};
  const graderExpense =
    Object.values(graderRows).reduce(
      (sum, row) => sum + (Number(row.persons) || 0) * (Number(row.amount) || 0),
      0
    ) + (Number(graderData.extra_amount) || 0);

  const workerRows = labourData.worker_rows || [];
  const labourExpense = workerRows.reduce(
    (sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.amount) || 0),
    0
  );

  const estimatedProfit = totalHarvestAmount - (graderExpense + labourExpense);

  // Generate unique bill number: HRV + YYYYMMDD + 4 digits
  const generateBillNumber = () => {
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `HRV${todayStr}${rand}`;
  };

  // Submit Harvest & Generate Bill
  const handleGenerateBill = async () => {
    if (!selectedTankId || grandTotalKgs <= 0 || !pricePerKg) {
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
        total_kgs: totalWeight,
        total_loose: totalNetWeight,
        total_save: grandTotalKgs,
        final_count: finalCount,
        price_per_kg: Number(pricePerKg),
        total_amount: totalHarvestAmount,
        buyer_name: graderData.buyer_name,
        factory_name: graderData.factory_name,
        grader_id: graderData.grader_id || null,
        grader_details: { ...graderData, total_expense: graderExpense },
        labour_supplier_id: labourData.labour_supplier_id || null,
        labour_details: { ...labourData, grand_total: labourExpense },
        billing_info: billingData,
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

      // 2a. Backfill individual weighment logs to link them to this harvest entry
      try {
        await supabase
          .from(TABLES.harvestWeighments)
          .update({ harvest_entry_id: createdEntry.id })
          .eq('session_id', sessionId)
          .is('harvest_entry_id', null);
      } catch (weighErr) {
        console.warn('Failed to backfill weighment logs:', weighErr?.message || weighErr);
      }

      // 3. If Full Harvest -> Auto update tank status to empty
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
    '3. Billing Page',
    '4. Weight Entry (ESP32)',
    '5. Count & Price',
    '6. Grader & Buyer',
    '7. Labour Details',
    '8. Review & Payments',
  ];

  return (
    <div className="space-y-6">
      {/* Wizard Step Stepper Navigation Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card overflow-x-auto">
        <div className="flex items-center justify-between min-w-[900px]">
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
          siteId={siteId}
          onProceed={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}

      {/* STEP 3: Billing Page */}
      {step === 3 && (
        <BillingPage
          billingData={billingData}
          setBillingData={setBillingData}
          onProceed={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      )}

      {/* STEP 4: Weight Entry with ESP32 Scale */}
      {step === 4 && (
        <WeightEntryTable
          weightRows={weightRows}
          setWeightRows={setWeightRows}
          siteId={siteId}
          tankId={selectedTankId}
          sessionId={sessionId}
          netWeightPerNet={billingData.net_weight}
          onProceed={() => setStep(5)}
          onBack={() => setStep(3)}
        />
      )}

      {/* STEP 5: Count & Price Entry */}
      {step === 5 && (
        <CountEntryTable
          countRows={countRows}
          setCountRows={setCountRows}
          selectedCountIdx={selectedCountIdx}
          setSelectedCountIdx={setSelectedCountIdx}
          pricePerKg={pricePerKg}
          setPricePerKg={setPricePerKg}
          totalHarvestKgs={grandTotalKgs}
          onProceed={() => setStep(6)}
          onBack={() => setStep(4)}
        />
      )}

      {/* STEP 6: Grader & Destination */}
      {step === 6 && (
        <GraderDetailsForm
          graderData={graderData}
          setGraderData={setGraderData}
          siteId={siteId}
          onProceed={() => setStep(7)}
          onBack={() => setStep(5)}
        />
      )}

      {/* STEP 7: Labour Details */}
      {step === 7 && (
        <LabourDetailsForm
          labourData={labourData}
          setLabourData={setLabourData}
          siteId={siteId}
          onProceed={() => setStep(8)}
          onBack={() => setStep(6)}
        />
      )}

      {/* STEP 8: Review & Payments with 3 sub-tabs (Harvest Bill, Tank FCR, UASF Rates) */}
      {step === 8 && (
        <ReviewAndPayment
          siteId={siteId}
          harvestType={harvestType}
          selectedTank={selectedTank}
          tanks={tanks}
          billingData={billingData}
          weightRows={weightRows}
          grandTotalKgs={grandTotalKgs}
          countRows={countRows}
          selectedCountIdx={selectedCountIdx}
          finalCount={finalCount}
          pricePerKg={pricePerKg}
          graderData={graderData}
          labourData={labourData}
          sessionId={sessionId}
          generatedBill={generatedBill}
          onGenerateBill={handleGenerateBill}
          onFinished={onFinished}
          onBack={() => setStep(7)}
        />
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