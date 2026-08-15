const hatcheries = [
  { id: 'h-1', hatchery_name: 'Hatchery A' },
  { id: 'h-2', hatchery_name: 'Hatchery A' }
];
const bankAccounts = [
  { id: 'hba-1', hatchery_id: 'h-1', bank_name: 'Andhra Bank', account_number: '111' },
  { id: 'hba-2', hatchery_id: 'h-2', bank_name: 'HDFC', account_number: '222' }
];

const search = "";
let result = hatcheries;

const uniqueByName = [];
const seenNames = new Set();
for (const h of result) {
  const nameKey = (h.hatchery_name || '').trim().toLowerCase();
  if (!nameKey || !seenNames.has(nameKey)) {
    if (nameKey) seenNames.add(nameKey);
    uniqueByName.push(h);
  }
}
console.log("Dropdown hatcheries:", uniqueByName.map(h => h.hatchery_name));

const selectedHatchery = uniqueByName[0];

const targetName = (selectedHatchery.hatchery_name || '').trim().toLowerCase();
const matchingHatcheryIds = new Set(
  hatcheries
    .filter(h => (h.hatchery_name || '').trim().toLowerCase() === targetName)
    .map(h => h.id)
);
matchingHatcheryIds.add(selectedHatchery.id);

const accounts = bankAccounts.filter((b) => matchingHatcheryIds.has(b.hatchery_id));

console.log("Matching bank accounts:");
accounts.forEach(a => console.log(a.bank_name, a.account_number));
