import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data, error } = await supabase.from('payments').select('payment_method_details, created_at, amount, status').order('created_at', { ascending: false }).limit(5);
  console.log('Error:', error);
  console.log('Payments:', JSON.stringify(data, null, 2));
}
test();
