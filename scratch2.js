import { normalizeMediaPath } from './src/components/payments/mediaEvidence.js';

console.log(normalizeMediaPath('payment-evidence/bank-photo-123.jpg'));
console.log(normalizeMediaPath('media/payment-evidence/bank-photo-123.jpg'));
console.log(normalizeMediaPath('{"path":"payment-evidence/bank-photo-123.jpg"}'));
console.log(normalizeMediaPath('https://kzkissrwiejcvphsdxul.supabase.co/storage/v1/object/public/media/payment-evidence/bank-photo-123.jpg'));
