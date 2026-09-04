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
}) {
  const { user } = useAuth();
  const toast = useToast();

  // ── Cash flow state ────────────────────────────────────────────────────
  const [enableCash, setEnableCash] = useState(false);
  const [cashBalance, setCashBalance] = useState(50000); // available
  const cashLimit = 25000; // HOD / manager limit
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

  const amount = Number(cashAmount) || 0;
  const advAmount = Number(advanceAmount) || 0;

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
      const { data: txns } = await supabase
        .from(TABLES.payments)
        .select('*')
        .eq('site_id', siteId)
        .eq('type', type)
        .order('created_at', { ascending: false });
      setCashTxns((txns ?? []).filter((t) => t.method === 'cash'));
      setAdvanceTxns((txns ?? []).filter((t) => t.method === 'advance'));
    })();
  }, [siteId, type]);

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
      return { kind: 'info', text: `Balance after payment: ₹${cashBalance.toLocaleString('en-IN')}` };
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
  }, [cashAmount, amount, cashBalance, cashLimit]);

  // ── Actions ───────────────────────────────────────────────────────────
  async function proceedCash() {
    if (amount <= 0 || amount > cashLimit || amount > cashBalance) {
      toast.error('Fix the cash amount before proceeding');
      return;
    }
    const payload = {
      site_id: siteId,
      type,
      method: 'cash',
      amount,
      status: 'completed',
      related_tank_id: relatedTankId,
      related_section_id: relatedSectionId,
      bill_id: billId,
      created_by: user?.id,
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
    toast.success('Cash payment recorded');
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

  async function submitAdvance() {
    if (advAmount <= 0) return toast.error('Enter an advance amount');
    let paymentAccountId = null;
    let bankAccountId = null;
    if (advanceMode === 'upi') {
      if (!selectedAccountId) return toast.error('Select a UPI account');
      paymentAccountId = selectedAccountId;
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

    const payload = {
      site_id: siteId,
      type,
      method: 'advance',
      advance_mode: advanceMode,
      amount: advAmount,
      status: 'requested',
      payment_account_id: paymentAccountId,
      bank_account_id: bankAccountId,
      related_tank_id: relatedTankId,
      related_section_id: relatedSectionId,
      bill_id: billId,
      created_by: user?.id,
    };
    const { data: rows, error } = await supabase.from(TABLES.payments).insert(payload).select();
    if (error) return toast.error(error.message);
    const data = (Array.isArray(rows) ? rows[0] : rows) || { id: payload.bill_id || `adv-${Date.now()}`, ...payload };
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

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Cash Payment toggle ───────────────────────────────────────── */}
      <ToggleRow
        title="Cash Payment"
        subtitle="Pay via cash (HOD limit applies)"
        color="var(--color-info)"
        checked={enableCash}
        onChange={setEnableCash}
        count={cashTxns.length}
        countLabel={`payment${cashTxns.length === 1 ? '' : 's'}`}
      />

      {enableCash && (
        <div className="space-y-2">
          <div
            className="rounded-[8px] px-3 py-2 flex items-center gap-2"
            style={{ background: 'var(--color-info-bg)' }}
          >
            <span>💳</span>
            <span className="text-[13px] font-semibold">
              Available Balance: ₹{cashBalance.toLocaleString('en-IN')}
            </span>
          </div>
          <input
            type="number"
            className="field"
            placeholder={`Max ₹${cashLimit.toLocaleString('en-IN')}`}
            value={cashAmount}
            onChange={(e) => setCashAmount(e.target.value)}
          />
          <ValidationBox kind={cashValidation.kind} text={cashValidation.text} />
          <button
            disabled={!(enableCash && amount > 0)}
            onClick={proceedCash}
            className="btn w-full text-white"
            style={{ background: 'var(--color-info)' }}
          >
            Proceed Payment
          </button>
        </div>
      )}

      <LedgerTable
        title="Cash Payment Table"
        subtitle="Amount is auto-filled when payment is completed; use Edit to correct amount"
        color="var(--color-info)"
        icon="💸"
        emptyText="No cash payments generated yet."
        columns={['Cash Payment ID', 'Time', 'Amount', 'Edit']}
        rows={cashTxns.map((t) => [
          <span className="text-xs font-bold">{shortId(t.id)}</span>,
          <span className="text-xs">{fmtDateTime(t.created_at)}</span>,
          <span className="text-xs font-extrabold">₹{Number(t.amount).toLocaleString('en-IN')}</span>,
          <button onClick={() => editCash(t)} className="text-xs font-semibold" style={{ color: 'var(--color-info)' }}>
            ✎ Edit
          </button>,
        ])}
      />

      {/* ── Advance Request toggle ────────────────────────────────────── */}
      <ToggleRow
        title="Advance Request"
        subtitle="Request advance from finance"
        color="var(--color-success)"
        checked={enableAdvance}
        onChange={setEnableAdvance}
        count={advanceTxns.length}
        countLabel={`request${advanceTxns.length === 1 ? '' : 's'}`}
      />

      {enableAdvance && (
        <div className="space-y-3">
          <input
            type="number"
            className="field"
            placeholder="Advance Amount (₹)"
            value={advanceAmount}
            onChange={(e) => setAdvanceAmount(e.target.value)}
          />

          <p className="text-[13px] font-semibold text-text-secondary">Payment Method</p>
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
            <UpiAccountPicker
              accounts={accounts}
              selectedId={selectedAccountId}
              onSelect={setSelectedAccountId}
            />
          )}
          {advanceMode === 'bank' && (
            <BankDetails
              banks={banks}
              selectedBankId={selectedBankId}
              onSelectBank={(b) => {
                setSelectedBankId(b.id);
                setBankForm({
                  ifsc: b.ifsc,
                  accountNumber: b.account_number,
                  bankName: b.bank_name,
                  holderName: b.holder_name || '',
                });
                setEntryMethod('manual');
              }}
              entryMethod={entryMethod}
              setEntryMethod={(m) => {
                setEntryMethod(m);
                if (m !== 'manual') setSelectedBankId(null);
              }}
              form={bankForm}
              setForm={setBankForm}
            />
          )}

          {advAmount > 0 && (
            <button onClick={submitAdvance} className="btn-success w-full">
              ➤ Submit Request
            </button>
          )}
        </div>
      )}

      <LedgerTable
        title="Advance Payment Request Table"
        subtitle="Proof and Machine IDs Book unlock only after the requested amount is completed"
        color="var(--color-success)"
        icon="🧾"
        emptyText="No advance payment requests generated yet."
        columns={['Request Payment ID', 'Request Time', 'Amount', 'Status', 'Payment Proof', 'Machine IDs Book']}
        rows={advanceTxns.map((t) => {
          const done = t.status === 'completed';
          return [
            <span className="text-xs font-bold">{shortId(t.id)}</span>,
            <span className="text-xs">{fmtDateTime(t.created_at)}</span>,
            <span className="text-xs font-extrabold">₹{Number(t.amount).toLocaleString('en-IN')}</span>,
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
            ),
          ];
        })}
      />
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

