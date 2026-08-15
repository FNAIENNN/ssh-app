import { useEffect, useState } from 'react';
import { supabase, TABLES } from '../../../../lib/supabaseClient';
import { Empty } from '../../../../components/ui/State';
import RequestPayment from '../../../../components/payments/RequestPayment';

/**
 * Outside Workers (PRD §7.2) — ad-hoc labor payments.
 * Reuses the same Request Payment component. The worker scope is captured via
 * the note; an optional "Link to Bill" picker lets the payment roll up into a
 * bill's Workers row in History.
 */
export default function OutsideWorkers({ siteId }) {
  const [note, setNote] = useState('');
  const [bills, setBills] = useState([]);
  const [billId, setBillId] = useState('');

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      const { data } = await supabase
        .from(TABLES.bills)
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false });
      setBills(data ?? []);
    })();
  }, [siteId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="card p-5 lg:col-span-1">
        <h3 className="font-bold mb-3">Worker details</h3>
        <label className="field-label">Work / worker note</label>
        <textarea
          className="field min-h-[120px]"
          placeholder="e.g. 4 workers, net mending, Section C — 2 days"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {bills.length > 0 && (
          <div className="mt-3">
            <label className="field-label">Link to Bill (optional)</label>
            <select
              className="field"
              value={billId}
              onChange={(e) => setBillId(e.target.value)}
            >
              <option value="">Not linked</option>
              {bills.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bill_number}
                </option>
              ))}
            </select>
          </div>
        )}

        <p className="text-xs text-text-muted mt-2">
          Payment is captured via the Request Payment panel.
        </p>
        {!siteId && <Empty title="Select a site" />}
      </div>

      <div className="lg:col-span-2">
        <RequestPayment type="outside_worker" siteId={siteId} billId={billId || null} />
      </div>
    </div>
  );
}
