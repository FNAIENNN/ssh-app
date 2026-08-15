import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPA_URL, process.env.SUPA_KEY);
async function run() {
  const { data, error } = await supabase.from('payments').select('*').eq('type', 'return');
  console.log(JSON.stringify(data, null, 2));
}
run();
