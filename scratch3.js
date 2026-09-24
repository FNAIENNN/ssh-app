import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data, error } = await supabase.storage.from('media').list('payment-evidence', { limit: 10, sortBy: { column: 'created_at', order: 'desc' } });
  console.log('List Error:', error);
  console.log('Recent Files:', data);
}
test();
