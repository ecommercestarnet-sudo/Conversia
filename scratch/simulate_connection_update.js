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

const url = env.NEXT_PUBLIC_SUPABASE_URL || 'https://erojwnigzuhnzxjsdbxe.supabase.co';
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function simulate() {
  console.log('=== WhatsApp Connection Log Simulation ===');
  
  // 1. Fetch a valid organization using check_db_diagnostics
  console.log('Fetching organization info using check_db_diagnostics RPC...');
  const { data: diagnosticData, error: diagErr } = await supabase.rpc('check_db_diagnostics');
  if (diagErr) {
    console.error('Error calling check_db_diagnostics:', diagErr);
    return;
  }
  
  const lastOrg = diagnosticData?.last_org;
  if (!lastOrg || !lastOrg.id) {
    console.error('No organization found in database!');
    return;
  }
  
  console.log(`Using Organization from DB: "${lastOrg.name}" (ID: ${lastOrg.id}, Slug: ${lastOrg.slug})`);

  // Ensure it has an instance name set for testing
  const instanceName = lastOrg.evolution_instance_name || 'test-inst-123';
  console.log(`Setting evolution_instance_name of organization to "${instanceName}"...`);
  await supabase
    .from('organizations')
    .update({ evolution_instance_name: instanceName })
    .eq('id', lastOrg.id);

  // 2. Insert offline ('close') log directly to verify schema and RLS
  console.log('\n2. Testing direct database insert into whatsapp_status_logs...');
  const testOfflineLog = {
    company_id: lastOrg.id,
    status: 'close',
    reason: 'Evolution API simulation offline test',
    created_at: new Date().toISOString()
  };
  
  const { data: insertedLog, error: insertErr } = await supabase
    .from('whatsapp_status_logs')
    .insert(testOfflineLog)
    .select('*')
    .maybeSingle();
    
  if (insertErr) {
    console.error('Error inserting log into whatsapp_status_logs:', insertErr);
  } else {
    console.log('Successfully inserted connection log:', insertedLog);
  }

  // 3. Query the connection logs to ensure it can be retrieved
  console.log('\n3. Testing direct database query (whatsapp_status_logs)...');
  const { data: logs, error: queryErr } = await supabase
    .from('whatsapp_status_logs')
    .select('*')
    .eq('company_id', lastOrg.id)
    .order('created_at', { ascending: false })
    .limit(5);
    
  if (queryErr) {
    console.error('Error querying whatsapp_status_logs:', queryErr);
  } else {
    console.log(`Successfully retrieved ${logs ? logs.length : 0} logs for organization:`);
    if (logs) {
      logs.forEach(l => {
        console.log(`  - Status: [${l.status}] at ${l.created_at} | Reason: ${l.reason}`);
      });
    }
  }

  // 4. Test Webhook Route local simulation if server is running
  console.log('\n4. Simulating Webhook POST to local API Route...');
  const webhookUrl = 'http://localhost:3000/api/webhook/whatsapp';
  
  const simulatedPayload = {
    event: 'connection.update',
    instance: instanceName,
    data: {
      state: 'close',
      statusReason: 401,
      disconnectionReasonCode: 401
    }
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(simulatedPayload)
    });
    
    console.log(`Local Webhook response status: ${response.status} ${response.statusText}`);
    const resBody = await response.json();
    console.log('Local Webhook response body:', resBody);
  } catch (err) {
    console.log(`Could not connect to local server at ${webhookUrl} (Next.js server might not be running). This is expected if the server is off.`);
  }
}

simulate().catch(console.error);
