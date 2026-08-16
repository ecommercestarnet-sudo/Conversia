import { supabase } from '@/lib/supabase';
import PlaybookClient from './PlaybookClient';

export const dynamic = 'force-dynamic';

export default async function PlaybookPage() {
  // 1. Fetch the first company to act as our tenant
  const { data: companies, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .limit(1);

  if (companyError) {
    console.error('Error fetching company for playbook:', companyError);
  }

  const company = companies && companies.length > 0 ? companies[0] : null;

  // 2. Fetch the existing playbook for this company if it exists
  let playbook = null;
  if (company) {
    const { data: playbookData, error: playbookError } = await supabase
      .from('ai_playbooks')
      .select('*')
      .eq('organization_id', company.id)
      .maybeSingle();

    if (playbookError) {
      console.error('Error fetching playbook data:', playbookError);
    } else {
      playbook = playbookData;
    }
  }

  // 3. Render the client form component
  return (
    <PlaybookClient 
      company={company} 
      initialPlaybook={playbook} 
    />
  );
}
