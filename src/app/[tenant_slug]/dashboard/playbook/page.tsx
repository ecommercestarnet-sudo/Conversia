import { createClient } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import PlaybookClient from './PlaybookClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    tenant_slug: string;
  }>;
}

export default async function PlaybookPage({ params }: PageProps) {
  const { tenant_slug } = await params;
  const supabase = await createClient();

  // 1. Fetch organization by slug
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('slug', tenant_slug)
    .maybeSingle();

  if (orgError || !org) {
    console.error('Organization not found for playbook:', tenant_slug, orgError);
    redirect('/login');
  }

  // 2. Fetch the existing playbook for this organization if it exists
  const { data: playbookData, error: playbookError } = await supabase
    .from('ai_playbooks')
    .select('*')
    .eq('organization_id', org.id)
    .maybeSingle();

  if (playbookError) {
    console.error('Error fetching playbook data:', playbookError);
  }

  // 3. Render the client form component (passing org mapped as 'company' to maintain compatibility)
  return (
    <PlaybookClient 
      company={org} 
      initialPlaybook={playbookData} 
    />
  );
}
