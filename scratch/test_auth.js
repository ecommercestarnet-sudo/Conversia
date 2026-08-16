const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://erojwnigzuhnzxjsdbxe.supabase.co';
const supabaseKey = 'sb_publishable_SP8P3jQmZZRAsvCnHruWnw_3wJY1Jlm';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const email = 'test_agent_' + Math.random().toString(36).substring(7) + '@test.com';
  const password = 'password123';

  console.log(`Attempting signup with Email: ${email}`);
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password
  });

  if (signUpError) {
    console.error('Sign Up Error:', signUpError);
    return;
  }

  console.log('Sign Up Success:', signUpData.user ? 'User created' : 'No user');

  console.log('Attempting signin...');
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (signInError) {
    console.error('Sign In Error:', signInError);
    return;
  }

  console.log('Sign In Success. User ID:', signInData.user.id);
}

test();
