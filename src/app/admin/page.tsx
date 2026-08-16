import { createClient } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import AdminClient from './AdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = await createClient();

  // 1. Double check session authorization
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 2. Fetch logged in user's role to confirm they are a superadmin
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'superadmin') {
    redirect('/');
  }

  // 3. Fetch all organizations
  const { data: organizations, error } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching organizations for superadmin panel:', error);
  }

  // 4. Render styled admin client view
  return (
    <AdminClient initialOrganizations={organizations || []} />
  );
}
