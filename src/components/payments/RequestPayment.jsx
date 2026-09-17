import { useEffect, useMemo, useState } from 'react';
import { supabase, TABLES } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import LedgerTable, { StatusChip } from './LedgerTable';

/**
 * RequestPayment — the shared payment pattern used everywhere a payment
 * occurs in SSH (Seed Payments, Vehicle advances, Outside Workers).
 * Only the "Request Payment" method is used (no direct capture). PRD §10.
 *
 * Ported from the Flutter reference implementation (paste-attachment).
 *
 * Two togglable flows, each with its own running ledger table:
 *   1. Cash Payment  — amount with live validation vs. balance + HOD limit.
 *   2. Advance/Request — UPI or Bank Transfer; status starts "Requested",
 *      finance uploads proof, marks "Completed", then proof preview +
 *      "register-in-machine-IDs-book" toggle unlock.
 *
 * Props:
 *   - type: 'seed' | 'vehicle' | 'outside_worker'
 *   - siteId, relatedTankId, relatedSectionId (optional scoping)
 *   - onPaid(payment)  — callback after a successful cash/advance commit
 */
export default function RequestPayment({
  type = 'seed',
  siteId,
  relatedTankId = null,
  relatedSectionId = null,
  onPaid,
  prefillAmount = null,
  billId = null,
  totalOrderPrice = null,
  supplierSection = null,
  selectedHatchery = null, // Legacy, use selectedRecipient
  selectedHatcheryBankAccount = null, // Legacy, use selectedRecipientBankAccount
  selectedRecipient = null,
  selectedRecipientBankAccount = null,
  onHatcheryBankAccountAdded,
  hideMachineIdBook = false,
  workSource = null,
  batchId = null,
}) {
  const { user } = useAuth();
  const toast = useToast();

  // ── Cash flow state ────────────────────────────────────────────────────
  const [enableCash, setEnableCash] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [cashTxns, setCashTxns] = useState([]);

  // ── Advance flow state ─────────────────────────────────────────────────
  const [enableAdvance, setEnableAdvance] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceMode, setAdvanceMode] = useState('upi'); // 'upi' | 'bank'
  const [entryMethod, setEntryMethod] = useState(null); // 'manual' | 'photo' | 'voice'
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [selectedBankId, setSelectedBankId] = useState(null);
  const [bankForm, setBankForm] = useState({ ifsc: '', accountNumber: '', bankName: '', holderName: '' });
  const [advanceTxns, setAdvanceTxns] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [banks, setBanks] = useState([]);

  // ── UI Restoration State ───────────────────────────────────────────────
  const [showCashBalance, setShowCashBalance] = useState(false);
  const [upiIdInput, setUpiIdInput] = useState('');

  const amount = Number(cashAmount) || 0;
  const advAmount = Number(advanceAmount) || 0;

  const originalTotal = Number(totalOrderPrice) || 0;
  const totalRequestedSoFar = [...cashTxns, ...advanceTxns].reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const currentRemainingBalance = Math.max(0, originalTotal - totalRequestedSoFar);

  // ── Prefill (e.g. overall price from a seed order, or a pending amount) ──
  useEffect(() => {
    if (prefillAmount == null) return;
    const v = Math.round(Number(prefillAmount) || 0);
    if (!v) return;
    setCashAmount(String(v));
    setAdvanceAmount(String(v));
  }, [prefillAmount]);

  // ── Data loading ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!siteId) return;
    (async () => {
      let query = supabase
        .from(TABLES.payments)
        .select('*')
        .eq('site_id', siteId)
        .eq('type', type)
        .order('created_at', { ascending: false });
      if (billId) {
        query = query.eq('bill_id', billId);
      }
      const { data: txns } = await query;
      let filteredTxns = txns ?? [];
      if (batchId) {
        filteredTxns = filteredTxns.filter((t) => (t.payment_method_details?.batch_id === batchId) || (t.batch_id === batchId));
      }
      setCashTxns(filteredTxns.filter((t) => t.method === 'cash'));
      setAdvanceTxns(filteredTxns.filter((t) => t.method === 'advance'));
    })();
  }, [siteId, type, billId, batchId]);

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
        .eq('user_id', user.id)
        .order('is_primary', { ascending: false });
      setAccounts(a ?? []);
      setBanks(b ?? []);
      // default primary account
      if (a?.length && !selectedAccountId) setSelectedAccountId(a.find((x) => x.is_primary)?.id ?? a[0].id);
    })();
  }, [user]);

  // ── Cash validation info (mirrors `_buildCashValidationInfo`) ─────────
  const cashValidation = useMemo(() => {
    if (!cashAmount) {
      return { kind: 'info', text: `Balance after request: ₹${currentRemainingBalance.toLocaleString('en-IN')}` };
    }
    if (amount > currentRemainingBalance && originalTotal > 0) {
      return { kind: 'danger', text: `Insufficient remaining balance (avail: ₹${currentRemainingBalance.toLocaleString('en-IN')}).` };
    }
    return { kind: 'success', text: `Valid. Balance after request: ₹${Math.max(0, currentRemainingBalance - amount).toLocaleString('en-IN')}` };
  }, [cashAmount, amount, currentRemainingBalance, originalTotal]);

  const advanceValidation = useMemo(() => {
    if (!advanceAmount) {
      return { kind: 'info', text: `Balance after request: ₹${currentRemainingBalance.toLocaleString('en-IN')}` };
    }
    if (advAmount > currentRemainingBalance && originalTotal > 0) {
      return { kind: 'danger', text: `Insufficient remaining balance (avail: ₹${currentRemainingBalance.toLocaleString('en-IN')}).` };
    }
    return { kind: 'success', text: `Valid. Balance after request: ₹${Math.max(0, currentRemainingBalance - advAmount).toLocaleString('en-IN')}` };
  }, [advanceAmount, advAmount, currentRemainingBalance, originalTotal]);

  // ── Actions ───────────────────────────────────────────────────────────
  async function proceedCash() {
    if (amount <= 0 || (originalTotal > 0 && amount > currentRemainingBalance)) {
      toast.error('Fix the cash amount before proceeding');
      return;
    }
    const remBal = Math.max(0, currentRemainingBalance - amount);
    const isValidUuid = typeof user?.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id);
    const payload = {
      site_id: siteId,
      type,
      method: 'cash',
      amount,
      remaining_balance: remBal,
      status: 'requested',
      related_tank_id: relatedTankId,
      related_section_id: relatedSectionId,
      bill_id: billId,
      ...(isValidUuid ? { created_by: user.id } : {}),
      payment_method_details: batchId ? { batch_id: batchId } : null,
    };
    let data = { id: `pay-${Date.now()}`, ...payload };
    try {
      const { data: rows, error } = await supabase.from(TABLES.payments).insert(payload).select();
      if (!error && rows && rows[0]) {
        data = rows[0];
      } else if (error) {
        console.warn('Payment insert warning:', error);
      }
    } catch (err) {
      console.warn('Payment insert error:', err);
    }
    setCashTxns((prev) => [data, ...prev]);
    setCashAmount('');
    toast.success('Cash request submitted');
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

  async function getOrSaveRecipientBank() {
    const recipient = selectedRecipient || selectedHatchery;
    if (!recipient) {
      toast.error('No recipient selected');
      return null;
    }
    
    if (!bankForm.ifsc || !bankForm.accountNumber || !bankForm.bankName) {
      toast.error('Fill IFSC, Account Number, and Bank Name');
      return null;
    }

    const formNormAcct = (bankForm.accountNumber || '').trim().replace(/\s+/g, '');
    const formNormIfsc = (bankForm.ifsc || '').trim().toUpperCase().replace(/\s+/g, '');

    const { data: existing } = await supabase
      .from(TABLES.hatcheryBankAccounts)
      .select('*')
      .eq('hatchery_id', recipient.id);

    const match = (existing || []).find((a) => {
      const aNormAcct = (a.account_number || '').trim().replace(/\s+/g, '');
      const aNormIfsc = (a.ifsc_code || a.ifsc || '').trim().toUpperCase().replace(/\s+/g, '');
      return aNormAcct === formNormAcct && aNormIfsc === formNormIfsc;
    });

    if (match) {
      return match;
    }

    const newBankPayload = {
      hatchery_id: recipient.id,
      bank_name: bankForm.bankName.trim() || 'Bank Account',
      holder_name: bankForm.holderName.trim(),
      account_number: formNormAcct,
      ifsc_code: formNormIfsc,
    };

    const { data: nbRows, error: nbErr } = await supabase
      .from(TABLES.hatcheryBankAccounts)
      .insert(newBankPayload)
      .select();
    
    if (nbErr) {
      toast.error('Failed to save bank account');
      return null;
    }

    if (nbRows && nbRows.length > 0) {
      if (onHatcheryBankAccountAdded) {
        onHatcheryBankAccountAdded(nbRows[0]);
      }
      return nbRows[0];
    }
    return null;
  }

  async function handleSaveRecipientBank() {
    const recipient = selectedRecipient || selectedHatchery;
    if (!recipient) {
      toast.error('No recipient selected');
      return;
    }
    const formNormAcct = (bankForm.accountNumber || '').trim().replace(/\s+/g, '');
    const formNormIfsc = (bankForm.ifsc || '').trim().toUpperCase().replace(/\s+/g, '');
    
    const { data: existing } = await supabase
      .from(TABLES.hatcheryBankAccounts)
      .select('*')
      .eq('hatchery_id', recipient.id);

    const match = (existing || []).find((a) => {
      const aNormAcct = (a.account_number || '').trim().replace(/\s+/g, '');
      const aNormIfsc = (a.ifsc_code || a.ifsc || '').trim().toUpperCase().replace(/\s+/g, '');
      return aNormAcct === formNormAcct && aNormIfsc === formNormIfsc;
    });

    if (match) {
      toast.info('Bank account already exists for this recipient');
      return;
    }

    const bank = await getOrSaveRecipientBank();
    if (bank) {
      toast.success('Bank account saved successfully');
    }
  }

  async function submitAdvance() {
    if (advAmount <= 0 || (originalTotal > 0 && advAmount > currentRemainingBalance)) {
      return toast.error('Fix the advance amount before proceeding');
    }
    let paymentAccountId = null;
    let bankAccountId = null;
    let paymentMethodDetails = null; // Declare here so we can populate it

    if (advanceMode === 'upi') {
      if (!upiIdInput.trim()) return toast.error('Enter a UPI ID');
      paymentMethodDetails = { upi_id: upiIdInput.trim() };
      paymentAccountId = null;
    } else {
      if (entryMethod === 'manual') {
        if (!bankForm.ifsc || !bankForm.accountNumber || !bankForm.bankName) {
          return toast.error('Fill bank details or pick a saved account');
        }
      } else if (!selectedBankId) {
        return toast.error('Pick a saved bank account or enter manually');
      }
      bankAccountId = selectedBankId;
    }

    const remBal = Math.max(0, currentRemainingBalance - advAmount);
    
    let finalBankAccountId = bankAccountId;

    if (advanceMode === 'bank' && entryMethod === 'manual') {
      const bank = await getOrSaveRecipientBank();
      if (!bank) return;
      finalBankAccountId = bank.id;
    }

    const isValidUuid = typeof user?.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id);
    const payload = {
      site_id: siteId,
      type,
      method: 'advance',
      advance_mode: advanceMode,
      amount: advAmount,
      remaining_balance: remBal,
      status: 'requested',
      payment_account_id: paymentAccountId,
      bank_account_id: finalBankAccountId,
      related_tank_id: relatedTankId,
      related_section_id: relatedSectionId,
      bill_id: billId,
      ...(isValidUuid ? { created_by: user.id } : {}),
      payment_method_details: {
        ...(paymentMethodDetails || {}),
        ...(batchId ? { batch_id: batchId } : {})
      },
    };
    let data = { id: `adv-${Date.now()}`, ...payload };
    try {
      const { data: rows, error } = await supabase.from(TABLES.payments).insert(payload).select();
      if (!error && rows && rows[0]) {
        data = rows[0];
      } else if (error) {
        console.warn('Advance insert warning:', error);
      }
    } catch (err) {
      console.warn('Advance insert error:', err);
    }
    setAdvanceTxns((prev) => [data, ...prev]);
    setAdvanceAmount('');
    toast.success('Request submitted for approval');
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

  async function toggleMachineBook(txn, value) {
    const { data: rows, error } = await supabase
      .from(TABLES.payments)
      .update({ registered_in_machine_ids_book: value })
      .eq('id', txn.id)
      .select();
    if (error) return toast.error(error.message);
    const data = (Array.isArray(rows) ? rows[0] : rows) || { ...txn, registered_in_machine_ids_book: value };
    setAdvanceTxns((prev) => prev.map((t) => (t.id === txn.id ? data : t)));
  }

  useEffect(() => {
    const acct = selectedRecipientBankAccount || selectedHatcheryBankAccount;
    const recipient = selectedRecipient || selectedHatchery;
    if (!acct) return;
    setSelectedBankId(acct.id || null);
    setBankForm({
      ifsc: acct.ifsc || acct.ifsc_code || '',
      accountNumber: acct.account_number || '',
      bankName: acct.bank_name || '',
      holderName: acct.holder_name || recipient?.hatchery_name || recipient?.name || '',
    });
    setAdvanceMode('bank');
    setEnableAdvance(true);
    setEntryMethod('manual');
  }, [selectedRecipientBankAccount, selectedHatcheryBankAccount, selectedRecipient, selectedHatchery]);

  void onHatcheryBankAccountAdded;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {supplierSection}
      {workSource && (
        <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Source: {workSource}</p>
      )}
      {totalOrderPrice != null && Number(totalOrderPrice) > 0 && (
        <div className="rounded-[12px] px-4 py-3 flex items-center justify-between" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <span className="text-xs font-bold text-text-muted">Order total</span>
          <span className="text-lg font-extrabold">₹{Number(totalOrderPrice).toLocaleString('en-IN')}</span>
        </div>
      )}
      {/* ── Cash Payment toggle ───────────────────────────────────────── */}
      <ToggleRow
        title="Advance Cash Payments"
        subtitle="Request advance via cash"
        color="var(--color-info)"
        checked={enableCash}
        onChange={setEnableCash}
        count={cashTxns.length}
        countLabel={`payment${cashTxns.length === 1 ? '' : 's'}`}
      />

      {enableCash && (
        <div className="space-y-4">
          <div className="border rounded-[12px] p-4 space-y-4" style={{ borderColor: 'var(--color-border)' }}>
            <button
              type="button"
              className="btn w-full font-bold shadow-sm"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
              onClick={() => setShowCashBalance(true)}
            >
              Check Balance
            </button>
            {showCashBalance && (
              <div
                className="rounded-[8px] px-3 py-2 flex items-center gap-2"
                style={{ background: 'var(--color-info-bg)' }}
              >
                <span>💳</span>
                <span className="text-[13px] font-semibold" style={{ color: 'var(--color-info)' }}>
                  Current Remaining Balance: ₹{currentRemainingBalance.toLocaleString('en-IN')}
                </span>
              </div>
            )}
            <input
              type="number"
              className="field"
              placeholder="Request Amount (₹)"
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
            />
            {cashAmount && (
              <ValidationBox kind={cashValidation.kind} text={cashValidation.text} />
            )}
            <button
              type="button"
              onClick={proceedCash}
              className="btn w-full text-white shadow-sm font-bold"
              style={{ background: 'var(--color-info)' }}
            >
              Submit Request
            </button>
          </div>

          {cashTxns.length > 0 && (
            <LedgerTable
            title="Cash Payment Table"
            subtitle="List of advance cash requests"
            color="var(--color-info)"
            icon="💸"
            emptyText="No cash payments generated yet."
            columns={['Request ID', 'Time', 'Amount', 'Remaining Balance', 'Status', 'Edit']}
            rows={cashTxns.map((t) => [
              <span className="text-xs font-bold">{shortId(t.id)}</span>,
              <span className="text-xs">{fmtDateTime(t.created_at)}</span>,
              <span className="text-xs font-extrabold">₹{Number(t.amount).toLocaleString('en-IN')}</span>,
              <span className="text-xs font-semibold text-text-secondary">{t.remaining_balance != null ? `₹${Number(t.remaining_balance).toLocaleString('en-IN')}` : '—'}</span>,
              <StatusChip label={t.status || 'requested'} color={t.status === 'completed' ? 'var(--color-success)' : 'var(--color-warning)'} />,
              <button onClick={() => editCash(t)} className="text-xs font-semibold" style={{ color: 'var(--color-info)' }}>
                ✎ Edit
              </button>,
            ])}
          />
          )}
        </div>
      )}

      {/* ── Advance Request toggle ────────────────────────────────────── */}
      <ToggleRow
        title="Advance Bank Payments"
        subtitle="Request advance via UPI or Bank Transfer"
        color="var(--color-success)"
        checked={enableAdvance}
        onChange={setEnableAdvance}
        count={advanceTxns.length}
        countLabel={`request${advanceTxns.length === 1 ? '' : 's'}`}
      />

      {enableAdvance && (
        <div className="space-y-4">
          <div className="border rounded-[12px] p-4 space-y-4" style={{ borderColor: 'var(--color-border)' }}>
            <input
              type="number"
              className="field"
              placeholder="Advance Amount (₹)"
              value={advanceAmount}
              onChange={(e) => setAdvanceAmount(e.target.value)}
            />
            {advanceAmount && (
              <ValidationBox kind={advanceValidation.kind} text={advanceValidation.text} />
            )}

            <p className="text-[13px] font-semibold text-text-secondary">Select Payment Method</p>
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
                setEntryMethod('manual');
              }}
              icon="🏦"
              label="Bank Transfer"
              color="var(--color-info)"
            />
          </div>

          {advanceMode === 'upi' && (
            <div>
              <input
                type="text"
                className="field"
                placeholder="Enter UPI ID"
                value={upiIdInput}
                onChange={(e) => setUpiIdInput(e.target.value)}
              />
            </div>
          )}
          {advanceMode === 'bank' && (
            <BankDetails
              entryMethod={entryMethod || 'manual'}
              setEntryMethod={(m) => {
                setEntryMethod(m);
                if (m !== 'manual') setSelectedBankId(null);
              }}
              form={bankForm}
              setForm={setBankForm}
              onAddBank={handleSaveRecipientBank}
              addBankLabel={type === 'outside_worker' ? 'Add Bank to Supplier' : 'Add Bank to Hatchery'}
            />
          )}

            <button
              type="button"
              onClick={submitAdvance}
              className="btn w-full text-white shadow-sm font-bold"
              style={{ background: 'var(--color-success)' }}
            >
              Submit Request
            </button>
        </div>

        {advanceTxns.length > 0 && (
          <LedgerTable
            title="Advance Bank Payment Table"
          subtitle="Proof and Machine IDs Book unlock only after the requested amount is completed"
          color="var(--color-success)"
          icon="🧾"
          emptyText="No advance bank payments generated yet."
          columns={hideMachineIdBook
            ? ['Request ID', 'Time', 'Amount', 'Remaining Balance', 'Status', 'Payment Proof']
            : ['Request ID', 'Time', 'Amount', 'Remaining Balance', 'Status', 'Payment Proof', 'Machine IDs Book']}
          rows={advanceTxns.map((t) => {
            const done = t.status === 'completed';
            const cells = [
              <span className="text-xs font-bold">{shortId(t.id)}</span>,
              <span className="text-xs">{fmtDateTime(t.created_at)}</span>,
              <span className="text-xs font-extrabold">₹{Number(t.amount).toLocaleString('en-IN')}</span>,
              <span className="text-xs font-semibold text-text-secondary">{t.remaining_balance != null ? `₹${Number(t.remaining_balance).toLocaleString('en-IN')}` : '—'}</span>,
              done ? (
                <StatusChip label="Completed" color="var(--color-success)" />
              ) : (
                <button
                  onClick={() => completeAdvance(t)}
                  className="text-xs font-semibold"
                  style={{ color: 'var(--color-warning)' }}
                >
                  ✓ Requested
                </button>
              ),
              done ? (
                <ProofPreview label={t.proof_url ?? 'Payment proof'} />
              ) : (
                <span className="text-xs text-text-muted">Visible after completion</span>
              ),
            ];
            if (!hideMachineIdBook) {
              cells.push(
                done ? (
                  <label className="flex items-center gap-2 text-xs font-extrabold" style={{ color: t.registered_in_machine_ids_book ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                    {t.registered_in_machine_ids_book ? 'Yes' : 'No'}
                    <input
                      type="checkbox"
                      checked={!!t.registered_in_machine_ids_book}
                      onChange={(e) => toggleMachineBook(t, e.target.checked)}
                    />
                  </label>
                ) : (
                  <span className="text-xs text-text-muted">Locked</span>
                )
              );
            }
            return cells;
          })}
        />
        )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function ToggleRow({ title, subtitle, color, checked, onChange, count, countLabel }) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex-1 flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-5 h-5 accent-current"
          style={{ accentColor: color }}
        />
        <span>
          <span className="block font-semibold text-sm">{title}</span>
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

function UpiAccountPicker({ accounts, selectedId, onSelect }) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-text-secondary mb-2">Select Verified UPI Account</p>
      {accounts.length === 0 && (
        <p className="text-xs text-text-muted">No saved UPI accounts. Add one from your profile (coming soon).</p>
      )}
      <div className="space-y-2">
        {accounts.map((a) => {
          const active = a.id === selectedId;
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className="w-full text-left rounded-[12px] px-4 py-3 border flex items-center gap-3"
              style={{
                background: active ? 'var(--color-success-bg)' : 'var(--color-surface)',
                borderColor: active ? 'var(--color-success)' : 'var(--color-border)',
                borderWidth: active ? 2 : 1,
              }}
            >
              <span>{active ? '✅' : '👛'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate" style={{ color: active ? 'var(--color-success)' : 'var(--color-text-primary)' }}>
                  {a.upi_id}
                </p>
                <p className="text-[10px] text-text-muted truncate">{a.bank_name}</p>
              </div>
              {a.is_primary && (
                <span className="chip" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>Default</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BankDetails({ entryMethod, setEntryMethod, form, setForm, onAddBank, addBankLabel }) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] font-semibold text-text-secondary">Select Entry Method</p>
      <div className="grid grid-cols-3 gap-2">
        {[
          { id: 'manual', label: 'Manual', icon: '✍️' },
          { id: 'photo', label: 'Photo', icon: '📷' },
          { id: 'voice', label: 'Voice', icon: '🎙️' },
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
        <div className="space-y-2">
          <input
            className="field"
            placeholder="IFSC Code"
            value={form.ifsc}
            onChange={(e) => setForm({ ...form, ifsc: e.target.value })}
          />
          <input
            className="field"
            placeholder="Account Number"
            value={form.accountNumber}
            onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
          />
          <input
            className="field"
            placeholder="Bank Name"
            value={form.bankName}
            onChange={(e) => setForm({ ...form, bankName: e.target.value })}
          />
          <input
            className="field"
            placeholder="Holder Name"
            value={form.holderName}
            onChange={(e) => setForm({ ...form, holderName: e.target.value })}
          />
          {onAddBank && (
            <button
              type="button"
              onClick={onAddBank}
              className="btn-ghost w-full py-2 mt-2 text-xs font-bold rounded-[8px]"
              style={{ border: '1px solid var(--color-border)', color: 'var(--color-info)' }}
            >
              + {addBankLabel}
            </button>
          )}
        </div>
      )}
      {entryMethod === 'photo' && (
        <div className="rounded-[10px] px-3 py-3 flex items-center gap-2" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
          📷 <span>Upload bank screenshot</span>
        </div>
      )}
      {entryMethod === 'voice' && (
        <div className="rounded-[10px] px-3 py-3 flex items-center gap-2" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
          🎙️ <span>Record bank details by voice</span>
        </div>
      )}
      {entryMethod && (
        <div className="rounded-[10px] px-3 py-2.5 flex items-center gap-2" style={{ background: 'var(--color-success-bg)', border: '1px solid var(--color-success)' }}>
          <span style={{ color: 'var(--color-success)' }}>ℹ️</span>
          <span className="text-[11px]" style={{ color: 'var(--color-success)' }}>Request will be sent for approval</span>
        </div>
      )}
    </div>
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

// ── helpers ─────────────────────────────────────────────────────────────
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
