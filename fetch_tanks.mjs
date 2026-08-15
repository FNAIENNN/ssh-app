import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://kzkissrwiejcvphsdxul.supabase.co',
  'sb_publishable_nKyN4mmmUvjvxVfKxSW-RQ_K-3qZaqF'
);

async function checkTanks() {
  const { data, error } = await supabase.from('tanks').select('*');
  if (error) {
    console.error('Error fetching tanks:', error);
    return;
  }
  
  const invalidTanks = data.filter(t => !/^[a-zA-Z]/.test(t.name) || t.name === '7');
  
  console.log('All Tanks Count:', data.length);
  console.log('Invalid Tanks:', invalidTanks);
  
  // If there are invalid tanks, let's also fetch the sections so we know where they belong
  if (invalidTanks.length > 0) {
    const sectionIds = [...new Set(invalidTanks.map(t => t.section_id))];
    const { data: sections } = await supabase.from('sections').select('*').in('id', sectionIds);
    console.log('Sections containing invalid tanks:', sections);
  }
}

checkTanks();
