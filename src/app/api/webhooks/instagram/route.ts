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

      // Buscar organização dona dessa conta do Instagram (ou qualquer organização com instagram_status = 'connected' caso o ID seja IGSID)
      let { data: org } = await supabase
        .from('organizations')
        .select('id, name, slug, instagram_access_token')
        .eq('instagram_account_id', igAccountId)
        .maybeSingle();

      if (!org) {
        // Fallback: buscar organização que está com instagram conectado
        const { data: fallbackOrg } = await supabase
          .from('organizations')
          .select('id, name, slug, instagram_access_token')
          .eq('instagram_status', 'connected')
          .limit(1)
          .maybeSingle();
        org = fallbackOrg;
      }

      if (!org) {
        console.warn(`[INSTAGRAM WEBHOOK] No organization found for Instagram Account ID: ${igAccountId}`);
        continue;
      }

      for (const messagingEvent of entry.messaging || []) {
        const senderId = String(messagingEvent.sender?.id || '');
        const recipientId = String(messagingEvent.recipient?.id || '');
        const message = messagingEvent.message;

        if (!message) continue;

        const isEcho = Boolean(message.is_echo || senderId === igAccountId);
        const customerId = isEcho ? recipientId : senderId;
        const messageText = message.text || (message.attachments ? '[Mídia do Instagram]' : '');

        if (!messageText || !customerId) continue;

        // Tentar buscar o @username do seguidor na Graph API se tivermos token
        let clientIdentifier = customerId;
        if (!isEcho && org.instagram_access_token) {
          try {
            const profileRes = await fetch(`https://graph.instagram.com/v21.0/${customerId}?fields=username,name&access_token=${org.instagram_access_token}`);
            const profileData = await profileRes.json();
            if (profileData?.username) {
              clientIdentifier = profileData.username;
            }
          } catch (pErr) {
            // Mantém o ID numérico se não conseguir resolver o username
          }
        }

        // 1. Buscar conversa existente para esse cliente no Instagram
        let { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('organization_id', org.id)
          .eq('channel', 'instagram')
          .or(`client_phone.eq.${clientIdentifier},client_phone.eq.${customerId},instagram_sender_id.eq.${customerId}`)
          .maybeSingle();

        if (!conv) {
          const { data: newConv, error: createConvError } = await supabase
            .from('conversations')
            .insert({
              organization_id: org.id,
              client_phone: clientIdentifier,
              instagram_sender_id: customerId,
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

        // 2. Inserir a mensagem
        const senderType = isEcho ? 'atendente' : 'cliente';
        await supabase.from('messages').insert({
          conversation_id: conv.id,
          sender_type: senderType,
          content: messageText,
          created_at: new Date(messagingEvent.timestamp || Date.now()).toISOString()
        });

        // 3. Disparar análise de IA quando houver histórico suficiente
        const { data: allMessages } = await supabase
          .from('messages')
          .select('sender_type, content, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true });

        if (allMessages && allMessages.length >= 2) {
          try {
            const formattedForAi = allMessages.map((m: any) => ({
              sender: (m.sender_type === 'agent' || m.sender_type === 'atendente' ? 'agent' : 'client') as 'agent' | 'client',
              text: m.content,
              timestamp: m.created_at,
            }));
            const analysisResult = await analyzeConversation(formattedForAi, org.id);
            if (analysisResult) {
              await supabase.from('analyses').insert({
                conversation_id: conv.id,
                overall_score: analysisResult.overall_score,
                scores: analysisResult.scores,
                summary: analysisResult.summary,
                strengths: analysisResult.strengths,
                weaknesses: analysisResult.weaknesses,
                recommendations: analysisResult.recommendations,
                objections: analysisResult.objections,
              });
            }
          } catch (aiErr) {
            console.error('[INSTAGRAM WEBHOOK] AI analysis error:', aiErr);
          }
        }

        try {
          revalidatePath(`/${org.slug}/dashboard`, 'page');
        } catch (revErr) {
          // Ignore revalidation errors in background
        }

        console.log(`[INSTAGRAM WEBHOOK] Message saved for conversation ${conv.id}`);
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error('[INSTAGRAM WEBHOOK] Error processing webhook:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
