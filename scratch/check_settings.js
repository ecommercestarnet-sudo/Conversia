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
  console.log('Fetching settings for instance-01f18917-1686...');
  try {
    const fetchResp = await fetch(`${apiUrl.replace(/\/$/, '')}/settings/find/instance-01f18917-1686`, {
      headers: { 'apikey': apiKey }
    });
    if (fetchResp.ok) {
      const data = await fetchResp.json();
      console.log('Current Settings:', JSON.stringify(data, null, 2));
      
      // Update settings if not saving messages
      /*
      const updateResp = await fetch(`${apiUrl.replace(/\/$/, '')}/settings/set/instance-01f18917-1686`, {
        method: 'POST',
        headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookBase64: true,
          readMessages: false,
          keepOpen: false
        }) // The exact settings payload depends on Evolution API version
      });
      */
    } else {
      console.log(`Failed: ${fetchResp.status} ${fetchResp.statusText}`);
      console.log(await fetchResp.text());
    }
  } catch (err) {
    console.error(err);
  }
}

run();
