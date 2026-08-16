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
  console.log(`Checking connectionState for 'atendimento'...`);
  try {
    const fetchResp = await fetch(`${apiUrl.replace(/\/$/, '')}/instance/connectionState/atendimento`, {
      headers: { 'apikey': apiKey }
    });
    console.log(`Status: ${fetchResp.status} ${fetchResp.statusText}`);
    const data = await fetchResp.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}

run();
