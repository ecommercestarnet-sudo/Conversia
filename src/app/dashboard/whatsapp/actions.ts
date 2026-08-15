'use server';

import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

import fs from 'fs';
import path from 'path';

let EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
let EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

// Fallback manual parser for .env.local (useful if Next.js hasn't restarted yet to load new envs)
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

// Fallback para valores padrão do VPS (caso não configurado no Vercel/Ambiente)
if (!EVOLUTION_API_URL) {
  EVOLUTION_API_URL = 'http://216.238.122.167:8080';
}
if (!EVOLUTION_API_KEY) {
  EVOLUTION_API_KEY = 'minha_chave_secreta_123';
}

console.log('[WhatsApp Server Actions] Evolution API Config loaded:', {
  url: EVOLUTION_API_URL,
  key: EVOLUTION_API_KEY ? 'configured' : 'not configured'
});

export async function getWhatsAppStatus(companyId: string) {
  try {
    // 1. Get the instance name from the database
    const { data: company, error: selectError } = await supabase
      .from('companies')
      .select('evolution_instance_name, whatsapp_status')
      .eq('id', companyId)
      .maybeSingle();

    if (selectError || !company) {
      return { success: false, error: 'Empresa não encontrada' };
    }

    const instanceName = company.evolution_instance_name;

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
          .from('companies')
          .update({ evolution_instance_name: null, whatsapp_status: 'disconnected' })
          .eq('id', companyId);
        revalidatePath('/dashboard/whatsapp');
        return { success: true, status: 'disconnected', instanceName: null };
      }
      return { success: false, error: `Erro na Evolution API: ${resp.statusText}` };
    }

    const data = await resp.json();
    const state = data.instance?.state || 'close';
    const status = state === 'open' ? 'connected' : 'disconnected';

    // 3. Update database if the status has changed
    if (status !== company.whatsapp_status) {
      await supabase
        .from('companies')
        .update({ whatsapp_status: status })
        .eq('id', companyId);
      revalidatePath('/dashboard/whatsapp');
      revalidatePath('/dashboard');
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

export async function connectWhatsApp(companyId: string) {
  try {
    // 1. Get or generate instance name
    const { data: company, error: selectError } = await supabase
      .from('companies')
      .select('evolution_instance_name')
      .eq('id', companyId)
      .maybeSingle();

    if (selectError || !company) {
      return { success: false, error: 'Empresa não encontrada' };
    }

    let instanceName = company.evolution_instance_name;
    if (!instanceName) {
      // Generate a unique instance name using company ID and a random suffix to prevent container session caching issues
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      instanceName = `instance-${companyId.slice(0, 8)}-${randomSuffix}`;
      await supabase
        .from('companies')
        .update({ evolution_instance_name: instanceName, whatsapp_status: 'disconnected' })
        .eq('id', companyId);
    }

    // 2. Call the Supabase Edge Function to handle Evolution API create/connect and webhook configuration
    const edgeFunctionUrl = `${SUPABASE_URL?.replace(/\/$/, '')}/functions/v1/evolution-manager`;
    console.log(`[Next.js Server Action] Calling Edge Function: ${edgeFunctionUrl} for instance: ${instanceName}`);
    
    const resp = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'connect',
        companyId,
        instanceName
      })
    });

    console.log(`[Next.js Server Action] Edge Function response status: ${resp.status}`);

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[Next.js Server Action] Edge Function returned error: ${errText}`);
      return { success: false, error: `Edge Function error: ${errText}` };
    }

    const data = await resp.json();
    console.log(`[Next.js Server Action] Edge Function response data:`, JSON.stringify(data));
    revalidatePath('/dashboard/whatsapp');
    return { success: true, ...data, instanceName };
  } catch (error: any) {
    console.error('Error in connectWhatsApp:', error);
    return { success: false, error: error.message || 'Erro interno no servidor' };
  }
}

export async function disconnectWhatsApp(companyId: string) {
  try {
    const { data: company, error: selectError } = await supabase
      .from('companies')
      .select('evolution_instance_name')
      .eq('id', companyId)
      .maybeSingle();

    if (selectError || !company || !company.evolution_instance_name) {
      return { success: false, error: 'Instância não configurada para esta empresa' };
    }

    const instanceName = company.evolution_instance_name;

    // Call Supabase Edge Function to delete the instance and update database
    const edgeFunctionUrl = `${SUPABASE_URL?.replace(/\/$/, '')}/functions/v1/evolution-manager`;
    const resp = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'disconnect',
        companyId,
        instanceName
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { success: false, error: `Edge Function error: ${errText}` };
    }

    revalidatePath('/dashboard/whatsapp');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: any) {
    console.error('Error in disconnectWhatsApp:', error);
    return { success: false, error: error.message || 'Erro interno no servidor' };
  }
}
