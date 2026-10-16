import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'conversia_instagram_verify_token_2026';

// 1. GET: Validação do Webhook pela Meta
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[INSTAGRAM WEBHOOK] Verified successfully by Meta!');
    return new Response(challenge, { status: 200 });
  }

  return new Response('Forbidden', { status: 403 });
}

// 2. POST: Recebimento das Mensagens em Tempo Real da Meta
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[INSTAGRAM WEBHOOK] Payload received:', JSON.stringify(body));

    if (body.object !== 'instagram' && body.object !== 'page') {
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Iterar pelas entradas do webhook da Meta
    for (const entry of body.entry || []) {
      const igAccountId = entry.id; // ID da conta do Instagram / Página receptora

      // Buscar organização dona dessa conta do Instagram
      const { data: org } = await supabase
        .from('organizations')
        .select('id, name, slug')
        .or(`instagram_account_id.eq.${igAccountId}`)
        .maybeSingle();

      if (!org) {
        console.warn(`[INSTAGRAM WEBHOOK] No organization found for Instagram Account ID: ${igAccountId}`);
        continue;
      }

      for (const messagingEvent of entry.messaging || []) {
        const senderId = messagingEvent.sender?.id;
        const recipientId = messagingEvent.recipient?.id;
        const message = messagingEvent.message;

        if (!message || message.is_echo) {
          // Se for echo (enviado pelo atendente via celular/app)
          if (message && message.is_echo && senderId === igAccountId) {
            const customerId = recipientId;
            const text = message.text || (message.attachments ? '[Mídia do Instagram]' : '');

            // Localizar conversa existente
            const { data: existingConv } = await supabase
              .from('conversations')
              .select('id')
              .eq('organization_id', org.id)
              .eq('channel', 'instagram')
              .eq('client_phone', customerId)
              .maybeSingle();

            if (existingConv && text) {
              await supabase.from('messages').insert({
                conversation_id: existingConv.id,
                sender_type: 'atendente',
                content: text,
                created_at: new Date(messagingEvent.timestamp || Date.now()).toISOString()
              });
            }
          }
          continue;
        }

        // Mensagem recebida de um CLIENTE (Seguidor)
        const customerId = senderId;
        const messageText = message.text || (message.attachments ? '[Mídia do Instagram]' : '');

        if (!messageText) continue;

        // 1. Buscar ou criar conversa para esse cliente no Instagram
        let { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('organization_id', org.id)
          .eq('channel', 'instagram')
          .eq('client_phone', customerId)
          .maybeSingle();

        if (!conv) {
          const { data: newConv, error: createConvError } = await supabase
            .from('conversations')
            .insert({
              organization_id: org.id,
              client_phone: customerId, // Usamos o ID do Instagram como identificador
              channel: 'instagram',
              created_at: new Date().toISOString()
            })
            .select('id')
            .single();

          if (createConvError) {
            console.error('[INSTAGRAM WEBHOOK] Error creating conversation:', createConvError);
            continue;
          }
          conv = newConv;
        }

        // 2. Inserir a mensagem recebida do cliente
        await supabase.from('messages').insert({
          conversation_id: conv.id,
          sender_type: 'cliente',
          content: messageText,
          created_at: new Date(messagingEvent.timestamp || Date.now()).toISOString()
        });

        console.log(`[INSTAGRAM WEBHOOK] Message saved for conversation ${conv.id}`);
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error('[INSTAGRAM WEBHOOK] Error processing webhook:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
