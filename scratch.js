import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const path = 'payment-evidence/test.jpg';
  const { data: signed, error: signError } = await supabase.storage.from('media').createSignedUrl(path, 3600);
  console.log('Signed:', signed, signError);

  const { data: publicData } = supabase.storage.from('media').getPublicUrl(path);
  console.log('Public:', publicData);
}
test();
