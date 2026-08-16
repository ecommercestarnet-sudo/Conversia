'use server';

import { createClient } from '@/lib/auth-server';
import { revalidatePath } from 'next/cache';

export async function deleteOrganization(id: string) {
  try {
    const supabase = await createClient();
    
    // Security check: Only superadmin can delete organizations!
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Não autenticado.' };
    }
    
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
      
    if (userData?.role !== 'superadmin') {
      return { success: false, error: 'Acesso negado. Apenas superadmins podem realizar esta ação.' };
    }

    // Initialize a service-role supabase client to bypass RLS for this admin action
    const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Delete the organization
    const { error } = await supabaseAdmin
      .from('organizations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting organization:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Unhandled error in deleteOrganization:', error);
    return { success: false, error: error.message || 'Erro interno no servidor' };
  }
}
