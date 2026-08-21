import { createClient } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import WhatsAppClient from './WhatsAppClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    tenant_slug: string;
  }>;
}

export default async function WhatsAppPage({ params }: PageProps) {
  const { tenant_slug } = await params;
  const supabase = await createClient();

  // 1. Fetch organization by slug
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', tenant_slug)
    .maybeSingle();

  if (orgError || !org) {
    console.error('Organization not found for whatsapp page:', tenant_slug, orgError);
    redirect('/login');
  }

  // 2. Fetch the last whatsapp status log to see if it is disconnected ('close')
  const { data: lastStatusLog } = await supabase
    .from('whatsapp_status_logs')
    .select('status, created_at')
    .eq('company_id', org.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 3. Render client component, mapping org to company for compatibility
  return (
    <WhatsAppClient company={org} lastStatusLog={lastStatusLog} />
  );
}
