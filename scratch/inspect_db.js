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

async function inspect() {
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: {
        'apikey': key,
      }
    });
    if (!res.ok) {
      console.error(`Failed to fetch schema: ${res.status} ${res.statusText}`);
      return;
    }
    const schema = await res.json();
    console.log('=== Schema Definitions (Tables) ===');
    console.log(Object.keys(schema.definitions || {}));
    
    // Let's print details of 'organizations'
    if (schema.definitions && schema.definitions.organizations) {
      console.log('\n=== Organizations columns ===');
      console.log(JSON.stringify(schema.definitions.organizations.properties, null, 2));
    }
  } catch (err) {
    console.error(err);
  }
}

inspect();
