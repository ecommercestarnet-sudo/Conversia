import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const META_APP_ID = process.env.META_APP_ID || '1613773990527200';
const META_APP_SECRET = process.env.META_APP_SECRET || '1c8a326c50f7eac58dc0772c2cbea82d';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // Contém o tenant_slug ou organization_id
  const error = searchParams.get('error');
  const errorReason = searchParams.get('error_reason');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://conversia-two.vercel.app';

  if (error || !code) {
    console.error('[INSTAGRAM OAUTH] Error in callback:', error, errorReason);
    return NextResponse.redirect(`${baseUrl}/${state || ''}/dashboard/canais?error=instagram_auth_cancelled`);
  }

  try {
    const redirectUri = `${baseUrl}/api/auth/instagram/callback`;

    // 1. Trocar code por User Access Token de curta duração
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${META_APP_SECRET}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error('[INSTAGRAM OAUTH] Failed to exchange code for token:', tokenData.error);
      return NextResponse.redirect(`${baseUrl}/${state || ''}/dashboard/canais?error=token_exchange_failed`);
    }

    const shortLivedToken = tokenData.access_token;

    // 2. Trocar por User Access Token de Longa Duração (60 dias)
    const longTokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${shortLivedToken}`;
    const longTokenRes = await fetch(longTokenUrl);
    const longTokenData = await longTokenRes.json();
    const userAccessToken = longTokenData.access_token || shortLivedToken;

    // 3. Buscar Páginas e Contas do Instagram vinculadas
    const accountsUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}&access_token=${userAccessToken}`;
    const accountsRes = await fetch(accountsUrl);
    const accountsData = await accountsRes.json();

    if (!accountsData.data || accountsData.data.length === 0) {
      return NextResponse.redirect(`${baseUrl}/${state || ''}/dashboard/canais?error=no_facebook_pages`);
    }

    // Achar a primeira página que tenha uma conta do Instagram conectada
    let targetPage = accountsData.data.find((p: any) => p.instagram_business_account?.id);
    if (!targetPage) {
      // Se não achou de primeira, usa a primeira página disponível
      targetPage = accountsData.data[0];
    }

    const igAccount = targetPage.instagram_business_account;
    const pageAccessToken = targetPage.access_token; // Token de página permanente
    const instagramId = igAccount?.id || null;
    const instagramUsername = igAccount?.username || targetPage.name || 'Instagram Conectado';

    // 4. Inscrever a página nos webhooks de mensagens
    if (pageAccessToken && targetPage.id) {
      try {
        await fetch(`https://graph.facebook.com/v21.0/${targetPage.id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${pageAccessToken}`, {
          method: 'POST'
        });
      } catch (subErr) {
        console.warn('[INSTAGRAM OAUTH] Could not subscribe app to page webhooks:', subErr);
      }
    }

    // 5. Salvar na organização no Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Localizar organização pelo slug (state)
    const tenantSlug = state;
    if (tenantSlug) {
      await supabase
        .from('organizations')
        .update({
          instagram_account_id: instagramId,
          instagram_username: instagramUsername,
          instagram_access_token: pageAccessToken,
          instagram_status: 'connected'
        })
        .eq('slug', tenantSlug);
    }

    return NextResponse.redirect(`${baseUrl}/${tenantSlug || ''}/dashboard/canais?status=instagram_connected`);
  } catch (err: any) {
    console.error('[INSTAGRAM OAUTH] Unexpected error:', err);
    return NextResponse.redirect(`${baseUrl}/${state || ''}/dashboard/canais?error=server_error`);
  }
}
