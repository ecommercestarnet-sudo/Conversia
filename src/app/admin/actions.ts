'use server';

import { createClient } from '@/lib/auth-server';
import { revalidatePath } from 'next/cache';

export async function deleteOrganization(id: string) {
  try {
    const supabase = await createClient();
    
    // Security check: Only authenticated users can call this RPC
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Não autenticado.' };
    }

    // Call the SECURITY DEFINER RPC which validates the superadmin role and deletes the row
    const { data: wasDeleted, error } = await supabase.rpc('delete_organization_admin', { 
      org_id: id 
    });

    if (error) {
      console.error('Error deleting organization via RPC:', error);
      return { success: false, error: error.message };
    }

    if (!wasDeleted) {
      return { success: false, error: 'A organização não foi encontrada ou já foi deletada.' };
    }

    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Unhandled error in deleteOrganization:', error);
    return { success: false, error: error.message || 'Erro interno no servidor' };
  }
}
