import { useState, useMemo } from 'react';
import SignaturePad from './SignaturePad';
import { useToast } from '../../../../hooks/useToast';

const WORKER_ROWS = [
  { sNo: 1, category: 'Workers' },
  { sNo: 2, category: 'Bike' },
  { sNo: 3, category: 'Auto' },
  { sNo: 4, category: 'Beta' },
  { sNo: 5, category: 'Others' },
];

export default function OutsideWorkersStep3({ initialSupervisorName = '', onComplete, onBack = null }) {
  const toast = useToast();

  const [tableData, setTableData] = useState(() =>
    WORKER_ROWS.map((r) => ({
      ...r,
      quantity: '',
      amount: '',
    }))
  );

  const [remarks, setRemarks] = useState('');
  const [supervisorName, setSupervisorName] = useState(initialSupervisorName);
  const [supervisorPhone, setSupervisorPhone] = useState('');
  const [supervisorSignature, setSupervisorSignature] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function handleRowChange(index, field, value) {
    setTableData((prev) =>
      prev.map((r, idx) => (idx === index ? { ...r, [field]: value } : r))
    );
  }

  // Calculate row total and grand total
  const calculatedRows = useMemo(() => {
    return tableData.map((r) => {
      const q = Number(r.quantity) || 0;
      const a = Number(r.amount) || 0;
      return {
        ...r,
        total: q * a,
      };
    });
  }, [tableData]);

  const grandTotal = useMemo(() => {
    return calculatedRows.reduce((sum, r) => sum + r.total, 0);
  }, [calculatedRows]);

  async function handleNext() {
    // Validate at least one worker row has a quantity entered
    const hasWorkers = calculatedRows.some((r) => Number(r.quantity) > 0);
    if (!hasWorkers) return toast.error('Enter at least one worker row with a quantity greater than 0');
    if (!remarks.trim()) return toast.error('Remarks are required before submitting');
    if (!supervisorName.trim()) return toast.error('Enter Supervisor Name');
    if (!supervisorPhone.trim()) return toast.error('Enter Supervisor Phone Number');
    if (!supervisorSignature) return toast.error('Provide Supervisor Digital Signature');

    setSubmitting(true);
    try {
      await onComplete({
        workers: calculatedRows,
        grandTotal,
        remarks,
        supervisorName,
        supervisorPhone,
        supervisorSignature,
      });
    } catch (err) {
      toast.error(err?.message || 'Error submitting Outside Workers data');
      setSubmitting(false);
    }
    // Note: setSubmitting(false) is NOT called on success because the parent
    // will navigate away — keeping submitting=true prevents a double-click.
  }

  return (
    <div className="card p-6 space-y-6 max-w-4xl mx-auto shadow-md border" style={{ borderColor: 'var(--color-primary)' }}>
      {/* Title */}
      <div className="text-center space-y-1">
        <h3 className="text-2xl font-black text-primary uppercase tracking-wide flex items-center justify-center gap-2">
          <span>👷</span> Outside Workers
        </h3>
        <p className="text-xs text-text-secondary">
          Enter outside workers and vehicle details for seed stocking.
        </p>
      </div>

      {/* Workers Table */}
      <div className="overflow-x-auto rounded-[12px] border" style={{ borderColor: 'var(--color-border)' }}>
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr style={{ background: 'var(--color-primary)', color: '#fff' }}>
              <th className="p-3 font-extrabold text-center border-r border-white/20">Serial Number</th>
              <th className="p-3 font-extrabold">Category</th>
              <th className="p-3 font-extrabold w-32">Quantity</th>
              <th className="p-3 font-extrabold w-36">Amount (₹)</th>
              <th className="p-3 font-extrabold text-right w-40">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            {calculatedRows.map((r, idx) => (
              <tr key={r.sNo} className="border-b hover:bg-slate-50 transition" style={{ borderColor: 'var(--color-border)' }}>
                <td className="p-3 font-bold text-center border-r text-text-muted" style={{ borderColor: 'var(--color-border)' }}>
                  {r.sNo}
                </td>
                <td className="p-3 font-extrabold text-sm text-slate-800">
                  {r.category}
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    className="field py-1.5 text-xs font-semibold"
                    placeholder="Qty"
                    value={r.quantity}
                    onChange={(e) => handleRowChange(idx, 'quantity', e.target.value)}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    className="field py-1.5 text-xs font-semibold"
                    placeholder="Rate ₹"
                    value={r.amount}
                    onChange={(e) => handleRowChange(idx, 'amount', e.target.value)}
                  />
                </td>
                <td className="p-3 text-right font-extrabold text-sm text-primary">
                  ₹{r.total.toLocaleString('en-IN')}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-extrabold text-sm border-t-2" style={{ borderColor: 'var(--color-border)' }}>
              <td colSpan={4} className="p-3 text-right">Grand Total:</td>
              <td className="p-3 text-right text-success font-black text-base">
                ₹{grandTotal.toLocaleString('en-IN')}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Multiline Remarks */}
      <div>
        <label className="field-label">Remarks</label>
        <textarea
          rows={3}
          className="field text-sm"
          placeholder="Enter remarks or additional notes..."
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
      </div>

      {/* Supervisor Details & Digital Signature */}
      <div className="card p-5 space-y-4 border">
        <h4 className="font-extrabold text-base text-primary border-b pb-2">✍️ Supervisor Sign-off</h4>
        <div>
          <label className="field-label">Supervisor Name *</label>
          <input
            className="field text-sm"
            placeholder="Enter Supervisor Name"
            value={supervisorName}
            onChange={(e) => setSupervisorName(e.target.value)}
          />
        </div>

        <div>
          <label className="field-label">Supervisor Phone Number</label>
          <input
            type="tel"
            className="field text-sm"
            placeholder="Enter Phone Number"
            value={supervisorPhone}
            onChange={(e) => setSupervisorPhone(e.target.value)}
          />
        </div>

        <div>
          <label className="field-label">Supervisor Signature *</label>
          <SignaturePad onSave={(sig) => setSupervisorSignature(sig)} value={supervisorSignature} />
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="btn-ghost text-sm font-bold px-5 py-3 border rounded-[10px] flex items-center gap-1.5"
            style={{ borderColor: 'var(--color-border)', color: '#000' }}
          >
            <span>←</span> Back
          </button>
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={submitting}
          className="btn-success flex-1 text-base py-3.5 font-extrabold shadow-lg flex items-center justify-center gap-2"
        >
          <span>{submitting ? '⏳ Submitting…' : '✅ Complete Stocking / Submit'}</span>
          <span>➔</span>
        </button>
      </div>
    </div>
  );
}
