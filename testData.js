import { createLocalClient } from './src/lib/localClient.js';

const supabase = createLocalClient();

async function run() {
  const { data: hatcheries } = await supabase.from('hatcheries').select('*');
  const { data: accounts } = await supabase.from('hatchery_bank_accounts').select('*');
  
  console.log("HATCHERIES:");
  hatcheries.forEach(h => console.log(`ID: ${h.id}, Name: ${h.name || h.hatchery_name}, Acc: ${h.account_number}`));
  
  console.log("\nBANK ACCOUNTS:");
  accounts.forEach(a => console.log(`ID: ${a.id}, Hatchery ID: ${a.hatchery_id}, Acc: ${a.account_number}`));
}

run();
