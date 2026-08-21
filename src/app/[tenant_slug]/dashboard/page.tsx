import { createClient } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    tenant_slug: string;
  }>;
}

export default async function DashboardPage({ params }: PageProps) {
  const { tenant_slug } = await params;
  const supabase = await createClient();

  // 1. Fetch organization by slug
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, whatsapp_status')
    .eq('slug', tenant_slug)
    .maybeSingle();

  if (orgError || !org) {
    console.error('Organization not found for slug:', tenant_slug, orgError);
    redirect('/login');
  }

  // 2. Fetch conversations associated with this organization
  const { data: conversations, error } = await supabase
    .from('conversations')
    .select(`
      id,
      client_phone,
      operator_id,
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
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching conversations for dashboard:', error);
  }

  // Fetch operators associated with this organization
  const { data: operators, error: operatorsError } = await supabase
    .from('operators')
    .select('id, name, role, work_hours')
    .eq('company_id', org.id)
    .order('name');

  if (operatorsError) {
    console.error('Error fetching operators for dashboard:', operatorsError);
  }

  // 3. Fetch the last whatsapp status log to see if it is disconnected ('close')
  const { data: lastStatusLog } = await supabase
    .from('whatsapp_status_logs')
    .select('status, created_at')
    .eq('company_id', org.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <DashboardClient 
      initialConversations={conversations || []} 
      organization={org} 
      lastStatusLog={lastStatusLog}
      operators={operators || []}
    />
  );
}
