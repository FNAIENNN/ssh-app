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