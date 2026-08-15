import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://kzkissrwiejcvphsdxul.supabase.co',
  'sb_publishable_nKyN4mmmUvjvxVfKxSW-RQ_K-3qZaqF'
);

async function run() {
  const { data, error } = await supabase.from('bills').select('id, type, bill_number, original_bill_id, packing_data').eq('type', 'return');
  console.log("Error:", error);
  console.log("Returns count:", data?.length);
  if (data && data.length > 0) {
    console.log("Sample:", data[data.length - 1]);
  }
}
run();
