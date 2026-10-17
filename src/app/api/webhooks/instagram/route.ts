import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { analyzeConversation } from '@/lib/ai-analyzer';
import { revalidatePath } from 'next/cache';

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'conversia_instagram_verify_token_2026';

// 1. GET: Validação do Webhook pela Meta
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[INSTAGRAM WEBHOOK] Verified successfully by Meta!');
    return new Response(challenge || '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
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

    // Iterar pelas entradas do webhook da Meta
    for (const entry of body.entry || []) {
      const igAccountId = String(entry.id || ''); // ID da conta do Instagram / Página receptora

      // Buscar organização dona dessa conta do Instagram via RPC SECURITY DEFINER (funciona mesmo sem service_role na Vercel)
      const { data: rpcOrg } = await supabase.rpc('get_instagram_webhook_org', {
        p_ig_account_id: igAccountId,
      });

      let org: any = rpcOrg || null;

      if (!org) {
        const { data: directOrg } = await supabase
          .from('organizations')
          .select('id, name, slug, instagram_account_id, instagram_access_token')
          .eq('instagram_account_id', igAccountId)
          .maybeSingle();
        org = directOrg;
      }

      if (!org) {
        const { data: fallbackOrg } = await supabase
          .from('organizations')
          .select('id, name, slug, instagram_account_id, instagram_access_token')
          .eq('instagram_status', 'connected')
          .limit(1)
          .maybeSingle();
        org = fallbackOrg;
      }

      if (!org) {
        console.warn(`[INSTAGRAM WEBHOOK] No organization found for Instagram Account ID: ${igAccountId}`);
        continue;
      }

      // Normalizar eventos vindos tanto de entry.messaging (produção) quanto entry.changes (botão de teste da Meta)
      const events: any[] = [...(entry.messaging || [])];
      for (const change of entry.changes || []) {
        if ((change.field === 'messages' || change.field === 'messaging_postbacks') && change.value) {
          events.push(change.value);
        }
      }

      for (const messagingEvent of events) {
        const senderId = String(messagingEvent.sender?.id || '');
        const recipientId = String(messagingEvent.recipient?.id || '');
        const message = messagingEvent.message || messagingEvent.postback;

        if (!message) continue;

        // Ignorar eventos de leitura/reação vazios sem texto nem anexo
        if (message.is_deleted || message.is_unsupported) continue;

        const isEcho = Boolean(
          message.is_echo ||
          (igAccountId && senderId === igAccountId) ||
          (org.instagram_account_id && senderId === String(org.instagram_account_id))
        );
        const customerId = isEcho ? recipientId : senderId;

        let messageText = message.text || message.title || '';
        if (!messageText && Array.isArray(message.attachments) && message.attachments.length > 0) {
          const audioAtt = message.attachments.find((a: any) => a.type === 'audio' && a.payload?.url);
          if (audioAtt && process.env.OPENAI_API_KEY) {
            try {
              const audioRes = await fetch(audioAtt.payload.url);
              if (audioRes.ok) {
                const audioBuffer = await audioRes.arrayBuffer();
                const formData = new FormData();
                const blob = new Blob([audioBuffer], { type: 'audio/mp4' });
                formData.append('file', blob, 'instagram_audio.mp4');
                formData.append('model', 'whisper-1');
                formData.append('language', 'pt');
                const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
                  body: formData,
                });
                const whisperData = await whisperRes.json();
                if (whisperData?.text) {
                  messageText = whisperData.text.trim();
                }
              }
            } catch (audioErr) {
              console.error('[INSTAGRAM WEBHOOK] Audio transcription error:', audioErr);
            }
          }
          if (!messageText) {
            const attType = message.attachments[0]?.type || 'mídia';
            messageText = `[Mídia do Instagram: ${attType}]`;
          }
        }

        if (!messageText || !customerId) continue;

        // Tentar buscar o @username do seguidor na Graph API se tivermos token
        let clientIdentifier = customerId;
        if (org.instagram_access_token) {
          try {
            const profileRes = await fetch(`https://graph.instagram.com/v21.0/${customerId}?fields=username,name&access_token=${org.instagram_access_token}`);
            const profileData = await profileRes.json();
            if (profileData?.username) {
              clientIdentifier = profileData.username;
            } else if (profileData?.name) {
              clientIdentifier = profileData.name;
            }
          } catch (pErr) {
            // Mantém o ID numérico se não conseguir resolver o username
          }
        }

        // 1 & 2. Salvar conversa e mensagem via RPC SECURITY DEFINER (usando 'agent' / 'client' igual ao WhatsApp)
        const senderType = isEcho ? 'agent' : 'client';
        let convId: string | number | null = null;

        const { data: rpcSaved, error: rpcSaveError } = await supabase.rpc('save_instagram_webhook_message', {
          p_org_id: org.id,
          p_client_identifier: clientIdentifier,
          p_customer_id: customerId,
          p_sender_type: senderType,
          p_content: messageText,
        });

        if (!rpcSaveError && rpcSaved?.conversation_id) {
          convId = rpcSaved.conversation_id;
        } else {
          if (rpcSaveError) {
            console.error('[INSTAGRAM WEBHOOK] RPC save error, trying direct fallback:', rpcSaveError);
          }
          // Fallback direto caso necessário
          const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('organization_id', org.id)
            .or(`client_phone.eq.${clientIdentifier},client_phone.eq.${customerId},instagram_sender_id.eq.${customerId}`)
            .maybeSingle();

          if (existingConv?.id) {
            convId = existingConv.id;
          } else {
            const { data: newConv, error: createConvError } = await supabase
              .from('conversations')
              .insert({
                organization_id: org.id,
                client_phone: clientIdentifier,
                instagram_sender_id: customerId,
                channel: 'instagram',
              })
              .select('id')
              .single();

            if (createConvError || !newConv) {
              console.error('[INSTAGRAM WEBHOOK] Error creating conversation:', createConvError);
              continue;
            }
            convId = newConv.id;
          }

          const { error: msgError } = await supabase.from('messages').insert({
            conversation_id: convId,
            sender_type: senderType,
            content: messageText,
          });

          if (msgError) {
            console.error('[INSTAGRAM WEBHOOK] Error inserting message:', msgError);
            continue;
          }
        }

        // 3. Disparar análise de IA
        try {
          if (convId) {
            await analyzeConversation(String(convId));
          }
        } catch (aiErr) {
          console.error('[INSTAGRAM WEBHOOK] AI analysis error:', aiErr);
        }

        try {
          revalidatePath(`/${org.slug}/dashboard`, 'page');
        } catch (revErr) {
          // Ignore revalidation errors in background
        }

        console.log(`[INSTAGRAM WEBHOOK] Message saved for conversation ${convId}`);
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error('[INSTAGRAM WEBHOOK] Error processing webhook:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
