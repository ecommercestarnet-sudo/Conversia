import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { analyzeConversation } from '@/lib/ai-analyzer';
import { revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Webhook payload received:', JSON.stringify(body, null, 2));

    const event = (body.event || '').toLowerCase();

    // 1. Handle Connection Update Event
    if (event === 'connection.update' || event === 'connection_update') {
      const connData = body.data || {};
      const state = connData.state || connData.instance?.state || '';
      const statusReason = connData.statusReason ?? connData.disconnectionReasonCode ?? null;
      const instanceName = body.instance || '';

      console.log(`[CONNECTION_UPDATE] state="${state}" statusReason=${statusReason} instance=${instanceName}`);

      if (!instanceName) {
        return NextResponse.json({ success: false, error: 'Missing instance name' }, { status: 400 });
      }

      // Fetch organization matching evolution_instance_name
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, name, whatsapp_status, slug')
        .eq('evolution_instance_name', instanceName)
        .maybeSingle();

      if (orgError) {
        console.error('[CONNECTION_UPDATE] Error fetching organization:', orgError);
        return NextResponse.json({ success: false, error: orgError.message }, { status: 500 });
      }

      if (!org) {
        console.warn(`[CONNECTION_UPDATE] Organization not found for instance: ${instanceName}`);
        return NextResponse.json({ success: true, message: 'Organization not found' }, { status: 200 });
      }

      const isConnected = state === 'open';
      const newDbStatus = isConnected ? 'connected' : 'disconnected';
      const newLogStatus = isConnected ? 'open' : 'close';

      // Record logs only when status changes
      if (org.whatsapp_status !== newDbStatus) {
        console.log(`[CONNECTION_UPDATE] Status changed for organization ${org.name} (${org.id}) from ${org.whatsapp_status} to ${newDbStatus}`);

        // Update organization's current status
        const { error: updateError } = await supabase
          .from('organizations')
          .update({ whatsapp_status: newDbStatus })
          .eq('id', org.id);

        if (updateError) {
          console.error('[CONNECTION_UPDATE] Error updating organization status:', updateError);
        }

        // Insert connection status log
        const { error: logError } = await supabase
          .from('whatsapp_status_logs')
          .insert({
            company_id: org.id,
            status: newLogStatus,
            reason: statusReason ? String(statusReason) : null,
            created_at: new Date().toISOString()
          });

        if (logError) {
          console.error('[CONNECTION_UPDATE] Error inserting status log:', logError);
        }

        // Revalidate client pages
        try {
          revalidatePath(`/${org.slug}/dashboard`, 'page');
          revalidatePath(`/${org.slug}/dashboard/whatsapp`, 'page');
          revalidatePath(`/${org.slug}/dashboard/playbook`, 'page');
        } catch (e) {
          console.error('[CONNECTION_UPDATE] Revalidation failed:', e);
        }
      } else {
        console.log(`[CONNECTION_UPDATE] Status for organization ${org.name} is already ${newDbStatus}. No change logged.`);
      }

      return NextResponse.json({ success: true, message: 'Connection update processed.' }, { status: 200 });
    }

    // 2. Handle Message Event (Evolution API messages.upsert / messages_upsert, or Z-API fallback)
    let clientPhone = '';
    let content = '';
    let fromMe = false;
    let isGroup = false;
    let instanceNameForMessage = '';

    if (event === 'messages.upsert' || event === 'messages_upsert' || (body.data && body.data.key)) {
      // Evolution API format
      const data = body.data || {};
      const key = data.key || {};
      const remoteJid = key.remoteJid || '';
      isGroup = remoteJid.endsWith('@g.us');
      fromMe = key.fromMe === true;
      instanceNameForMessage = body.instance || '';

      let rawPhone = remoteJid;
      if (rawPhone.endsWith('@lid') && key.remoteJidAlt) {
        rawPhone = key.remoteJidAlt;
      }
      if (rawPhone) {
        const phonePart = rawPhone.split('@')[0];
        clientPhone = phonePart.replace(/[^0-9]/g, '');
      }

      const rawMessage = data.message || {};
      if (rawMessage.conversation) {
        content = rawMessage.conversation;
      } else if (rawMessage.extendedTextMessage?.text) {
        content = rawMessage.extendedTextMessage.text;
      } else if (rawMessage.imageMessage?.caption) {
        content = rawMessage.imageMessage.caption;
      } else if (rawMessage.videoMessage?.caption) {
        content = rawMessage.videoMessage.caption;
      }
    } else {
      // Z-API format fallback (or mock testing payloads)
      isGroup = body.isGroup === true;
      fromMe = body.fromMe === true;
      
      let rawPhone = body.phone;
      if (rawPhone) {
        if (typeof rawPhone === 'string') {
          const phonePart = rawPhone.split('@')[0];
          clientPhone = phonePart.replace(/[^0-9]/g, '');
        } else if (typeof rawPhone === 'number') {
          clientPhone = String(rawPhone);
        }
      }

      if (body.text && typeof body.text === 'object' && body.text.message) {
        content = body.text.message;
      } else if (body.body && typeof body.body === 'string') {
        content = body.body;
      }
    }

    // Ignore group messages
    if (isGroup) {
      console.log('Webhook ignored: message is from a group.');
      return NextResponse.json({ success: true, message: 'Group messages are ignored.' }, { status: 200 });
    }

    if (!clientPhone) {
      console.warn('Webhook ignored: could not extract phone number from payload.', body);
      return NextResponse.json({ success: true, message: 'Could not extract phone number.' }, { status: 200 });
    }

    if (!content) {
      console.log(`Webhook ignored: no message content resolved for client phone ${clientPhone}.`);
      return NextResponse.json({ success: true, message: 'No message content resolved.' }, { status: 200 });
    }

    // Find organization ID
    let orgId: string | null = null;
    let orgSlug = '';
    if (instanceNameForMessage) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, slug')
        .eq('evolution_instance_name', instanceNameForMessage)
        .maybeSingle();
      if (orgData) {
        orgId = orgData.id;
        orgSlug = orgData.slug;
      }
    }

    // Fallback to first organization in database if not found (for testing/compatibility)
    if (!orgId) {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, slug')
        .limit(1);
      if (orgs && orgs.length > 0) {
        orgId = orgs[0].id;
        orgSlug = orgs[0].slug;
      }
    }

    let conversationId: string | number | null = null;

    // Search or create conversation in conversations table
    const selectQuery = supabase
      .from('conversations')
      .select('id, organization_id')
      .eq('client_phone', clientPhone);

    if (orgId) {
      selectQuery.eq('organization_id', orgId);
    } else {
      selectQuery.is('organization_id', null);
    }

    const { data: existingConv, error: selectError } = await selectQuery.maybeSingle();

    if (selectError) {
      console.error('Error selecting conversation:', selectError);
      throw selectError;
    }

    if (existingConv) {
      conversationId = existingConv.id;
      if (existingConv.organization_id === null && orgId) {
        await supabase
          .from('conversations')
          .update({ organization_id: orgId })
          .eq('id', conversationId);
      }
    } else {
      const { data: newConv, error: insertError } = await supabase
        .from('conversations')
        .insert({ client_phone: clientPhone, organization_id: orgId })
        .select('id')
        .maybeSingle();

      if (insertError) {
        // Fallback retry block
        const retryQuery = supabase
          .from('conversations')
          .select('id')
          .eq('client_phone', clientPhone);
        if (orgId) {
          retryQuery.eq('organization_id', orgId);
        } else {
          retryQuery.is('organization_id', null);
        }
        const { data: retryConv, error: retryError } = await retryQuery.maybeSingle();
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

    // Save the message
    const senderType = fromMe ? 'agent' : 'client';
    const { data: insertedMsg, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: senderType,
        content: content,
      })
      .select('id')
      .maybeSingle();

    if (msgError) {
      console.error('Error inserting message into Supabase:', msgError);
      throw msgError;
    }

    const insertedId = insertedMsg?.id;

    console.log(`Message successfully saved. Conversation ID: ${conversationId}, Sender Type: ${senderType}`);

    // Wait 4 seconds to accumulate message bursts
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Check if a newer message has been saved in the meantime
    if (insertedId) {
      const { data: latestMsg } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestMsg && latestMsg.id !== insertedId) {
        console.log(`[AI Analyzer] Newer message ${latestMsg.id} exists in DB. Skipping analysis for message ${insertedId}.`);
        return NextResponse.json({ success: true, message: 'Skipped analysis: newer message exists.' }, { status: 200 });
      }
    }

    // Execute analyzeConversation (internal gates handle debouncing, min messages, last sender check)
    console.log(`Executing AI analysis for conversation ID: ${conversationId}`);
    await analyzeConversation(String(conversationId));

    if (orgSlug) {
      try {
        revalidatePath(`/${orgSlug}/dashboard`, 'page');
      } catch (e) {
        console.error('[MESSAGE_RECEIVED] Revalidation failed:', e);
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
