const hatcheries = [
  { id: 'h-1', name: 'Hatchery A' },
  { id: 'h-2', name: 'Hatchery A' }
];
const bankAccounts = [
  { id: 'hba-1', hatchery_id: 'h-1', bank_name: 'Andhra Bank', account_number: '111' },
  { id: 'hba-2', hatchery_id: 'h-2', bank_name: 'HDFC', account_number: '222' }
];

console.log("Unique Hatchery test by ID:");
const uniqueHatcheries = [];
const seenIds = new Set();
for (const h of hatcheries) {
  if (!seenIds.has(h.id)) {
    seenIds.add(h.id);
    uniqueHatcheries.push(h);
  }
}
console.log("unique hatcheries (by ID):", uniqueHatcheries.map(h => h.id + " - " + h.name));

const selectedHatchery = uniqueHatcheries[0]; // h-1

const accounts = bankAccounts.filter((b) => b.hatchery_id === selectedHatchery.id);

console.log("\nSelected Hatchery ID:", selectedHatchery.id);
console.log("Matching bank accounts:");
accounts.forEach((a, i) => console.log(`${i+1}. ${a.id} - ${a.bank_name} - ${a.account_number}`));
