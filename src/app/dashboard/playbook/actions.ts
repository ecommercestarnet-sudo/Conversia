'use server';

import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export interface PlaybookFormData {
  organization_id: string;
  company_context: string;
  knowledge_base: string;
  evaluation_criteria: string;
  custom_prompt: string;
}

export async function savePlaybook(data: PlaybookFormData) {
  try {
    if (!data.organization_id) {
      return { success: false, error: 'ID da organização é obrigatório.' };
    }

    const { error } = await supabase
      .from('ai_playbooks')
      .upsert({
        organization_id: data.organization_id,
        company_context: data.company_context,
        knowledge_base: data.knowledge_base,
        evaluation_criteria: data.evaluation_criteria,
        custom_prompt: data.custom_prompt,
      }, {
        onConflict: 'organization_id',
      });

    if (error) {
      console.error('Error upserting playbook:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/dashboard/playbook');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: any) {
    console.error('Unhandled exception in savePlaybook:', error);
    return { success: false, error: error.message || 'Erro interno no servidor' };
  }
}
