import { useEffect, useMemo, useState } from 'react';
import { supabase, TABLES } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import LedgerTable, { StatusChip } from './LedgerTable';

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

export default function RequestPayment({
  type = 'seed',
  siteId,
  relatedTankId = null,
  relatedSectionId = null,
  onPaid,
  prefillAmount = null,
  billId = null,
  supplierSection = null,
  selectedHatchery = null,
  selectedHatcheryBankAccount = null,
  onHatcheryBankAccountAdded = null,
  totalOrderPrice = 0,
  // hideMachineIdBook: Machine ID Book column is already removed from both
  // Advance Cash and Advance Bank ledger tables. This prop is kept for API
  // compatibility with callers that pass it.
  hideMachineIdBook = false, // eslint-disable-line no-unused-vars
  workSource = null,
}) {
  const { user } = useAuth();
  const toast = useToast();

  // ── Cash flow state ────────────────────────────────────────────────────
  const [enableCash, setEnableCash] = useState(false);
  const [cashBalance, setCashBalance] = useState(50000); // available
  const [showBalance, setShowBalance] = useState(false);
  const cashLimit = 25000; // HOD limit
  const [cashAmount, setCashAmount] = useState('');
  const [cashTxns, setCashTxns] = useState([]);

  // ── Advance flow state ─────────────────────────────────────────────────
  const [enableAdvance, setEnableAdvance] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceMode, setAdvanceMode] = useState('upi'); // 'upi' | 'bank'
  const [showSavedUpi, setShowSavedUpi] = useState(false);
  const [entryMethod, setEntryMethod] = useState(null); // 'manual' | 'photo' | 'voice'
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [selectedBankId, setSelectedBankId] = useState(null);
  const [bankForm, setBankForm] = useState({ ifsc: '', accountNumber: '', bankName: '', holderName: '', upiId: '' });
  
  // Photo & Voice Entry state
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);

  const [advanceTxns, setAdvanceTxns] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [banks, setBanks] = useState([]);
  const [submitted, setSubmitted] = useState(false);

  const amount = Number(cashAmount) || 0;
  const advAmount = Number(advanceAmount) || 0;

  const totalCashRequested = useMemo(() => {
    return cashTxns.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [cashTxns]);

  const totalAdvanceRequested = useMemo(() => {
    return advanceTxns.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [advanceTxns]);

  const sharedRemainingBalance = useMemo(() => {
    if (!totalOrderPrice) return null;
    return totalOrderPrice - (totalCashRequested + amount) - (totalAdvanceRequested + advAmount);
  }, [totalOrderPrice, totalCashRequested, totalAdvanceRequested, amount, advAmount]);

  const isExceedingTotal = sharedRemainingBalance !== null && sharedRemainingBalance < 0;

  // Do not auto-fill payment amounts per requirement #3 (keep empty for manual entry)
  useEffect(() => {
    setCashAmount('');
    setAdvanceAmount('');
  }, [prefillAmount]);

  // Update bankForm when selectedHatcheryBankAccount changes
  useEffect(() => {
    if (selectedHatcheryBankAccount) {
      setSelectedBankId(selectedHatcheryBankAccount.id);
      setBankForm((f) => ({
        ...f,
        bankName: selectedHatcheryBankAccount.bank_name || '',
        accountNumber: selectedHatcheryBankAccount.account_number || '',
        ifsc: selectedHatcheryBankAccount.ifsc_code || selectedHatcheryBankAccount.ifsc || '',
        holderName: selectedHatcheryBankAccount.holder_name || selectedHatchery?.holder_name || '',
      }));
      setAdvanceMode('bank');
      setEntryMethod('manual');
    } else {
      setSelectedBankId(null);
      setBankForm((f) => ({
        ...f,
        bankName: '',
        accountNumber: '',
        ifsc: '',
        holderName: '',
      }));
    }
  }, [selectedHatcheryBankAccount, selectedHatchery]);

  // ── Data loading ──
  useEffect(() => {
    if (!siteId) return;
    (async () => {
      const { data: txns } = await supabase
        .from(TABLES.payments)
        .select('*')
        .eq('site_id', siteId)
        .eq('type', type)
        .order('created_at', { ascending: false });

      const billTxns = billId ? (txns ?? []).filter(t => t.bill_id === billId) : (txns ?? []);
      setCashTxns(billTxns.filter((t) => t.method === 'cash'));
      setAdvanceTxns(billTxns.filter((t) => t.method === 'advance'));
    })();
  }, [siteId, type, billId]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: a } = await supabase
        .from(TABLES.paymentAccounts)
        .select('*')
        .eq('user_id', user.id)
        .order('is_primary', { ascending: false });
      const { data: b } = await supabase
        .from(TABLES.bankAccounts)
        .select('*')
        .order('created_at', { ascending: false });
      setAccounts(a ?? []);
      setBanks(b ?? []);
    })();
  }, [user]);

  // ── Cash validation ──
  const cashValidation = useMemo(() => {
    if (!cashAmount) {
      return { kind: 'info', text: `Balance after payment: ₹${cashBalance.toLocaleString('en-IN')}` };
    }
    if (isExceedingTotal) {
      return { kind: 'danger', text: `Total payment exceeds bill amount by ₹${Math.abs(sharedRemainingBalance).toLocaleString('en-IN')}` };
    }
    if (amount > cashLimit) {
      return {
        kind: 'danger',
        text: `Exceeds HOD limit of ₹${cashLimit.toLocaleString('en-IN')}. Please reduce or request advance.`,
      };
    }
    if (amount > cashBalance) {
      return { kind: 'danger', text: `Insufficient cash balance (avail: ₹${cashBalance.toLocaleString('en-IN')}).` };
    }
    return { kind: 'success', text: `Valid. Balance after payment: ₹${(cashBalance - amount).toLocaleString('en-IN')}` };
  }, [cashAmount, amount, cashBalance, cashLimit, isExceedingTotal, sharedRemainingBalance]);

  // ── Actions ──
  async function proceedCash() {
    if (amount <= 0 || amount > cashLimit || amount > cashBalance) {
      toast.error('Fix the cash amount before proceeding');
      return;
    }
    if (isExceedingTotal) {
      toast.error('Combined payment exceeds total bill amount');
      return;
    }
    const payload = {
      site_id: siteId,
      type,
      method: 'cash',
      amount,
      status: 'requested', // Submit request to payments module (Requirement #5)
      remaining_balance: sharedRemainingBalance,
      related_tank_id: relatedTankId,
      related_section_id: relatedSectionId,
      bill_id: billId,
      created_by: user?.id,
      note: workSource ? `Work Source: ${workSource}` : null,
    };
    const { data: rows, error } = await supabase.from(TABLES.payments).insert(payload).select();
    if (error) {
      toast.error(error.message);
      return;
    }
    const data = (Array.isArray(rows) ? rows[0] : rows) || { id: payload.bill_id || `pay-${Date.now()}`, ...payload };
    setCashTxns((prev) => [data, ...prev]);
    setCashBalance((b) => b - amount);
    setCashAmount('');
    toast.success('Advance Cash request submitted to Payments module!');
    onPaid?.(data);
  }

  async function editCash(txn) {
    const next = prompt('Edit cash amount (₹):', txn.amount);
    if (!next) return;
    const amt = Number(next);
    if (!amt || amt <= 0) return toast.error('Invalid amount');
    const { data: rows, error } = await supabase
      .from(TABLES.payments)
      .update({ amount: amt })
      .eq('id', txn.id)
      .select();
    if (error) return toast.error(error.message);
    const data = (Array.isArray(rows) ? rows[0] : rows) || { ...txn, amount: amt };
    setCashTxns((prev) => prev.map((t) => (t.id === txn.id ? data : t)));
    toast.success('Amount updated');
  }

  function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
      toast.success(`Passbook photo attached: ${file.name}`);
    }
  }

  function handleVoiceRecording() {
    if (!isRecording) {
      setIsRecording(true);
      toast.info('Voice recording started... speak bank details');
      setTimeout(() => {
        setIsRecording(false);
        setAudioUrl('demo_voice_recording.webm');
        toast.success('Voice recording saved successfully!');
      }, 3000);
    } else {
      setIsRecording(false);
      setAudioUrl('demo_voice_recording.webm');
      toast.success('Voice recording saved successfully!');
    }
  }

  async function submitAdvance() {
    if (advAmount <= 0) return toast.error('Enter an advance amount');
    if (isExceedingTotal) return toast.error('Combined payment exceeds total bill amount');
    let bankAccountId = selectedBankId || selectedHatcheryBankAccount?.id || null;
    let upiIdVal = null;

    if (advanceMode === 'upi') {
      const upiField = bankForm.upiId?.trim() || '';
      if (!upiField && !selectedAccountId) return toast.error('Enter a UPI ID');
      upiIdVal = upiField || (accounts.find(a => a.id === selectedAccountId)?.upi_id);
    } else {
      if (entryMethod === 'manual') {
        if (!bankForm.accountNumber || !bankForm.ifsc) {
          return toast.error('Enter account number and IFSC code');
        }

        // Deduplication check for existing bank account (Requirement #9)
        const existingBank = banks.find(
          (b) =>
            b.account_number?.trim() === bankForm.accountNumber.trim() &&
            (b.ifsc?.trim() === bankForm.ifsc.trim() || b.ifsc_code?.trim() === bankForm.ifsc.trim())
        );

        if (existingBank) {
          bankAccountId = existingBank.id;
          toast.info(`Using existing saved bank account: ${existingBank.bank_name || 'Bank Account'}`);
        } else {
          // Save bank account associated with current hatchery if selected
          if (selectedHatchery) {
            const { data: savedHatcheryBank } = await supabase.from(TABLES.hatcheryBankAccounts).insert({
              hatchery_id: selectedHatchery.id,
              bank_name: bankForm.bankName || 'Bank Account',
              account_number: bankForm.accountNumber,
              ifsc_code: bankForm.ifsc,
              holder_name: bankForm.holderName || selectedHatchery.holder_name || '',
            }).select();
            if (savedHatcheryBank?.[0]) {
              bankAccountId = savedHatcheryBank[0].id;
              onHatcheryBankAccountAdded?.(savedHatcheryBank[0]);
            }
          }
          // Also save in general bank accounts list
          const { data: savedBank } = await supabase.from(TABLES.bankAccounts).insert({
            user_id: user?.id,
            bank_name: bankForm.bankName || 'Bank Account',
            account_number: bankForm.accountNumber,
            ifsc: bankForm.ifsc,
            holder_name: bankForm.holderName || '',
          }).select();
          if (savedBank?.[0]) {
            if (!bankAccountId) bankAccountId = savedBank[0].id;
            setBanks((prev) => [savedBank[0], ...prev]);
          }
        }
      }
    }

    const payload = {
      site_id: siteId,
      type,
      method: 'advance',
      advance_mode: advanceMode,
      amount: advAmount,
      status: 'requested',
      remaining_balance: sharedRemainingBalance,
      upi_id: upiIdVal,
      bank_account_id: bankAccountId,
      hatchery_id: selectedHatchery?.id || null,
      related_tank_id: relatedTankId,
      related_section_id: relatedSectionId,
      bill_id: billId,
      created_by: user?.id,
      photo_url: photoPreview || null,
      voice_url: audioUrl || null,
      note: workSource ? `Work Source: ${workSource}` : null,
    };

    const { data: rows, error } = await supabase.from(TABLES.payments).insert(payload).select();
    if (error) return toast.error(error.message);
    const data = (Array.isArray(rows) ? rows[0] : rows) || { id: payload.bill_id || `adv-${Date.now()}`, ...payload };
    
    setAdvanceTxns((prev) => [data, ...prev]);
    setAdvanceAmount('');
    setSubmitted(true);
    toast.success('Advance Bank request submitted to Payments module!');
    onPaid?.(data);
  }

  async function completeAdvance(txn) {
    const { data: rows, error } = await supabase
      .from(TABLES.payments)
      .update({ status: 'completed', proof_url: txn.proof_url ?? `proof_${txn.id.slice(0, 6)}.png` })
      .eq('id', txn.id)
      .select();
    if (error) return toast.error(error.message);
    const data = (Array.isArray(rows) ? rows[0] : rows) || { ...txn, status: 'completed' };
    setAdvanceTxns((prev) => prev.map((t) => (t.id === txn.id ? data : t)));
    toast.success('Marked completed');
  }

  return (
    <div className="space-y-4">
      {/* Hatchery Details Slot */}
      {supplierSection}

      {/* ── Advance Cash Payments Toggle (Requirement #3) ── */}
      <ToggleRow
        title="Advance Cash Payments"
        subtitle="Request cash advance (HOD limit applies)"
        color="var(--color-info)"
        checked={enableCash}
        onChange={setEnableCash}
        count={cashTxns.length}
        countLabel={`request${cashTxns.length === 1 ? '' : 's'}`}
      />

      {enableCash && (
        <div className="space-y-3 p-4 rounded-[12px] border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-info)' }}>
          {!showBalance ? (
            <button
              type="button"
              onClick={() => setShowBalance(true)}
              className="btn-ghost text-xs font-bold border px-3 py-2 rounded-[8px] flex items-center gap-2"
              style={{ borderColor: 'var(--color-info)', color: 'var(--color-info)' }}
            >
              <span>💳</span>
              <span>Check Balance</span>
            </button>
          ) : (
            <div
              className="rounded-[8px] px-3 py-2 flex items-center gap-2"
              style={{ background: 'var(--color-info-bg)' }}
            >
              <span>💳</span>
              <span className="text-[13px] font-semibold">
                Available Cash Limit Balance: ₹{cashBalance.toLocaleString('en-IN')}
              </span>
            </div>
          )}

          <div>
            <label className="field-label">Request Amount (₹)</label>
            <input
              type="number"
              className="field"
              placeholder={`Max ₹${cashLimit.toLocaleString('en-IN')}`}
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
            />
          </div>

          {/* Real-time Remaining Balance Display (Requirement #6) */}
          {sharedRemainingBalance !== null && (amount > 0 || advAmount > 0) && (
            <div className={`p-3 rounded-[10px] text-xs flex justify-between items-center ${isExceedingTotal ? 'bg-red-50 border border-red-200' : 'bg-sky-50 border border-sky-200'}`}>
              <span className={`font-bold ${isExceedingTotal ? 'text-red-900' : 'text-sky-900'}`}>Remaining Seed Order Balance:</span>
              <span className={`font-extrabold text-sm ${isExceedingTotal ? 'text-red-950' : 'text-sky-950'}`}>₹{sharedRemainingBalance.toLocaleString('en-IN')}</span>
            </div>
          )}

          <ValidationBox kind={cashValidation.kind} text={cashValidation.text} />
          
          {/* Submit Request Button (Requirement #5) */}
          <button
            type="button"
            disabled={!(enableCash && amount > 0)}
            onClick={proceedCash}
            className="btn w-full font-extrabold text-white py-3 shadow-md"
            style={{ background: 'var(--color-info)' }}
          >
            Submit Request
          </button>

          {/* Cash Payment Table (Requirement #4: Machine ID Book column removed) */}
          {cashTxns.length > 0 && (
            <div className="pt-2">
              <LedgerTable
                title="Advance Cash Payment Request Table"
                subtitle="Submitted requests"
                color="var(--color-info)"
                icon="💸"
                emptyText="No cash requests submitted."
                columns={['Request ID', 'Time', 'Amount', 'Remaining Balance', 'Status']}
                rows={cashTxns.map((t) => [
                  <span className="text-xs font-bold">{shortId(t.id)}</span>,
                  <span className="text-xs">{fmtDateTime(t.created_at)}</span>,
                  <span className="text-xs font-extrabold">₹{Number(t.amount).toLocaleString('en-IN')}</span>,
                  <span className="text-xs font-bold text-slate-700">₹{(sharedRemainingBalance ?? 0).toLocaleString('en-IN')}</span>,
                  <StatusChip label={t.status || 'Requested'} color="var(--color-info)" />,
                ])}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Advance Bank Payments Toggle (Requirement #3) ── */}
      <ToggleRow
        title="Advance Bank Payments"
        subtitle="Request advance bank transfer from finance"
        color="var(--color-success)"
        checked={enableAdvance}
        onChange={setEnableAdvance}
        count={advanceTxns.length}
        countLabel={`request${advanceTxns.length === 1 ? '' : 's'}`}
      />

      {enableAdvance && (
        <div className="space-y-4 p-4 rounded-[12px] border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-success)' }}>
          <div>
            <label className="field-label">Advance Amount (₹)</label>
            <input
              type="number"
              className="field"
              placeholder="Enter advance amount"
              value={advanceAmount}
              onChange={(e) => setAdvanceAmount(e.target.value)}
            />
          </div>

          {/* Real-time Remaining Balance Display (Requirement #8) */}
          {sharedRemainingBalance !== null && (amount > 0 || advAmount > 0) && (
            <div className={`p-3 rounded-[10px] text-xs flex justify-between items-center ${isExceedingTotal ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'}`}>
              <span className={`font-bold ${isExceedingTotal ? 'text-red-900' : 'text-emerald-900'}`}>Remaining Balance After Bank Request:</span>
              <span className={`font-extrabold text-sm ${isExceedingTotal ? 'text-red-950' : 'text-emerald-950'}`}>₹{sharedRemainingBalance.toLocaleString('en-IN')}</span>
            </div>
          )}

          {isExceedingTotal && (
            <ValidationBox kind="danger" text={`Total payment exceeds bill amount by ₹${Math.abs(sharedRemainingBalance).toLocaleString('en-IN')}`} />
          )}

          <p className="text-[13px] font-bold text-text-secondary">Select Payment Method</p>
          <div className="grid grid-cols-2 gap-3">
            <ModeTile
              active={advanceMode === 'upi'}
              onClick={() => {
                setAdvanceMode('upi');
                setEntryMethod(null);
              }}
              icon="🔳"
              label="UPI"
              color="var(--color-success)"
            />
            <ModeTile
              active={advanceMode === 'bank'}
              onClick={() => {
                setAdvanceMode('bank');
                setEntryMethod(null);
              }}
              icon="🏦"
              label="Bank Transfer"
              color="var(--color-info)"
            />
          </div>

          {advanceMode === 'upi' && (
            <div className="space-y-3">
              <div>
                <label className="field-label">Enter UPI ID</label>
                <input
                  className="field"
                  placeholder="e.g. hatchery@upi"
                  value={bankForm.upiId || ''}
                  onChange={(e) => setBankForm((f) => ({ ...f, upiId: e.target.value }))}
                />
              </div>

            </div>
          )}

          {advanceMode === 'bank' && (
            <div className="space-y-3">
              <p className="text-[13px] font-semibold text-text-secondary">Select Entry Method</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'manual', label: 'Manual Entry', icon: '✍️' },
                  { id: 'photo', label: 'Photo Upload', icon: '📷' },
                  { id: 'voice', label: 'Voice Entry', icon: '🎙️' },
                ].map((m) => {
                  const active = entryMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setEntryMethod(m.id)}
                      className="rounded-[10px] py-2.5 border flex flex-col items-center gap-1"
                      style={{
                        background: active ? 'var(--color-success-bg)' : 'var(--color-surface)',
                        borderColor: active ? 'var(--color-success)' : 'var(--color-border)',
                        borderWidth: active ? 2 : 1,
                      }}
                    >
                      <span className="text-xl">{m.icon}</span>
                      <span className="text-[11px] font-semibold" style={{ color: active ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {entryMethod === 'manual' && (
                <div className="space-y-2 pt-2">
                  <input
                    className="field text-sm"
                    placeholder="Bank Name (e.g. State Bank of India)"
                    value={bankForm.bankName}
                    onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                  />
                  <input
                    className="field text-sm"
                    placeholder="Account Holder Name"
                    value={bankForm.holderName}
                    onChange={(e) => setBankForm({ ...bankForm, holderName: e.target.value })}
                  />
                  <input
                    className="field text-sm"
                    placeholder="Account Number"
                    value={bankForm.accountNumber}
                    onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
                  />
                  <input
                    className="field text-sm"
                    placeholder="IFSC Code"
                    value={bankForm.ifsc}
                    onChange={(e) => setBankForm({ ...bankForm, ifsc: e.target.value })}
                  />
                </div>
              )}

              {entryMethod === 'photo' && (
                <div className="p-3 rounded-[10px] border space-y-2" style={{ background: 'var(--color-surface-dark)', borderColor: 'var(--color-border)' }}>
                  <label className="field-label block">Upload Passbook / Bank Details Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="field py-1 text-xs"
                  />
                  {photoPreview && (
                    <div className="mt-2 relative rounded-[8px] overflow-hidden border max-w-xs">
                      <img src={photoPreview} alt="Bank Passbook" className="w-full h-32 object-cover" />
                      <p className="text-[10px] p-1 bg-black/60 text-white text-center">Attached Passbook Image</p>
                    </div>
                  )}
                </div>
              )}

              {entryMethod === 'voice' && (
                <div className="p-3 rounded-[10px] border space-y-2 text-center" style={{ background: 'var(--color-surface-dark)', borderColor: 'var(--color-[#eab308])' }}>
                  <p className="text-xs font-semibold text-text-secondary">Record Bank Details Audio</p>
                  <button
                    type="button"
                    onClick={handleVoiceRecording}
                    className="btn px-4 py-2 text-xs font-bold flex items-center justify-center gap-2 mx-auto"
                    style={{
                      background: isRecording ? 'var(--color-danger)' : 'var(--color-info)',
                      color: '#fff',
                    }}
                  >
                    <span>🎙️</span>
                    <span>{isRecording ? 'Recording... (Click to stop)' : 'Start Voice Recording'}</span>
                  </button>
                  {audioUrl && (
                    <div className="p-2 rounded-[8px] bg-success-bg text-success text-xs font-bold flex items-center justify-center gap-2">
                      <span>✓</span> Voice Recording Saved
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={submitAdvance}
            className="btn-success w-full font-bold text-base py-3"
          >
            Submit Request
          </button>

          {/* Advance Payment Table (Requirement #4: Machine ID Book column removed) */}
          {(submitted || advanceTxns.length > 0) && (
            <div className="pt-3">
              <LedgerTable
                title="Advance Bank Payment Request Table"
                subtitle="Requests for this order"
                color="var(--color-success)"
                icon="🧾"
                emptyText="No advance payment requests generated."
                columns={['Request Payment ID', 'Request Time', 'Amount', 'Remaining Balance', 'Status', 'Payment Proof']}
                rows={advanceTxns.map((t) => {
                  const done = t.status === 'completed';
                  return [
                    <span className="text-xs font-bold">{shortId(t.id)}</span>,
                    <span className="text-xs">{fmtDateTime(t.created_at)}</span>,
                    <span className="text-xs font-extrabold">₹{Number(t.amount).toLocaleString('en-IN')}</span>,
                    <span className="text-xs font-bold text-slate-700">₹{(sharedRemainingBalance ?? 0).toLocaleString('en-IN')}</span>,
                    done ? (
                      <StatusChip label="Completed" color="var(--color-success)" />
                    ) : (
                      <span className="text-xs font-semibold text-amber-700">✓ Requested</span>
                    ),
                    done ? (
                      <ProofPreview label={t.proof_url ?? 'Payment proof'} />
                    ) : (
                      <span className="text-xs text-text-muted">Visible after completion</span>
                    ),
                  ];
                })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──

function ToggleRow({ title, subtitle, color, checked, onChange, count, countLabel }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-[12px] border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
      <label className="flex-1 flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-5 h-5 accent-current"
          style={{ accentColor: color }}
        />
        <span>
          <span className="block font-extrabold text-sm">{title}</span>
          <span className="block text-[11px] text-text-secondary">{subtitle}</span>
        </span>
      </label>
      <span
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
        style={{ background: `${color}1a`, border: `1px solid ${color}30`, color }}
      >
        🧾 {count} {countLabel}
      </span>
    </div>
  );
}

function ValidationBox({ kind, text }) {
  const map = {
    info: { bg: 'var(--color-info-bg)', fg: 'var(--color-info)', icon: 'ℹ️' },
    success: { bg: 'var(--color-success-bg)', fg: 'var(--color-success)', icon: '✅' },
    danger: { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger)', icon: '⚠️' },
  };
  const s = map[kind] ?? map.info;
  return (
    <div className="rounded-[10px] px-3 py-2.5 flex items-center gap-2" style={{ background: s.bg, border: `1px solid ${s.fg}30` }}>
      <span>{s.icon}</span>
      <span className="text-[11px]" style={{ color: s.fg }}>{text}</span>
    </div>
  );
}

function ModeTile({ active, onClick, icon, label, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[10px] py-3 border-2 flex flex-col items-center gap-1 transition"
      style={{
        background: active ? `${color}1a` : 'var(--color-surface)',
        borderColor: active ? color : 'var(--color-border)',
        borderWidth: active ? 2 : 1,
      }}
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-semibold" style={{ color: active ? color : 'var(--color-text-secondary)' }}>{label}</span>
    </button>
  );
}

function ProofPreview({ label }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[12px] px-2.5 py-1.5"
      style={{ background: 'var(--color-success-bg)', border: '1px solid var(--color-success)' }}
    >
      <span className="text-[11px] font-bold" style={{ color: 'var(--color-success)' }}>🖼️ {label}</span>
    </span>
  );
}

function shortId(id) {
  return (id || '').toUpperCase().replace(/-/g, '').slice(0, 8) || '—';
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
