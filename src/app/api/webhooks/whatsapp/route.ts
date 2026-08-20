import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { analyzeConversation } from '@/lib/ai-analyzer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Z-API Webhook payload received:', JSON.stringify(body, null, 2));

    // 1. Ignore message ONLY if it is from a group (isGroup is true)
    if (body.isGroup === true) {
      console.log('Webhook ignored: message is from a group (isGroup is true).');
      return Response.json({ success: true, message: 'Group messages are ignored.' }, { status: 200 });
    }

    // Handle both agent messages (fromMe === true) and client messages (fromMe === false)
    const fromMe = body.fromMe === true;

    // 2. Extract phone from body.phone and text from body.text?.message or body.body
    let rawPhone = body.phone;
    let clientPhone = '';
    if (rawPhone) {
      if (typeof rawPhone === 'string') {
        const phonePart = rawPhone.split('@')[0];
        clientPhone = phonePart.replace(/[^0-9]/g, '');
      } else if (typeof rawPhone === 'number') {
        clientPhone = String(rawPhone);
      }
    }

    if (!clientPhone) {
      console.warn('Webhook ignored: could not extract phone number from payload.', body);
      return Response.json({ success: true, message: 'Could not extract phone number.' }, { status: 200 });
    }

    let content = '';
    if (body.text && typeof body.text === 'object' && body.text.message) {
      content = body.text.message;
    } else if (body.body && typeof body.body === 'string') {
      content = body.body;
    }

    if (!content) {
      console.log(`Webhook ignored: no message content resolved for client phone ${clientPhone}.`);
      return Response.json({ success: true, message: 'No message content resolved.' }, { status: 200 });
    }

    let conversationId: string | number | null = null;

    // 3. Search or create conversation in conversations table, filtering by phone and ensuring organization_id is null
    const { data: existingConv, error: selectError } = await supabase
      .from('conversations')
      .select('id')
      .eq('client_phone', clientPhone)
      .is('organization_id', null)
      .maybeSingle();

    if (selectError) {
      console.error('Error selecting conversation:', selectError);
      throw selectError;
    }

    if (existingConv) {
      conversationId = existingConv.id;
    } else {
      const { data: newConv, error: insertError } = await supabase
        .from('conversations')
        .insert({ client_phone: clientPhone })
        .select('id')
        .maybeSingle();

      if (insertError) {
        // Fallback retry block for concurrent inserts
        const { data: retryConv, error: retryError } = await supabase
          .from('conversations')
          .select('id')
          .eq('client_phone', clientPhone)
          .is('organization_id', null)
          .maybeSingle();

        if (retryError || !retryConv) {
          console.error('Error creating conversation and retry failed:', insertError, retryError);
          throw insertError;
        }
        conversationId = retryConv.id;
      } else if (newConv) {
        conversationId = newConv.id;
      }
    }

    if (!conversationId) {
      throw new Error('Failed to resolve or create conversation ID.');
    }

    // 4. Save the message to messages table (sender_type: 'agent' if fromMe is true, else 'client')
    // We map it to 'agent'/'client' because pg check constraint allows only these terms.
    const senderType = fromMe ? 'agent' : 'client';
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: senderType,
        content: content,
      });

    if (msgError) {
      console.error('Error inserting message into Supabase:', msgError);
      throw msgError;
    }

    console.log(`Message successfully saved. Conversation ID: ${conversationId}, Sender Type: ${senderType}`);

    // 5. Execute analyzeConversation synchronously with await
    console.log(`Executing AI analysis synchronously for conversation ID: ${conversationId}`);
    await analyzeConversation(String(conversationId));

    // 6. Return status 200 with { success: true }
    return Response.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.log('Erro Supabase:', error);
    console.error('Error processing Z-API webhook:', error);
    return Response.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
