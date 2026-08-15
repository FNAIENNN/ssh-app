import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: ls, error: e1 } = await supabase.from('labour_suppliers').select('*').limit(1);
  console.log("labour_suppliers cols:", ls ? Object.keys(ls[0] || {}) : e1);

  const { data: hba, error: e2 } = await supabase.from('hatchery_bank_accounts').select('*').limit(1);
  console.log("hatchery_bank_accounts cols:", hba ? Object.keys(hba[0] || {}) : e2);
  
  const { data: ba, error: e3 } = await supabase.from('bank_accounts').select('*').limit(1);
  console.log("bank_accounts cols:", ba ? Object.keys(ba[0] || {}) : e3);
  
  const { data: p, error: e4 } = await supabase.from('payments').select('*').limit(1);
  console.log("payments cols:", p ? Object.keys(p[0] || {}) : e4);
}
run();
