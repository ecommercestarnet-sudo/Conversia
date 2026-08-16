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

const apiUrl = (env.EVOLUTION_API_URL || 'http://216.238.122.167:8080').replace(/\/$/, '');
const apiKey = env.EVOLUTION_API_KEY;

async function run() {
  console.log('=== 1. API Root (confirming which server) ===');
  const rootResp = await fetch(apiUrl, { headers: { 'apikey': apiKey } });
  console.log(await rootResp.json());

  console.log('\n=== 2. ALL Instances on this server ===');
  const instResp = await fetch(`${apiUrl}/instance/fetchInstances`, { headers: { 'apikey': apiKey } });
  const instances = await instResp.json();
  const list = Array.isArray(instances) ? instances : (instances.instances || []);
  if (list.length === 0) {
    console.log('NO INSTANCES FOUND ON THIS SERVER!');
  } else {
    list.forEach(inst => {
      const name = inst.name || inst.instanceName || inst.instance?.instanceName || JSON.stringify(inst).slice(0, 100);
      const state = inst.connectionStatus || inst.state || inst.instance?.state || 'unknown';
      const owner = inst.ownerJid || inst.owner || '';
      console.log(`  - ${name} | state=${state} | owner=${owner}`);
    });
  }

  console.log('\n=== 3. Webhook config for each instance ===');
  for (const inst of list) {
    const name = inst.name || inst.instanceName || inst.instance?.instanceName;
    if (!name) continue;
    try {
      const whResp = await fetch(`${apiUrl}/webhook/find/${name}`, { headers: { 'apikey': apiKey } });
      if (whResp.ok) {
        const whData = await whResp.json();
        console.log(`  [${name}] webhook:`, JSON.stringify(whData, null, 2));
      } else {
        console.log(`  [${name}] webhook: ${whResp.status} ${await whResp.text()}`);
      }
    } catch (e) {
      console.log(`  [${name}] webhook error:`, e.message);
    }
  }

  console.log('\n=== 4. Settings for each instance ===');
  for (const inst of list) {
    const name = inst.name || inst.instanceName || inst.instance?.instanceName;
    if (!name) continue;
    try {
      const setResp = await fetch(`${apiUrl}/settings/find/${name}`, { headers: { 'apikey': apiKey } });
      if (setResp.ok) {
        const setData = await setResp.json();
        console.log(`  [${name}] settings:`, JSON.stringify(setData, null, 2));
      } else {
        console.log(`  [${name}] settings: ${setResp.status} ${await setResp.text()}`);
      }
    } catch (e) {
      console.log(`  [${name}] settings error:`, e.message);
    }
  }

  console.log('\n=== 5. Try sending a test message FROM the instance ===');
  for (const inst of list) {
    const name = inst.name || inst.instanceName || inst.instance?.instanceName;
    const state = inst.connectionStatus || inst.state || inst.instance?.state || 'unknown';
    if (!name || state !== 'open') continue;
    console.log(`  Sending test message from ${name}...`);
    try {
      const msgResp = await fetch(`${apiUrl}/message/sendText/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
        body: JSON.stringify({
          number: '558591038188',
          text: 'TESTE_WEBHOOK_' + Date.now()
        })
      });
      const msgData = await msgResp.text();
      console.log(`  Send result (${msgResp.status}):`, msgData.slice(0, 500));
    } catch (e) {
      console.log(`  Send error:`, e.message);
    }
  }
}

run().catch(console.error);
