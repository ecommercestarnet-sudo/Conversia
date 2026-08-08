import { supabase } from '@/lib/supabase';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // Query all conversations with their associated analyses and messages
  const { data: conversations, error } = await supabase
    .from('conversations')
    .select(`
      id,
      client_phone,
      created_at,
      analyses (
        id,
        overall_score,
        scores,
        summary,
        strengths,
        weaknesses,
        recommendations,
        objections,
        created_at
      ),
      messages (
        id,
        sender_type,
        content,
        created_at
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching conversations for dashboard:', error);
  }

  // Pass retrieved data to the client-side interactive component
  return (
    <DashboardClient initialConversations={conversations || []} />
  );
}
