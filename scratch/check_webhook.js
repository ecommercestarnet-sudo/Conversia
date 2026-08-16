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
const instanceName = 'c01f1891764';

async function run() {
  console.log(`Fetching webhook config for ${instanceName}...`);
  try {
    const fetchResp = await fetch(`${apiUrl.replace(/\/$/, '')}/webhook/find/${instanceName}`, {
      headers: { 'apikey': apiKey }
    });
    if (fetchResp.ok) {
      const data = await fetchResp.json();
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`Failed: ${fetchResp.status} ${fetchResp.statusText}`);
      console.log(await fetchResp.text());
    }
  } catch (err) {
    console.error(err);
  }
}

run();
