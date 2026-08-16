const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const apiUrl = env.EVOLUTION_API_URL || 'http://216.238.122.167:8080';
const apiKey = env.EVOLUTION_API_KEY || 'minha_chave_secreta_123';
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('=== DB STATUS ===');
  const { data: companies } = await supabase.from('companies').select('name, evolution_instance_name, whatsapp_status');
  console.log(companies);

  console.log('\n=== EVOLUTION API INSTANCES ===');
  const fetchResp = await fetch(`${apiUrl}/instance/fetchInstances`, { headers: { 'apikey': apiKey } });
  const list = await fetchResp.json();
  const instances = Array.isArray(list) ? list : [];
  instances.forEach(i => {
    console.log(`- ${i.name || i.instanceName}: status=${i.connectionStatus}, reason=${i.disconnectionReasonCode}`);
  });
}

run();
