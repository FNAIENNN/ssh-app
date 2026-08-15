import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function inspect() {
  const { data: payments, error: pErr } = await supabase
    .from('payments')
    .select('id, type, bill_id, related_tank_id, packing_data, note, holder_name, vehicle_no')
    .eq('type', 'return')
    .limit(5);
    
  if (pErr) console.error("Payment Error:", pErr);
  console.log("PAYMENTS with type='return':", JSON.stringify(payments, null, 2));

  const { data: bills, error: bErr } = await supabase
    .from('bills')
    .select('id, bill_number, type, packing_data, original_tank, drum_name')
    .in('type', ['return', 'return_bill'])
    .limit(5);
    
  if (bErr) console.error("Bill Error:", bErr);
  console.log("BILLS with type='return' or 'return_bill':", JSON.stringify(bills, null, 2));
}

inspect();
