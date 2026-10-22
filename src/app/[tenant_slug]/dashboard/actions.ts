'use server';

import { createClient } from '@/lib/auth-server';
import { supabase as adminSupabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function deleteConversation(conversationId: string | number) {
  try {
    if (!conversationId) {
      return { success: false, error: 'ID da conversa é obrigatório.' };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Não autenticado.' };
    }

    // 1. Apagar análises vinculadas
    await adminSupabase
      .from('analyses')
      .delete()
      .eq('conversation_id', conversationId);

    // 2. Apagar mensagens vinculadas
    await adminSupabase
      .from('messages')
      .delete()
      .eq('conversation_id', conversationId);

    // 3. Apagar a conversa
    const { error: convError } = await adminSupabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (convError) {
      console.error('Error deleting conversation:', convError);
      return { success: false, error: convError.message };
    }

    revalidatePath('/[tenant_slug]/dashboard', 'page');
    return { success: true };
  } catch (error: any) {
    console.error('Unhandled exception in deleteConversation:', error);
    return { success: false, error: error.message || 'Erro interno ao excluir conversa' };
  }
}

export async function deleteMessage(messageId: string | number, conversationId?: string | number) {
  try {
    if (!messageId) {
      return { success: false, error: 'ID da mensagem é obrigatório.' };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Não autenticado.' };
    }

    // 1. Apagar a mensagem específica
    const { error } = await adminSupabase
      .from('messages')
      .delete()
      .eq('id', messageId);

    if (error) {
      console.error('Error deleting message:', error);
      return { success: false, error: error.message };
    }

    // 2. Se informou conversationId, verificar se ainda restam mensagens
    if (conversationId) {
      const { data: remainingMsgs } = await adminSupabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .limit(1);

      // Se não sobrou nenhuma mensagem, apagar a conversa e análises para deixar o painel zerado
      if (!remainingMsgs || remainingMsgs.length === 0) {
        await adminSupabase.from('analyses').delete().eq('conversation_id', conversationId);
        await adminSupabase.from('conversations').delete().eq('id', conversationId);
      }
    }

    revalidatePath('/[tenant_slug]/dashboard', 'page');
    return { success: true };
  } catch (error: any) {
    console.error('Unhandled exception in deleteMessage:', error);
    return { success: false, error: error.message || 'Erro interno ao excluir mensagem' };
  }
}
