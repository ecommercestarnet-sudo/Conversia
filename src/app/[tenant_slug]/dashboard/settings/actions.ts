'use server';

import { createClient } from '@/lib/auth-server';
import { revalidatePath } from 'next/cache';

export interface CompanySettingsData {
  company_id: string;
  owner_whatsapp: string;
}

export interface OperatorFormData {
  id?: string;
  company_id: string;
  name: string;
  role?: string;
  work_hours?: string;
}

export async function saveCompanySettings(data: CompanySettingsData) {
  try {
    if (!data.company_id) {
      return { success: false, error: 'ID da organização é obrigatório.' };
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from('organizations')
      .update({ owner_whatsapp: data.owner_whatsapp || null })
      .eq('id', data.company_id);

    if (error) {
      console.error('Error updating company settings:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/[tenant_slug]/dashboard/settings', 'page');
    revalidatePath('/[tenant_slug]/dashboard', 'page');
    return { success: true };
  } catch (error: any) {
    console.error('Unhandled exception in saveCompanySettings:', error);
    return { success: false, error: error.message || 'Erro interno no servidor' };
  }
}

export async function saveOperator(data: OperatorFormData) {
  try {
    if (!data.company_id) {
      return { success: false, error: 'ID da organização é obrigatório.' };
    }
    if (!data.name) {
      return { success: false, error: 'Nome do atendente é obrigatório.' };
    }

    const supabase = await createClient();

    const operatorData: any = {
      company_id: data.company_id,
      name: data.name,
      role: data.role || null,
      work_hours: data.work_hours || null,
    };

    if (data.id) {
      operatorData.id = data.id;
    }

    const { error } = await supabase
      .from('operators')
      .upsert(operatorData);

    if (error) {
      console.error('Error upserting operator:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/[tenant_slug]/dashboard/settings', 'page');
    revalidatePath('/[tenant_slug]/dashboard', 'page');
    return { success: true };
  } catch (error: any) {
    console.error('Unhandled exception in saveOperator:', error);
    return { success: false, error: error.message || 'Erro interno no servidor' };
  }
}

export async function deleteOperator(id: string) {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('operators')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting operator:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/[tenant_slug]/dashboard/settings', 'page');
    revalidatePath('/[tenant_slug]/dashboard', 'page');
    return { success: true };
  } catch (error: any) {
    console.error('Unhandled exception in deleteOperator:', error);
    return { success: false, error: error.message || 'Erro interno no servidor' };
  }
}

export async function assignOperatorToConversation(conversationId: string | number, operatorId: string | null) {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('conversations')
      .update({ operator_id: operatorId })
      .eq('id', conversationId);

    if (error) {
      console.error('Error assigning operator to conversation:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/[tenant_slug]/dashboard', 'page');
    return { success: true };
  } catch (error: any) {
    console.error('Unhandled exception in assignOperatorToConversation:', error);
    return { success: false, error: error.message || 'Erro interno no servidor' };
  }
}
