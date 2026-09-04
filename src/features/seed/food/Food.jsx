import { useState } from 'react';
import { supabase, TABLES } from '../../../lib/supabaseClient';
import { useSite } from '../../../hooks/useSite';
import { useToast } from '../../../hooks/useToast';

/**
 * Food Card (PRD §7.4) — intentionally minimal stub.
 * Pushes feed/food data to the external Canteen App via the `food_orders`
 * table (one-way sync, SSH → Canteen). Kept simple per the brief, ready to
 * wire to a webhook later.
 */
export default function Food() {
  const { siteId } = useSite();
  const toast = useToast();
  const [payload, setPayload] = useState('{\n  "meal": "lunch",\n  "count": 12\n}');

  async function pushToCanteen() {
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return toast.error('Payload must be valid JSON');
    }
    const { error } = await supabase.from(TABLES.foodOrders).insert({
      site_id: siteId,
      payload: parsed,
    });
    if (error) return toast.error(error.message);
    toast.success('Food order queued for Canteen sync');
  }

  return (
    <div className="card p-6 max-w-2xl">
      <h3 className="font-bold">🍱 Food</h3>
      <p className="text-sm text-text-secondary mt-1">
        Stub module — pushes feed/food data to the external Canteen App via the{' '}
        <code className="text-xs bg-[var(--color-surface)] px-1.5 py-0.5 rounded">food_orders</code> table.
      </p>

      <label className="field-label mt-4">Order payload (JSON)</label>
      <textarea
        className="field min-h-[140px] font-mono text-xs"
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
      />

      <button onClick={pushToCanteen} disabled={!siteId} className="btn-primary mt-3">
        ➤ Push to Canteen App
      </button>
    </div>
  );
}
