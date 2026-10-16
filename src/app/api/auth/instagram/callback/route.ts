import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || '2457047531452520';
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || 'eff478aee445118cf14a1aadf30862cf';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // Contém o tenant_slug
  const error = searchParams.get('error');
  const errorReason = searchParams.get('error_reason');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://conversia-two.vercel.app';

  if (error || !code) {
    console.error('[INSTAGRAM OAUTH] Error in callback:', error, errorReason);
    return NextResponse.redirect(`${baseUrl}/${state || ''}/dashboard/canais?error=instagram_auth_cancelled`);
  }

  try {
    const redirectUri = `${baseUrl}/api/auth/instagram/callback`;

    // 1. Trocar code por Token de curta duração na API do Instagram
    const formData = new FormData();
    formData.append('client_id', INSTAGRAM_APP_ID);
    formData.append('client_secret', INSTAGRAM_APP_SECRET);
    formData.append('grant_type', 'authorization_code');
    formData.append('redirect_uri', redirectUri);
    formData.append('code', code);

    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: formData
    });
    const tokenData = await tokenRes.json();

    if (tokenData.error_type || !tokenData.access_token) {
      console.error('[INSTAGRAM OAUTH] Failed to exchange code for token:', tokenData);
      return NextResponse.redirect(`${baseUrl}/${state || ''}/dashboard/canais?error=token_exchange_failed`);
    }

    const shortLivedToken = tokenData.access_token;
    const instagramUserId = tokenData.user_id;

    // 2. Trocar por Token de Longa Duração (60 dias)
    const longTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`;
    const longTokenRes = await fetch(longTokenUrl);
    const longTokenData = await longTokenRes.json();
    const accessToken = longTokenData.access_token || shortLivedToken;

    // 3. Buscar detalhes do usuário do Instagram (Username)
    let instagramUsername = 'Instagram Conectado';
    try {
      const userRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=id,username,account_type&access_token=${accessToken}`);
      const userData = await userRes.json();
      if (userData.username) {
        instagramUsername = userData.username;
      }
    } catch (uErr) {
      console.warn('[INSTAGRAM OAUTH] Could not fetch username:', uErr);
    }

    // 4. Salvar na organização no Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Localizar organização pelo slug (state)
    const tenantSlug = state;
    if (tenantSlug) {
      await supabase
        .from('organizations')
        .update({
          instagram_account_id: String(instagramUserId),
          instagram_username: instagramUsername,
          instagram_access_token: accessToken,
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
