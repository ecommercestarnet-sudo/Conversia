// Migration SQL to add Instagram fields to organizations and conversations
// Execute this query in the Supabase SQL Editor:
//
// ALTER TABLE organizations 
// ADD COLUMN IF NOT EXISTS instagram_account_id text,
// ADD COLUMN IF NOT EXISTS instagram_username text,
// ADD COLUMN IF NOT EXISTS instagram_access_token text,
// ADD COLUMN IF NOT EXISTS instagram_status text DEFAULT 'disconnected';
//
// ALTER TABLE conversations
// ADD COLUMN IF NOT EXISTS channel text DEFAULT 'whatsapp',
// ADD COLUMN IF NOT EXISTS instagram_sender_id text;
//
// CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
