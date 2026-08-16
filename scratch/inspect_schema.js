const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://erojwnigzuhnzxjsdbxe.supabase.co';
const supabaseKey = 'sb_publishable_SP8P3jQmZZRAsvCnHruWnw_3wJY1Jlm';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  // Let's run a query to get a single row from conversations and messages
  // to see their columns.
  const { data: conversations, error: errConv } = await supabase.from('conversations').select('*').limit(1);
  console.log('Conversation Row:', conversations, errConv);

  const { data: messages, error: errMsgs } = await supabase.from('messages').select('*').limit(1);
  console.log('Message Row:', messages, errMsgs);

  const { data: analyses, error: errAnalyses } = await supabase.from('analyses').select('*').limit(1);
  console.log('Analysis Row:', analyses, errAnalyses);
}

inspect();
