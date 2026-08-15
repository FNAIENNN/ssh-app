import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: h } = await supabase.from('hatcheries').select('*');
  console.log("hatcheries:", h?.length, h);
}
run();
