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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('Fetching last 10 messages from database...');
  const { data, error } = await supabase
    .from('messages')
    .select('id, content, sender_type, created_at, conversation_id')
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  data.forEach(m => {
    console.log(`[${m.created_at}] ${m.sender_type.padEnd(8)} | Conv: ${m.conversation_id.substring(0,8)} | ${m.content.substring(0, 100)}`);
  });
}

run();
