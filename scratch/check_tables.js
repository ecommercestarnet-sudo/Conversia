const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.rpc('get_tables'); // Or just run select queries on companies and organizations
  console.log('Testing companies...');
  const { data: c, error: ec } = await supabase.from('companies').select('*').limit(1);
  console.log('companies:', c, ec);
  
  console.log('Testing organizations...');
  const { data: o, error: eo } = await supabase.from('organizations').select('*').limit(1);
  console.log('organizations:', o, eo);
}

run();
