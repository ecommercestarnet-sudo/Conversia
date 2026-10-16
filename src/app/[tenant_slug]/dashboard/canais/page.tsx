import { createClient } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import ChannelsClient from './ChannelsClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    tenant_slug: string;
  }>;
}

export default async function ChannelsPage({ params }: PageProps) {
  const { tenant_slug } = await params;
  const supabase = await createClient();

  // 1. Fetch organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', tenant_slug)
    .maybeSingle();

  if (orgError || !org) {
    console.error('Organization not found for channels page:', tenant_slug, orgError);
    redirect('/login');
  }

  // 2. Fetch last status log of WhatsApp
  const { data: lastStatusLog } = await supabase
    .from('whatsapp_status_logs')
    .select('status, created_at')
    .eq('company_id', org.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <ChannelsClient 
      company={org} 
      lastStatusLog={lastStatusLog} 
      tenantSlug={tenant_slug}
    />
  );
}
