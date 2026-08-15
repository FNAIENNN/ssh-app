import { useState, useMemo, useEffect } from 'react';
import SignaturePad from './SignaturePad';
import { useToast } from '../../../../hooks/useToast';
import { supabase, TABLES } from '../../../../lib/supabaseClient';

const WORKER_ROWS = [
  { sNo: 1, category: 'Workers' },
  { sNo: 2, category: 'Bike' },
  { sNo: 3, category: 'Auto' },
  { sNo: 4, category: 'Beta' },
  { sNo: 5, category: 'Others' },
];

export default function OutsideWorkersStep3({
  initialStep3Data = null,
  initialSupervisorName = '',
  initialSupervisorPhone = '',
  siteId = null,
  activeOrder = null,
  onComplete,
  onBack = null,
  onSaveState = null,
}) {
  const toast = useToast();

  const [suppliers, setSuppliers] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);

  // Data State
  const [selectedSupplierId, setSelectedSupplierId] = useState(initialStep3Data?.selectedSupplierId || '');
  const [selectedSupplier, setSelectedSupplier] = useState(initialStep3Data?.selectedSupplier || null);

  const [tableData, setTableData] = useState(() =>
    initialStep3Data?.tableData || WORKER_ROWS.map((r) => ({
      ...r,
      quantity: '',
      amount: '',
    }))
  );

  const [paymentMethod, setPaymentMethod] = useState(initialStep3Data?.paymentMethod || 'upi'); // 'upi' or 'bank'
  const [upiId, setUpiId] = useState(initialStep3Data?.upiId || '');
  const [owBankHolderName, setOwBankHolderName] = useState(initialStep3Data?.owBankHolderName || '');
  const [owBankAccountNumber, setOwBankAccountNumber] = useState(initialStep3Data?.owBankAccountNumber || '');
  const [owBankIfsc, setOwBankIfsc] = useState(initialStep3Data?.owBankIfsc || '');
  const [owBankName, setOwBankName] = useState(initialStep3Data?.owBankName || '');
  const [remarks, setRemarks] = useState(initialStep3Data?.remarks || '');
  const [mestriName, setMestriName] = useState(initialStep3Data?.mestriName || '');
  const [mestriPhone, setMestriPhone] = useState(initialStep3Data?.mestriPhone || '');
  const [mestriSignature, setMestriSignature] = useState(initialStep3Data?.mestriSignature || null);
  
  const [submitting, setSubmitting] = useState(false);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);

  // Add Supplier State
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [newSupplierForm, setNewSupplierForm] = useState({
    supplierName: '',
    holderName: '',
    accountNumber: '',
    ifsc: '',
    bankName: ''
  });

  const [selectedBankAccountId, setSelectedBankAccountId] = useState('');
  const [submittedPayments, setSubmittedPayments] = useState([]);
  const [showPaymentSummary, setShowPaymentSummary] = useState(false);

  useEffect(() => {
    if (!activeOrder?.id) return;
    async function fetchPayments() {
      const { data } = await supabase
        .from(TABLES.payments)
        .select(`
          *,
          bank_accounts (
            account_number, holder_name, ifsc, bank_name
          ),
          labour_suppliers:supplier_id (
            name
          )
        `)
        .eq('bill_id', activeOrder.id)
        .eq('type', 'outside_worker')
        .order('created_at', { ascending: true });

      if (data) {
        // Manually fetch missing relations in case localClient join failed
        for (let p of data) {
          if (p.supplier_id && !p.labour_suppliers) {
            const { data: sup } = await supabase.from(TABLES.labourSuppliers).select('name').eq('id', p.supplier_id).maybeSingle();
            if (sup) p.labour_suppliers = sup;
          }
          if (p.bank_account_id && !p.bank_accounts) {
            const { data: bank } = await supabase.from(TABLES.bankAccounts).select('account_number, holder_name, ifsc, bank_name').eq('id', p.bank_account_id).maybeSingle();
            if (bank) p.bank_accounts = bank;
          }
        }
        setSubmittedPayments(data);
      }
    }
    fetchPayments();
  }, [activeOrder?.id]);

  // Expose current state for backing out
  useEffect(() => {
    if (onSaveState) {
      onSaveState({
        selectedSupplierId,
        selectedSupplier,
        tableData,
        paymentMethod,
        upiId,
        owBankHolderName,
        owBankAccountNumber,
        owBankIfsc,
        owBankName,
        remarks,
        mestriName,
        mestriPhone,
        mestriSignature,
      });
    }
  }, [
    selectedSupplierId, selectedSupplier, tableData, paymentMethod, upiId,
    owBankHolderName, owBankAccountNumber, owBankIfsc, owBankName,
    remarks, mestriName, mestriPhone, mestriSignature, onSaveState
  ]);

  // Fetch Suppliers
  useEffect(() => {
    async function loadSuppliers() {
      try {
        const [{ data: hatchData }, { data: lsData }] = await Promise.all([
          supabase.from(TABLES.hatcheries).select('id, name, phone'),
          supabase.from(TABLES.labourSuppliers).select('id, name, phone, type')
        ]);
        
        const combined = [];
        const seen = new Set();
        
        (hatchData || []).forEach(h => {
          if (!h.name) return;
          const key = String(h.name).trim().toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            combined.push({ ...h, source_table: 'hatcheries' });
          }
        });
        (lsData || []).forEach(ls => {
          if (!ls.name) return;
          const key = String(ls.name).trim().toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            combined.push({ ...ls, source_table: 'labour_suppliers' });
          }
        });
        
        // Sort alphabetically
        combined.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setSuppliers(combined);
      } catch (err) {
        console.error('Error fetching suppliers:', err);
      }
    }
    loadSuppliers();
  }, []);

  // Fetch Bank Accounts for selected supplier
  useEffect(() => {
    async function loadBankAccounts() {
      if (!selectedSupplierId || !selectedSupplier) {
        setBankAccounts([]);
        setOwBankHolderName('');
        setOwBankAccountNumber('');
        setOwBankIfsc('');
        setOwBankName('');
        return;
      }
      try {
        let fetchedAccounts = [];
        if (selectedSupplier.source_table === 'hatcheries') {
          const { data } = await supabase.from(TABLES.hatcheryBankAccounts).select('*').eq('hatchery_id', selectedSupplier.id);
          fetchedAccounts = data || [];
        } else {
          // Check bank accounts matching holder_name close to supplier name OR user_id = supplier.id
          const { data } = await supabase.from(TABLES.bankAccounts)
            .select('*')
            .or(`holder_name.ilike.%${selectedSupplier.name}%,user_id.eq.${selectedSupplier.id}`);
          fetchedAccounts = data || [];
        }
        // Ensure unique bank accounts by account number
        const uniqueAccounts = [];
        const seen = new Set();
        for (const acc of fetchedAccounts) {
           if (!seen.has(acc.account_number)) {
              seen.add(acc.account_number);
              uniqueAccounts.push(acc);
           }
        }

        setBankAccounts(uniqueAccounts);

        // Auto-select the first one if none is selected
        if (uniqueAccounts.length > 0) {
          const acc = uniqueAccounts[0];
          setSelectedBankAccountId(acc.id);
          setOwBankHolderName(acc.holder_name || '');
          setOwBankAccountNumber(acc.account_number || '');
          setOwBankIfsc(acc.ifsc || '');
          setOwBankName(acc.bank_name || '');
        } else {
          setSelectedBankAccountId('');
          setOwBankHolderName('');
          setOwBankAccountNumber('');
          setOwBankIfsc('');
          setOwBankName('');
        }
      } catch (err) {
        console.error('Error fetching banks:', err);
      }
    }
    loadBankAccounts();
  }, [selectedSupplierId, selectedSupplier]);

  function handleSelectBankAccount(acc) {
    setSelectedBankAccountId(acc.id);
    setOwBankHolderName(acc.holder_name || '');
    setOwBankAccountNumber(acc.account_number || '');
    setOwBankIfsc(acc.ifsc || '');
    setOwBankName(acc.bank_name || '');
  }

  function handleRowChange(index, field, value) {
    setTableData((prev) =>
      prev.map((r, idx) => (idx === index ? { ...r, [field]: value } : r))
    );
  }

  function removeRow(index) {
    setTableData((prev) => prev.filter((_, idx) => idx !== index));
  }

  function addRow() {
    setTableData((prev) => [
      ...prev,
      { sNo: prev.length + 1, category: '', quantity: '', amount: '' }
    ]);
  }

  const calculatedRows = useMemo(() => {
    return tableData.map((r) => {
      const q = Number(r.quantity) || 0;
      const a = Number(r.amount) || 0;
      return { ...r, total: q * a };
    });
  }, [tableData]);

  const grandTotal = useMemo(() => {
    return calculatedRows.reduce((sum, r) => sum + r.total, 0);
  }, [calculatedRows]);

  async function handleSaveSupplier() {
    const { supplierName, holderName, accountNumber, ifsc, bankName } = newSupplierForm;
    if (!supplierName.trim() || !holderName.trim() || !accountNumber.trim() || !ifsc.trim() || !bankName.trim()) {
      return toast.error('Please fill all supplier and bank details.');
    }

    setSavingSupplier(true);
    try {
      let targetSupplier = suppliers.find(s => (s.name || '').toLowerCase() === supplierName.trim().toLowerCase());

      if (!targetSupplier) {
        const { data: supData, error: supErr } = await supabase.from(TABLES.labourSuppliers).insert({
          site_id: siteId,
          name: supplierName.trim(),
          type: 'Outside Worker',
          created_at: new Date().toISOString()
        }).select();
        if (supErr) throw supErr;
        
        targetSupplier = Array.isArray(supData) ? supData[0] : supData;
        const supplierItem = { ...targetSupplier, source_table: 'labour_suppliers' };
        setSuppliers(prev => [...prev, supplierItem].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      }

      const { data: existingBanks, error: fetchBankErr } = await supabase
        .from(TABLES.bankAccounts)
        .select('*')
        .eq('user_id', targetSupplier.id);
      
      if (fetchBankErr) throw fetchBankErr;

      let newBank = null;
      let alreadyExists = false;

      if (existingBanks) {
        const duplicate = existingBanks.find(b => 
          b.account_number === accountNumber.trim() &&
// MISSING LINE 301
// MISSING LINE 302
// MISSING LINE 303
// MISSING LINE 304
// MISSING LINE 305
// MISSING LINE 306
// MISSING LINE 307
// MISSING LINE 308
// MISSING LINE 309
// MISSING LINE 310
// MISSING LINE 311
// MISSING LINE 312
// MISSING LINE 313
// MISSING LINE 314
// MISSING LINE 315
// MISSING LINE 316
// MISSING LINE 317
// MISSING LINE 318
// MISSING LINE 319
// MISSING LINE 320
// MISSING LINE 321
// MISSING LINE 322
// MISSING LINE 323
// MISSING LINE 324
// MISSING LINE 325
// MISSING LINE 326
// MISSING LINE 327
// MISSING LINE 328
// MISSING LINE 329
// MISSING LINE 330
// MISSING LINE 331
// MISSING LINE 332
// MISSING LINE 333
// MISSING LINE 334
// MISSING LINE 335
// MISSING LINE 336
// MISSING LINE 337
// MISSING LINE 338
// MISSING LINE 339
// MISSING LINE 340
// MISSING LINE 341
// MISSING LINE 342
// MISSING LINE 343
// MISSING LINE 344
// MISSING LINE 345
// MISSING LINE 346
// MISSING LINE 347
// MISSING LINE 348
// MISSING LINE 349
// MISSING LINE 350
// MISSING LINE 351
// MISSING LINE 352
// MISSING LINE 353
// MISSING LINE 354
// MISSING LINE 355
// MISSING LINE 356
// MISSING LINE 357
// MISSING LINE 358
// MISSING LINE 359
// MISSING LINE 360
// MISSING LINE 361
// MISSING LINE 362
// MISSING LINE 363
// MISSING LINE 364
// MISSING LINE 365
// MISSING LINE 366
// MISSING LINE 367
// MISSING LINE 368
// MISSING LINE 369
// MISSING LINE 370
// MISSING LINE 371
// MISSING LINE 372
// MISSING LINE 373
// MISSING LINE 374
// MISSING LINE 375
// MISSING LINE 376
// MISSING LINE 377
// MISSING LINE 378
// MISSING LINE 379
            bank_name: owBankName.trim(),
            created_at: new Date().toISOString()
          }).select();
          
          if (bankErr) throw bankErr;
          
          const newBank = Array.isArray(bankData) ? bankData[0] : bankData;
          finalBankAccountId = newBank.id;
          
          setBankAccounts(prev => [...prev, newBank]);
          setSelectedBankAccountId(newBank.id);
        }
      }

      const payload = {
        site_id: siteId,
        bill_id: activeOrder?.id || null,
        type: 'outside_worker',
        method: paymentMethod,
        amount: grandTotal,
        upi_id: paymentMethod === 'upi' ? upiId.trim() : null,
        bank_account_id: paymentMethod === 'bank' ? (finalBankAccountId || null) : null,
        supplier_id: selectedSupplierId, // Assuming payments table can store this or it's just meta
        supervisor_name: mestriName,
        supervisor_phone: mestriPhone,
        status: 'requested',
        created_at: new Date().toISOString(),
      };

      // Add the local mock data so it displays correctly immediately
      const mockBankAccount = paymentMethod === 'bank' ? { 
        account_number: owBankAccountNumber,
        holder_name: owBankHolderName,
        ifsc: owBankIfsc,
        bank_name: owBankName 
      } : null;
      
      const mockSupplier = { name: selectedSupplier?.name };

      const { data, error } = await supabase.from(TABLES.payments).insert(payload).select();
      if (error) {
        toast.error(error.message);
      } else {
        if (data && data[0]) {
          setSubmittedPayments(prev => [...prev, { 
            ...data[0], 
            bank_accounts: mockBankAccount,
            labour_suppliers: mockSupplier
          }]);
        }
        setPaymentSubmitted(true);
        setShowPaymentSummary(true);
        toast.success('Outside Workers payment request submitted successfully!');
      }
    } catch (err) {
      toast.error('Failed to submit payment request');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNext() {
    const hasWorkers = calculatedRows.some((r) => Number(r.quantity) > 0);
    if (!hasWorkers) return toast.error('Enter at least one worker row with a quantity greater than 0');
    if (!selectedSupplierId) return toast.error('Select Supplier Details');
    if (!mestriName.trim()) return toast.error('Enter Mestri Name');
    if (!mestriPhone.trim()) return toast.error('Enter Mestri Phone Number');
    if (!mestriSignature) return toast.error('Provide Mestri Digital Signature');

    setSubmitting(true);
    try {
      await onComplete({
        workers: calculatedRows,
        grandTotal,
        remarks,
        mestriName,
        mestriPhone,
        mestriSignature,
        upiId: paymentMethod === 'upi' ? upiId : null,
        owBankHolderName: paymentMethod === 'bank' ? owBankHolderName : null,
        owBankAccountNumber: paymentMethod === 'bank' ? owBankAccountNumber : null,
        owBankIfsc: paymentMethod === 'bank' ? owBankIfsc : null,
        owBankName: paymentMethod === 'bank' ? owBankName : null,
        paymentMethod,
        selectedSupplierId,
        selectedSupplierName: selectedSupplier?.name,
      });
    } catch (err) {
      toast.error(err?.message || 'Error submitting Outside Workers data');
      setSubmitting(false);
    }
  }


  return (
    <div className="card p-6 space-y-6 max-w-4xl mx-auto shadow-md border" style={{ borderColor: 'var(--color-primary)' }}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div>
            <h3 className="text-2xl font-black text-primary uppercase tracking-wide flex items-center gap-2">
// MISSING LINE 481
// MISSING LINE 482
// MISSING LINE 483
// MISSING LINE 484
// MISSING LINE 485
// MISSING LINE 486
// MISSING LINE 487
// MISSING LINE 488
// MISSING LINE 489
// MISSING LINE 490
// MISSING LINE 491
// MISSING LINE 492
// MISSING LINE 493
// MISSING LINE 494
// MISSING LINE 495
// MISSING LINE 496
// MISSING LINE 497
// MISSING LINE 498
// MISSING LINE 499
// MISSING LINE 500
// MISSING LINE 501
// MISSING LINE 502
// MISSING LINE 503
// MISSING LINE 504
// MISSING LINE 505
// MISSING LINE 506
// MISSING LINE 507
// MISSING LINE 508
// MISSING LINE 509
// MISSING LINE 510
// MISSING LINE 511
// MISSING LINE 512
// MISSING LINE 513
// MISSING LINE 514
// MISSING LINE 515
// MISSING LINE 516
// MISSING LINE 517
// MISSING LINE 518
// MISSING LINE 519
// MISSING LINE 520
// MISSING LINE 521
// MISSING LINE 522
// MISSING LINE 523
// MISSING LINE 524
// MISSING LINE 525
// MISSING LINE 526
// MISSING LINE 527
// MISSING LINE 528
// MISSING LINE 529
// MISSING LINE 530
// MISSING LINE 531
// MISSING LINE 532
// MISSING LINE 533
// MISSING LINE 534
// MISSING LINE 535
// MISSING LINE 536
// MISSING LINE 537
// MISSING LINE 538
// MISSING LINE 539
// MISSING LINE 540
// MISSING LINE 541
// MISSING LINE 542
// MISSING LINE 543
// MISSING LINE 544
// MISSING LINE 545
// MISSING LINE 546
// MISSING LINE 547
// MISSING LINE 548
// MISSING LINE 549
// MISSING LINE 550
// MISSING LINE 551
// MISSING LINE 552
// MISSING LINE 553
// MISSING LINE 554
// MISSING LINE 555
// MISSING LINE 556
// MISSING LINE 557
// MISSING LINE 558
// MISSING LINE 559
// MISSING LINE 560
// MISSING LINE 561
// MISSING LINE 562
// MISSING LINE 563
// MISSING LINE 564
// MISSING LINE 565
// MISSING LINE 566
// MISSING LINE 567
// MISSING LINE 568
// MISSING LINE 569
// MISSING LINE 570
// MISSING LINE 571
// MISSING LINE 572
// MISSING LINE 573
// MISSING LINE 574
// MISSING LINE 575
// MISSING LINE 576
// MISSING LINE 577
// MISSING LINE 578
// MISSING LINE 579
// MISSING LINE 580
// MISSING LINE 581
// MISSING LINE 582
// MISSING LINE 583
// MISSING LINE 584
// MISSING LINE 585
// MISSING LINE 586
// MISSING LINE 587
// MISSING LINE 588
// MISSING LINE 589
// MISSING LINE 590
// MISSING LINE 591
// MISSING LINE 592
// MISSING LINE 593
// MISSING LINE 594
// MISSING LINE 595
// MISSING LINE 596
// MISSING LINE 597
// MISSING LINE 598
// MISSING LINE 599
// MISSING LINE 600
// MISSING LINE 601
// MISSING LINE 602
// MISSING LINE 603
// MISSING LINE 604
// MISSING LINE 605
// MISSING LINE 606
// MISSING LINE 607
// MISSING LINE 608
// MISSING LINE 609
// MISSING LINE 610
// MISSING LINE 611
// MISSING LINE 612
// MISSING LINE 613
// MISSING LINE 614
// MISSING LINE 615
// MISSING LINE 616
// MISSING LINE 617
// MISSING LINE 618
// MISSING LINE 619
// MISSING LINE 620
// MISSING LINE 621
// MISSING LINE 622
// MISSING LINE 623
// MISSING LINE 624
// MISSING LINE 625
// MISSING LINE 626
// MISSING LINE 627
// MISSING LINE 628
// MISSING LINE 629
// MISSING LINE 630
// MISSING LINE 631
// MISSING LINE 632
// MISSING LINE 633
// MISSING LINE 634
// MISSING LINE 635
// MISSING LINE 636
// MISSING LINE 637
// MISSING LINE 638
// MISSING LINE 639
// MISSING LINE 640
// MISSING LINE 641
// MISSING LINE 642
// MISSING LINE 643
// MISSING LINE 644
// MISSING LINE 645
// MISSING LINE 646
// MISSING LINE 647
// MISSING LINE 648
// MISSING LINE 649
// MISSING LINE 650
// MISSING LINE 651
// MISSING LINE 652
// MISSING LINE 653
// MISSING LINE 654
// MISSING LINE 655
// MISSING LINE 656
// MISSING LINE 657
// MISSING LINE 658
// MISSING LINE 659
// MISSING LINE 660
// MISSING LINE 661
// MISSING LINE 662
// MISSING LINE 663
// MISSING LINE 664
// MISSING LINE 665
// MISSING LINE 666
// MISSING LINE 667
// MISSING LINE 668
// MISSING LINE 669
// MISSING LINE 670
// MISSING LINE 671
// MISSING LINE 672
// MISSING LINE 673
// MISSING LINE 674
// MISSING LINE 675
// MISSING LINE 676
// MISSING LINE 677
// MISSING LINE 678
// MISSING LINE 679
// MISSING LINE 680
// MISSING LINE 681
// MISSING LINE 682
// MISSING LINE 683
// MISSING LINE 684
// MISSING LINE 685
// MISSING LINE 686
// MISSING LINE 687
// MISSING LINE 688
// MISSING LINE 689
// MISSING LINE 690
// MISSING LINE 691
// MISSING LINE 692
// MISSING LINE 693
// MISSING LINE 694
// MISSING LINE 695
// MISSING LINE 696
// MISSING LINE 697
// MISSING LINE 698
// MISSING LINE 699
// MISSING LINE 700
// MISSING LINE 701
// MISSING LINE 702
// MISSING LINE 703
// MISSING LINE 704
// MISSING LINE 705
// MISSING LINE 706
// MISSING LINE 707
// MISSING LINE 708
// MISSING LINE 709
// MISSING LINE 710
// MISSING LINE 711
// MISSING LINE 712
// MISSING LINE 713
// MISSING LINE 714
// MISSING LINE 715
// MISSING LINE 716
// MISSING LINE 717
// MISSING LINE 718
// MISSING LINE 719
// MISSING LINE 720
// MISSING LINE 721
// MISSING LINE 722
// MISSING LINE 723
// MISSING LINE 724
// MISSING LINE 725
// MISSING LINE 726
// MISSING LINE 727
// MISSING LINE 728
// MISSING LINE 729
                  placeholder="Enter Account Holder Name"
                  value={owBankHolderName}
                  onChange={(e) => setOwBankHolderName(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label text-xs">Account Number *</label>
                <input
                  type="text"
                  className="field text-sm"
                  placeholder="Enter Account Number"
                  value={owBankAccountNumber}
                  onChange={(e) => setOwBankAccountNumber(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label text-xs">IFSC Code *</label>
                <input
                  type="text"
                  className="field text-sm"
                  placeholder="Enter IFSC Code"
                  value={owBankIfsc}
                  onChange={(e) => setOwBankIfsc(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label text-xs">Bank Name *</label>
                <input
                  type="text"
                  className="field text-sm"
                  placeholder="Enter Bank Name"
                  value={owBankName}
                  onChange={(e) => setOwBankName(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={handleSubmitRequest}
            disabled={submitting}
            className="btn-primary w-full text-sm font-extrabold py-3 shadow"
          >
            {submitting ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>

        <div className="mt-8 border-t pt-6 space-y-4">
          <h4 className="font-extrabold text-base text-primary">📑 Submitted Outside Worker Payments</h4>
          
          {submittedPayments.length > 0 ? (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 font-bold text-gray-700">Date</th>
                    <th className="px-3 py-2 font-bold text-gray-700">Source</th>
                    <th className="px-3 py-2 font-bold text-gray-700">Supplier</th>
                    <th className="px-3 py-2 font-bold text-gray-700">Mestri</th>
                    <th className="px-3 py-2 font-bold text-gray-700 text-right">Amount</th>
                    <th className="px-3 py-2 font-bold text-gray-700 text-center">Status</th>
                  </tr>
                </thead>
                    if (p.created_at) {
                      const dateObj = new Date(p.created_at);
                      const formattedDate = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
                      const formattedTime = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                    const isCompleted = p.status === 'completed';
                    const isRejected = p.status === 'rejected' || p.status === 'failed';
                    
                    const paymentIdStr = p.id ? p.id.split('-')[0].toUpperCase() : 'N/A';
                    const supplierName = p.labour_suppliers?.name || 'Unknown';
                    
                    let paymentDateTime = 'N/A';
                    if (p.created_at) {
                      const dateObj = new Date(p.created_at);
                      const formattedDate = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
                      const formattedTime = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                      paymentDateTime = `${formattedDate} ${formattedTime}`;
                    }
                    
                    return (
                      <tr key={p.id} className="border-t hover:bg-slate-50 transition" style={{ borderColor: 'var(--color-border)' }}>
                        <td className="p-2 font-medium text-slate-500 border-r text-[11px]" style={{ borderColor: 'var(--color-border)' }}>{paymentDateTime}</td>
                        <td className="p-2 font-bold text-slate-600 border-r text-[11px] text-center" style={{ borderColor: 'var(--color-border)' }}>
                          <span className="text-[10px] uppercase font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            {p.process || 'Seed Stocking'}
                          </span>
                        </td>
                        <td className="p-2 font-bold text-slate-700 border-r" style={{ borderColor: 'var(--color-border)' }}>{supplierName}</td>
                        <td className="p-2 font-bold text-slate-600 border-r text-xs" style={{ borderColor: 'var(--color-border)' }}>{p.supervisor_name || 'N/A'}</td>
                        <td className="p-2 font-extrabold text-primary border-r text-right" style={{ borderColor: 'var(--color-border)' }}>₹{Number(p.amount || 0).toLocaleString('en-IN')}</td>
                        <td className="p-2 font-bold capitalize text-center">
                          {isCompleted ? (
                            <span className="text-green-600">Completed</span>
                          ) : isRejected ? (
                            <span className="text-red-600">{p.status}</span>
                          ) : (
                            <span className="text-amber-600">{p.status === 'requested' ? 'Pending' : (p.status || 'Pending')}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {submittedPayments.filter(p => commonWorkSource === 'All' || p.process === commonWorkSource || (commonWorkSource === 'Seed Stocking' && !p.process)).length === 0 && (
                    <tr>
                      <td colSpan="6" className="px-3 py-4 text-center text-xs text-gray-500">
                        No workers found for {commonWorkSource}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      {/* REMARKS */}
      <div>
        <label className="field-label font-bold text-sm">REMARKS</label>
        <textarea
          rows={3}
          className="field text-sm mt-1"
          placeholder="Enter remarks or additional notes..."
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
      </div>

      {/* MESTRI DETAILS */}
      <div className="card p-5 space-y-4 border">
        <h4 className="font-extrabold text-base text-primary border-b pb-2 uppercase">✍️ Mestri Details</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="field-label">Mestri Name *</label>
            <input
              className="field text-sm"
              placeholder="Enter Mestri Name"
              value={mestriName}
              onChange={(e) => setMestriName(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Mestri Phone Number *</label>
            <input
              type="tel"
              className="field text-sm"
              placeholder="Enter Phone Number"
              value={mestriPhone}
              onChange={(e) => setMestriPhone(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="field-label">Mestri Signature *</label>
          <SignaturePad onSave={(sig) => setMestriSignature(sig)} value={mestriSignature} />
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleNext}
          disabled={submitting}
          className="btn-success flex-1 text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2"
        >
          <span>{submitting ? '⏳ Saving Bill…' : 'Save Bill'}</span>
          <span>💾</span>
        </button>
      </div>
    </div>
  );
}

