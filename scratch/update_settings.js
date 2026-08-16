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

async function run() {
  console.log('Enabling alwaysOnline for instance-01f18917-1686...');
  try {
    const updateResp = await fetch(`${apiUrl.replace(/\/$/, '')}/settings/set/instance-01f18917-1686`, {
      method: 'POST',
      headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rejectCall: false,
        msgCall: "",
        groupsIgnore: false,
        alwaysOnline: true,
        readMessages: true,
        readStatus: false,
        syncFullHistory: false
      })
    });
    
    if (updateResp.ok) {
      console.log('Settings updated successfully!');
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
