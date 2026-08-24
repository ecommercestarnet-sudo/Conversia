import { createClient } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    tenant_slug: string;
  }>;
}

export default async function SettingsPage({ params }: PageProps) {
  const { tenant_slug } = await params;
  const supabase = await createClient();

  // 1. Fetch organization by slug
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, slug, evolution_instance_name, whatsapp_status, owner_whatsapp, owner_name')
    .eq('slug', tenant_slug)
    .maybeSingle();

  if (orgError || !org) {
    console.error('Organization not found for settings:', tenant_slug, orgError);
    redirect('/login');
  }

  // 2. Fetch the operators for this organization
  const { data: operators, error: operatorsError } = await supabase
    .from('operators')
    .select('*')
    .eq('company_id', org.id)
    .order('created_at', { ascending: false });

  if (operatorsError) {
    console.error('Error fetching operators data:', operatorsError);
  }

  // 3. Fetch the last whatsapp status log to see if it is disconnected ('close')
  const { data: lastStatusLog } = await supabase
    .from('whatsapp_status_logs')
    .select('status, created_at')
    .eq('company_id', org.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 4. Fetch the user's role in the organization
  const { data: { user } } = await supabase.auth.getUser();
  let userRole = 'user';
  if (user) {
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (userData) {
      userRole = userData.role;
    }
  }

  return (
    <SettingsClient 
      company={org} 
      initialOperators={operators || []} 
      lastStatusLog={lastStatusLog}
      userRole={userRole}
    />
  );
}
