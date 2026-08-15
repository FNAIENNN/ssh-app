import { buildDemoData } from './src/lib/demoData.js';
const data = buildDemoData();

const hatcheries = data.hatcheries;
const bankAccounts = data.hatchery_bank_accounts;

console.log("Unique Hatchery test:");
const uniqueHatcheries = [];
const seenIds = new Set();
for (const h of hatcheries) {
  if (!seenIds.has(h.id)) {
    seenIds.add(h.id);
    uniqueHatcheries.push(h);
  }
}
console.log("unique:", uniqueHatcheries.map(h => h.id + " - " + (h.name || h.hatchery_name)));

const selectedHatchery = uniqueHatcheries[0]; // h-1

const accounts = bankAccounts.filter((b) => b.hatchery_id === selectedHatchery.id);
const seen = new Set();
const filteredAccounts = accounts.filter((a) => {
  const key = `${(a.account_number || '').trim()}_${(a.ifsc_code || a.ifsc || '').trim()}`;
  if (!key || key === '_') return true;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

console.log("\nSelected Hatchery ID:", selectedHatchery.id);
console.log("Matching bank accounts:");
filteredAccounts.forEach((a, i) => console.log(`${i+1}. ${a.id} - ${a.bank_name} - ${a.account_number}`));

