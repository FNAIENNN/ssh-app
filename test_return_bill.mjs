import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Assuming we can read .env
const envFile = fs.readFileSync(path.resolve('.env'), 'utf8');
const lines = envFile.split('\n');
let supabaseUrl = '';
let supabaseKey = '';
lines.forEach(line => {
  if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) supabaseKey = line.split('=')[1].trim();
});

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: bills } = await supabase.from('bills').select('*').eq('type', 'return').limit(1);
  if (bills && bills.length > 0) {
    const bill = bills[0];
    console.log('Return Bill:', JSON.stringify(bill, null, 2));
    
    const { data: payments } = await supabase.from('payments').select('*').eq('bill_id', bill.id);
    console.log('Payments:', JSON.stringify(payments, null, 2));

    const { data: seedOrder } = await supabase.from('bills').select('*').eq('id', bill.packing_data?.order_id);
    console.log('Original Order:', JSON.stringify(seedOrder, null, 2));
  } else {
    console.log('No return bills found.');
  }
}
check();
