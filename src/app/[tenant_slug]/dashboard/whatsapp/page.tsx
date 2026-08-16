import { supabase } from '@/lib/supabase';
import WhatsAppClient from './WhatsAppClient';

export const dynamic = 'force-dynamic';

export default async function WhatsAppPage() {
  // Fetch the active company
  const { data: companies, error } = await supabase
    .from('companies')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching company for whatsapp module:', error);
  }

  const company = companies && companies.length > 0 ? companies[0] : null;

  return (
    <WhatsAppClient company={company} />
  );
}
