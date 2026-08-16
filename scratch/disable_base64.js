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
const apiKey = env.EVOLUTION_API_KEY;
const instanceName = 'org_01f18917-6446-4e49-ba48-0c8f2702852f_1786831562';
const webhookUrlSetting = `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

async function run() {
  console.log(`Updating webhook config for ${instanceName} to disable base64...`);
  try {
    const updateResp = await fetch(`${apiUrl.replace(/\/$/, '')}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrlSetting,
          byEvents: false,
          base64: false, // Set to false to prevent internal base64 encoding crashes
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'MESSAGES_DELETE',
            'SEND_MESSAGE',
            'CONNECTION_UPDATE'
          ]
        }
      })
    });
    
    if (updateResp.ok) {
      console.log('Webhook updated successfully!');
      const data = await updateResp.json();
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`Failed: ${updateResp.status} ${updateResp.statusText}`);
      console.log(await updateResp.text());
    }
  } catch (err) {
    console.error(err);
  }
}

run();
