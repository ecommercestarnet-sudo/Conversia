'use server';

import { createClient } from '@/lib/auth-server';
import { revalidatePath } from 'next/cache';

export interface AlertRules {
  alert_on_price_unhandled: boolean;
  alert_on_dry_price: boolean;
  alert_on_drop_unhandled: boolean;
  min_confidence_score: number;
  alert_phone_override?: string;
}

export interface PlaybookFormData {
  organization_id: string;
  company_context: string;
  knowledge_base: string;
  evaluation_criteria: string;
  custom_prompt: string;
  alert_rules?: AlertRules;
}

export async function savePlaybook(data: PlaybookFormData) {
  try {
    if (!data.organization_id) {
      return { success: false, error: 'ID da organização é obrigatório.' };
    }

    const supabase = await createClient();

    const payload: any = {
      organization_id: data.organization_id,
      company_context: data.company_context,
      knowledge_base: data.knowledge_base,
      evaluation_criteria: data.evaluation_criteria,
      custom_prompt: data.custom_prompt,
    };

    if (data.alert_rules) {
      payload.alert_rules = data.alert_rules;
    }

    const { error } = await supabase
      .from('ai_playbooks')
      .upsert(payload, {
        onConflict: 'organization_id',
      });

    if (error) {
      // If error is about alert_rules column not existing yet, fallback without alert_rules
      if (error.message?.includes('alert_rules')) {
        console.warn('Column alert_rules does not exist yet. Falling back without alert_rules...');
        delete payload.alert_rules;
        const { error: fallbackError } = await supabase
          .from('ai_playbooks')
          .upsert(payload, { onConflict: 'organization_id' });
        
        if (fallbackError) {
          return { success: false, error: fallbackError.message };
        }
      } else {
        console.error('Error upserting playbook:', error);
        return { success: false, error: error.message };
      }
    }

    revalidatePath('/[tenant_slug]/dashboard/playbook', 'page');
    revalidatePath('/[tenant_slug]/dashboard', 'page');
    return { success: true };
  } catch (error: any) {
    console.error('Unhandled exception in savePlaybook:', error);
    return { success: false, error: error.message || 'Erro interno no servidor' };
  }
}
