import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { analyzeConversation } from '@/lib/ai-analyzer';

export async function GET(request: NextRequest) {
  try {
    const clientPhone = '5511999998888';
    console.log(`Running simulation test for phone: ${clientPhone}`);

    // 1. Clean up any existing simulation records to allow repeatable testing
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('client_phone', clientPhone)
      .maybeSingle();

    if (existingConv) {
      console.log(`Cleaning up old simulation records for conversation ID: ${existingConv.id}`);
      // Manually clean child tables first to avoid foreign key constraint violations
      await supabase.from('messages').delete().eq('conversation_id', existingConv.id);
      await supabase.from('analyses').delete().eq('conversation_id', existingConv.id);
      await supabase.from('conversations').delete().eq('id', existingConv.id);
    }

    // 2. Create a new conversation record
    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert({ client_phone: clientPhone })
      .select('id')
      .maybeSingle();

    if (convError || !newConv) {
      console.error('Failed to create new conversation in simulation:', convError);
      throw convError || new Error('Could not create conversation');
    }

    const conversationId = newConv.id;
    console.log(`Created new simulation conversation: ${conversationId}`);

    // 3. Define and insert 4 sequential mock messages
    // We space their created_at timestamps to ensure strict chronological sorting in the database
    const now = new Date();
    const mockMessages = [
      {
        conversation_id: conversationId,
        sender_type: 'client' as const,
        content: 'Olá, qual o valor da mensalidade da academia?',
        created_at: new Date(now.getTime() - 40000).toISOString(),
      },
      {
        conversation_id: conversationId,
        sender_type: 'agent' as const,
        content: 'Oi! Custa R$ 120 no plano anual. Quer vir conhecer?',
        created_at: new Date(now.getTime() - 30000).toISOString(),
      },
      {
        conversation_id: conversationId,
        sender_type: 'client' as const,
        content: 'Achei meio caro, vou pensar.',
        created_at: new Date(now.getTime() - 20000).toISOString(),
      },
      {
        conversation_id: conversationId,
        sender_type: 'agent' as const,
        content: 'Entendi, tchau.',
        created_at: new Date(now.getTime() - 10000).toISOString(),
      },
    ];

    const { error: msgError } = await supabase
      .from('messages')
      .insert(mockMessages);

    if (msgError) {
      console.error('Failed to insert mock messages in simulation:', msgError);
      throw msgError;
    }

    console.log('Successfully inserted mock messages. Running AI analysis...');

    // 4. Run the AI analyzer synchronously to ensure it completes before returning the response
    await analyzeConversation(String(conversationId));

    console.log('AI analysis completed for simulated conversation.');

    return Response.json({
      success: true,
      message: 'Simulation completed and analyzed successfully.',
      conversationId: conversationId,
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error in simulation endpoint:', error);
    return Response.json({
      success: false,
      error: error.message || 'Internal Server Error',
    }, { status: 500 });
  }
}
