import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: sections } = await supabase.from('sections').select('*').ilike('name', '%A%');
  if (sections && sections.length > 0) {
    const sec = sections[0];
    const { data: tanks } = await supabase.from('tanks').select('name').eq('section_id', sec.id).order('name');
    console.log('Tanks in Section A:', tanks.map(t => t.name).join(', '));
  } else {
    console.log('Section A not found');
  }
}
check();
