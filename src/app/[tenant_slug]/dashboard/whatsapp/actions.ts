'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

import fs from 'fs';
import path from 'path';

let EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
let EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

// Fallback manual parser for .env.local
if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split(/\r?\n/).forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          let value = parts.slice(1).join('=').trim();
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
          
          if (key === 'EVOLUTION_API_URL') EVOLUTION_API_URL = value;
          if (key === 'EVOLUTION_API_KEY') EVOLUTION_API_KEY = value;
        }
      });
    }
  } catch (e) {
    console.error('Failed to parse .env.local fallback:', e);
  }
}

if (!EVOLUTION_API_URL) {
  EVOLUTION_API_URL = 'http://216.238.122.167:8081';
}
if (!EVOLUTION_API_KEY) {
  EVOLUTION_API_KEY = '429683C4C977415CAAFCCE10F7D57E11';
}

export async function getWhatsAppStatus(organization_id: string) {
  try {
    const supabase = await createClient();
    
    // 1. Get the instance name from the database
    const { data: org, error: selectError } = await supabase
      .from('organizations')
      .select('evolution_instance_name, whatsapp_status')
      .eq('id', organization_id)
      .maybeSingle();

    if (selectError || !org) {
      return { success: false, error: 'Organização não encontrada' };
    }

    const instanceName = org.evolution_instance_name;

    if (!instanceName) {
      return { success: true, status: 'disconnected', instanceName: null };
    }

    // 2. Fetch connection status from Evolution API
    const url = `${EVOLUTION_API_URL?.replace(/\/$/, '')}/instance/connectionState/${instanceName}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_API_KEY || ''
      }
    });

    if (!resp.ok) {
      // If it doesn't exist on Evolution, update DB and return disconnected
      if (resp.status === 404) {
        await supabase
          .from('organizations')
          .update({ evolution_instance_name: null, whatsapp_status: 'disconnected' })
          .eq('id', organization_id);
        revalidatePath('/[tenant_slug]/dashboard/whatsapp', 'page');
        return { success: true, status: 'disconnected', instanceName: null };
      }
      return { success: false, error: `Erro na Evolution API: ${resp.statusText}` };
    }

    const data = await resp.json();
    const state = data.instance?.state || 'close';
    const status = state === 'open' ? 'connected' : 'disconnected';

    // 3. Update database if the status has changed
    if (status !== org.whatsapp_status) {
      await supabase
        .from('organizations')
        .update({ whatsapp_status: status })
        .eq('id', organization_id);
      revalidatePath('/[tenant_slug]/dashboard/whatsapp', 'page');
    }

    // 4. Fetch connected phone number if state is open
    let connectedPhone: string | null = null;
    if (status === 'connected') {
      try {
        const fetchUrl = `${EVOLUTION_API_URL?.replace(/\/$/, '')}/instance/fetchInstances`;
        const fetchResp = await fetch(fetchUrl, {
          method: 'GET',
          headers: {
            'apikey': EVOLUTION_API_KEY || ''
          }
        });
        if (fetchResp.ok) {
          const instances = await fetchResp.json();
          const list = Array.isArray(instances) ? instances : (instances.instances || []);
          const match = list.find((inst: any) => (inst.name || inst.instanceName) === instanceName);
          if (match) {
            const rawOwner = match.ownerJid || match.phone || null;
            if (rawOwner) {
              connectedPhone = rawOwner.split('@')[0].replace(/[^0-9]/g, '');
            }
          }
        }
      } catch (e) {
        console.error('Error fetching connected phone number:', e);
      }
    }

    return { success: true, status, instanceName, state, connectedPhone };
  } catch (error: any) {
    console.error('Error in getWhatsAppStatus:', error);
    return { success: false, error: error.message || 'Erro interno no servidor' };
  }
}

export async function connectWhatsApp(organization_id: string) {
  try {
    const supabase = await createClient();
    // Use session token or pass it securely to Edge Function. But we will just pass the organizationId.
    const { data: { session } } = await supabase.auth.getSession();
    
    const edgeFunctionUrl = `${SUPABASE_URL?.replace(/\/$/, '')}/functions/v1/evolution-manager`;
    
    const resp = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || process.env.SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        action: 'connect',
        organizationId: organization_id
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { success: false, error: `Edge Function error: ${errText}` };
    }

    const data = await resp.json();
    revalidatePath('/[tenant_slug]/dashboard/whatsapp', 'page');
    return { success: true, ...data };
  } catch (error: any) {
    console.error('Error in connectWhatsApp:', error);
    return { success: false, error: error.message || 'Erro interno no servidor' };
  }
}

export async function disconnectWhatsApp(organization_id: string) {
  try {
    const supabase = await createClient();
    const { data: org, error: selectError } = await supabase
      .from('organizations')
      .select('evolution_instance_name')
      .eq('id', organization_id)
      .maybeSingle();

    if (selectError || !org || !org.evolution_instance_name) {
      return { success: false, error: 'Instância não configurada para esta organização' };
    }

    const instanceName = org.evolution_instance_name;

    const { data: { session } } = await supabase.auth.getSession();
    
    const edgeFunctionUrl = `${SUPABASE_URL?.replace(/\/$/, '')}/functions/v1/evolution-manager`;
    const resp = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || process.env.SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        action: 'disconnect',
        organizationId: organization_id,
        instanceName
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { success: false, error: `Edge Function error: ${errText}` };
    }

    revalidatePath('/[tenant_slug]/dashboard/whatsapp', 'page');
    return { success: true };
  } catch (error: any) {
    console.error('Error in disconnectWhatsApp:', error);
    return { success: false, error: error.message || 'Erro interno no servidor' };
  }
}
