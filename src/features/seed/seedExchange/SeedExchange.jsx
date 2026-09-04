import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { useAuth } from '../../../hooks/useAuth';
import { useSite } from '../../../hooks/useSite';
import { useToast } from '../../../hooks/useToast';
import { Empty } from '../../../components/ui/State';

/**
 * SignaturePad — HTML5 Canvas signature pad for supervisor digital signature.
 */
function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';

    if (value && value.startsWith('data:image')) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = value;
    }
  }, [value]);

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      onChange(canvas.toDataURL());
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  };

  return (
    <div className="space-y-2">
      <div className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-inner relative">
        <canvas
          ref={canvasRef}
          width={350}
          height={120}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-28 cursor-crosshair touch-none"
        />
        <button
          type="button"
          onClick={clearCanvas}
          className="absolute top-2 right-2 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg border border-slate-300 print:hidden"
        >
          Clear Sign
        </button>
      </div>
      <p className="text-[10px] text-slate-400 italic">Draw supervisor digital signature inside box above</p>
    </div>
  );
}

/**
 * SeedExchange — Main component containing 2 Sub-tabs:
 *   1. Seed Exchange (2 Sections: Data Entry [5 steps], Worker Payments [2 steps])
 *   2. Overall Report (Ledger with Search & View/Download PDF modal)
 */