function BankDetails({ banks, selectedBankId, onSelectBank, entryMethod, setEntryMethod, form, setForm }) {
  return (
    <div className="space-y-3">
      {banks.length > 0 && (
        <div>
          <p className="text-[13px] font-semibold text-text-secondary mb-2">Saved Bank Accounts</p>
          <div className="space-y-2">
            {banks.map((b) => {
              const active = b.id === selectedBankId;
              return (
                <button
                  key={b.id}
                  onClick={() => onSelectBank(b)}
                  className="w-full text-left rounded-[12px] px-4 py-3 border flex items-center gap-3"
                  style={{
                    background: active ? 'var(--color-info-bg)' : 'var(--color-surface)',
                    borderColor: active ? 'var(--color-info)' : 'var(--color-border)',
                    borderWidth: active ? 2 : 1,
                  }}
                >
                  <span>{active ? '✅' : '🏦'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold truncate" style={{ color: active ? 'var(--color-info)' : 'var(--color-text-primary)' }}>
                      {b.bank_name}
                    </p>
                    <p className="text-[10px] text-text-muted truncate">A/C {b.account_number} · IFSC: {b.ifsc}</p>
                  </div>
                  {b.is_primary && (
                    <span className="chip" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>Default</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="my-3 border-t" style={{ borderColor: 'var(--color-border)' }} />
          <p className="text-xs text-text-secondary">Or enter manually</p>
        </div>
      )}

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
