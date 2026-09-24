import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await supabase
        .from('payments')
        .select('id, payment_method_details')
        .not('payment_method_details', 'is', null)
        .limit(20);

    if (error) {
        console.error(error);
        return;
    }

    for (const row of data) {
        if (row.payment_method_details?.photo || row.payment_method_details?.voice) {
            console.log('ID:', row.id);
            console.log('Photo:', JSON.stringify(row.payment_method_details?.photo));
            console.log('Voice:', JSON.stringify(row.payment_method_details?.voice));
            console.log('------------------');
        }
    }
}
run();