export default function SeedExchange() {
  const { siteId } = useSite();
  const { user } = useAuth();
  const toast = useToast();

  const [tanks, setTanks] = useState([]);
  const [sections, setSections] = useState([]);

  // Sub-tab state: 'exchange' | 'reports'
  const [mainSubTab, setMainSubTab] = useState('exchange');

  // Seed Exchange Mode: 'dataEntry' | 'workerPayments'
  const [exchangeSection, setExchangeSection] = useState('dataEntry');

  // ── Data Entry 4-step stepper: 'tankSelect' | 'checklist' | 'weightEntry' | 'count'
  const [dataEntryStep, setDataEntryStep] = useState('tankSelect');

  // ── Step 1: Tank Selection State ──────────────────────────────────────
  const [exchangeDate, setExchangeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [fromSection, setFromSection] = useState('');
  const [toSection, setToSection] = useState('');
  const [fromTankId, setFromTankId] = useState('');
  const [toTankId, setToTankId] = useState('');
  const [expectedQty, setExpectedQty] = useState('');
  const [remarks, setRemarks] = useState('');

  // ── Step 2: Checklist State ───────────────────────────────────────────
  const [checklistStage, setChecklistStage] = useState('nursery'); // 'nursery' | 'hatchery'
  const [checklistItems, setChecklistItems] = useState([
    { id: 1, stage: 'nursery', text: 'Water Salinity & Temperature match test between tanks', checked: false },
    { id: 2, stage: 'nursery', text: 'Oxygen Saturation level verification (DO > 5.0 ppm)', checked: false },
    { id: 3, stage: 'nursery', text: 'Netting Mesh size suitability check', checked: false },
    { id: 4, stage: 'hatchery', text: 'Water exchange & pH buffering check', checked: false },
    { id: 5, stage: 'hatchery', text: 'Acclimatization stress test completed', checked: false },
    { id: 6, stage: 'hatchery', text: 'Aeration equipment active in receiving tank', checked: false },
  ]);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [editingChecklistId, setEditingChecklistId] = useState(null);
  const [editingChecklistText, setEditingChecklistText] = useState('');

  // ── Step 3: Weight Entry State ────────────────────────────────────────
  const [tareWeightPerNet, setTareWeightPerNet] = useState('0'); // kg per net (default '0')
  const [weighmentRows, setWeighmentRows] = useState([
    { id: 1, grossKg: '3.1', nets: 1 },
    { id: 2, grossKg: '3.2', nets: 1 },
  ]);

  // ── Step 4: Count State ───────────────────────────────────────────────
  const [countRows, setCountRows] = useState([
    { id: 1, sampleKg: '3.0', totalPieces: '100' }, // 100/3 = 33.33 count
    { id: 2, sampleKg: '2.5', totalPieces: '150' }, // 150/2.5 = 60.0 count
  ]);
  const [selectedCountIdx, setSelectedCountIdx] = useState(0);

  // ── Step 5: Overall View State ────────────────────────────────────────
  const [enableWeighmentTableInBill, setEnableWeighmentTableInBill] = useState(true);
  const [enableCountTableInBill, setEnableCountTableInBill] = useState(true);
  const [enableWorkerTableInBill, setEnableWorkerTableInBill] = useState(true);

  const [selectedDocPreference, setSelectedDocPreference] = useState('from'); // 'from' | 'to'
  const [supervisorName, setSupervisorName] = useState('');
  const [supervisorPhone, setSupervisorPhone] = useState('');
  const [supervisorSignature, setSupervisorSignature] = useState('');

  const [generatedBill, setGeneratedBill] = useState(null);

  // ── Worker Payments Section State ─────────────────────────────────────
  // Worker Payments 3 steps: 'tankSelection' | 'workerDetails' | 'overallView'
  const [workerStep, setWorkerStep] = useState('tankSelection');
  const [selectedWorkerBillIds, setSelectedWorkerBillIds] = useState([]);

  // Pending exchange cards submitted from Count step → shown in Worker Payments Tank Selection
  const [pendingExchangeCards, setPendingExchangeCards] = useState([]);
  // Submitted worker payment details saved after Worker Payments submit
  const [submittedWorkerPayment, setSubmittedWorkerPayment] = useState(null);

  // Supplier Details
  const [suppliers, setSuppliers] = useState([
    { id: 'sup1', name: 'Raju Labour Agency', phone: '9848022334', village: 'Akividu', phonepe: '9848022334', bankAcc: '30492810482', bankHolder: 'K. Raju' },
    { id: 'sup2', name: 'Venkateswara Valalu Mestri', phone: '9440182736', village: 'Bhimavaram', phonepe: '9440182736', bankAcc: '10293847561', bankHolder: 'V. Venkatesh' },
  ]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [showNewSupplierForm, setShowNewSupplierForm] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    phone: '',
    village: '',
    phonepe: '',
    bankAcc: '',
    bankHolder: '',
  });

  // Worker Categories & Wages Table — pre-filled with 8 default harvest batch categories
  const [wagesRows, setWagesRows] = useState([
    { id: 1, category: '1. vala manushulu', qty: 0, amount: 0 },
    { id: 2, category: '2. mestri', qty: 0, amount: 0 },
    { id: 3, category: '3. autos', qty: 0, amount: 0 },
    { id: 4, category: '4. valalu', qty: 0, amount: 0 },
    { id: 5, category: '5. chethi valalu', qty: 0, amount: 0 },
    { id: 6, category: '6. guntu valalu', qty: 0, amount: 0 },
    { id: 7, category: '7. Beta', qty: 0, amount: 0 },
    { id: 8, category: '8. extra amount', qty: 0, amount: 0 },
  ]);

  // ── Overall Reports Archive State & Search ────────────────────────────
  const [savedExchangesLedger, setSavedExchangesLedger] = useState([]);
  const [searchReportDate, setSearchReportDate] = useState('');
  const [searchReportBillNo, setSearchReportBillNo] = useState('');
  const [viewingReportModal, setViewingReportModal] = useState(null);

  // Load site sections, tanks & stored seed exchange records
  useEffect(() => {
    if (!siteId) return;
    (async () => {
      const [{ data: sData }, { data: tData }] = await Promise.all([
        supabase.from(TABLES.sections).select('*').eq('site_id', siteId).order('name'),
        supabase.from(TABLES.tanks).select('*').eq('site_id', siteId).order('name'),
      ]);
      setSections(sData ?? []);
      setTanks(tData ?? []);
    })();

    // Load saved seed exchange bills ledger from LocalStorage
    try {
      const storedLedger = JSON.parse(localStorage.getItem(`seed_exchanges_ledger_${siteId}`) || '[]');
      setSavedExchangesLedger(storedLedger);
    } catch {
      setSavedExchangesLedger([]);
    }
  }, [siteId]);

  // Derived Tanks for From/To Section
  const fromTanksList = useMemo(() => {
    if (!fromSection) return tanks;
    return tanks.filter((t) => t.section_id === fromSection);
  }, [tanks, fromSection]);

  // Requirement 1: Filter out selected "From Tank" from "To Tank" options
  const toTanksList = useMemo(() => {
    let list = tanks;
    if (toSection) {
      list = list.filter((t) => t.section_id === toSection);
    }
    if (fromTankId) {
      list = list.filter((t) => t.id !== fromTankId);
    }
    return list;
  }, [tanks, toSection, fromTankId]);

  const fromTank = useMemo(() => tanks.find((t) => t.id === fromTankId), [tanks, fromTankId]);
  const toTank = useMemo(() => tanks.find((t) => t.id === toTankId), [tanks, toTankId]);

  // Computed DOC for From Tank
  const fromTankDoc = useMemo(() => {
    if (!fromTank?.start_date) return '45';
    const days = Math.max(1, Math.floor((Date.now() - new Date(fromTank.start_date).getTime()) / 86400000));
    return String(days);
  }, [fromTank]);

  const toTankDoc = useMemo(() => {
    if (!toTank?.start_date) return '30';
    const days = Math.max(1, Math.floor((Date.now() - new Date(toTank.start_date).getTime()) / 86400000));
    return String(days);
  }, [toTank]);

  // ── Step 3 Weightment Calculations ────────────────────────────────────
  const totalGrossWeight = useMemo(() => {
    return weighmentRows.reduce((sum, r) => sum + (Number(r.grossKg) || 0), 0);
  }, [weighmentRows]);

  const totalNetsCount = useMemo(() => {
    return weighmentRows.reduce((sum, r) => sum + (Number(r.nets) || 0), 0);
  }, [weighmentRows]);

  const totalNetTareWeight = useMemo(() => {
    const netWeightVal = Number(tareWeightPerNet) || 0;
    return totalNetsCount * netWeightVal;
  }, [totalNetsCount, tareWeightPerNet]);

  const grandTotalNetWeight = useMemo(() => {
    return Math.max(0, totalGrossWeight - totalNetTareWeight);
  }, [totalGrossWeight, totalNetTareWeight]);

  // ── Step 4 Count Calculations ─────────────────────────────────────────
  const computedCounts = useMemo(() => {
    return countRows.map((r) => {
      const sKg = Number(r.sampleKg) || 0;
      const tPcs = Number(r.totalPieces) || 0;
      const countVal = sKg > 0 ? parseFloat((tPcs / sKg).toFixed(2)) : 0;
      return { ...r, calculatedCount: countVal };
    });
  }, [countRows]);

  const activeCountRow = computedCounts[selectedCountIdx] || computedCounts[0] || { calculatedCount: 0 };
  const selectedCountValue = activeCountRow.calculatedCount || 0;

  // Total Exchanged Seed Pieces (Total Weight * Selected Count)
  const totalExchangedPieces = useMemo(() => {
    return Math.round(grandTotalNetWeight * selectedCountValue);
  }, [grandTotalNetWeight, selectedCountValue]);

  // ── After Exchange Calculated Tank States ──────────────────────────────
  const fromTankInitialSeed = Number(fromTank?.quantity || 100000);
  const fromTankInitialFeed = Number(fromTank?.feed || fromTank?.tank_feed || 500);
  const fromTankUpdatedSeed = Math.max(0, fromTankInitialSeed - totalExchangedPieces);
  const fromTankUpdatedFeed = Math.max(0, fromTankInitialFeed - grandTotalNetWeight);

  const toTankInitialSeed = Number(toTank?.quantity || 0);
  // Requirement 2: show consumed feed by existing seed in To Tank if seed exists (default 120 kg if no feed property set on existing seed tank)
  const toTankInitialFeed = useMemo(() => {
    if (!toTank) return 0;
    const feedVal = Number(toTank.feed ?? toTank.tank_feed ?? 0);
    if (toTankInitialSeed > 0) {
      return feedVal > 0 ? feedVal : 120;
    }
    return feedVal;
  }, [toTank, toTankInitialSeed]);

  const toTankUpdatedSeed = toTankInitialSeed + totalExchangedPieces;
  const toTankUpdatedFeed = toTankInitialFeed + grandTotalNetWeight;

  const toTankHatcheryDisplay = useMemo(() => {
    const fromHatcheryName = fromTank?.hatchery || 'Vizag Hatchery';
    const toHatcheryName = toTank?.hatchery || '';
    if (toTankInitialSeed > 0 && toHatcheryName) {
      return `${toHatcheryName} (${toTankInitialSeed.toLocaleString('en-IN')} seed) + ${fromHatcheryName} (${totalExchangedPieces.toLocaleString('en-IN')} exchanged seed)`;
    }
    return `${fromHatcheryName} (${totalExchangedPieces.toLocaleString('en-IN')} seed)`;
  }, [fromTank, toTank, toTankInitialSeed, totalExchangedPieces]);

  // Helper to reset data entry state for "Submit, Add Another Tank"
  const resetDataEntryForm = () => {
    setFromTankId('');
    setToTankId('');
    setExpectedQty('');
    setRemarks('');
    setWeighmentRows([
      { id: Date.now(), grossKg: '3.1', nets: 1 },
      { id: Date.now() + 1, grossKg: '3.2', nets: 1 },
    ]);
    setCountRows([
      { id: Date.now() + 2, sampleKg: '3.0', totalPieces: '100' },
      { id: Date.now() + 3, sampleKg: '2.5', totalPieces: '150' },
    ]);
    setSelectedCountIdx(0);
    setDataEntryStep('tankSelect');
  };

  // Helper to save current exchange bill
  const saveExchangeBillRecord = () => {
    const billNum = `SEX${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    const newBillRecord = {
      id: `sex-bill-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      bill_number: billNum,
      date: exchangeDate,
      from_tank_id: fromTankId,
      from_tank_name: fromTank?.name || 'From Tank',
      to_tank_id: toTankId,
      to_tank_name: toTank?.name || 'To Tank',
      expected_qty: expectedQty,
      remarks,
      weighment_rows: weighmentRows,
      count_rows: computedCounts,
      selected_count: selectedCountValue,
      total_weight_kg: grandTotalNetWeight,
      total_pieces: totalExchangedPieces,
      supervisor_name: supervisorName || 'Supervisor',
      supervisor_phone: supervisorPhone,
      supervisor_signature: supervisorSignature,
      doc_selected: selectedDocPreference === 'from' ? fromTankDoc : toTankDoc,
      from_tank_before: {
        name: fromTank?.name || 'From Tank',
        seed: fromTankInitialSeed,
        hatchery: fromTank?.hatchery || 'Vizag Hatchery',
        doc: fromTankDoc,
        feed: fromTankInitialFeed,
      },
      to_tank_before: {
        name: toTank?.name || 'To Tank',
        seed: toTankInitialSeed,
        hatchery: toTank?.hatchery || (toTankInitialSeed > 0 ? 'Bhimavaram Hatchery' : 'Empty Tank'),
        doc: toTankDoc,
        feed: toTankInitialFeed,
      },
      from_tank_after: {
        name: fromTank?.name || 'From Tank',
        seed: fromTankUpdatedSeed,
        hatchery: fromTank?.hatchery || 'Vizag Hatchery',
        doc: fromTankDoc,
        feed: fromTankUpdatedFeed,
      },
      to_tank_after: {
        name: toTank?.name || 'To Tank',
        seed: toTankUpdatedSeed,
        hatchery: toTankHatcheryDisplay,
        doc: selectedDocPreference === 'from' ? fromTankDoc : toTankDoc,
        feed: toTankUpdatedFeed,
      },
      enable_weighment: enableWeighmentTableInBill,
      enable_count: enableCountTableInBill,
      enable_worker: enableWorkerTableInBill,
      wages_rows: wagesRows,
      wages_total: wagesRows.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.amount) || 0), 0),
      worker_payment: submittedWorkerPayment,
      status: 'Saved',
      created_at: new Date().toISOString(),
    };

    setGeneratedBill(newBillRecord);

    setSavedExchangesLedger((prevLedger) => {
      const updatedLedger = [newBillRecord, ...prevLedger];
      localStorage.setItem(`seed_exchanges_ledger_${siteId}`, JSON.stringify(updatedLedger));
      return updatedLedger;
    });

    return newBillRecord;
  };

  // Validation derived states
  const isTankSelectValid = useMemo(() => {
    return Boolean(fromTankId && toTankId && expectedQty && Number(expectedQty) > 0);
  }, [fromTankId, toTankId, expectedQty]);

  const isWeightEntryValid = useMemo(() => {
    return weighmentRows.some((r) => Number(r.grossKg) > 0 && Number(r.nets) > 0);
  }, [weighmentRows]);

  const isCountValid = useMemo(() => {
    return countRows.some((r) => Number(r.sampleKg) > 0 && Number(r.totalPieces) > 0);
  }, [countRows]);

  // ── Step 2 Checklist Handlers ─────────────────────────────────────────
  const visibleChecklistItems = useMemo(() => {
    return checklistItems.filter((item) => item.stage === checklistStage);
  }, [checklistItems, checklistStage]);

  const isChecklistValid = useMemo(() => {
    return visibleChecklistItems.length > 0 && visibleChecklistItems.every((item) => item.checked);
  }, [visibleChecklistItems]);

  const handleToggleChecklist = (id) => {
    setChecklistItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item))
    );
  };

  const handleAddChecklistPoint = () => {
    if (!newChecklistText.trim()) return;
    setChecklistItems((prev) => [
      ...prev,
      { id: Date.now(), stage: checklistStage, text: newChecklistText.trim(), checked: true },
    ]);
    setNewChecklistText('');
    toast.success('Checklist point added');
  };

  const handleDeleteChecklistPoint = (id) => {
    setChecklistItems((prev) => prev.filter((item) => item.id !== id));
    toast.info('Checklist point removed');
  };

  const handleStartEditChecklist = (item) => {
    setEditingChecklistId(item.id);
    setEditingChecklistText(item.text);
  };

  const handleSaveEditChecklist = () => {
    if (!editingChecklistText.trim()) return;
    setChecklistItems((prev) =>
      prev.map((item) => (item.id === editingChecklistId ? { ...item, text: editingChecklistText.trim() } : item))
    );
    setEditingChecklistId(null);
    setEditingChecklistText('');
    toast.success('Checklist point updated');
  };

  // ── Step 3 Weightment Handlers ────────────────────────────────────────
  const handleAddWeighmentRow = () => {
    setWeighmentRows((prev) => [
      ...prev,
      { id: Date.now(), grossKg: '3.0', nets: 1 },
    ]);
  };

  const handleUpdateWeighmentRow = (id, field, val) => {
    setWeighmentRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const handleNetCountChange = (id, delta) => {
    setWeighmentRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const newNets = Math.max(1, (Number(r.nets) || 1) + delta);
          return { ...r, nets: newNets };
        }
        return r;
      })
    );
  };

  const handleDeleteWeighmentRow = (id) => {
    if (weighmentRows.length <= 1) {
      toast.error('Must keep at least 1 weighment row');
      return;
    }
    setWeighmentRows((prev) => prev.filter((r) => r.id !== id));
  };

  // ── Step 4 Count Handlers ─────────────────────────────────────────────
  const handleAddCountRow = () => {
    setCountRows((prev) => [
      ...prev,
      { id: Date.now(), sampleKg: '1.0', totalPieces: '50' },
    ]);
  };

  const handleUpdateCountRow = (id, field, val) => {
    setCountRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const handleDeleteCountRow = (id) => {
    if (countRows.length <= 1) {
      toast.error('Must keep at least 1 count row');
      return;
    }
    setCountRows((prev) => prev.filter((r) => r.id !== id));
    if (selectedCountIdx >= countRows.length - 1) {
      setSelectedCountIdx(0);
    }
  };

  // Requirement 6: "submit ,add another tank" handler
  const handleSubmitAndAddAnotherTank = () => {
    if (!fromTankId || !toTankId) {
      toast.error('Please complete Tank Selection first');
      return;
    }
    const savedRecord = saveExchangeBillRecord();
    setSelectedWorkerBillIds((prev) => Array.from(new Set([savedRecord.id, ...prev])));
    toast.success(`Tank ${fromTank?.name || ''} → ${toTank?.name || ''} data stored! You can now enter another tank.`);
    resetDataEntryForm();
  };

  // Count Submit → save exchange card & navigate to Worker Payments
  const handleSubmitCountToWorkerPayments = () => {
    if (!fromTankId || !toTankId) {
      toast.error('Please complete Tank Selection first');
      return;
    }
    const savedRecord = saveExchangeBillRecord();
    setSelectedWorkerBillIds((prev) => Array.from(new Set([savedRecord.id, ...prev])));
    setExchangeSection('workerPayments');
    setWorkerStep('tankSelection');
    toast.success('Exchange data saved and added to Worker Payments!');
  };

  // ── Step 5 Generate Bill Handler ──────────────────────────────────────
  const handleGenerateBill = (navigateToReports = false) => {
    if (!fromTankId || !toTankId) {
      toast.error('Please select From Tank and To Tank');
      return null;
    }
    if (generatedBill && !navigateToReports) {
      toast.info('Bill already generated. Click Download to print.');
      return generatedBill;
    }
    const newBillRecord = saveExchangeBillRecord();
    toast.success(`Bill #${newBillRecord.bill_number} generated & saved to Reports!`);

    if (navigateToReports) {
      setTimeout(() => setMainSubTab('reports'), 300);
    }
    return newBillRecord;
  };

  const handleDownloadBillPDF = () => {
    const updatedRecord = saveExchangeBillRecord();
    setGeneratedBill(updatedRecord);

    const originalTitle = document.title;
    document.title = '';
    window.print();
    document.title = originalTitle;
  };

  // ── Worker Payments Handlers ──────────────────────────────────────────
  const handleAddNewSupplier = () => {
    if (!newSupplier.name.trim() || !newSupplier.phone.trim()) {
      toast.error('Supplier name and phone number are required');
      return;
    }
    const supObj = {
      id: `sup-${Date.now()}`,
      ...newSupplier,
    };
    setSuppliers((prev) => [...prev, supObj]);
    setSelectedSupplierId(supObj.id);
    setShowNewSupplierForm(false);
    setNewSupplier({ name: '', phone: '', village: '', phonepe: '', bankAcc: '', bankHolder: '' });
    toast.success(`New supplier "${supObj.name}" added`);
  };

  const handleAddWagesRow = () => {
    setWagesRows((prev) => [
      ...prev,
      { id: Date.now(), category: `${prev.length + 1}. custom batch`, qty: 0, amount: 0 },
    ]);
  };

  const handleDeleteWagesRow = (id) => {
    if (wagesRows.length <= 1) {
      toast.error('Must keep at least 1 wages row');
      return;
    }
    setWagesRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleUpdateWagesRow = (id, field, val) => {
    setWagesRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const workerTotalAmount = useMemo(() => {
    return wagesRows.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.amount) || 0), 0);
  }, [wagesRows]);

  const selectedSupplierObj = useMemo(() => {
    return suppliers.find((s) => s.id === selectedSupplierId);
  }, [suppliers, selectedSupplierId]);

  const handlePaymentRequestSubmit = () => {
    if (!selectedWorkerBillIds.length) {
      toast.error('Select at least one seed exchange tank/bill first');
      return;
    }
    const selectedBills = savedExchangesLedger.filter((b) => selectedWorkerBillIds.includes(b.id));
    const linkedBillNums = selectedBills.map((b) => b.bill_number).join(', ');

    const requestPayload = {
      id: `wrk-req-${Date.now()}`,
      bill_number: `WRK-${Date.now().toString().slice(-6)}`,
      linked_exchange_bills: linkedBillNums,
      supplier_name: selectedSupplierObj?.name || 'Worker Supplier',
      supplier_details: selectedSupplierObj,
      wages_rows: wagesRows,
      total_wages: workerTotalAmount,
      date: new Date().toISOString().slice(0, 10),
      status: 'Pending Payment',
      created_at: new Date().toISOString(),
    };

    try {
      const existingReqs = JSON.parse(localStorage.getItem('seed_exchange_worker_requests') || '[]');
      localStorage.setItem('seed_exchange_worker_requests', JSON.stringify([requestPayload, ...existingReqs]));
    } catch {
      // fallback
    }

    toast.success(`Worker Payment Request Submitted! Total: ₹${workerTotalAmount.toLocaleString('en-IN')}`);
    setSubmittedWorkerPayment(requestPayload);
    setWorkerStep('overallView');
  };

  // Requirement 7: Get all selected bills for overall view rendering
  const selectedBillsForView = useMemo(() => {
    if (selectedWorkerBillIds.length === 0 && generatedBill) {
      return [generatedBill];
    }
    const matched = savedExchangesLedger.filter((b) => selectedWorkerBillIds.includes(b.id));
    if (matched.length > 0) return matched;
    if (generatedBill) return [generatedBill];
    return [];
  }, [savedExchangesLedger, selectedWorkerBillIds, generatedBill]);

  // Filtered Overall Report Ledger
  const filteredReportsLedger = useMemo(() => {
    return savedExchangesLedger.filter((b) => {
      const bDate = String(b.date || b.created_at || '').slice(0, 10);
      if (searchReportDate && !bDate.includes(searchReportDate)) return false;
      if (searchReportBillNo && !String(b.bill_number || '').toLowerCase().includes(searchReportBillNo.toLowerCase())) return false;
      return true;
    });
  }, [savedExchangesLedger, searchReportDate, searchReportBillNo]);

  if (!siteId) return <Empty icon="🗺️" title="Select a site first" />;

  return (
    <div className="space-y-6 text-left font-sans pb-10">
      
      {/* ── SUB TAB NAV: 1. Seed Exchange  |  2. Overall Report ─────────── */}
      <div className="bg-slate-900 rounded-2xl p-4 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 block">
            SEED EXCHANGE MODULE
          </span>
          <h2 className="text-xl font-black text-white">Seed Transfer &amp; Worker Wage Management</h2>
        </div>

        <div className="flex bg-slate-800 p-1.5 rounded-xl border border-slate-700">
          <button
            type="button"
            onClick={() => setMainSubTab('exchange')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 ${
              mainSubTab === 'exchange' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:text-white'
            }`}
          >
            <span>1. Seed Exchange</span>
          </button>

          <button
            type="button"
            onClick={() => setMainSubTab('reports')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 ${
              mainSubTab === 'reports' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:text-white'
            }`}
          >
            <span>2. Overall Report</span>
            {savedExchangesLedger.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-black">
                {savedExchangesLedger.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SUB TAB 1: SEED EXCHANGE                                            */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {mainSubTab === 'exchange' && (
        <div className="space-y-6">
          
          {/* Section Switcher: 1. Data Entry  |  2. Worker Payments */}
          <div className="flex items-center gap-3 bg-white rounded-2xl p-3 border border-slate-200 shadow-card print:hidden">
            <button
              type="button"
              onClick={() => setExchangeSection('dataEntry')}
              className={`flex-1 py-3 rounded-xl text-xs sm:text-sm font-extrabold transition flex items-center justify-center gap-2 ${
                exchangeSection === 'dataEntry'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>📊</span>
              <span>1. Data Entry</span>
            </button>
            <button
              type="button"
              onClick={() => setExchangeSection('workerPayments')}
              className={`flex-1 py-3 rounded-xl text-xs sm:text-sm font-extrabold transition flex items-center justify-center gap-2 ${
                exchangeSection === 'workerPayments'
                  ? 'bg-emerald-700 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>👷</span>
              <span>2. Worker Payments</span>
            </button>
          </div>

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* SECTION 1: DATA ENTRY (5 Sub-sections / Steps)                  */}
          {/* ──────────────────────────────────────────────────────────────── */}
          {exchangeSection === 'dataEntry' && (
            <div className="space-y-6 print:hidden">
              
              {/* Data Entry Stepper Navigation */}
              <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-card overflow-x-auto">
                <div className="flex items-center gap-2 min-w-max">
                  {[
                    { id: 'tankSelect', label: '1. Tank Selection', icon: '🗄️' },
                    { id: 'checklist', label: '2. Checklist', icon: '📋' },
                    { id: 'weightEntry', label: '3. Weight Entry', icon: '⚖️' },
                    { id: 'count', label: '4. Count', icon: '🔢' },
                  ].map((stepObj) => {
                    const isActive = dataEntryStep === stepObj.id;
                    return (
                      <button
                        key={stepObj.id}
                        type="button"
                        onClick={() => setDataEntryStep(stepObj.id)}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                          isActive
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span>{stepObj.icon}</span>
                        <span>{stepObj.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── STEP 1: TANK SELECTION ───────────────────────────────── */}
              {dataEntryStep === 'tankSelect' && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <span>🗄️</span> Tank Selection &amp; Exchange Setup
                    </h3>
                    
                    {/* Date Picker with Edit Toggle */}
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-300">
                      <span className="text-xs font-extrabold text-slate-700">Date:</span>
                      {isEditingDate ? (
                        <input
                          type="date"
                          value={exchangeDate}
                          onChange={(e) => setExchangeDate(e.target.value)}
                          onBlur={() => setIsEditingDate(false)}
                          className="bg-white text-slate-900 font-mono text-xs p-1 rounded-lg border border-slate-300"
                        />
                      ) : (
                        <span className="font-mono font-bold text-slate-900 text-xs">{exchangeDate}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsEditingDate(!isEditingDate)}
                        className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200"
                      >
                        {isEditingDate ? 'Done' : 'Edit Date ✏️'}
                      </button>
                    </div>
                  </div>

                  {/* Options b & c: From section & To section (Beside each other) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-extrabold text-slate-700 block mb-1">b. From Section (Source)</label>
                      <select
                        value={fromSection}
                        onChange={(e) => {
                          setFromSection(e.target.value);
                          setFromTankId('');
                        }}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:border-blue-500"
                      >
                        <option value="">-- All Sections --</option>
                        {sections.map((sec) => (
                          <option key={sec.id} value={sec.id}>{sec.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-extrabold text-slate-700 block mb-1">c. To Section (Destination)</label>
                      <select
                        value={toSection}
                        onChange={(e) => {
                          setToSection(e.target.value);
                          setToTankId('');
                        }}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:border-blue-500"
                      >
                        <option value="">-- All Sections --</option>
                        {sections.map((sec) => (
                          <option key={sec.id} value={sec.id}>{sec.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Options d & e: From tank & To tank (Beside each other) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* From Tank */}
                    <div className="space-y-3">
                      <label className="text-xs font-extrabold text-slate-700 block">d. From Tank (Seed Giving Tank)</label>
                      <select
                        value={fromTankId}
                        onChange={(e) => {
                          setFromTankId(e.target.value);
                          if (toTankId === e.target.value) {
                            setToTankId('');
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:border-blue-500"
                      >
                        <option value="">-- Select From Tank --</option>
                        {fromTanksList.map((tk) => (
                          <option key={tk.id} value={tk.id}>
                            {/* Requirement 3: Remove "PL" term */}
                            Tank {tk.name} ({tk.quantity ? `${tk.quantity.toLocaleString('en-IN')}` : 'Empty'})
                          </option>
                        ))}
                      </select>

                      {fromTank && (
                        <div className="rounded-xl p-4 bg-blue-50/70 border border-blue-200 text-xs space-y-1">
                          <p className="font-extrabold text-blue-900 text-sm">Tank {fromTank.name}</p>
                          <p>Tank No: <span className="font-bold text-slate-900">{fromTank.tank_no || fromTank.name}</span></p>
                          <p>DOC: <span className="font-bold text-slate-900">{fromTankDoc} days</span></p>
                          {/* Requirement 3: Remove "PL" term */}
                          <p>Seed Qty: <span className="font-extrabold text-blue-700">{fromTank.quantity?.toLocaleString('en-IN') || '100,000'}</span></p>
                          <p>Hatchery: <span className="font-bold text-slate-900">{fromTank.hatchery || 'Vizag Hatchery'}</span></p>
                          <p>Tank Feed: <span className="font-bold text-slate-900">{fromTank.feed || fromTank.tank_feed || 500} kg</span></p>
                          <p>latest count: <span className="font-bold text-slate-900">{fromTank.latest_count || '60'}</span></p>
                        </div>
                      )}
                    </div>

                    {/* To Tank */}
                    <div className="space-y-3">
                      <label className="text-xs font-extrabold text-slate-700 block">e. To Tank (Seed Receiving Tank)</label>
                      <select
                        value={toTankId}
                        onChange={(e) => setToTankId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:border-blue-500"
                      >
                        <option value="">-- Select To Tank --</option>
                        {toTanksList.map((tk) => (
                          <option key={tk.id} value={tk.id}>
                            {/* Requirement 3: Remove "PL" term */}
                            Tank {tk.name} ({tk.quantity ? `${tk.quantity.toLocaleString('en-IN')}` : 'Empty Tank'})
                          </option>
                        ))}
                      </select>

                      {toTank ? (
                        <div className={`rounded-xl p-4 border text-xs space-y-1 ${
                          Number(toTank.quantity || 0) > 0 ? 'bg-emerald-50/70 border-emerald-200' : 'bg-slate-50 border-slate-200'
                        }`}>
                          <p className="font-extrabold text-slate-900 text-sm">Tank {toTank.name}</p>
                          <p>Tank No: <span className="font-bold text-slate-900">{toTank.tank_no || toTank.name}</span></p>
                          <p>DOC: <span className="font-bold text-slate-900">{toTankDoc} days</span></p>
                          {/* Requirement 3: Remove "PL" term */}
                          <p>Seed Status: {Number(toTank.quantity || 0) > 0 ? (
                            <span className="font-extrabold text-emerald-800">{toTank.quantity.toLocaleString('en-IN')} ({toTank.hatchery || 'Bhimavaram Hatchery'})</span>
                          ) : (
                            <span className="font-bold text-slate-500">Empty Tank</span>
                          )}</p>
                          {/* Requirement 2: Show consumed feed by existed seed */}
                          <p>Tank Feed: <span className="font-bold text-slate-900">{toTankInitialFeed} kg</span></p>
                          <p>latest count: <span className="font-bold text-slate-900">{toTank.latest_count || 'N/A'}</span></p>
                        </div>
                      ) : (
                        <div className="rounded-xl p-4 bg-amber-50 border border-amber-200 text-xs text-amber-900">
                          <p className="font-bold">NOTE 1: Tank Shifting Rule</p>
                          <p className="text-[11px] mt-0.5">Whether To Tank contains seed or is empty, seed can be shifted without any problem.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Options f, g, h, i */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div>
                      {/* Requirement 1: Validate Expected Quantity does not exceed seed in From Tank */}
                      <label className="text-xs font-extrabold text-slate-700 block mb-1">f. Expected Quantity (Pieces)</label>
                      <input
                        type="number"
                        placeholder="e.g. 25000"
                        value={expectedQty}
                        onChange={(e) => {
                          const val = e.target.value;
                          const maxSeed = Number(fromTank?.quantity || 100000);
                          if (fromTank && val !== '' && Number(val) > maxSeed) {
                            toast.error(`Expected Quantity (${Number(val).toLocaleString('en-IN')}) cannot exceed seed available in Tank ${fromTank.name} (${maxSeed.toLocaleString('en-IN')})!`);
                            setExpectedQty(String(maxSeed));
                            return;
                          }
                          setExpectedQty(val);
                        }}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white"
                      />
                      {fromTank && Number(expectedQty) > 0 && (
                        <span className="text-[10px] font-bold text-slate-400 mt-1 block">
                          Max available: {Number(fromTank?.quantity || 100000).toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-extrabold text-slate-700 block mb-1">g. DOC of From Tank (Auto)</label>
                      <input
                        type="text"
                        readOnly
                        value={fromTankDoc ? `${fromTankDoc} Days` : 'Auto-filled'}
                        className="w-full bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-extrabold text-slate-700 block mb-1">h. Hatchery Name of From Tank (Auto)</label>
                      <input
                        type="text"
                        readOnly
                        value={fromTank?.hatchery || 'Vizag Hatchery'}
                        className="w-full bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-extrabold text-slate-700 block mb-1">i. Remarks (Optional)</label>
                    <textarea
                      placeholder="Add optional notes or instructions for seed exchange..."
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-medium text-slate-900 focus:bg-white min-h-[60px]"
                    />
                  </div>

                  {/* Submit Button to Checklist */}
                  <div className="flex justify-end pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={!isTankSelectValid}
                      onClick={() => setDataEntryStep('checklist')}
                      className={`px-6 py-3 rounded-xl font-black text-xs transition shadow-md flex items-center gap-2 ${
                        isTankSelectValid
                          ? 'bg-blue-600 hover:bg-blue-500 text-white'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <span>Proceed to Safety Checklist →</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 2: CHECKLIST ────────────────────────────────────── */}
              {dataEntryStep === 'checklist' && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                        <span>📋</span> Seed Exchange Safety Checklist
                      </h3>
                      <p className="text-xs text-slate-500">Check safety points before entering seed exchange weights.</p>
                    </div>

                    {/* Requirement 4: Stage Selector Dropdown with 2 options (no numbers) */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-700">Stage:</span>
                      <select
                        value={checklistStage}
                        onChange={(e) => setChecklistStage(e.target.value)}
                        className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:bg-white"
                      >
                        <option value="nursery">Nursery seed</option>
                        <option value="hatchery">Hatchery seed</option>
                      </select>
                    </div>
                  </div>

                  {/* Add New Checklist Point */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Add new checklist point for ${checklistStage === 'nursery' ? 'Nursery seed' : 'Hatchery seed'}...`}
                      value={newChecklistText}
                      onChange={(e) => setNewChecklistText(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddChecklistPoint}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-sm"
                    >
                      + Add Point
                    </button>
                  </div>

                  {/* Requirement 4: Aesthetic Checklist Items Layout & Default Unchecked State */}
                  <div className="space-y-2.5">
                    {visibleChecklistItems.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                          item.checked 
                            ? 'bg-emerald-50/70 border-emerald-300 shadow-sm' 
                            : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 hover:bg-slate-100/50'
                        }`}
                      >
                        <label className="flex items-center gap-3.5 cursor-pointer flex-1 mr-4 select-none">
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={() => handleToggleChecklist(item.id)}
                            className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                          />
                          {editingChecklistId === item.id ? (
                            <input
                              type="text"
                              value={editingChecklistText}
                              onChange={(e) => setEditingChecklistText(e.target.value)}
                              className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          ) : (
                            <span className={`text-xs font-bold transition-all ${item.checked ? 'text-emerald-900 font-extrabold' : 'text-slate-700'}`}>
                              {item.text}
                            </span>
                          )}
                        </label>

                        <div className="flex items-center gap-2">
                          {editingChecklistId === item.id ? (
                            <button
                              type="button"
                              onClick={handleSaveEditChecklist}
                              className="text-[11px] font-extrabold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1 rounded-lg border border-emerald-300"
                            >
                              Save
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartEditChecklist(item)}
                              className="text-[11px] font-extrabold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50"
                            >
                              Edit ✏️
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteChecklistPoint(item.id)}
                            className="text-[11px] font-extrabold text-rose-600 hover:text-rose-800 px-2 py-1 rounded-lg hover:bg-rose-50"
                          >
                            Delete 🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Submit Button to Weight Entry */}
                  <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setDataEntryStep('tankSelect')}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                    >
                      ← Back to Tank Selection
                    </button>

                    <button
                      type="button"
                      disabled={!isChecklistValid}
                      onClick={() => setDataEntryStep('weightEntry')}
                      className={`px-6 py-3 rounded-xl font-black text-xs transition shadow-md ${
                        isChecklistValid
                          ? 'bg-blue-600 hover:bg-blue-500 text-white'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      Submit to Weight Entry →
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: WEIGHT ENTRY ─────────────────────────────────── */}
              {dataEntryStep === 'weightEntry' && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                        <span>⚖️</span> Weightment Table (Weight Entry)
                      </h3>
                      <p className="text-xs text-slate-500">Record total gross weight and net counts for seed exchange.</p>
                    </div>

                    {/* Requirement 5: Default net weight 0, editable and allow backspacing 0 to empty */}
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-300">
                      <span className="text-xs font-bold text-slate-700">Tare/Net Wt:</span>
                      <input
                        type="text"
                        value={tareWeightPerNet}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            setTareWeightPerNet(val);
                          }
                        }}
                        placeholder="0"
                        className="w-16 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                      />
                      <span className="text-xs text-slate-500 font-bold">KG / net</span>
                    </div>
                  </div>

                  {/* Weightment Table */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                        <tr>
                          <th className="p-3 w-14 text-center">1. S.No</th>
                          <th className="p-3">2. Weight (kgs)</th>
                          <th className="p-3 text-center">3. Nets</th>
                          <th className="p-3 text-center w-24">4. Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {weighmentRows.map((row, idx) => (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                            <td className="p-3">
                              <input
                                type="number"
                                step="0.1"
                                placeholder="e.g. 3.1"
                                value={row.grossKg}
                                onChange={(e) => handleUpdateWeighmentRow(row.id, 'grossKg', e.target.value)}
                                className="w-40 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 font-mono font-black text-sm text-slate-900 focus:bg-white"
                              />
                              <span className="text-[10px] text-slate-400 ml-2">(e.g. 3.1 kg)</span>
                            </td>
                            <td className="p-3 text-center">
                              <div className="inline-flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-300">
                                <button
                                  type="button"
                                  onClick={() => handleNetCountChange(row.id, -1)}
                                  className="w-7 h-7 rounded-lg bg-white shadow-sm font-black text-slate-700 hover:bg-slate-200"
                                >
                                  -
                                </button>
                                <span className="w-6 text-center font-mono font-black text-sm text-slate-900">
                                  {row.nets || 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleNetCountChange(row.id, 1)}
                                  className="w-7 h-7 rounded-lg bg-white shadow-sm font-black text-slate-700 hover:bg-slate-200"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteWeighmentRow(row.id)}
                                className="px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-bold border border-rose-200"
                              >
                                Delete 🗑️
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Add Row Button */}
                  <div className="flex justify-start">
                    <button
                      type="button"
                      onClick={handleAddWeighmentRow}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-sm"
                    >
                      + Add New Row
                    </button>
                  </div>

                  {/* Below Table 3 Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div className="rounded-2xl p-4 bg-slate-50 border border-slate-200 text-slate-900">
                      <span className="text-[10px] font-extrabold text-slate-500 uppercase block">1. Total Weight</span>
                      <span className="text-2xl font-black font-mono mt-1 block">
                        {totalGrossWeight.toFixed(1)} KG
                      </span>
                    </div>

                    <div className="rounded-2xl p-4 bg-amber-50 border border-amber-200 text-amber-900">
                      <span className="text-[10px] font-extrabold text-amber-700 uppercase block">2. Total Net Weight (Nets × Wt)</span>
                      <span className="text-2xl font-black font-mono mt-1 block">
                        {totalNetTareWeight.toFixed(2)} KG
                      </span>
                      <span className="text-[10px] text-amber-600 block mt-0.5">{totalNetsCount} nets × {Number(tareWeightPerNet) || 0} kg</span>
                    </div>

                    <div className="rounded-2xl p-4 bg-emerald-50 border border-emerald-200 text-emerald-900">
                      <span className="text-[10px] font-extrabold text-emerald-700 uppercase block">3. Grand Total (Total - Net Wt)</span>
                      <span className="text-2xl font-black font-mono mt-1 block">
                        {grandTotalNetWeight.toFixed(2)} KG
                      </span>
                    </div>
                  </div>

                  {/* Submit Button to Count */}
                  <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setDataEntryStep('checklist')}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                    >
                      ← Back to Checklist
                    </button>

                    <button
                      type="button"
                      disabled={!isWeightEntryValid}
                      onClick={() => setDataEntryStep('count')}
                      className={`px-6 py-3 rounded-xl font-black text-xs transition shadow-md ${
                        isWeightEntryValid
                          ? 'bg-blue-600 hover:bg-blue-500 text-white'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      Submit to Count Section →
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 4: COUNT ────────────────────────────────────────── */}
              {dataEntryStep === 'count' && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                        <span>🔢</span> Count Table (Sample Weight &amp; Count)
                      </h3>
                      <p className="text-xs text-slate-500">Exact count table from harvest module with decimal calculated count.</p>
                    </div>
                  </div>

                  {/* Count Table (6 Columns) */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                        <tr>
                          <th className="p-3 w-16 text-center">1. Select</th>
                          <th className="p-3 w-14 text-center">2. S.No</th>
                          <th className="p-3">3. Sample Weight (KGs)</th>
                          <th className="p-3">4. Total Pieces (no)</th>
                          <th className="p-3 text-right">5. Calculated Count</th>
                          <th className="p-3 text-center w-24">6. Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {computedCounts.map((row, idx) => {
                          const isSelected = selectedCountIdx === idx;
                          return (
                            <tr key={row.id} className={`hover:bg-slate-50 ${isSelected ? 'bg-blue-50/60' : ''}`}>
                              <td className="p-3 text-center">
                                <input
                                  type="radio"
                                  name="countSelectionRadio"
                                  checked={isSelected}
                                  onChange={() => setSelectedCountIdx(idx)}
                                  className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                                />
                              </td>
                              <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                              <td className="p-3">
                                <input
                                  type="number"
                                  step="0.1"
                                  placeholder="e.g. 3.0"
                                  value={row.sampleKg}
                                  onChange={(e) => handleUpdateCountRow(row.id, 'sampleKg', e.target.value)}
                                  className="w-32 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 font-mono font-bold text-slate-900 focus:bg-white"
                                />
                              </td>
                              <td className="p-3">
                                <input
                                  type="number"
                                  placeholder="e.g. 100"
                                  value={row.totalPieces}
                                  onChange={(e) => handleUpdateCountRow(row.id, 'totalPieces', e.target.value)}
                                  className="w-32 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 font-mono font-bold text-slate-900 focus:bg-white"
                                />
                              </td>
                              <td className="p-3 text-right font-mono font-black text-blue-700 text-sm">
                                {row.calculatedCount.toFixed(2)}
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCountRow(row.id)}
                                  className="px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-bold border border-rose-200"
                                >
                                  Delete 🗑️
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Add Row Button */}
                  <div className="flex justify-start">
                    <button
                      type="button"
                      onClick={handleAddCountRow}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-sm"
                    >
                      + Add New Row
                    </button>
                  </div>

                  {/* Selected Count Card */}
                  <div className="rounded-2xl p-4 bg-gradient-to-r from-blue-900 to-indigo-900 text-white shadow-md">
                    <span className="text-[10px] font-extrabold text-blue-300 uppercase block">Selected Count</span>
                    <span className="text-3xl font-black font-mono text-white mt-1 block">
                      {selectedCountValue.toFixed(2)}
                    </span>
                    <span className="text-xs text-blue-200 mt-1 block font-medium">
                      Calculated from row #{selectedCountIdx + 1} ({activeCountRow.totalPieces} pieces for {activeCountRow.sampleKg} kg)
                    </span>
                  </div>

                  {/* Requirement 6: Submit buttons layout - Back on left, 2 buttons on bottom right stacked vertically */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setDataEntryStep('weightEntry')}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl self-start sm:self-auto"
                    >
                      ← Back to Weight Entry
                    </button>

                    <div className="flex flex-col items-end gap-2.5 w-full sm:w-auto">
                      {/* Requirement 6: "submit ,add another tank" button above "submit go to worker payments" */}
                      <button
                        type="button"
                        onClick={handleSubmitAndAddAnotherTank}
                        className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-2"
                      >
                        <span>➕</span>
                        <span>Submit, Add Another Tank</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSubmitCountToWorkerPayments}
                        className="w-full sm:w-auto px-6 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-2"
                      >
                        <span>✓</span>
                        <span>Submit → Go to Worker Payments</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ──────────────────────────────────────────────────────────────── */}
          {/* SECTION 2: WORKER PAYMENTS (3 Sub-sections / Steps)             */}
          {/* ──────────────────────────────────────────────────────────────── */}
          {exchangeSection === 'workerPayments' && (
            <div className="space-y-6">
              
              {/* Stepper tabs for Worker Payments */}
              <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-card flex items-center gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => setWorkerStep('tankSelection')}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition ${
                    workerStep === 'tankSelection' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  1. Tank Selection
                </button>
                <button
                  type="button"
                  disabled={selectedWorkerBillIds.length === 0}
                  onClick={() => setWorkerStep('workerDetails')}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition ${
                    workerStep === 'workerDetails' ? 'bg-emerald-700 text-white shadow-sm' : selectedWorkerBillIds.length > 0 ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300 cursor-not-allowed'
                  }`}
                >
                  2. Worker Payments
                </button>
                <button
                  type="button"
                  disabled={!isWorkerDetailsValid}
                  onClick={() => setWorkerStep('overallView')}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition ${
                    workerStep === 'overallView' ? 'bg-blue-700 text-white shadow-sm' : isWorkerDetailsValid ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300 cursor-not-allowed'
                  }`}
                >
                  3. Overall View
                </button>
              </div>

              {/* ── WORKER STEP 1: TANK SELECTION ─────────────────────────── */}
              {workerStep === 'tankSelection' && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-4 print:hidden">
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <span>🗄️</span> Select Submitted Seed Exchange Tanks / Bills
                  </h3>
                  <p className="text-xs text-slate-500">
                    All submitted seed exchange tanks data are saved below. Select multiple tanks to calculate worker payments.
                  </p>

                  {savedExchangesLedger.length === 0 ? (
                    <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                      No submitted seed exchange bills available yet. Complete Data Entry step first.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {savedExchangesLedger.map((b) => {
                        const isSelected = selectedWorkerBillIds.includes(b.id);
                        return (
                          <div
                            key={b.id}
                            onClick={() => {
                              setSelectedWorkerBillIds((prev) =>
                                prev.includes(b.id) ? prev.filter((id) => id !== b.id) : [...prev, b.id]
                              );
                            }}
                            className={`p-4 rounded-2xl border-2 transition cursor-pointer ${
                              isSelected ? 'bg-emerald-50/80 border-emerald-600 shadow-md' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono font-black text-blue-700 text-sm">{b.bill_number}</span>
                              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                {isSelected ? '✓ Selected' : 'Click to Select'}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-900">
                              From Tank: {b.from_tank_name} → To Tank: {b.to_tank_name}
                            </p>
                            <p className="text-xs text-slate-500 mt-1 font-mono">
                              {/* Requirement 3: Remove "PL" term */}
                              Weight: {b.total_weight_kg?.toFixed?.(1) || b.total_weight_kg} KG | Seed: {b.total_pieces?.toLocaleString?.('en-IN') || b.total_pieces}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex justify-end pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={selectedWorkerBillIds.length === 0}
                      onClick={() => setWorkerStep('workerDetails')}
                      className={`px-6 py-3 rounded-xl font-black text-xs transition shadow-md ${
                        selectedWorkerBillIds.length > 0
                          ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      Proceed to Worker Payments Details →
                    </button>
                  </div>
                </div>
              )}

              {/* ── WORKER STEP 2: WORKER PAYMENTS & WAGES ───────────────── */}
              {workerStep === 'workerDetails' && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-6 print:hidden">
                  
                  {/* Supplier Selection & New Supplier Option */}
                  <div className="space-y-4 border-b border-slate-100 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                        <span>👤</span> Supplier &amp; Labour Details
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowNewSupplierForm(!showNewSupplierForm)}
                        className="px-3.5 py-1.5 bg-blue-50 text-blue-700 border border-blue-300 hover:bg-blue-100 rounded-xl text-xs font-extrabold"
                      >
                        {showNewSupplierForm ? 'Close Form' : '+ New Supplier'}
                      </button>
                    </div>

                    {/* Dropdown for Existing Suppliers */}
                    <div>
                      <label className="text-xs font-extrabold text-slate-700 block mb-1">Supplier Name</label>
                      <select
                        value={selectedSupplierId}
                        onChange={(e) => setSelectedSupplierId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:bg-white"
                      >
                        <option value="">-- Select Existing Supplier --</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>{s.name} ({s.village})</option>
                        ))}
                      </select>
                    </div>

                    {/* Display Selected Supplier Details */}
                    {selectedSupplierObj && (
                      <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-200 text-xs grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono">
                        <div><span className="text-[10px] text-slate-500 block font-sans">Name</span><span className="font-bold">{selectedSupplierObj.name}</span></div>
                        <div><span className="text-[10px] text-slate-500 block font-sans">Phone</span><span className="font-bold">{selectedSupplierObj.phone}</span></div>
                        <div><span className="text-[10px] text-slate-500 block font-sans">Village</span><span className="font-bold">{selectedSupplierObj.village}</span></div>
                        <div><span className="text-[10px] text-slate-500 block font-sans">PhonePe #</span><span className="font-bold">{selectedSupplierObj.phonepe}</span></div>
                        <div><span className="text-[10px] text-slate-500 block font-sans">Bank Account</span><span className="font-bold">{selectedSupplierObj.bankAcc}</span></div>
                        <div><span className="text-[10px] text-slate-500 block font-sans">Account Holder</span><span className="font-bold">{selectedSupplierObj.bankHolder}</span></div>
                      </div>
                    )}

                    {/* New Supplier Form */}
                    {showNewSupplierForm && (
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-300 space-y-3">
                        <h4 className="text-xs font-extrabold text-slate-900 uppercase">Create New Supplier</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block">1. Name (Supplier)</label>
                            <input
                              type="text"
                              value={newSupplier.name}
                              onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block">2. Phone No. (Supplier)</label>
                            <input
                              type="tel"
                              value={newSupplier.phone}
                              onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block">3. Village Name</label>
                            <input
                              type="text"
                              value={newSupplier.village}
                              onChange={(e) => setNewSupplier({ ...newSupplier, village: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block">4. PhonePe No.</label>
                            <input
                              type="tel"
                              value={newSupplier.phonepe}
                              onChange={(e) => setNewSupplier({ ...newSupplier, phonepe: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block">5a. Bank Account Number</label>
                            <input
                              type="text"
                              value={newSupplier.bankAcc}
                              onChange={(e) => setNewSupplier({ ...newSupplier, bankAcc: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900 font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block">5b. Bank Holder Name</label>
                            <input
                              type="text"
                              value={newSupplier.bankHolder}
                              onChange={(e) => setNewSupplier({ ...newSupplier, bankHolder: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddNewSupplier}
                          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-extrabold rounded-xl"
                        >
                          Save New Supplier
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Heading: Worker categories & wages */}
                  <div className="space-y-4">
                    <h3 className="text-base font-extrabold text-slate-900 uppercase tracking-wide">
                      Worker Categories &amp; Wages
                    </h3>

                    {/* Table with 4 Columns */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                          <tr>
                            <th className="p-3">1. Harvest Batch / Category</th>
                            <th className="p-3 text-center">2. Quantity</th>
                            <th className="p-3 text-right">3. Amount (₹ per each)</th>
                            <th className="p-3 text-right">4. Total Amount (₹)</th>
                            <th className="p-3 text-center w-16">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {wagesRows.map((row) => {
                            const tot = (Number(row.qty) || 0) * (Number(row.amount) || 0);
                            return (
                              <tr key={row.id} className="hover:bg-slate-50">
                                <td className="p-3 font-bold text-slate-900">{row.category}</td>
                                <td className="p-3 text-center">
                                  <input
                                    type="number"
                                    value={row.qty}
                                    onChange={(e) => handleUpdateWagesRow(row.id, 'qty', e.target.value)}
                                    className="w-20 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-center font-mono font-bold text-slate-900"
                                  />
                                </td>
                                <td className="p-3 text-right">
                                  <input
                                    type="number"
                                    value={row.amount}
                                    onChange={(e) => handleUpdateWagesRow(row.id, 'amount', e.target.value)}
                                    className="w-28 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-right font-mono font-bold text-slate-900"
                                  />
                                </td>
                                <td className="p-3 text-right font-mono font-black text-emerald-700 text-sm">
                                  ₹{tot.toLocaleString('en-IN')}
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteWagesRow(row.id)}
                                    className="p-1 text-rose-500 hover:text-rose-700 transition"
                                    title="Remove row"
                                  >
                                    🗑️
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* "+" Symbol at End to Add Rows */}
                    <div className="flex justify-start">
                      <button
                        type="button"
                        onClick={handleAddWagesRow}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-sm flex items-center gap-1.5"
                      >
                        <span>+</span>
                        <span>Add Category Row</span>
                      </button>
                    </div>

                    {/* Total Amount Card */}
                    <div className="rounded-2xl p-5 bg-gradient-to-r from-emerald-900 to-teal-900 text-white shadow-lg">
                      <span className="text-[10px] font-extrabold text-emerald-300 uppercase block">Grand Total Wages</span>
                      <span className="text-3xl font-black font-mono text-white mt-1 block">
                        ₹{workerTotalAmount.toLocaleString('en-IN')}
                      </span>
                    </div>

                    {/* Payment Request Option + Overall View Button */}
                    <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                      <button
                        type="button"
                        onClick={() => setWorkerStep('tankSelection')}
                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl self-start sm:self-auto"
                      >
                        ← Back to Tank Selection
                      </button>

                      <div className="flex flex-col items-end gap-2.5 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={handlePaymentRequestSubmit}
                          className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-2"
                        >
                          <span>💳 Submit Payment Request to Payments Tab</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setWorkerStep('overallView')}
                          className="w-full sm:w-auto px-6 py-2.5 bg-blue-700 hover:bg-blue-600 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-2"
                        >
                          <span>🧾 Overall View →</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── WORKER STEP 3: OVERALL VIEW (BILL FORMAT) ─────────────── */}
              {workerStep === 'overallView' && (
                <div className="space-y-6">

                  {/* Printable Bill Area */}
                  <div id="printable-seed-exchange-document" className="bg-white rounded-3xl p-8 border border-slate-200 shadow-2xl space-y-6 text-slate-800">

                    {/* Bill Title & Header */}
                    <div className="text-center border-b border-slate-200 pb-4 space-y-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                        OFFICIAL SEED EXCHANGE BILL
                      </span>
                      <h1 className="text-2xl font-black text-slate-900">SEED EXCHANGE &amp; TRANSFER STATEMENT</h1>
                      <div className="flex justify-center items-center gap-4 text-xs text-slate-600 font-mono font-bold pt-1">
                        <span>Date: {exchangeDate}</span>
                        {selectedBillsForView.length > 0 && (
                          <span className="text-blue-700">
                            Bill(s): {selectedBillsForView.map((b) => b.bill_number).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* BEFORE & AFTER SEED EXCHANGE STATUS AND TABLES FOR SELECTED BILLS */}
                    {selectedBillsForView.map((billItem, bIdx) => {
                      const fromBefore = billItem.from_tank_before || { name: billItem.from_tank_name, seed: fromTankInitialSeed, hatchery: 'Vizag Hatchery', doc: fromTankDoc, feed: fromTankInitialFeed };
                      const toBefore = billItem.to_tank_before || { name: billItem.to_tank_name, seed: toTankInitialSeed, hatchery: 'Bhimavaram Hatchery', doc: toTankDoc, feed: toTankInitialFeed };
                      const fromAfter = billItem.from_tank_after || { name: billItem.from_tank_name, seed: fromTankUpdatedSeed, hatchery: 'Vizag Hatchery', doc: fromTankDoc, feed: fromTankUpdatedFeed };
                      const toAfter = billItem.to_tank_after || { name: billItem.to_tank_after || billItem.to_tank_name, seed: toTankUpdatedSeed, hatchery: toTankHatcheryDisplay, doc: toTankDoc, feed: toTankUpdatedFeed };

                      const wRows = billItem.weighment_rows && billItem.weighment_rows.length > 0 ? billItem.weighment_rows : weighmentRows;
                      const cRows = billItem.count_rows && billItem.count_rows.length > 0 ? billItem.count_rows : computedCounts;
                      const totWt = billItem.total_weight_kg ?? grandTotalNetWeight;
                      const selCount = billItem.selected_count ?? selectedCountValue;
                      const totPcs = billItem.total_pieces ?? totalExchangedPieces;

                      return (
                        <div key={`status-${billItem.id || bIdx}`} className="space-y-4 pt-2 border-b border-slate-200 pb-6 last:border-b-0">
                          <div className="text-center border-b border-slate-100 pb-2">
                            <span className="font-extrabold text-xs text-blue-800 bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                              Exchange Details #{bIdx + 1}: {billItem.from_tank_name} → {billItem.to_tank_name} ({billItem.bill_number})
                            </span>
                          </div>

                          {/* BEFORE SEED EXCHANGE */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider text-center">
                              BEFORE SEED EXCHANGE STATUS
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-200 text-xs space-y-1">
                                <p className="font-black text-blue-900 text-sm">From Tank: {fromBefore.name}</p>
                                <p>Seed Qty: <span className="font-bold text-slate-900">{fromBefore.seed?.toLocaleString?.('en-IN') || fromBefore.seed}</span></p>
                                <p>Hatchery: <span className="font-bold text-slate-900">{fromBefore.hatchery || 'N/A'}</span></p>
                                <p>DOC: <span className="font-bold text-slate-900">{fromBefore.doc || 'N/A'} Days</span></p>
                                <p>Feed: <span className="font-bold text-slate-900">{fromBefore.feed || 0} kg</span></p>
                              </div>
                              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-1">
                                <p className="font-black text-slate-900 text-sm">To Tank: {toBefore.name}</p>
                                {Number(toBefore.seed || 0) > 0 ? (
                                  <>
                                    <p>Seed Qty: <span className="font-bold text-slate-900">{toBefore.seed?.toLocaleString?.('en-IN') || toBefore.seed}</span></p>
                                    <p>Hatchery: <span className="font-bold text-slate-900">{toBefore.hatchery || 'N/A'}</span></p>
                                    <p>DOC: <span className="font-bold text-slate-900">{toBefore.doc || 'N/A'} Days</span></p>
                                    <p>Feed: <span className="font-bold text-slate-900">{toBefore.feed || 0} kg</span></p>
                                  </>
                                ) : (
                                  <p className="font-extrabold text-slate-500 italic">Status: Empty Tank</p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* WEIGHMENT TABLE (Between Before & After Cards) */}
                          <div className={`space-y-2 pt-2 table-card-container break-inside-avoid page-break-inside-avoid ${!enableWeighmentTableInBill ? 'print:hidden' : ''}`}>
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">⚖️ Weighment Table</h4>
                              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 print:hidden select-none">
                                <input
                                  type="checkbox"
                                  checked={enableWeighmentTableInBill}
                                  onChange={(e) => setEnableWeighmentTableInBill(e.target.checked)}
                                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                                />
                                <span>Enable Table</span>
                              </label>
                            </div>
                            {enableWeighmentTableInBill && (
                              <div className="overflow-x-auto rounded-xl border border-slate-200">
                                <table className="w-full text-xs text-left">
                                  <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                                    <tr>
                                      <th className="p-2.5 w-14 text-center">S.No</th>
                                      <th className="p-2.5">Gross Weight (KG)</th>
                                      <th className="p-2.5 text-center">Nets Count</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-medium">
                                    {wRows.map((r, i) => (
                                      <tr key={i}>
                                        <td className="p-2.5 text-center text-slate-500 font-bold">{i + 1}</td>
                                        <td className="p-2.5 font-mono font-bold">{r.grossKg} KG</td>
                                        <td className="p-2.5 text-center font-mono">{r.nets || 1} net</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {/* COUNT TABLE (Between Before & After Cards) */}
                          <div className={`space-y-2 pt-2 table-card-container break-inside-avoid page-break-inside-avoid ${!enableCountTableInBill ? 'print:hidden' : ''}`}>
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">🔢 Count Table</h4>
                              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 print:hidden select-none">
                                <input
                                  type="checkbox"
                                  checked={enableCountTableInBill}
                                  onChange={(e) => setEnableCountTableInBill(e.target.checked)}
                                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                                />
                                <span>Enable Table</span>
                              </label>
                            </div>
                            {enableCountTableInBill && (
                              <div className="overflow-x-auto rounded-xl border border-slate-200">
                                <table className="w-full text-xs text-left">
                                  <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                                    <tr>
                                      <th className="p-2.5 w-14 text-center">S.No</th>
                                      <th className="p-2.5">Sample Wt (KG)</th>
                                      <th className="p-2.5">Total Pieces</th>
                                      <th className="p-2.5 text-right">Calculated Count</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-medium">
                                    {cRows.map((r, i) => (
                                      <tr key={i}>
                                        <td className="p-2.5 text-center text-slate-500 font-bold">{i + 1}</td>
                                        <td className="p-2.5 font-mono">{r.sampleKg} KG</td>
                                        <td className="p-2.5 font-mono">{r.totalPieces} pcs</td>
                                        <td className="p-2.5 text-right font-mono font-bold text-blue-700">
                                          {Number(r.calculatedCount || (r.sampleKg > 0 ? r.totalPieces / r.sampleKg : 0)).toFixed(2)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {/* 3 SUMMARY CARDS BELOW TABLES */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs pt-2">
                            <div className="rounded-2xl p-4 bg-slate-50 border border-slate-200">
                              <span className="text-[10px] font-extrabold text-slate-500 uppercase block font-sans">Total Weight</span>
                              <span className="text-xl font-black text-slate-900 mt-1 block">
                                {Number(totWt || 0).toFixed(2)} KG
                              </span>
                            </div>
                            <div className="rounded-2xl p-4 bg-blue-50 border border-blue-200">
                              <span className="text-[10px] font-extrabold text-blue-700 uppercase block font-sans">Selected Count</span>
                              <span className="text-xl font-black text-blue-900 mt-1 block">
                                {Number(selCount || 0).toFixed(2)}
                              </span>
                            </div>
                            <div className="rounded-2xl p-4 bg-emerald-50 border border-emerald-200">
                              <span className="text-[10px] font-extrabold text-emerald-700 uppercase block font-sans">Seed Exchange (Weight * Count)</span>
                              <span className="text-xl font-black text-emerald-900 mt-1 block">
                                {totPcs?.toLocaleString?.('en-IN') || totPcs}
                              </span>
                            </div>
                          </div>

                          {/* AFTER SEED EXCHANGE */}
                          <div className="space-y-2 pt-2">
                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider text-center">
                              AFTER SEED EXCHANGE UPDATED STATUS
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-1">
                                <p className="font-black text-slate-900 text-sm">From Tank: {fromAfter.name}</p>
                                <p>Remaining Seed: <span className="font-bold text-slate-900">{fromAfter.seed?.toLocaleString?.('en-IN') || fromAfter.seed}</span></p>
                                <p>Hatchery: <span className="font-bold text-slate-900">{fromAfter.hatchery || 'N/A'}</span></p>
                                <p>DOC: <span className="font-bold text-slate-900">{fromAfter.doc || 'N/A'} Days</span></p>
                                <p>Updated Feed: <span className="font-bold text-slate-900">{Number(fromAfter.feed || 0).toFixed?.(1) || fromAfter.feed} kg</span></p>
                              </div>
                              <div className="bg-emerald-50/80 p-4 rounded-2xl border border-emerald-200 text-xs space-y-1">
                                <p className="font-black text-emerald-900 text-sm">To Tank: {toAfter.name}</p>
                                <p>Updated Seed: <span className="font-extrabold text-emerald-800">{toAfter.seed?.toLocaleString?.('en-IN') || toAfter.seed}</span></p>
                                <p>Hatchery Info: <span className="font-bold text-slate-900">{toAfter.hatchery || 'N/A'}</span></p>
                                <p>DOC: <span className="font-bold text-slate-900">{toAfter.doc || 'N/A'} Days</span></p>
                                <p>Updated Feed: <span className="font-bold text-slate-900">{Number(toAfter.feed || 0).toFixed?.(1) || toAfter.feed} kg</span></p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* WORKER WAGES TABLE */}
                    <div className={`space-y-2 pt-2 table-card-container break-inside-avoid page-break-inside-avoid ${!enableWorkerTableInBill ? 'print:hidden' : ''}`}>
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">👷 Worker Categories &amp; Wages Summary</h4>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 print:hidden select-none">
                          <input
                            type="checkbox"
                            checked={enableWorkerTableInBill}
                            onChange={(e) => setEnableWorkerTableInBill(e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                          />
                          <span>Enable Table</span>
                        </label>
                      </div>

                      {enableWorkerTableInBill && (
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                              <tr>
                                <th className="p-2.5">Harvest Batch / Category</th>
                                <th className="p-2.5 text-center">Quantity</th>
                                <th className="p-2.5 text-right">Amount / Each (₹)</th>
                                <th className="p-2.5 text-right">Total Amount (₹)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {wagesRows.map((row) => {
                                const tot = (Number(row.qty) || 0) * (Number(row.amount) || 0);
                                return (
                                  <tr key={row.id}>
                                    <td className="p-2.5 font-bold text-slate-900">{row.category}</td>
                                    <td className="p-2.5 text-center font-mono">{row.qty}</td>
                                    <td className="p-2.5 text-right font-mono">₹{row.amount}</td>
                                    <td className="p-2.5 text-right font-mono font-bold text-emerald-700">₹{tot.toLocaleString('en-IN')}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-slate-100 font-extrabold text-xs">
                              <tr>
                                <td colSpan={3} className="p-2.5 uppercase">Worker Wages Total:</td>
                                <td className="p-2.5 text-right font-mono text-emerald-800 font-black text-sm">
                                  ₹{workerTotalAmount.toLocaleString('en-IN')}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Supervisor Details & Digital Signature */}
                    <div className="pt-4 border-t border-slate-200 space-y-4 break-inside-avoid page-break-inside-avoid">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">✍️ Supervisor Sign &amp; Details</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">1. Supervisor Name</label>
                          <input
                            type="text"
                            placeholder="Enter supervisor name"
                            value={supervisorName}
                            onChange={(e) => setSupervisorName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">2. Phone Number</label>
                          <input
                            type="tel"
                            placeholder="Enter phone number"
                            value={supervisorPhone}
                            onChange={(e) => setSupervisorPhone(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">3. Digital Signature</label>
                          <SignaturePad value={supervisorSignature} onChange={setSupervisorSignature} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Buttons */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 print:hidden">
                    <button
                      type="button"
                      onClick={() => setWorkerStep('workerDetails')}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                    >
                      ← Back to Worker Payments
                    </button>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleGenerateBill}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-md"
                      >
                        ⚡ Generate Bill
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadBillPDF}
                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-md"
                      >
                        📥 Download Bill
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SUB TAB 2: OVERALL REPORT                                           */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {mainSubTab === 'reports' && (
        <div className="space-y-6">
          
          {/* Search Functionality Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card flex flex-col md:flex-row items-center justify-between gap-3 print:hidden">
            <div className="flex flex-wrap items-center gap-3">
              {/* Date Search */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-300">
                <span className="text-xs font-bold text-slate-700">📅 Search by Date:</span>
                <input
                  type="date"
                  value={searchReportDate}
                  onChange={(e) => setSearchReportDate(e.target.value)}
                  className="bg-white text-slate-900 font-mono text-xs p-1 rounded-lg border border-slate-300 focus:outline-none"
                />
              </div>

              {/* Bill Number Search */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-300">
                <span className="text-xs font-bold text-slate-700">🧾 Search by Bill #:</span>
                <input
                  type="text"
                  placeholder="e.g. SEX2026..."
                  value={searchReportBillNo}
                  onChange={(e) => setSearchReportBillNo(e.target.value)}
                  className="bg-white text-slate-900 font-mono text-xs px-2 py-1 rounded-lg border border-slate-300 focus:outline-none w-40"
                />
              </div>
            </div>

            {(searchReportDate || searchReportBillNo) && (
              <button
                type="button"
                onClick={() => {
                  setSearchReportDate('');
                  setSearchReportBillNo('');
                }}
                className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200"
              >
                Clear Search
              </button>
            )}
          </div>

          {/* Overall Report Ledger Table */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card space-y-4 print:hidden">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>📊</span> Overall Seed Exchange Reports Ledger ({filteredReportsLedger.length})
            </h3>

            {filteredReportsLedger.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                No matching seed exchange bills found in archive.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">1. Bill Number</th>
                      <th className="p-3">2. Date</th>
                      <th className="p-3">3. From Tank</th>
                      <th className="p-3">4. To Tank</th>
                      <th className="p-3 text-right">5. Seed Quantity</th>
                      <th className="p-3 text-center">6. Status</th>
                      <th className="p-3 text-center">7. Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-medium text-slate-800">
                    {filteredReportsLedger.map((b) => (
                      <tr key={b.id || b.bill_number} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-extrabold text-blue-700">{b.bill_number}</td>
                        <td className="p-3 font-mono text-slate-500">{b.date}</td>
                        <td className="p-3 font-bold text-slate-900">{b.from_tank_name}</td>
                        <td className="p-3 font-bold text-slate-900">{b.to_tank_name}</td>
                        <td className="p-3 text-right font-mono font-black text-emerald-700">
                          {/* Requirement 3: Remove "PL" term */}
                          {b.total_pieces?.toLocaleString?.('en-IN') || b.total_pieces}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase">
                            {b.status || 'Saved'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => setViewingReportModal(b)}
                            className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[11px] font-extrabold hover:bg-slate-800 transition"
                          >
                            👁️ View / Download Bill
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Requirement 9: Full Bill Modal with Print PDF capability */}
      {viewingReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:static print:p-0 print:m-0 print:bg-white print:overflow-visible print:block print:w-full print:max-w-none print:h-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden my-auto border border-slate-200 print:shadow-none print:border-none print:w-full print:max-w-none print:overflow-visible print:block print:m-0 print:p-0 print:rounded-none print:h-auto">
            
            {/* Modal Header */}
            <div className="bg-slate-900 p-4 text-white flex items-center justify-between print:hidden">
              <span className="font-extrabold text-sm">Official Seed Exchange Bill #{viewingReportModal.bill_number}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const originalTitle = document.title;
                    document.title = '';
                    window.print();
                    document.title = originalTitle;
                  }}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-xl shadow-sm transition"
                >
                  🖨️ Download PDF / Print
                </button>
                <button
                  type="button"
                  onClick={() => setViewingReportModal(null)}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center justify-center text-sm transition"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Printable Full Bill Body */}
            <div id="printable-report-modal-document" className="p-8 space-y-6 text-slate-800 bg-white print:p-0 print:m-0 print:space-y-4">
              <div className="text-center border-b border-slate-200 pb-4 space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  OFFICIAL SEED EXCHANGE STATEMENT
                </span>
                <h1 className="text-2xl font-black text-slate-900">SEED EXCHANGE BILL DETAILS</h1>
                <p className="text-xs text-slate-600 font-mono font-bold">
                  Bill #: {viewingReportModal.bill_number} | Date: {viewingReportModal.date}
                </p>
              </div>

              {/* Before Exchange Status */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider text-center">BEFORE SEED EXCHANGE</h4>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-200 space-y-1">
                    <p className="font-black text-blue-900 text-sm">From Tank: {viewingReportModal.from_tank_name}</p>
                    <p>Seed Qty: <span className="font-bold text-slate-900">{viewingReportModal.from_tank_before?.seed?.toLocaleString?.('en-IN') || 'N/A'}</span></p>
                    <p>Hatchery: <span className="font-bold text-slate-900">{viewingReportModal.from_tank_before?.hatchery || 'N/A'}</span></p>
                    <p>DOC: <span className="font-bold text-slate-900">{viewingReportModal.from_tank_before?.doc || 'N/A'} Days</span></p>
                    <p>Feed: <span className="font-bold text-slate-900">{viewingReportModal.from_tank_before?.feed || 0} kg</span></p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1">
                    <p className="font-black text-slate-900 text-sm">To Tank: {viewingReportModal.to_tank_name}</p>
                    <p>Seed Qty: <span className="font-bold text-slate-900">{viewingReportModal.to_tank_before?.seed?.toLocaleString?.('en-IN') || 0}</span></p>
                    <p>Hatchery: <span className="font-bold text-slate-900">{viewingReportModal.to_tank_before?.hatchery || 'N/A'}</span></p>
                    <p>DOC: <span className="font-bold text-slate-900">{viewingReportModal.to_tank_before?.doc || 'N/A'} Days</span></p>
                    <p>Feed: <span className="font-bold text-slate-900">{viewingReportModal.to_tank_before?.feed || 0} kg</span></p>
                  </div>
                </div>
              </div>

              {/* Weighment Table */}
              {viewingReportModal.enable_weighment !== false && viewingReportModal.weighment_rows && viewingReportModal.weighment_rows.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">⚖️ Weighment Table</h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                        <tr>
                          <th className="p-2.5">S.No</th>
                          <th className="p-2.5">Gross Weight (KG)</th>
                          <th className="p-2.5 text-center">Nets Count</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {viewingReportModal.weighment_rows.map((r, i) => (
                          <tr key={i}>
                            <td className="p-2.5 text-slate-500 font-bold">{i + 1}</td>
                            <td className="p-2.5 font-mono font-bold">{r.grossKg} KG</td>
                            <td className="p-2.5 text-center font-mono">{r.nets} net</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Count Table */}
              {viewingReportModal.enable_count !== false && viewingReportModal.count_rows && viewingReportModal.count_rows.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">🔢 Count Table</h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                        <tr>
                          <th className="p-2.5">S.No</th>
                          <th className="p-2.5">Sample Wt (KG)</th>
                          <th className="p-2.5">Total Pieces</th>
                          <th className="p-2.5 text-right">Calculated Count</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {viewingReportModal.count_rows.map((r, i) => (
                          <tr key={i}>
                            <td className="p-2.5 text-slate-500">{i + 1}</td>
                            <td className="p-2.5 font-mono">{r.sampleKg} KG</td>
                            <td className="p-2.5 font-mono">{r.totalPieces} pcs</td>
                            <td className="p-2.5 text-right font-mono font-bold text-blue-700">
                              {Number(r.calculatedCount || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                <div className="rounded-2xl p-4 bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase block font-sans">Total Weight</span>
                  <span className="text-xl font-black text-slate-900 mt-1 block">
                    {Number(viewingReportModal.total_weight_kg || 0).toFixed(2)} KG
                  </span>
                </div>
                <div className="rounded-2xl p-4 bg-blue-50 border border-blue-200">
                  <span className="text-[10px] font-extrabold text-blue-700 uppercase block font-sans">Selected Count</span>
                  <span className="text-xl font-black text-blue-900 mt-1 block">
                    {Number(viewingReportModal.selected_count || 0).toFixed(2)}
                  </span>
                </div>
                <div className="rounded-2xl p-4 bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] font-extrabold text-emerald-700 uppercase block font-sans">Seed Exchange (Weight * Count)</span>
                  <span className="text-xl font-black text-emerald-900 mt-1 block">
                    {viewingReportModal.total_pieces?.toLocaleString?.('en-IN') || viewingReportModal.total_pieces}
                  </span>
                </div>
              </div>

              {/* After Exchange Status */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider text-center">AFTER SEED EXCHANGE UPDATED STATUS</h4>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1">
                    <p className="font-black text-slate-900 text-sm">From Tank: {viewingReportModal.from_tank_name}</p>
                    <p>Remaining Seed: <span className="font-bold text-slate-900">{viewingReportModal.from_tank_after?.seed?.toLocaleString?.('en-IN') || 'N/A'}</span></p>
                    <p>Updated Feed: <span className="font-bold text-slate-900">{viewingReportModal.from_tank_after?.feed || 0} kg</span></p>
                  </div>
                  <div className="bg-emerald-50/80 p-4 rounded-2xl border border-emerald-200 space-y-1">
                    <p className="font-black text-emerald-900 text-sm">To Tank: {viewingReportModal.to_tank_name}</p>
                    <p>Updated Seed: <span className="font-extrabold text-emerald-800">{viewingReportModal.to_tank_after?.seed?.toLocaleString?.('en-IN') || 'N/A'}</span></p>
                    <p>Hatchery Info: <span className="font-bold text-slate-900">{viewingReportModal.to_tank_after?.hatchery || 'N/A'}</span></p>
                    <p>Updated Feed: <span className="font-bold text-slate-900">{viewingReportModal.to_tank_after?.feed || 0} kg</span></p>
                  </div>
                </div>
              </div>

              {/* Worker Payment Summary if present */}
              {viewingReportModal.enable_worker !== false && viewingReportModal.wages_rows && viewingReportModal.wages_rows.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">👷 Worker Categories &amp; Wages Summary</h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px]">
                        <tr>
                          <th className="p-2.5">Category</th>
                          <th className="p-2.5 text-center">Qty</th>
                          <th className="p-2.5 text-right">Amount (₹)</th>
                          <th className="p-2.5 text-right">Total (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {viewingReportModal.wages_rows.map((row, i) => {
                          const tot = (Number(row.qty) || 0) * (Number(row.amount) || 0);
                          return (
                            <tr key={i}>
                              <td className="p-2.5 font-bold text-slate-900">{row.category}</td>
                              <td className="p-2.5 text-center font-mono">{row.qty}</td>
                              <td className="p-2.5 text-right font-mono">₹{row.amount}</td>
                              <td className="p-2.5 text-right font-mono font-bold text-emerald-700">₹{tot.toLocaleString('en-IN')}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Supervisor Details & Digital Signature */}
              <div className="pt-4 border-t border-slate-200 text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 break-inside-avoid page-break-inside-avoid">
                <div>
                  <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-wider mb-1">✍️ Supervisor Sign &amp; Details</h4>
                  <p className="font-bold text-slate-900">Supervisor: {viewingReportModal.supervisor_name || supervisorName || 'Site Supervisor'}</p>
                  <p className="text-slate-500">Phone: {viewingReportModal.supervisor_phone || supervisorPhone || 'N/A'}</p>
                </div>
                {(viewingReportModal.supervisor_signature || supervisorSignature) ? (
                  <div className="text-right">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Digital Signature</span>
                    <img src={viewingReportModal.supervisor_signature || supervisorSignature} alt="Signature" className="h-10 border border-slate-200 rounded p-1 inline-block bg-white" />
                  </div>
                ) : (
                  <div className="text-right">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase block font-mono border-b border-slate-300 pb-1 w-32">Authorized Sign</span>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
