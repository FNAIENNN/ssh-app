const fs = require('fs');
const content = fs.readFileSync('FULL_PackingPage.jsx', 'utf-8');
const lines = content.split('\n');
const fixed = lines.filter(l => !l.startsWith('The above content shows the entire')).join('\n');
fs.writeFileSync('/home/user/Downloads/ssh-app/ssh-app/src/features/seed/payments/packing/PackingPage.jsx', fixed);
