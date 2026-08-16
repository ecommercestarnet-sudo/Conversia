const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://erojwnigzuhnzxjsdbxe.supabase.co';
const supabaseKey = 'sb_publishable_SP8P3jQmZZRAsvCnHruWnw_3wJY1Jlm';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const email = 'ailton2@bol.com.br';
  // Note: The user password isn't known to me, but if we query without password, we can't login.
  // Wait, did the user create a password like "123456" or "password"?
  // Let's try "123456" or similar, or I can just check if I can register a new user in the script
  // and see if the public.users record gets created for it!
  // Yes! We did register "test_agent_..." in the previous script. Let's sign in as that user and query!
  // The email was printed in the previous output, but we can generate a new one, sign up, sign in, and query.
  
  const testEmail = 'test_query_' + Math.random().toString(36).substring(7) + '@test.com';
  const password = 'password123';

  console.log(`Signing up: ${testEmail}`);
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password
  });

  if (signUpError) {
    console.error('Sign Up Error:', signUpError);
    return;
  }

  const userId = signUpData.user.id;
  console.log('Signed up user ID:', userId);

  // Authenticate as this user
  console.log('Signing in...');
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password
  });

  if (signInError) {
    console.error('Sign In Error:', signInError);
    return;
  }

  // Create a new client authenticated as this user
  const authClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    }
  });
  await authClient.auth.setSession(signInData.session);

  // Query public.users
  const { data: userRecord, error: userError } = await authClient
    .from('users')
    .select('*, organizations(*)')
    .eq('id', userId);

  console.log('User Record from public.users:', userRecord);
  console.log('User Record Error:', userError);
}

test();
